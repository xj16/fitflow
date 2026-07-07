import { TestBed } from '@angular/core/testing';
import { DataService } from './data.service';
import { KV_STORE } from '../storage/storage.tokens';
import { MemoryStore } from '../storage/kv-store';

describe('DataService', () => {
  let service: DataService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        DataService,
        { provide: KV_STORE, useClass: MemoryStore },
      ],
    });
    service = TestBed.inject(DataService);
    await service.init();
  });

  it('seeds the exercise library on first run', () => {
    expect(service.exercises().length).toBeGreaterThan(10);
  });

  it('creates and lists a workout', async () => {
    const w = await service.createWorkout('Leg Day');
    expect(service.getWorkout(w.id)).toBeDefined();
    expect(service.workouts().some((x) => x.id === w.id)).toBeTrue();
    expect(service.workoutCount()).toBe(1);
  });

  it('adds an exercise and a set to a workout', async () => {
    const w = await service.createWorkout();
    const ex = service.exercises()[0];
    await service.addExerciseToWorkout(w.id, ex);

    let stored = service.getWorkout(w.id)!;
    expect(stored.exercises.length).toBe(1);
    expect(stored.exercises[0].sets.length).toBe(1);

    const entryId = stored.exercises[0].id;
    await service.addSet(w.id, entryId);
    stored = service.getWorkout(w.id)!;
    expect(stored.exercises[0].sets.length).toBe(2);
  });

  it('updates a set and reflects it in derived PRs', async () => {
    const w = await service.createWorkout();
    const ex = service.exercises().find((e) => e.name === 'Back Squat')!;
    await service.addExerciseToWorkout(w.id, ex);
    const entry = service.getWorkout(w.id)!.exercises[0];
    const setId = entry.sets[0].id;

    await service.updateSet(w.id, entry.id, setId, {
      weight: 120,
      reps: 5,
      done: true,
    });

    const pr = service.personalRecords().get(ex.id);
    expect(pr).toBeDefined();
    expect(pr!.maxWeight).toBe(120);
  });

  it('soft-deletes a workout so it drops out of the list', async () => {
    const w = await service.createWorkout();
    await service.deleteWorkout(w.id);
    expect(service.workouts().some((x) => x.id === w.id)).toBeFalse();
    // Tombstone still present in raw data for sync.
    expect(service.rawWorkouts().some((x) => x.id === w.id && x.deleted)).toBeTrue();
  });

  it('mirrors every mutation to the offline store', async () => {
    await service.createWorkout('Persisted');
    const store = TestBed.inject(KV_STORE);
    const raw = await store.get<unknown[]>('workouts');
    expect(Array.isArray(raw)).toBeTrue();
    expect((raw as unknown[]).length).toBe(1);
  });

  it('creates a custom exercise and persists it', async () => {
    const before = service.exercises().length;
    const created = await service.createExercise({
      name: 'Zercher Squat',
      muscleGroup: 'legs',
      equipment: 'barbell',
    });
    expect(service.exercises().length).toBe(before + 1);
    expect(created.id).toBeTruthy();
  });

  // ---- Demo mode --------------------------------------------------------

  it('seeds demo history only when there is no data', async () => {
    expect(service.hasData()).toBeFalse();
    const seeded = await service.loadDemoData(6);
    expect(seeded).toBeTrue();
    expect(service.workouts().length).toBeGreaterThan(0);
    expect(service.hasData()).toBeTrue();

    // Second call is a no-op — never clobbers existing history.
    const seededAgain = await service.loadDemoData(6);
    expect(seededAgain).toBeFalse();
  });

  // ---- Import / export --------------------------------------------------

  it('produces a versioned, self-describing export', async () => {
    await service.createWorkout('Exported');
    const dump = service.buildExport();
    expect(dump.app).toBe('fitflow');
    expect(dump.schemaVersion).toBeGreaterThanOrEqual(1);
    expect(dump.workouts.length).toBe(1);
    expect(typeof dump.exportedAt).toBe('string');
  });

  it('imports a backup by last-write-wins merge, not blind overwrite', async () => {
    // Local edit that is NEWER than the imported copy must survive.
    const w = await service.createWorkout('Local Newer');
    await service.updateWorkout(w.id, { title: 'Local Newer v2' });

    const stale = {
      ...w,
      title: 'Stale Import',
      updatedAt: '2000-01-01T00:00:00.000Z',
    };
    const brandNew = {
      id: 'imported-1',
      date: '2026-01-01T00:00:00.000Z',
      title: 'Imported Session',
      unit: 'kg' as const,
      exercises: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const summary = await service.importData({
      app: 'fitflow',
      workouts: [stale, brandNew],
    });

    // The stale import lost to the newer local edit.
    expect(service.getWorkout(w.id)?.title).toBe('Local Newer v2');
    // The brand-new record was pulled in.
    expect(service.getWorkout('imported-1')).toBeDefined();
    expect(summary.workouts).toBe(1); // one net-new record pulled
  });

  it('rejects a non-FitFlow payload', async () => {
    await expectAsync(
      service.importData({ app: 'somethingelse', workouts: [] }),
    ).toBeRejectedWithError(/Not a FitFlow backup/);
  });

  it('rejects a payload with no recognizable collections', async () => {
    await expectAsync(service.importData({ app: 'fitflow' })).toBeRejectedWithError(
      /no recognizable data/,
    );
  });
});
