import type { AvailabilityAnswer } from '../domain/types';

export interface CacheStorage {
  readAnswer(key: string): Promise<{ answer: AvailabilityAnswer; observedAt: number } | null>;
  writeAnswer(key: string, answer: AvailabilityAnswer, observedAt: number): Promise<void>;
}

const DB = 'daiso-finder';
const STORE = 'answers';
const VERSION = 1;
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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
