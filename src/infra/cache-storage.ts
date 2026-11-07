import type { AvailabilityAnswer } from '../domain/types';

export interface CacheStorage {
  readAnswer(key: string): Promise<{ answer: AvailabilityAnswer; observedAt: number } | null>;
  writeAnswer(key: string, answer: AvailabilityAnswer, observedAt: number): Promise<void>;
}

const DB = 'daiso-finder';
const STORE = 'answers';
const VERSION = 1;
// ONE connection for the app's lifetime. Opening per read/write leaked a connection per lookup and
// never closed any of them; a long-lived PWA accumulates those until the origin hits its limit.
let dbPromise: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const db = req.result;
      // A newer tab's upgrade would otherwise block forever on this open connection.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}
export function createIndexedDbCache(): CacheStorage {
  return {
    async readAnswer(key) {
      return (await tx('readonly', (s) => s.get(key))) ?? null;
    },
    async writeAnswer(key, answer, observedAt) {
      await tx('readwrite', (s) => s.put({ answer, observedAt }, key));
    },
  };
}
