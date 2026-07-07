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
import { deobfuscate, obfuscate } from './secret';

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
  private readonly _pendingChanges = signal(0);

  readonly config = this._config.asReadonly();
  readonly status = this._status.asReadonly();
  readonly lastSyncedAt = this._lastSyncedAt.asReadonly();
  readonly lastError = this._lastError.asReadonly();
  /** Count of local mutations not yet pushed to the remote, for the UI. */
  readonly pendingChanges = this._pendingChanges.asReadonly();

  private autoSyncHandle: ReturnType<typeof setTimeout> | null = null;
  private listenersBound = false;

  readonly isConfigured = computed(
    () => this.buildBackend(this._config())?.isConfigured() ?? false,
  );

  /** True when auto-sync is enabled AND a backend is configured. */
  readonly autoSyncActive = computed(
    () => (this._config().autoSync ?? false) && this.isConfigured(),
  );

  /** Load persisted sync config on startup and bind background-sync triggers. */
  async init(): Promise<void> {
    await this.store.ready();
    const cfg = await this.store.get<SyncConfig>(SYNC_CONFIG_KEY);
    if (cfg) {
      this._config.set({ ...DEFAULT_SYNC_CONFIG, ...decodeConfig(cfg) });
    }
    this._status.set(this.isConfigured() ? 'idle' : 'unconfigured');
    const last = await this.store.get<string>('last-synced-at');
    if (last) {
      this._lastSyncedAt.set(last);
    }
    this.bindLifecycleListeners();
    // Debounced auto-sync after local edits (only fires when auto-sync is on).
    this.data.setChangeListener(() => this.notifyLocalChange());
    // If we came up online with auto-sync on, catch up immediately.
    if (this.autoSyncActive() && this.isOnline()) {
      void this.syncNow();
    }
  }

  /**
   * Register a debounced sync after a local mutation. DataService calls this on
   * every write; when auto-sync is on we push changes up shortly after the user
   * stops editing (coalescing bursts of keystrokes into a single sync).
   */
  notifyLocalChange(): void {
    // Only meaningful when a remote is configured — an offline-only user has
    // nothing to push, so we don't accumulate a phantom pending count.
    if (!this.isConfigured()) {
      return;
    }
    this._pendingChanges.update((n) => n + 1);
    if (!this.autoSyncActive()) {
      return;
    }
    if (this.autoSyncHandle) {
      clearTimeout(this.autoSyncHandle);
    }
    this.autoSyncHandle = setTimeout(() => {
      this.autoSyncHandle = null;
      if (this.isOnline()) {
        void this.syncNow();
      }
    }, AUTO_SYNC_DEBOUNCE_MS);
  }

  /** Wire window 'online' + document visibility (app-resume) auto-sync. */
  private bindLifecycleListeners(): void {
    if (this.listenersBound || typeof window === 'undefined') {
      return;
    }
    this.listenersBound = true;
    window.addEventListener('online', () => {
      if (this.autoSyncActive()) {
        void this.syncNow();
      }
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.autoSyncActive()) {
          void this.syncNow();
        }
      });
    }
  }

  private isOnline(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  async saveConfig(config: SyncConfig): Promise<void> {
    // Keep the in-memory config in clear text (the adapters need it), but
    // obfuscate credentials before they touch disk so IndexedDB never holds
    // clear-text keys.
    this._config.set(config);
    await this.store.set(SYNC_CONFIG_KEY, encodeConfig(config));
    this._status.set(this.isConfigured() ? 'idle' : 'unconfigured');
    // Credentials may have changed → the delta cursors are backend-specific,
    // so reset them to force a full re-pull against the new target.
    await this.resetDeltaCursors();
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
      const marks = (await this.store.get<HighWaterMarks>(HWM_KEY)) ?? {};

      const workoutRes = await this.syncCollection(
        backend,
        'workouts',
        this.data.rawWorkouts(),
        marks.workouts ?? null,
      );
      const exerciseRes = await this.syncCollection(
        backend,
        'exercises',
        this.data.rawExercises(),
        marks.exercises ?? null,
      );
      const routineRes = await this.syncCollection(
        backend,
        'routines',
        this.data.rawRoutines(),
        marks.routines ?? null,
      );

      await this.data.replaceAll({
        workouts: workoutRes.merged,
        exercises: exerciseRes.merged,
        routines: routineRes.merged,
      });

      // Persist per-collection high-water marks so the next sync is a delta.
      await this.store.set<HighWaterMarks>(HWM_KEY, {
        workouts: workoutRes.mark,
        exercises: exerciseRes.mark,
        routines: routineRes.mark,
      });

      const stamp = nowIso();
      this._lastSyncedAt.set(stamp);
      await this.store.set('last-synced-at', stamp);
      this._pendingChanges.set(0);
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

  /**
   * Pull (incrementally, from `since`), merge, and push a single collection.
   * Returns the merged set, pulled/pushed counts, and the new high-water mark
   * to persist for the next delta pull.
   */
  private async syncCollection<T extends Syncable>(
    backend: SyncBackend,
    collection: 'workouts' | 'exercises' | 'routines',
    local: T[],
    since: string | null,
  ): Promise<{ merged: T[]; pulled: number; pushed: number; mark: string }> {
    const remote = await backend.pull<T>(collection, since);
    const result = mergeCollections(local, remote);

    // A delta pull only returns records the remote changed AFTER `since`, so a
    // "local-only" record in the merge is ambiguous: it is either genuinely new
    // OR already-synced (and simply not part of this delta). To avoid re-pushing
    // the entire collection every sync, when we have a cursor we only push
    // records whose local copy actually changed since it (updatedAt > since).
    // On a full pull (no cursor) we push everything the merge selected.
    const toPush = since
      ? result.pushed.filter((r) => r.updatedAt > since)
      : result.pushed;
    if (toPush.length > 0) {
      await backend.push(collection, toPush);
    }

    // Advance the mark to the newest updatedAt we know about after this sync,
    // so the next pull only fetches records changed strictly afterwards.
    const mark = maxUpdatedAt([...result.merged], since);
    return {
      merged: result.merged,
      pulled: result.pulled.length,
      pushed: toPush.length,
      mark,
    };
  }

  /** Clear stored delta cursors so the next sync performs a full re-pull. */
  async resetDeltaCursors(): Promise<void> {
    await this.store.remove(HWM_KEY);
  }
}

/** Per-collection ISO high-water marks for incremental delta pulls. */
interface HighWaterMarks {
  workouts?: string;
  exercises?: string;
  routines?: string;
}

const HWM_KEY = 'sync-high-water-marks';

/** Coalesce bursts of edits into a single auto-sync after this quiet period. */
const AUTO_SYNC_DEBOUNCE_MS = 4000;

/** Newest `updatedAt` across records, floored at the previous mark. */
function maxUpdatedAt(records: Syncable[], floor: string | null): string {
  let max = floor ?? '';
  for (const r of records) {
    if (r.updatedAt > max) {
      max = r.updatedAt;
    }
  }
  return max;
}

/** Obfuscate sensitive credential fields before persisting a config. */
function encodeConfig(cfg: SyncConfig): SyncConfig {
  const out: SyncConfig = { ...cfg };
  if (cfg.supabaseAnonKey) {
    out.supabaseAnonKey = obfuscate(cfg.supabaseAnonKey);
  }
  if (cfg.firebaseConfig) {
    out.firebaseConfig = mapValues(cfg.firebaseConfig, obfuscate);
  }
  return out;
}

/** Reverse `encodeConfig` when loading a persisted config. */
function decodeConfig(cfg: SyncConfig): SyncConfig {
  const out: SyncConfig = { ...cfg };
  if (cfg.supabaseAnonKey) {
    out.supabaseAnonKey = deobfuscate(cfg.supabaseAnonKey);
  }
  if (cfg.firebaseConfig) {
    out.firebaseConfig = mapValues(cfg.firebaseConfig, deobfuscate);
  }
  return out;
}

function mapValues(
  obj: Record<string, string>,
  fn: (v: string | undefined) => string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = fn(v) ?? v;
  }
  return out;
}
