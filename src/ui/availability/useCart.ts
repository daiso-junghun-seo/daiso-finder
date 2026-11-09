// src/ui/availability/useCart.ts
// Owner-exception §B47 controller: per-store shopping-list snapshots, add/recheck/import handlers,
// and the derived counts the surface and sheet both read. Extracted from AvailabilitySurface so the
// cart rules live in one place (and the surface keeps composition only).
import { useState } from 'react';
import type { StoreContext, StoreEvent, UiState } from '../../domain/types';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import { type CartItem, cartFor, cartQtyCount, cartTotal, itemFromAnswer } from '../../infra/cart';
import { isCrossStoreImport, parseCartImport } from '../cart-share';
import { useAvailabilityStore } from '../store';
import { type SubmittedQuery, pricedAnswerOf, runByPdNo, runQuery } from './pipelines';

export function useCartController({
  store,
  ui,
  lastSubmit,
  locale,
  dispatch,
}: {
  store: StoreContext | null;
  ui: UiState;
  lastSubmit: { current: SubmittedQuery | null };
  locale: Locale;
  dispatch: (event: StoreEvent) => void;
}) {
  const carts = useAvailabilityStore((s) => s.carts);
  const cartOpen = useAvailabilityStore((s) => s.cartOpen);
  const openCart = useAvailabilityStore((s) => s.openCart);
  const closeCart = useAvailabilityStore((s) => s.closeCart);
  const addItem = useAvailabilityStore((s) => s.addItem);
  const setItemQtyAction = useAvailabilityStore((s) => s.setItemQty);
  const toggleItemCheckedAction = useAvailabilityStore((s) => s.toggleItemChecked);
  const removeCartItemAction = useAvailabilityStore((s) => s.removeItem);
  const importCart = useAvailabilityStore((s) => s.importCart);
  const [cartNotice, setCartNotice] = useState<{ id: number; text: string } | null>(null);
  const cartAddedNotice = strings(locale).CART_ADDED_NOTICE;

  // Owner-exception §B47: snapshot the priced answer into this store's list. pdNo identity comes
  // from the retained submit (candidate/scan carry it, typed keywords don't) — the same source
  // the recheck below reuses, so add and recheck can never disagree on identity.
  const addToCart = () => {
    if (!store) return;
    const priced = pricedAnswerOf(ui);
    if (!priced) return; // unreachable: 담기 renders only for priced answers
    const last = lastSubmit.current;
    const pdNo =
      last?.kind === 'candidate'
        ? last.candidate.pdNo
        : last?.kind === 'scan'
          ? last.value
          : undefined;
    const item = itemFromAnswer(
      priced.query,
      pdNo,
      priced.answer,
      priced.freshness?.observedAt ?? Date.now(),
      Date.now(),
    );
    if (!item) return; // unreachable (priced gate above) — never a silent wrong row
    addItem(store, item);
    setCartNotice((n) => ({ id: (n?.id ?? 0) + 1, text: cartAddedNotice }));
  };

  // Per-item 다시 확인: the SAME two paths a fresh submit takes (exact pdNo when the row
  // resolved one, search-first otherwise). The sheet closes first — the answer lands on the
  // surface behind it, never inside an inert modal. Not a new submit: no recent-search bump
  // (retry semantics, B15).
  const recheckItem = (item: CartItem) => {
    if (!store) return;
    closeCart();
    if (item.pdNo) {
      const candidate = {
        pdNo: item.pdNo,
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl,
      };
      lastSubmit.current = { kind: 'candidate', candidate };
      void runByPdNo(store, candidate, dispatch);
    } else {
      lastSubmit.current = { kind: 'typed', keyword: item.query };
      void runQuery(store, item.query, dispatch);
    }
  };

  // Pasted-JSON import lands in THIS store's list with the same dedup/caps as adding by
  // hand (mergeImportedCart). Strict parse: garbage reports failure, never a half-loaded list.
  // crossStore tells the sheet that the imported rows lost their shelf snapshots.
  const importJson = (text: string): { ok: boolean; count: number; crossStore: boolean } => {
    if (!store) return { ok: false, count: 0, crossStore: false };
    const parsed = parseCartImport(text);
    if (!parsed) return { ok: false, count: 0, crossStore: false };
    importCart(store.strCd, store.strNm, parsed);
    return {
      ok: true,
      count: parsed.items.length,
      crossStore: isCrossStoreImport(parsed, store.strCd),
    };
  };

  // Active store's list + the honest count caption for the other stores' lists.
  const activeCart = store ? cartFor(carts, store.strCd) : null;
  const activeCartCount = activeCart ? cartQtyCount(activeCart) : 0;
  const activeCartTotal = activeCart ? cartTotal(activeCart) : 0;
  const otherStoreCount = store
    ? Object.entries(carts).filter(([cd, c]) => cd !== store.strCd && c.items.length > 0).length
    : 0;
  // The link is a shortcut to a memo, not content — hidden while every list is empty.
  const showCartLink = activeCartCount > 0 || otherStoreCount > 0;

  const setQty = (id: string, qty: number) => {
    if (store) setItemQtyAction(store.strCd, id, qty);
  };
  const toggleChecked = (id: string) => {
    if (store) toggleItemCheckedAction(store.strCd, id);
  };
  const removeItem = (id: string) => {
    if (store) removeCartItemAction(store.strCd, id);
  };

  return {
    cartOpen,
    openCart,
    closeCart,
    activeCart,
    activeCartCount,
    activeCartTotal,
    otherStoreCount,
    showCartLink,
    cartNotice,
    addToCart,
    recheckItem,
    importJson,
    setQty,
    toggleChecked,
    removeItem,
  };
}
