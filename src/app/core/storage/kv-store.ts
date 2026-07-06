/**
 * A minimal async key-value store abstraction.
 *
 * FitFlow persists each collection (workouts, exercises, routines) as a single
 * JSON document keyed by name. This keeps the storage layer tiny while still
 * being swappable: the browser build uses IndexedDB, and a native Capacitor
 * build can drop in a SQLite-backed implementation of the same interface
 * without touching any repository or UI code.
 */
export interface KvStore {
  /** Resolve once the backing store is ready to use. */
  ready(): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
  /** Name of the concrete backend, for diagnostics. */
  readonly backend: string;
}

/**
 * IndexedDB-backed KvStore. Works in every modern browser and in the
 * Capacitor WebView, giving true offline persistence with no server.
 */
export class IndexedDbStore implements KvStore {
  readonly backend = 'indexeddb';
  private db: IDBDatabase | null = null;
  private readonly dbName: string;
  private readonly storeName = 'kv';
  private openPromise: Promise<void> | null = null;

  constructor(dbName = 'fitflow') {
    this.dbName = dbName;
  }

  ready(): Promise<void> {
    if (this.openPromise) {
      return this.openPromise;
    }
    this.openPromise = new Promise<void>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this environment'));
        return;
      }
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    return this.openPromise;
  }

  private async tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    await this.ready();
    if (!this.db) {
      throw new Error('IndexedDB failed to open');
    }
    return this.db.transaction(this.storeName, mode).objectStore(this.storeName);
  }

  async get<T>(key: string): Promise<T | null> {
    const store = await this.tx('readonly');
    return new Promise<T | null>((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    const store = await this.tx('readwrite');
    return new Promise<void>((resolve, reject) => {
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async remove(key: string): Promise<void> {
    const store = await this.tx('readwrite');
    return new Promise<void>((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async keys(): Promise<string[]> {
    const store = await this.tx('readonly');
    return new Promise<string[]>((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
      req.onerror = () => reject(req.error);
    });
  }
}

/**
 * In-memory fallback used when IndexedDB is unavailable (e.g. some private
 * browsing modes or the karma test runner). Data does not persist across
 * reloads but the app stays fully functional for the session.
 */
export class MemoryStore implements KvStore {
  readonly backend = 'memory';
  private readonly map = new Map<string, unknown>();

  ready(): Promise<void> {
    return Promise.resolve();
  }

  get<T>(key: string): Promise<T | null> {
    return Promise.resolve((this.map.get(key) as T) ?? null);
  }

  set<T>(key: string, value: T): Promise<void> {
    // Structured-clone to mimic real store copy semantics.
    this.map.set(key, JSON.parse(JSON.stringify(value)));
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }

  keys(): Promise<string[]> {
    return Promise.resolve([...this.map.keys()]);
  }
}

/** Pick the best available store for the current environment. */
export function createKvStore(dbName = 'fitflow'): KvStore {
  if (typeof indexedDB !== 'undefined') {
    return new IndexedDbStore(dbName);
  }
  return new MemoryStore();
}
