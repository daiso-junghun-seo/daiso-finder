// src/ui/store.ts
import { create } from 'zustand';
import { initialState, reduce } from '../domain/state-machine';
import type { StoreContext, StoreEvent, UiState } from '../domain/types';
import { type Locale, loadLocale, resolveLocale, saveLocale } from '../i18n/locale';
import {
  type CartItem,
  type Carts,
  type StoreCart,
  addToCart,
  loadCarts,
  removeItem,
  saveCarts,
  setItemQty,
  toggleItemChecked,
} from '../infra/cart';
import {
  loadRecentSearches,
  nextRecentSearches,
  saveRecentSearches,
} from '../infra/recent-searches';
import {
  type RecentView,
  loadRecentViews,
  nextRecentViews,
  saveRecentViews,
} from '../infra/recent-views';
import { loadStoreContext, saveStoreContext } from '../infra/store-context';
import { mergeImportedCart } from './cart-share';

interface AvailabilityStore {
  ui: UiState;
  store: StoreContext | null; // null = first run — the store-selection surface leads (D082)
  sheetOpen: boolean;
  // Scanner visibility is UI-SHELL state, exactly like sheetOpen — not a 7th UiState. The 6 answer
  // states and every availability judgement are untouched by opening a viewfinder.
  scannerOpen: boolean;
  recentSearches: string[];
  // Owner-exception §B47: products with a resolved answer, most-recent-first (max 5).
  recentViews: RecentView[];
  // Owner-exception §B47: per-store shopping-list memos (local-only snapshots, never claims).
  carts: Carts;
  // Cart-sheet visibility is UI-SHELL state like sheetOpen/scannerOpen — not a 7th UiState.
  cartOpen: boolean;
  // Guidance language (ko default). Match tokens (product/store names, prices, floors/zones)
  // never translate (D069) — this only picks which guidance table renders (i18n/strings).
  locale: Locale;
  dispatch: (event: StoreEvent) => void;
  openSheet: () => void;
  closeSheet: () => void;
  openScanner: () => void;
  closeScanner: () => void;
  selectStore: (store: StoreContext) => void;
  recordSearch: (keyword: string) => void;
  recordView: (view: RecentView) => void;
  addItem: (store: StoreContext, item: CartItem) => void;
  setItemQty: (storeCd: string, id: string, qty: number) => void;
  toggleItemChecked: (storeCd: string, id: string) => void;
  removeItem: (storeCd: string, id: string) => void;
  importCart: (storeCd: string, storeName: string, imported: StoreCart) => void;
  openCart: () => void;
  closeCart: () => void;
  setLocale: (locale: Locale) => void;
}

const persisted = loadStoreContext();
const persistedRecent = loadRecentSearches();
const persistedViews = loadRecentViews();
const persistedCarts = loadCarts();
// ?lang= is read once at boot (a shared link pins its language); the toggle persists after.
const initialLocale =
  typeof window === 'undefined'
    ? ('ko' as Locale)
    : resolveLocale({
        search: window.location.search,
        stored: loadLocale(),
        navigatorLanguage: window.navigator.language,
      });

export const useAvailabilityStore = create<AvailabilityStore>((set) => ({
  ui: initialState,
  store: persisted,
  sheetOpen: persisted === null,
  scannerOpen: false,
  recentSearches: persistedRecent,
  recentViews: persistedViews,
  carts: persistedCarts,
  cartOpen: false,
  locale: initialLocale,
  dispatch: (event) => set((s) => ({ ui: reduce(s.ui, event) })),
  openSheet: () => set({ sheetOpen: true }),
  closeSheet: () => set({ sheetOpen: false }),
  openScanner: () => set({ scannerOpen: true }),
  closeScanner: () => set({ scannerOpen: false }),
  selectStore: (store) =>
    set((s) => {
      saveStoreContext(store);
      return { store, sheetOpen: false, ui: reduce(s.ui, { type: 'CHANGE_STORE', store }) };
    }),
  recordSearch: (keyword) =>
    set((s) => {
      const next = nextRecentSearches(s.recentSearches, keyword);
      saveRecentSearches(next);
      return { recentSearches: next };
    }),
  recordView: (view) =>
    set((s) => {
      const next = nextRecentViews(s.recentViews, view);
      saveRecentViews(next);
      return { recentViews: next };
    }),
  addItem: (store, item) =>
    set((s) => {
      const next = addToCart(s.carts, store.strCd, store.strNm, item);
      saveCarts(next);
      return { carts: next };
    }),
  setItemQty: (storeCd, id, qty) =>
    set((s) => {
      const next = setItemQty(s.carts, storeCd, id, qty);
      saveCarts(next);
      return { carts: next };
    }),
  toggleItemChecked: (storeCd, id) =>
    set((s) => {
      const next = toggleItemChecked(s.carts, storeCd, id);
      saveCarts(next);
      return { carts: next };
    }),
  removeItem: (storeCd, id) =>
    set((s) => {
      const next = removeItem(s.carts, storeCd, id);
      saveCarts(next);
      return { carts: next };
    }),
  importCart: (storeCd, storeName, imported) =>
    set((s) => {
      const next = mergeImportedCart(s.carts, storeCd, storeName, imported);
      saveCarts(next);
      return { carts: next };
    }),
  openCart: () => set({ cartOpen: true }),
  closeCart: () => set({ cartOpen: false }),
  setLocale: (locale) =>
    set(() => {
      saveLocale(locale);
      return { locale };
    }),
}));
