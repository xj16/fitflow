import { computed, inject, Injectable, signal } from '@angular/core';
import { KV_STORE } from '../storage/storage.tokens';
import { buildSeedExercises } from '../data/seed-exercises';
import { buildDemoHistory } from '../data/demo-data';
import {
  Exercise,
  ExerciseEntry,
  PersonalRecord,
  Routine,
  Workout,
  WorkoutSet,
} from '../models/workout.model';
import { nowIso, uuid } from '../utils/id';
import { computePersonalRecords } from '../utils/training-math';
import { mergeCollections } from '../sync/merge';

const KEY_WORKOUTS = 'workouts';
const KEY_EXERCISES = 'exercises';
const KEY_ROUTINES = 'routines';
const KEY_SCHEMA_VERSION = 'schema-version';

/** Current on-disk storage-format version, bumped when the shape changes. */
export const SCHEMA_VERSION = 1;

/** Shape of a FitFlow JSON backup / export. */
export interface FitFlowExport {
  schemaVersion: number;
  exportedAt: string;
  app: 'fitflow';
  workouts: Workout[];
  exercises: Exercise[];
  routines: Routine[];
}

/**
 * The single source of truth for all FitFlow data.
 *
 * Everything is held in Angular signals for fine-grained reactivity and
 * mirrored to the offline KvStore on every mutation, so the app is fully
 * usable with no network. Reads are synchronous off the signals; writes are
 * fire-and-forget persisted (awaited internally, surfaced via `saving`).
 *
 * All ids are client-generated and every record carries timestamps, which is
 * what lets the optional Supabase sync layer reconcile changes made offline.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly store = inject(KV_STORE);

  private readonly _workouts = signal<Workout[]>([]);
  private readonly _exercises = signal<Exercise[]>([]);
  private readonly _routines = signal<Routine[]>([]);
  private readonly _loaded = signal(false);

  /**
   * Optional hook invoked after any local mutation is persisted. SyncService
   * registers its debounced auto-sync trigger here. Kept as a plain callback
   * (rather than a direct import) so the data layer stays sync-agnostic and
   * there is no circular dependency between DataService and SyncService.
   */
  private onLocalChange: (() => void) | null = null;

  /** Register (or clear) the post-mutation change hook. */
  setChangeListener(fn: (() => void) | null): void {
    this.onLocalChange = fn;
  }

  /** All non-deleted workouts, newest first. */
  readonly workouts = computed(() =>
    this._workouts()
      .filter((w) => !w.deleted)
      .sort((a, b) => b.date.localeCompare(a.date)),
  );

  /** All non-deleted exercises, alphabetically. */
  readonly exercises = computed(() =>
    this._exercises()
      .filter((e) => !e.deleted)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  /** All non-deleted routines. */
  readonly routines = computed(() =>
    this._routines().filter((r) => !r.deleted),
  );

  readonly loaded = this._loaded.asReadonly();

  /** Personal records keyed by exerciseId, derived from workout history. */
  readonly personalRecords = computed<Map<string, PersonalRecord>>(() =>
    computePersonalRecords(this._workouts()),
  );

  /** Total number of logged (non-deleted) workouts. */
  readonly workoutCount = computed(() => this.workouts().length);

  /** Which storage backend is active, for the Settings screen. */
  get backend(): string {
    return this.store.backend;
  }

  /**
   * Load all collections from disk. Seeds the exercise library on first run.
   * Idempotent — safe to call from multiple route guards.
   */
  async init(): Promise<void> {
    if (this._loaded()) {
      return;
    }
    await this.store.ready();

    const [workouts, exercises, routines] = await Promise.all([
      this.store.get<Workout[]>(KEY_WORKOUTS),
      this.store.get<Exercise[]>(KEY_EXERCISES),
      this.store.get<Routine[]>(KEY_ROUTINES),
    ]);

    this._workouts.set(workouts ?? []);
    this._routines.set(routines ?? []);

    if (exercises && exercises.length > 0) {
      this._exercises.set(exercises);
    } else {
      const seed = buildSeedExercises();
      this._exercises.set(seed);
      await this.store.set(KEY_EXERCISES, seed);
    }

    await this.runMigrations();
    this._loaded.set(true);
  }

  /**
   * Storage-format migration hook. Reads the stored schema version and applies
   * any incremental upgrades needed to reach SCHEMA_VERSION, then stamps the
   * new version. Runs once on init and is a no-op when already current — this
   * is the safety valve that lets the single-blob-per-collection format evolve
   * without losing user data.
   */
  private async runMigrations(): Promise<void> {
    const stored = (await this.store.get<number>(KEY_SCHEMA_VERSION)) ?? 0;
    if (stored >= SCHEMA_VERSION) {
      return;
    }
    // (Future migrations from `stored` → SCHEMA_VERSION go here, in order.)
    await this.store.set(KEY_SCHEMA_VERSION, SCHEMA_VERSION);
  }

  // ---- Demo mode --------------------------------------------------------

  /** True once demo history has been generated (used to gate the UI button). */
  readonly hasData = computed(() => this._workouts().some((w) => !w.deleted));

  /**
   * Seed ~12 weeks of realistic progressive-overload history so the Stats,
   * PR and chart views render fully populated. Idempotent-ish: it only seeds
   * when there is no existing workout history, so it never clobbers real data.
   * Returns true if it seeded, false if it was skipped.
   */
  async loadDemoData(weeks = 12): Promise<boolean> {
    if (this.hasData()) {
      return false;
    }
    const { workouts, routines } = buildDemoHistory(this._exercises(), weeks);
    this._workouts.set(workouts);
    this._routines.update((list) => [...list, ...routines]);
    await this.store.set(KEY_WORKOUTS, workouts);
    await this.store.set(KEY_ROUTINES, this._routines());
    return true;
  }

  // ---- Import / export --------------------------------------------------

  /** Build a versioned, self-describing backup of everything. */
  buildExport(): FitFlowExport {
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: nowIso(),
      app: 'fitflow',
      workouts: this._workouts(),
      exercises: this._exercises(),
      routines: this._routines(),
    };
  }

  /**
   * Import a backup, reconciling it into local data with the same
   * last-write-wins merge engine used by sync (NOT a blind overwrite), so
   * importing on a device that already has data never loses newer local edits.
   * Validates the payload shape and returns a per-collection merge summary.
   */
  async importData(
    raw: unknown,
  ): Promise<{ workouts: number; exercises: number; routines: number }> {
    const data = raw as Partial<FitFlowExport> | null;
    if (
      !data ||
      typeof data !== 'object' ||
      (data.app !== undefined && data.app !== 'fitflow')
    ) {
      throw new Error('Not a FitFlow backup file.');
    }
    const importedWorkouts = asArray<Workout>(data.workouts);
    const importedExercises = asArray<Exercise>(data.exercises);
    const importedRoutines = asArray<Routine>(data.routines);
    if (
      !importedWorkouts &&
      !importedExercises &&
      !importedRoutines
    ) {
      throw new Error('Backup contains no recognizable data.');
    }

    const w = mergeCollections(this._workouts(), importedWorkouts ?? []);
    const e = mergeCollections(this._exercises(), importedExercises ?? []);
    const r = mergeCollections(this._routines(), importedRoutines ?? []);

    this._workouts.set(w.merged);
    this._exercises.set(e.merged);
    this._routines.set(r.merged);
    await this.store.set(KEY_WORKOUTS, w.merged);
    await this.store.set(KEY_EXERCISES, e.merged);
    await this.store.set(KEY_ROUTINES, r.merged);
    this.notifyChange();

    return {
      workouts: w.pulled.length,
      exercises: e.pulled.length,
      routines: r.pulled.length,
    };
  }

  // ---- Workouts ---------------------------------------------------------

  getWorkout(id: string): Workout | undefined {
    return this._workouts().find((w) => w.id === id && !w.deleted);
  }

  /** Create a blank workout for today and persist it. Returns the new record. */
  async createWorkout(title = 'New Workout'): Promise<Workout> {
    const ts = nowIso();
    const workout: Workout = {
      id: uuid(),
      date: ts,
      title,
      unit: 'kg',
      exercises: [],
      createdAt: ts,
      updatedAt: ts,
    };
    this._workouts.update((list) => [workout, ...list]);
    await this.persistWorkouts();
    return workout;
  }

  /** Apply a partial update to a workout, bumping updatedAt. */
  async updateWorkout(id: string, patch: Partial<Workout>): Promise<void> {
    this._workouts.update((list) =>
      list.map((w) =>
        w.id === id ? { ...w, ...patch, updatedAt: nowIso() } : w,
      ),
    );
    await this.persistWorkouts();
  }

  /** Soft-delete a workout so the deletion propagates through sync. */
  async deleteWorkout(id: string): Promise<void> {
    this._workouts.update((list) =>
      list.map((w) =>
        w.id === id ? { ...w, deleted: true, updatedAt: nowIso() } : w,
      ),
    );
    await this.persistWorkouts();
  }

  /** Add an exercise entry to a workout. */
  async addExerciseToWorkout(
    workoutId: string,
    exercise: Exercise,
  ): Promise<void> {
    const entry: ExerciseEntry = {
      id: uuid(),
      exerciseId: exercise.id,
      name: exercise.name,
      sets: [this.blankSet()],
    };
    const w = this.getWorkout(workoutId);
    if (!w) {
      return;
    }
    await this.updateWorkout(workoutId, {
      exercises: [...w.exercises, entry],
    });
  }

  async removeExerciseEntry(
    workoutId: string,
    entryId: string,
  ): Promise<void> {
    const w = this.getWorkout(workoutId);
    if (!w) {
      return;
    }
    await this.updateWorkout(workoutId, {
      exercises: w.exercises.filter((e) => e.id !== entryId),
    });
  }

  async addSet(workoutId: string, entryId: string): Promise<void> {
    const w = this.getWorkout(workoutId);
    if (!w) {
      return;
    }
    const exercises = w.exercises.map((e) => {
      if (e.id !== entryId) {
        return e;
      }
      // Prefill the new set from the previous one for fast logging.
      const prev = e.sets[e.sets.length - 1];
      const seed = prev
        ? { ...this.blankSet(), weight: prev.weight, reps: prev.reps }
        : this.blankSet();
      return { ...e, sets: [...e.sets, seed] };
    });
    await this.updateWorkout(workoutId, { exercises });
  }

  async updateSet(
    workoutId: string,
    entryId: string,
    setId: string,
    patch: Partial<WorkoutSet>,
  ): Promise<void> {
    const w = this.getWorkout(workoutId);
    if (!w) {
      return;
    }
    const exercises = w.exercises.map((e) =>
      e.id !== entryId
        ? e
        : {
            ...e,
            sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
          },
    );
    await this.updateWorkout(workoutId, { exercises });
  }

  async removeSet(
    workoutId: string,
    entryId: string,
    setId: string,
  ): Promise<void> {
    const w = this.getWorkout(workoutId);
    if (!w) {
      return;
    }
    const exercises = w.exercises.map((e) =>
      e.id !== entryId
        ? e
        : { ...e, sets: e.sets.filter((s) => s.id !== setId) },
    );
    await this.updateWorkout(workoutId, { exercises });
  }

  private blankSet(): WorkoutSet {
    return { id: uuid(), weight: 0, reps: 0, done: false };
  }

  // ---- Exercises --------------------------------------------------------

  async createExercise(
    data: Omit<Exercise, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Exercise> {
    const ts = nowIso();
    const ex: Exercise = { ...data, id: uuid(), createdAt: ts, updatedAt: ts };
    this._exercises.update((list) => [...list, ex]);
    await this.persistExercises();
    return ex;
  }

  async deleteExercise(id: string): Promise<void> {
    this._exercises.update((list) =>
      list.map((e) =>
        e.id === id ? { ...e, deleted: true, updatedAt: nowIso() } : e,
      ),
    );
    await this.persistExercises();
  }

  // ---- Routines ---------------------------------------------------------

  getRoutine(id: string): Routine | undefined {
    return this._routines().find((r) => r.id === id && !r.deleted);
  }

  async saveRoutine(routine: Routine): Promise<void> {
    const exists = this._routines().some((r) => r.id === routine.id);
    const stamped = { ...routine, updatedAt: nowIso() };
    this._routines.update((list) =>
      exists
        ? list.map((r) => (r.id === routine.id ? stamped : r))
        : [...list, stamped],
    );
    await this.persistRoutines();
  }

  async deleteRoutine(id: string): Promise<void> {
    this._routines.update((list) =>
      list.map((r) =>
        r.id === id ? { ...r, deleted: true, updatedAt: nowIso() } : r,
      ),
    );
    await this.persistRoutines();
  }

  // ---- Sync bridge ------------------------------------------------------

  /** Raw snapshots for the sync engine (includes tombstones). */
  rawWorkouts(): Workout[] {
    return this._workouts();
  }
  rawExercises(): Exercise[] {
    return this._exercises();
  }
  rawRoutines(): Routine[] {
    return this._routines();
  }

  /** Replace local collections after a sync merge, then persist. */
  async replaceAll(data: {
    workouts?: Workout[];
    exercises?: Exercise[];
    routines?: Routine[];
  }): Promise<void> {
    if (data.workouts) {
      this._workouts.set(data.workouts);
      await this.store.set(KEY_WORKOUTS, data.workouts);
    }
    if (data.exercises) {
      this._exercises.set(data.exercises);
      await this.store.set(KEY_EXERCISES, data.exercises);
    }
    if (data.routines) {
      this._routines.set(data.routines);
      await this.store.set(KEY_ROUTINES, data.routines);
    }
  }

  private async persistWorkouts(): Promise<void> {
    await this.store.set(KEY_WORKOUTS, this._workouts());
    this.notifyChange();
  }

  private async persistExercises(): Promise<void> {
    await this.store.set(KEY_EXERCISES, this._exercises());
    this.notifyChange();
  }

  private async persistRoutines(): Promise<void> {
    await this.store.set(KEY_ROUTINES, this._routines());
    this.notifyChange();
  }

  private notifyChange(): void {
    this.onLocalChange?.();
  }
}

/** Narrow an unknown import field to a syncable array, or undefined. */
function asArray<T>(value: unknown): T[] | undefined {
  return Array.isArray(value) ? (value as T[]) : undefined;
}
