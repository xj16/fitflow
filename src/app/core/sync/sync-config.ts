/**
 * Optional remote-sync configuration.
 *
 * FitFlow works 100% offline with zero configuration. Sync is strictly
 * opt-in: the user pastes the URL and anon key of their OWN self-hosted
 * Supabase project (or a free supabase.com project) on the Settings screen.
 * Nothing here requires a paid service, and no keys are bundled with the app.
 *
 * Config is persisted in the offline store like any other data.
 */
export interface SyncConfig {
  /** Which backend adapter to use. Only one is active at a time. */
  provider: 'supabase' | 'firebase' | 'none';
  /** Supabase project URL, e.g. https://xyz.supabase.co */
  supabaseUrl?: string;
  /** Supabase anonymous public key (safe to store client-side). */
  supabaseAnonKey?: string;
  /** Firebase config JSON, used only by the alternative adapter. */
  firebaseConfig?: Record<string, string>;
  /** Auto-sync after each local change when true. */
  autoSync?: boolean;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  provider: 'none',
  autoSync: false,
};

export const SYNC_CONFIG_KEY = 'sync-config';
