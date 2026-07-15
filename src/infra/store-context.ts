// src/infra/store-context.ts
import type { StoreContext } from '../domain/types';
const KEY = 'daiso.storeContext';
export function loadStoreContext(): StoreContext | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as StoreContext) : null;
}
export function saveStoreContext(store: StoreContext): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}
