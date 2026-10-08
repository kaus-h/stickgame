import type { StorageService } from '../PlatformServices';

const PREFIX = 'stickgame:';
const DB_NAME = 'stickgame';
const STORE = 'kv';

/**
 * Local-first web storage (GMR-48): IndexedDB (durable, larger, survives most "clear cookies"
 * flows), then localStorage, then an in-memory map when both are blocked (private browsing,
 * disabled storage). The game always runs; only persistence degrades. `kind` says which one won.
 */
export async function createWebStorage(): Promise<StorageService & { readonly kind: string }> {
  const idb = await openIndexedDb().catch(() => null);
  if (idb) return idbStorage(idb);
  if (localStorageWorks()) return localStore();
  return memoryStorage();
}

function openIndexedDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      resolve(null);
    };
    req.onblocked = () => {
      resolve(null);
    };
  });
}

function idbStorage(db: IDBDatabase): StorageService & { readonly kind: string } {
  const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) =>
    new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          resolve(req.result);
        };
        tx.onerror = () => {
          resolve(null);
        };
        tx.onabort = () => {
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });
  return {
    kind: 'indexeddb',
    load: async (key) => {
      const v = await run('readonly', (s) => s.get(key) as IDBRequest<unknown>);
      return typeof v === 'string' ? v : null;
    },
    save: async (key, value) => {
      // One transaction per write: the browser commits it atomically or not at all.
      await run('readwrite', (s) => s.put(value, key));
    },
  };
}

function localStorageWorks(): boolean {
  try {
    const k = `${PREFIX}__probe`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function localStore(): StorageService & { readonly kind: string } {
  return {
    kind: 'localstorage',
    load: (key) => {
      try {
        return Promise.resolve(localStorage.getItem(PREFIX + key));
      } catch {
        return Promise.resolve(null);
      }
    },
    save: (key, value) => {
      try {
        localStorage.setItem(PREFIX + key, value);
      } catch {
        // Quota or revoked access: keep playing; the save layer keeps the last good copy.
      }
      return Promise.resolve();
    },
  };
}

export function memoryStorage(): StorageService & { readonly kind: string } {
  const map = new Map<string, string>();
  return {
    kind: 'memory',
    load: (key) => Promise.resolve(map.get(key) ?? null),
    save: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}
