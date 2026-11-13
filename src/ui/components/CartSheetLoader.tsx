// src/ui/components/CartSheetLoader.tsx — the lazy boundary around the §B47 cart sheet.
//
// The sheet is only opened from the cart link, but the eager import path (store.ts → cart-share.ts)
// it used to travel with pulled the sheet, its share/export formatters and the clipboard/share
// primitives into the entry chunk for every shopper. This wrapper keeps them in their own chunk and
// renders a same-shape shell — title, 닫기 (focused, Escape wired) — while it loads, so opening the
// cart still looks and behaves like the sheet from the first frame.
//
// A rejected chunk import must not throw during render and unmount the root (the same discipline as
// main.tsx and the Flow 3 surface): the catch swaps in a stand-in that says, truthfully, that the
// sheet could not be loaded and offers the only retry that can work for a failed chunk — a reload.
import { type ComponentType, type ReactNode, Suspense, lazy } from 'react';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import type { StoreCart } from '../../infra/cart';
import { LiveRegion } from '../a11y/LiveRegion';
import type { CartSheetProps } from './CartSheet';
import { SheetShell } from './SheetShell';

const loadCartSheet = () => import('./CartSheet');

const CartSheet = lazy<ComponentType<CartSheetProps>>(() =>
  loadCartSheet()
    .then((module) => ({ default: module.CartSheet }))
    .catch(() => ({ default: CartSheetUnavailable })),
);

// The store suffix is part of the title in both the sheet and its shell/stand-in, so the heading a
// shopper sees never changes wording or loses the store name while the chunk loads (or fails).
function cartTitle(cart: StoreCart | null, locale: Locale): string {
  const S = strings(locale);
  return cart ? `${S.CART_TITLE} · ${cart.storeName}` : S.CART_TITLE;
}

// The shell carries the same contract as the sheet: the same labelled dialog, the same sheet styling,
// 닫기 focused on open and Escape dismissing.
function CartSheetShell({
  title,
  locale,
  onClose,
  children,
}: {
  title: string;
  locale: Locale;
  onClose: () => void;
  children?: ReactNode;
}) {
  const S = strings(locale);
  return (
    <SheetShell
      className="cart-sheet"
      titleId="cart-title"
      title={title}
      closeLabel={S.CART_CLOSE}
      onClose={onClose}
      grabber
    >
      {children}
    </SheetShell>
  );
}

function CartSheetUnavailable({ cart, locale, onClose }: CartSheetProps) {
  const S = strings(locale);
  return (
    <CartSheetShell title={cartTitle(cart, locale)} locale={locale} onClose={onClose}>
      <LiveRegion message={S.ERROR_NO_CACHE_BODY} visuallyHidden />
      <p className="text-body">{S.ERROR_NO_CACHE_BODY}</p>
      <button
        type="button"
        className="text-label cta--primary"
        onClick={() => window.location.reload()}
      >
        {S.RETRY_BUTTON}
      </button>
    </CartSheetShell>
  );
}

export function CartSheetLoader(props: CartSheetProps) {
  return (
    <Suspense
      fallback={
        <CartSheetShell
          title={cartTitle(props.cart, props.locale)}
          locale={props.locale}
          onClose={props.onClose}
        />
      }
    >
      <CartSheet {...props} />
    </Suspense>
  );
}
