import { TestBed } from '@angular/core/testing';
import { SyncService } from './sync.service';
import { DataService } from '../services/data.service';
import { KV_STORE } from '../storage/storage.tokens';
import { MemoryStore } from '../storage/kv-store';
import { SyncBackend, SyncCollection, Syncable } from './sync-types';
import { SyncConfig } from './sync-config';
import { Workout } from '../models/workout.model';

/**
 * A fully in-memory fake SyncBackend that records every call, so we can assert
 * the orchestration (pull → merge → push → persist) without a network. It also
 * honours the `since` delta cursor so we can prove incremental sync.
 */
class FakeBackend implements SyncBackend {
  readonly name = 'fake';
  configured = true;
  remote: Record<SyncCollection, Syncable[]> = {
    workouts: [],
    exercises: [],
    routines: [],
  };
  pulls: Array<{ collection: SyncCollection; since?: string | null }> = [];
  pushes: Array<{ collection: SyncCollection; records: Syncable[] }> = [];
  failOnPull = false;

  isConfigured(): boolean {
    return this.configured;
  }

  async pull<T extends Syncable>(
    collection: SyncCollection,
    since?: string | null,
  ): Promise<T[]> {
    this.pulls.push({ collection, since });
    if (this.failOnPull) {
      throw new Error('boom');
    }
    const rows = this.remote[collection] as T[];
    return since ? rows.filter((r) => r.updatedAt > since) : [...rows];
  }

  async push<T extends Syncable>(
    collection: SyncCollection,
    records: T[],
  ): Promise<void> {
    this.pushes.push({ collection, records: [...records] });
    // Reflect the push into the fake remote so a re-sync converges.
    const byId = new Map(this.remote[collection].map((r) => [r.id, r]));
    for (const r of records) {
      byId.set(r.id, r);
    }
    this.remote[collection] = [...byId.values()];
  }
}

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
}

describe('SyncService', () => {
  let sync: SyncService;
  let data: DataService;
  let fake: FakeBackend;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        SyncService,
        DataService,
        { provide: KV_STORE, useClass: MemoryStore },
      ],
    });
    data = TestBed.inject(DataService);
    sync = TestBed.inject(SyncService);
    await data.init();
    await sync.init();

    fake = new FakeBackend();
    // Force the service to use our fake backend regardless of config.
    (sync as unknown as { buildBackend: () => SyncBackend }).buildBackend =
      () => fake;
  });

  it('reports unconfigured and no-ops when the backend is not configured', async () => {
    fake.configured = false;
    const msg = await sync.syncNow();
    expect(msg).toContain('not configured');
    expect(sync.status()).toBe('unconfigured');
    expect(fake.pulls.length).toBe(0);
  });

  it('runs the full pull → merge → push → persist flow', async () => {
    // Seed a local workout so there is something to push.
    const local = await data.createWorkout('Bench Day');
    // Seed a remote-only workout so there is something to pull.
    const remoteWorkout: Workout = {
      id: 'remote-1',
      date: iso(1),
      title: 'Remote Squat',
      unit: 'kg',
      exercises: [],
      createdAt: iso(1),
      updatedAt: iso(1),
    };
    fake.remote.workouts = [remoteWorkout];

    const msg = await sync.syncNow();

    expect(sync.status()).toBe('success');
    expect(msg).toContain('Synced');
    // Pulled the remote workout down into local data.
    expect(data.getWorkout('remote-1')).toBeDefined();
    // Pushed the local workout up.
    const pushedWorkouts = fake.pushes.filter((p) => p.collection === 'workouts');
    expect(pushedWorkouts.length).toBe(1);
    expect(pushedWorkouts[0].records.some((r) => r.id === local.id)).toBeTrue();
    // Persisted a last-synced-at stamp.
    expect(sync.lastSyncedAt()).not.toBeNull();
  });

  it('captures errors into the status signal without throwing', async () => {
    fake.failOnPull = true;
    const msg = await sync.syncNow();
    expect(msg).toContain('Sync failed');
    expect(sync.status()).toBe('error');
    expect(sync.lastError()).toBe('boom');
  });

  it('goes offline (not error) when navigator reports offline', async () => {
    const spy = spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);
    const msg = await sync.syncNow();
    expect(msg).toContain('Offline');
    expect(sync.status()).toBe('offline');
    expect(fake.pulls.length).toBe(0);
    spy.and.callThrough();
  });

  it('performs a full pull first, then an incremental delta pull', async () => {
    await data.createWorkout('First');
    await sync.syncNow();
    // First sync: no cursor → full pull (since is null/undefined).
    const firstPull = fake.pulls.find((p) => p.collection === 'workouts');
    expect(firstPull?.since ?? null).toBeNull();

    fake.pulls = [];
    await sync.syncNow();
    // Second sync: a high-water mark should now be sent as `since`.
    const secondPull = fake.pulls.find((p) => p.collection === 'workouts');
    expect(secondPull?.since).toBeTruthy();
  });

  it('is idempotent — a second immediate sync pushes nothing new', async () => {
    await data.createWorkout('Idem');
    await sync.syncNow();
    fake.pushes = [];
    await sync.syncNow();
    const pushedRecords = fake.pushes.reduce((n, p) => n + p.records.length, 0);
    expect(pushedRecords).toBe(0);
  });

  it('resets delta cursors so the next sync is a full pull again', async () => {
    await data.createWorkout('Reset');
    await sync.syncNow();
    await sync.resetDeltaCursors();
    fake.pulls = [];
    await sync.syncNow();
    const pull = fake.pulls.find((p) => p.collection === 'workouts');
    expect(pull?.since ?? null).toBeNull();
  });

  it('tracks pending changes and clears them on a successful sync', async () => {
    // Configure a backend so the `_config` signal changes and the isConfigured
    // computed re-evaluates against our overridden buildBackend (which returns
    // the fake). Pending changes are only tracked when a remote is configured.
    await sync.saveConfig({
      provider: 'supabase',
      supabaseUrl: 'https://demo.supabase.co',
      supabaseAnonKey: 'k',
      autoSync: false,
    });
    expect(sync.isConfigured()).toBeTrue();

    sync.notifyLocalChange();
    sync.notifyLocalChange();
    expect(sync.pendingChanges()).toBe(2);
    await sync.syncNow();
    expect(sync.pendingChanges()).toBe(0);
  });

  it('does not accumulate pending changes when no backend is configured', () => {
    // `_config` is still 'none' here (default), so nothing is pending.
    sync.notifyLocalChange();
    sync.notifyLocalChange();
    expect(sync.pendingChanges()).toBe(0);
  });

  it('obfuscates the supabase key on disk but keeps it usable in memory', async () => {
    const cfg: SyncConfig = {
      provider: 'supabase',
      supabaseUrl: 'https://demo.supabase.co',
      supabaseAnonKey: 'super-secret-anon-key',
      autoSync: false,
    };
    await sync.saveConfig(cfg);
    // In memory the key is clear text (adapters need it).
    expect(sync.config().supabaseAnonKey).toBe('super-secret-anon-key');
    // On disk it is obfuscated, not clear text.
    const store = TestBed.inject(KV_STORE);
    const raw = await store.get<SyncConfig>('sync-config');
    expect(raw?.supabaseAnonKey).toBeTruthy();
    expect(raw?.supabaseAnonKey).not.toBe('super-secret-anon-key');
  });
});
