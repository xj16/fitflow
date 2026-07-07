import { SyncBackend, SyncCollection, Syncable } from './sync-types';

/**
 * Alternative sync backend targeting Firebase Realtime Database over its REST
 * API. This is the "one at a time" alternative to Supabase — only one backend
 * is ever active, chosen by SyncConfig.provider.
 *
 * We use the REST endpoint rather than the firebase JS SDK so the app stays
 * lean (no extra megabyte of vendor code) and works against a free Spark-plan
 * project. The user provides their databaseURL in the Firebase config.
 *
 * Data is stored under /<collection>/<id> as the full record JSON, mirroring
 * the Supabase schema so the merge layer is backend-agnostic.
 */
export class FirebaseBackend implements SyncBackend {
  readonly name = 'firebase';
  private readonly databaseUrl: string;

  constructor(config: Record<string, string> | undefined) {
    this.databaseUrl = (config?.['databaseURL'] ?? '').replace(/\/+$/, '');
  }

  isConfigured(): boolean {
    return this.databaseUrl.length > 0;
  }

  async pull<T extends Syncable>(
    collection: SyncCollection,
    since?: string | null,
  ): Promise<T[]> {
    if (!this.isConfigured()) {
      throw new Error('Firebase backend is not configured');
    }
    // Incremental delta sync: Firebase RTDB supports server-side range queries
    // via orderBy + startAt over the REST API. We use `startAt` (inclusive, and
    // universally supported across REST versions) and rely on the strict
    // client-side `> since` filter below to drop the boundary record — this is
    // more robust than `startAfter`, which some REST versions reject with 400.
    // (Requires an `.indexOn: ["updatedAt"]` rule on the node; without it
    // Firebase returns everything and we filter client-side.)
    let url = `${this.databaseUrl}/${collection}.json`;
    if (since) {
      const params = new URLSearchParams({
        orderBy: '"updatedAt"',
        startAt: `"${since}"`,
      });
      url = `${url}?${params.toString()}`;
    }
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Firebase pull failed: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as Record<string, T> | null;
    if (!body) {
      return [];
    }
    const rows = Object.values(body);
    // Defensive client-side filter in case the node has no index rule and
    // Firebase ignored the query (it then returns the whole collection).
    return since ? rows.filter((r) => r.updatedAt > since) : rows;
  }

  async push<T extends Syncable>(
    collection: SyncCollection,
    records: T[],
  ): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Firebase backend is not configured');
    }
    if (records.length === 0) {
      return;
    }
    // PATCH performs a multi-path update: one keyed entry per record id.
    const payload: Record<string, T> = {};
    for (const r of records) {
      payload[r.id] = r;
    }
    const res = await fetch(`${this.databaseUrl}/${collection}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Firebase push failed: ${res.status} ${res.statusText}`);
    }
  }
}
