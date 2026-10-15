// src/ui/components/CartSheet.tsx — owner-exception §B47 slice 2: the per-store shopping list.
// A bottom sheet like the D082 store sheet (same scrim/focus/Escape contract): rows are
// SNAPSHOTS (price · location · our observation time), never today's stock. Today's stock
// comes only from an explicit per-item 다시 확인, which the surface runs and which lands as
// a normal answer behind this sheet (the sheet closes first — background is inert while open).
import { useEffect, useRef } from 'react';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import type { StoreCart } from '../../infra/cart';
import { cartTotal } from '../../infra/cart';
import type { CartItem } from '../../infra/cart';
import { formatLocation, formatPrice } from '../format';
import { GlassSurface } from './GlassSurface';

export function CartSheet({
  cart,
  otherStoreCount,
  locale,
  onClose,
  onSetQty,
  onToggle,
  onRemove,
  onRecheck,
}: {
  // The ACTIVE store's cart (null = empty for this store — the note renders, not a blank sheet).
  cart: StoreCart | null;
  otherStoreCount: number;
  locale: Locale;
  onClose: () => void;
  onSetQty: (id: string, qty: number) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onRecheck: (item: CartItem) => void;
}) {
  const S = strings(locale);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Modal dialogs must receive focus on open (Interface §6) — the sheet pattern: 닫기 takes it.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Escape dismisses like 닫기 (the store-sheet contract, IME-safe).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const total = cart ? cartTotal(cart) : 0;

  return (
    <GlassSurface className="cart-sheet">
      <section role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="store-selection-sheet__header">
          <h2 id="cart-title" className="text-heading">
            {S.CART_TITLE}
            {cart ? ` · ${cart.storeName}` : ''}
          </h2>
          <button ref={closeRef} type="button" className="text-label" onClick={onClose}>
            {S.CART_CLOSE}
          </button>
        </div>
        <p className="text-caption">{S.CART_SNAPSHOT_NOTE}</p>
        {!cart || cart.items.length === 0 ? (
          <p className="text-body">{S.CART_EMPTY_NOTE}</p>
        ) : (
          <>
            <ul className="cart-sheet__list">
              {cart.items.map((item) => (
                <li key={item.id} className="cart-sheet__row">
                  <input
                    type="checkbox"
                    aria-label={S.cartCheckLabel(item.name)}
                    checked={item.checked}
                    onChange={() => onToggle(item.id)}
                  />
                  <div className="cart-sheet__facts">
                    <p className="text-body">{item.name}</p>
                    <p className="text-caption">
                      {formatPrice(item.price, locale)}
                      {item.location && ` · ${formatLocation(item.location, locale)}`}
                    </p>
                    <div className="cart-sheet__qty">
                      <button
                        type="button"
                        className="text-label"
                        aria-label={S.CART_QTY_DECREASE}
                        onClick={() => onSetQty(item.id, item.qty - 1)}
                      >
                        −
                      </button>
                      <span className="text-body" aria-live="polite">
                        {S.cartQtyText(item.qty)}
                      </span>
                      <button
                        type="button"
                        className="text-label"
                        aria-label={S.CART_QTY_INCREASE}
                        onClick={() => onSetQty(item.id, item.qty + 1)}
                      >
                        ＋
                      </button>
                    </div>
                  </div>
                  <div className="cart-sheet__row-actions">
                    <button type="button" className="text-label" onClick={() => onRecheck(item)}>
                      {S.RETRY_BUTTON}
                    </button>
                    <button type="button" className="text-label" onClick={() => onRemove(item.id)}>
                      {S.CART_REMOVE_BUTTON}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-heading">{S.cartTotalLabel(total)}</p>
          </>
        )}
        {otherStoreCount > 0 && (
          <p className="text-caption">{S.cartOtherStoresLabel(otherStoreCount)}</p>
        )}
      </section>
    </GlassSurface>
  );
}
