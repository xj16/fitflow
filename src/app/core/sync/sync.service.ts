import { computed, inject, Injectable, signal } from '@angular/core';
import { DataService } from '../services/data.service';
import { KV_STORE } from '../storage/storage.tokens';
import { FirebaseBackend } from './firebase.backend';
import { SupabaseBackend } from './supabase.backend';
import {
  DEFAULT_SYNC_CONFIG,
  SYNC_CONFIG_KEY,
  SyncConfig,
} from './sync-config';
import { mergeCollections } from './merge';
import { SyncBackend, SyncStatus, Syncable } from './sync-types';
import { nowIso } from '../utils/id';

/**
 * Orchestrates optional two-way sync between the offline store and a remote
 * backend (Supabase primary, Firebase alternative — one active at a time).
 *
 * The flow for each collection is: pull remote → last-write-wins merge with
 * local → push the records whose local copy won → persist the merged set. The
 * whole thing is a no-op (status 'unconfigured') until the user provides
 * credentials, so the app is fully functional offline with sync bolted on.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly data = inject(DataService);
  private readonly store = inject(KV_STORE);

  private readonly _config = signal<SyncConfig>(DEFAULT_SYNC_CONFIG);
  private readonly _status = signal<SyncStatus>('unconfigured');
  private readonly _lastSyncedAt = signal<string | null>(null);
  private readonly _lastError = signal<string | null>(null);

  readonly config = this._config.asReadonly();
  readonly status = this._status.asReadonly();
  readonly lastSyncedAt = this._lastSyncedAt.asReadonly();
  readonly lastError = this._lastError.asReadonly();

  readonly isConfigured = computed(
    () => this.buildBackend(this._config())?.isConfigured() ?? false,
  );

  /** Load persisted sync config on startup. */
  async init(): Promise<void> {
    await this.store.ready();
    const cfg = await this.store.get<SyncConfig>(SYNC_CONFIG_KEY);
    if (cfg) {
      this._config.set({ ...DEFAULT_SYNC_CONFIG, ...cfg });
    }
    this._status.set(this.isConfigured() ? 'idle' : 'unconfigured');
    const last = await this.store.get<string>('last-synced-at');
    if (last) {
      this._lastSyncedAt.set(last);
    }
  }

  async saveConfig(config: SyncConfig): Promise<void> {
    this._config.set(config);
    await this.store.set(SYNC_CONFIG_KEY, config);
    this._status.set(this.isConfigured() ? 'idle' : 'unconfigured');
  }

  private buildBackend(cfg: SyncConfig): SyncBackend | null {
    switch (cfg.provider) {
      case 'supabase':
        return new SupabaseBackend(
          cfg.supabaseUrl ?? '',
          cfg.supabaseAnonKey ?? '',
        );
      case 'firebase':
        return new FirebaseBackend(cfg.firebaseConfig);
      default:
        return null;
    }
  }

  /**
   * Run a full sync of all three collections. Safe to call any time; returns
   * a short human-readable summary. Never throws — errors are captured into
   * the reactive status/error signals for the UI to display.
   */
  async syncNow(): Promise<string> {
    const cfg = this._config();
    const backend = this.buildBackend(cfg);

    if (!backend || !backend.isConfigured()) {
      this._status.set('unconfigured');
      return 'Sync is not configured.';
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this._status.set('offline');
      this._lastError.set('Device is offline');
      return 'Offline — will sync when back online.';
    }

    this._status.set('syncing');
    this._lastError.set(null);

    try {
      const workoutRes = await this.syncCollection(
        backend,
        'workouts',
        this.data.rawWorkouts(),
      );
      const exerciseRes = await this.syncCollection(
        backend,
        'exercises',
        this.data.rawExercises(),
      );
      const routineRes = await this.syncCollection(
        backend,
        'routines',
        this.data.rawRoutines(),
      );

      await this.data.replaceAll({
        workouts: workoutRes.merged,
        exercises: exerciseRes.merged,
        routines: routineRes.merged,
      });

      const stamp = nowIso();
      this._lastSyncedAt.set(stamp);
      await this.store.set('last-synced-at', stamp);
      this._status.set('success');

      const pulled =
        workoutRes.pulled + exerciseRes.pulled + routineRes.pulled;
      const pushed =
        workoutRes.pushed + exerciseRes.pushed + routineRes.pushed;
      return `Synced. Pulled ${pulled}, pushed ${pushed}.`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._lastError.set(message);
      this._status.set('error');
      return `Sync failed: ${message}`;
    }
  }

  /** Pull, merge, push a single collection; returns pulled/pushed counts. */
  private async syncCollection<T extends Syncable>(
    backend: SyncBackend,
    collection: 'workouts' | 'exercises' | 'routines',
    local: T[],
  ): Promise<{ merged: T[]; pulled: number; pushed: number }> {
    const remote = await backend.pull<T>(collection);
    const result = mergeCollections(local, remote);
    if (result.pushed.length > 0) {
      await backend.push(collection, result.pushed);
    }
    return {
      merged: result.merged,
      pulled: result.pulled.length,
      pushed: result.pushed.length,
    };
  }
}
