// src/ui/cart-share.ts — owner-exception §B47 slice 3: moving the memo between
// browsers without any server. Three paths, all free and offline:
//   1. OS share sheet (navigator.share) when the device offers one,
//   2. clipboard copy of the human-readable text (or the JSON export),
//   3. hand-select from a readonly textarea when both APIs are missing (plain-http
//      phone testing has no clipboard API — the DiagnosticsBar precedent).
// QR is deliberately NOT here: it needs a generator dependency, and text/JSON already
// covers the transfer (B47-1: no new dependencies unless necessary).
//
// This module is the eager import/merge half: the store's import action runs even while the cart
// sheet is closed. The memo formatters live in cart-memo.ts with the sheet (both lazy).
import { type Carts, type StoreCart, addToCart, isValidCart } from '../infra/cart';

// An import is untrusted text pasted from anywhere, so the parser caps both the payload
// (64 KiB — far beyond a real memo) and the row count (the same per-store cap addToCart
// enforces) before any of it reaches storage.
const MAX_IMPORT_CHARS = 64 * 1024;
const MAX_IMPORT_ITEMS = 30;

// Strict: anything that is not exactly a NON-EMPTY StoreCart is rejected (never a half-loaded
// list, never a nothing-happened "success" that announces 0개). Oversized payloads are rejected
// wholesale rather than truncated — a short list would look like a successful import.
export function parseCartImport(text: string): StoreCart | null {
  if (text.length > MAX_IMPORT_CHARS) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isValidCart(parsed) || parsed.items.length === 0) return null;
    return parsed.items.length > MAX_IMPORT_ITEMS ? null : parsed;
  } catch {
    return null;
  }
}

// True when the memo was captured in a different store than the one it is being loaded into.
export function isCrossStoreImport(imported: StoreCart, storeCd: string): boolean {
  return imported.storeCd !== storeCd;
}

// Pure: fold an imported list into this store's list — same dedup/caps as adding by hand.
// A cross-store import keeps name/price/qty (store-independent enough to be useful) but DROPS
// the floor/zone snapshot: that position was observed in the other store and does not exist
// here. Carrying it over would make this store's list claim a shelf nobody observed (B47).
export function mergeImportedCart(
  carts: Carts,
  storeCd: string,
  storeName: string,
  imported: StoreCart,
): Carts {
  const items = isCrossStoreImport(imported, storeCd)
    ? imported.items.map((item) => (item.location ? { ...item, location: undefined } : item))
    : imported.items;
  return items.reduce((next, item) => addToCart(next, storeCd, storeName, item), carts);
}
