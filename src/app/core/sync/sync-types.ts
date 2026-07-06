import { Exercise, Routine, Workout } from '../models/workout.model';

/** Anything FitFlow syncs is a timestamped, id'd, soft-deletable record. */
export interface Syncable {
  id: string;
  updatedAt: string;
  deleted?: boolean;
}

/** Result of a merge between local and remote snapshots of one collection. */
export interface MergeResult<T extends Syncable> {
  /** The reconciled set to keep locally and (for pushes) upstream. */
  merged: T[];
  /** Records whose remote copy won and should overwrite local. */
  pulled: T[];
  /** Records whose local copy won and should be pushed upstream. */
  pushed: T[];
}

/** Everything a remote backend must implement to be a FitFlow sync target. */
export interface SyncBackend {
  readonly name: string;
  /** True when credentials/config are present and the backend is reachable. */
  isConfigured(): boolean;
  /** Pull all remote records for a collection. */
  pull<T extends Syncable>(collection: SyncCollection): Promise<T[]>;
  /** Upsert the given records into a collection. */
  push<T extends Syncable>(
    collection: SyncCollection,
    records: T[],
  ): Promise<void>;
}

export type SyncCollection = 'workouts' | 'exercises' | 'routines';

export interface SyncSnapshot {
  workouts: Workout[];
  exercises: Exercise[];
  routines: Routine[];
}

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'success'
  | 'error'
  | 'offline'
  | 'unconfigured';
