// src/infra/store-context.ts
import type { StoreContext } from '../domain/types';
const KEY = 'daiso.storeContext';
export function loadStoreContext(): StoreContext | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoreContext) : null;
  } catch {
    return null; // corrupt/unavailable storage degrades to first-run — never blocks the surface (G3)
  }
}
export function saveStoreContext(store: StoreContext): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // blocked/unavailable storage → best-effort persistence only; the in-memory Store Context
    // still works, so selecting a store never dead-ends the sheet (D082 operability)
  }
}
