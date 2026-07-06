import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SyncBackend, SyncCollection, Syncable } from './sync-types';

/**
 * Supabase implementation of the SyncBackend contract.
 *
 * Maps FitFlow's three collections onto three Postgres tables. Because every
 * record already carries a client-generated UUID `id` and an `updatedAt`
 * timestamp, an upsert keyed on `id` is all we need — the last-write-wins
 * merge happens client-side before we push, so the server stays a dumb store.
 *
 * The user supplies their own project URL + anon key, so this is free to run
 * against a self-hosted Supabase or a free-tier cloud project. See
 * `supabase/schema.sql` for the tables and row-level-security policies.
 */
export class SupabaseBackend implements SyncBackend {
  readonly name = 'supabase';
  private client: SupabaseClient | null = null;

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {
    if (url && anonKey) {
      this.client = createClient(url, anonKey, {
        auth: { persistSession: false },
      });
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private table(collection: SyncCollection): string {
    // Table names mirror collection names.
    return collection;
  }

  async pull<T extends Syncable>(collection: SyncCollection): Promise<T[]> {
    if (!this.client) {
      throw new Error('Supabase backend is not configured');
    }
    const { data, error } = await this.client
      .from(this.table(collection))
      .select('data');
    if (error) {
      throw new Error(`Supabase pull failed: ${error.message}`);
    }
    // Each row stores the full record JSON under a `data` column.
    return (data ?? []).map((row) => (row as { data: T }).data);
  }

  async push<T extends Syncable>(
    collection: SyncCollection,
    records: T[],
  ): Promise<void> {
    if (!this.client) {
      throw new Error('Supabase backend is not configured');
    }
    if (records.length === 0) {
      return;
    }
    const rows = records.map((r) => ({
      id: r.id,
      updated_at: r.updatedAt,
      deleted: r.deleted ?? false,
      data: r,
    }));
    const { error } = await this.client
      .from(this.table(collection))
      .upsert(rows, { onConflict: 'id' });
    if (error) {
      throw new Error(`Supabase push failed: ${error.message}`);
    }
  }
}
