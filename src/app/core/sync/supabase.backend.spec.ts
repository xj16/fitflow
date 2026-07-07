import { SupabaseBackend } from './supabase.backend';
import { Workout } from '../models/workout.model';

/**
 * A chainable stub of the tiny slice of the Supabase client the adapter uses:
 * `.from(table).select('data')` (optionally `.gt('updated_at', since)`) and
 * `.from(table).upsert(rows, opts)`. We record calls to assert row-shape
 * mapping, the delta filter, and error propagation.
 */
function makeStubClient(opts: {
  rows?: Array<{ data: unknown }>;
  selectError?: { message: string };
  upsertError?: { message: string };
}) {
  const calls = {
    table: '' as string,
    gt: null as { col: string; val: string } | null,
    upsertRows: null as unknown[] | null,
    onConflict: null as string | null,
  };

  const query: Record<string, unknown> = {
    select() {
      return this;
    },
    gt(col: string, val: string) {
      calls.gt = { col, val };
      return this;
    },
    then(resolve: (r: unknown) => void) {
      // Make the query object awaitable (Supabase queries are thenables).
      resolve({ data: opts.rows ?? [], error: opts.selectError ?? null });
    },
    upsert(rows: unknown[], o: { onConflict: string }) {
      calls.upsertRows = rows;
      calls.onConflict = o.onConflict;
      return Promise.resolve({ error: opts.upsertError ?? null });
    },
  };

  const client = {
    from(table: string) {
      calls.table = table;
      return query;
    },
  };
  return { client, calls };
}

function inject(backend: SupabaseBackend, client: unknown): void {
  (backend as unknown as { client: unknown }).client = client;
}

describe('SupabaseBackend', () => {
  it('is configured only when url + key are both present', () => {
    expect(new SupabaseBackend('', '').isConfigured()).toBeFalse();
    expect(
      new SupabaseBackend('https://x.supabase.co', 'key').isConfigured(),
    ).toBeTrue();
  });

  it('maps the `data` column to plain records on pull', async () => {
    const backend = new SupabaseBackend('https://x.supabase.co', 'k');
    const w: Workout = {
      id: 'w1',
      date: '2026-01-01T00:00:00Z',
      title: 'A',
      unit: 'kg',
      exercises: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const { client, calls } = makeStubClient({ rows: [{ data: w }] });
    inject(backend, client);

    const result = await backend.pull<Workout>('workouts');
    expect(result).toEqual([w]);
    expect(calls.table).toBe('workouts');
    expect(calls.gt).toBeNull(); // no `since` → full pull
  });

  it('adds a > updated_at filter for an incremental (delta) pull', async () => {
    const backend = new SupabaseBackend('https://x.supabase.co', 'k');
    const { client, calls } = makeStubClient({ rows: [] });
    inject(backend, client);

    await backend.pull<Workout>('workouts', '2026-05-01T00:00:00Z');
    expect(calls.gt).toEqual({
      col: 'updated_at',
      val: '2026-05-01T00:00:00Z',
    });
  });

  it('promotes id/updated_at/deleted columns on push', async () => {
    const backend = new SupabaseBackend('https://x.supabase.co', 'k');
    const { client, calls } = makeStubClient({});
    inject(backend, client);

    const w: Workout = {
      id: 'w1',
      date: '2026-01-01T00:00:00Z',
      title: 'A',
      unit: 'kg',
      exercises: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-02-02T00:00:00Z',
      deleted: true,
    };
    await backend.push('workouts', [w]);
    expect(calls.onConflict).toBe('id');
    const row = (calls.upsertRows as Array<Record<string, unknown>>)[0];
    expect(row['id']).toBe('w1');
    expect(row['updated_at']).toBe('2026-02-02T00:00:00Z');
    expect(row['deleted']).toBeTrue();
    expect(row['data']).toEqual(w);
  });

  it('propagates pull errors', async () => {
    const backend = new SupabaseBackend('https://x.supabase.co', 'k');
    const { client } = makeStubClient({ selectError: { message: 'nope' } });
    inject(backend, client);
    await expectAsync(backend.pull('workouts')).toBeRejectedWithError(
      /Supabase pull failed: nope/,
    );
  });

  it('propagates push errors', async () => {
    const backend = new SupabaseBackend('https://x.supabase.co', 'k');
    const { client } = makeStubClient({ upsertError: { message: 'denied' } });
    inject(backend, client);
    await expectAsync(
      backend.push('workouts', [
        {
          id: 'w1',
          updatedAt: '2026-01-01T00:00:00Z',
        } as Workout,
      ]),
    ).toBeRejectedWithError(/Supabase push failed: denied/);
  });

  it('skips the network call when pushing an empty set', async () => {
    const backend = new SupabaseBackend('https://x.supabase.co', 'k');
    const { client, calls } = makeStubClient({});
    inject(backend, client);
    await backend.push('workouts', []);
    expect(calls.upsertRows).toBeNull();
  });
});
