const DB = 'drawboardmafia';
const BOARDS = 'boards';
const ASSETS = 'assets';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      for (const s of [BOARDS, ASSETS]) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Boards are persisted as canonical .board text, the same format as on disk. */
export const loadBoardText = (key = 'current') => tx<string | undefined>(BOARDS, 'readonly', (s) => s.get(key));
export const saveBoardText = (text: string, key = 'current') => tx(BOARDS, 'readwrite', (s) => s.put(text, key));
export const getAsset = (name: string) => tx<string | undefined>(ASSETS, 'readonly', (s) => s.get(name));
export const putAsset = (name: string, dataUrl: string) => tx(ASSETS, 'readwrite', (s) => s.put(dataUrl, name));
