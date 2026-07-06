import { InjectionToken } from '@angular/core';
import { createKvStore, KvStore } from './kv-store';

/**
 * DI token for the offline key-value store. Provided at the app root with an
 * environment-appropriate implementation (IndexedDB in browsers/WebView,
 * in-memory fallback otherwise). Tests can override this with a MemoryStore.
 */
export const KV_STORE = new InjectionToken<KvStore>('KV_STORE', {
  providedIn: 'root',
  factory: () => createKvStore('fitflow'),
});
