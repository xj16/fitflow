import { FirebaseBackend } from './firebase.backend';
import { Workout } from '../models/workout.model';

function workout(id: string, updatedAt: string): Workout {
  return {
    id,
    date: updatedAt,
    title: id,
    unit: 'kg',
    exercises: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('FirebaseBackend', () => {
  const dbUrl = 'https://demo.firebaseio.com';

  afterEach(() => {
    // Restore any fetch spy between tests.
    if ((globalThis.fetch as unknown as jasmine.Spy)?.and) {
      (globalThis.fetch as unknown as jasmine.Spy).and.callThrough?.();
    }
  });

  it('normalizes a trailing slash and reports configured', () => {
    expect(new FirebaseBackend({ databaseURL: dbUrl + '/' }).isConfigured())
      .toBeTrue();
    expect(new FirebaseBackend(undefined).isConfigured()).toBeFalse();
  });

  it('pulls a keyed object into an array of records', async () => {
    const body = {
      a: workout('a', '2026-01-01T00:00:00Z'),
      b: workout('b', '2026-02-01T00:00:00Z'),
    };
    const fetchSpy = spyOn(globalThis, 'fetch').and.resolveTo(
      new Response(JSON.stringify(body), { status: 200 }),
    );
    const backend = new FirebaseBackend({ databaseURL: dbUrl });

    const rows = await backend.pull<Workout>('workouts');
    expect(rows.map((r) => r.id).sort()).toEqual(['a', 'b']);
    // Full pull → plain collection URL, no query string.
    expect(fetchSpy.calls.mostRecent().args[0]).toBe(
      `${dbUrl}/workouts.json`,
    );
  });

  it('sends an orderBy/startAt query for a delta pull', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').and.resolveTo(
      new Response('null', { status: 200 }),
    );
    const backend = new FirebaseBackend({ databaseURL: dbUrl });
    await backend.pull<Workout>('workouts', '2026-05-01T00:00:00Z');

    const url = String(fetchSpy.calls.mostRecent().args[0]);
    expect(url).toContain('orderBy=%22updatedAt%22');
    expect(url).toContain('startAt=%222026-05-01T00%3A00%3A00Z%22');
  });

  it('client-side filters by updatedAt when a since cursor is given', async () => {
    // Simulate a node with no index rule: Firebase returns everything.
    const body = {
      a: workout('a', '2026-01-01T00:00:00Z'),
      b: workout('b', '2026-06-01T00:00:00Z'),
    };
    spyOn(globalThis, 'fetch').and.resolveTo(
      new Response(JSON.stringify(body), { status: 200 }),
    );
    const backend = new FirebaseBackend({ databaseURL: dbUrl });
    const rows = await backend.pull<Workout>(
      'workouts',
      '2026-03-01T00:00:00Z',
    );
    expect(rows.map((r) => r.id)).toEqual(['b']);
  });

  it('returns an empty array when the node is null', async () => {
    spyOn(globalThis, 'fetch').and.resolveTo(
      new Response('null', { status: 200 }),
    );
    const backend = new FirebaseBackend({ databaseURL: dbUrl });
    expect(await backend.pull('workouts')).toEqual([]);
  });

  it('PATCHes a keyed payload on push', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').and.resolveTo(
      new Response('{}', { status: 200 }),
    );
    const backend = new FirebaseBackend({ databaseURL: dbUrl });
    const w = workout('w1', '2026-01-01T00:00:00Z');
    await backend.push('workouts', [w]);

    const [url, init] = fetchSpy.calls.mostRecent().args as [string, RequestInit];
    expect(url).toBe(`${dbUrl}/workouts.json`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ w1: w });
  });

  it('propagates HTTP errors on pull', async () => {
    spyOn(globalThis, 'fetch').and.resolveTo(
      new Response('nope', { status: 401, statusText: 'Unauthorized' }),
    );
    const backend = new FirebaseBackend({ databaseURL: dbUrl });
    await expectAsync(backend.pull('workouts')).toBeRejectedWithError(
      /Firebase pull failed: 401/,
    );
  });
});
