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

  async pull<T extends Syncable>(collection: SyncCollection): Promise<T[]> {
    if (!this.isConfigured()) {
      throw new Error('Firebase backend is not configured');
    }
    const res = await fetch(`${this.databaseUrl}/${collection}.json`);
    if (!res.ok) {
      throw new Error(`Firebase pull failed: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as Record<string, T> | null;
    return body ? Object.values(body) : [];
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
