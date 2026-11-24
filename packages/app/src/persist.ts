const DB = 'drawboardmafia';
const STORE = 'boards';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Boards are persisted as canonical .board text, the same format as on disk. */
export const loadBoardText = (key = 'current') => tx<string | undefined>('readonly', (s) => s.get(key));
export const saveBoardText = (text: string, key = 'current') => tx('readwrite', (s) => s.put(text, key));
