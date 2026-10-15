// src/ui/cart-share.ts — owner-exception §B47 slice 3: moving the memo between
// browsers without any server. Three paths, all free and offline:
//   1. OS share sheet (navigator.share) when the device offers one,
//   2. clipboard copy of the human-readable text (or the JSON export),
//   3. hand-select from a readonly textarea when both APIs are missing (plain-http
//      phone testing has no clipboard API — the DiagnosticsBar precedent).
// QR is deliberately NOT here: it needs a generator dependency, and text/JSON already
// covers the transfer (B47-1: no new dependencies unless necessary).
import type { Locale } from '../i18n/locale';
import { strings } from '../i18n/strings';
import { type Carts, type StoreCart, addToCart, isValidCart } from '../infra/cart';
import { formatLocation, formatPrice } from './format';

// Human-readable memo: store + rows (qty × snapshot price · snapshot location) + checked-only
// total + the honesty footer. Unchecked rows are listed but marked — never silently summed.
export function buildShareText(cart: StoreCart, locale: Locale): string {
  const S = strings(locale);
  const head = `${cart.storeName} ${S.CART_TITLE}`;
  const rows = cart.items.map((i) => {
    const loc = i.location ? ` · ${formatLocation(i.location, locale)}` : '';
    const mark = i.checked ? '' : ` ${S.CART_UNCHECKED_MARK}`;
    return `${i.name} × ${S.cartQtyText(i.qty)} · ${formatPrice(i.price, locale)}${loc}${mark}`;
  });
  const total = cart.items.filter((i) => i.checked).reduce((sum, i) => sum + i.price * i.qty, 0);
  return [head, ...rows, S.cartTotalLabel(total), S.CART_SNAPSHOT_NOTE].join('\n');
}

// Machine-readable memo: the StoreCart as JSON (imported back with parseCartImport).
export function exportCartJson(cart: StoreCart): string {
  return JSON.stringify(cart);
}

// Strict: anything that is not exactly a StoreCart is rejected (never a half-loaded list).
export function parseCartImport(text: string): StoreCart | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isValidCart(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Pure: fold an imported list into this store's list — same dedup/caps as adding by hand.
export function mergeImportedCart(
  carts: Carts,
  storeCd: string,
  storeName: string,
  imported: StoreCart,
): Carts {
  return imported.items.reduce((next, item) => addToCart(next, storeCd, storeName, item), carts);
}
