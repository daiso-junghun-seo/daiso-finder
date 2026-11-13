// src/ui/cart-memo.ts — the CartSheet-only half of §B47 slice 3: turning this store's snapshots
// into a portable memo (human-readable text, machine-readable JSON). Kept out of cart-share.ts so
// the eager import/merge path does not carry the share/export formatters into the entry chunk; the
// sheet and this module load together on first open.
import type { Locale } from '../i18n/locale';
import { strings } from '../i18n/strings';
import type { StoreCart } from '../infra/cart';
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
