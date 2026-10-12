// src/ui/store.ts
import { create } from 'zustand';
import { initialState, reduce } from '../domain/state-machine';
import type { StoreContext, StoreEvent, UiState } from '../domain/types';
import { type Locale, loadLocale, resolveLocale, saveLocale } from '../i18n/locale';
import {
  loadRecentSearches,
  nextRecentSearches,
  saveRecentSearches,
} from '../infra/recent-searches';
import { loadStoreContext, saveStoreContext } from '../infra/store-context';

interface AvailabilityStore {
  ui: UiState;
  store: StoreContext | null; // null = first run — the store-selection surface leads (D082)
  sheetOpen: boolean;
  // Scanner visibility is UI-SHELL state, exactly like sheetOpen — not a 7th UiState. The 6 answer
  // states and every availability judgement are untouched by opening a viewfinder.
  scannerOpen: boolean;
  recentSearches: string[];
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
  setLocale: (locale: Locale) => void;
}

const persisted = loadStoreContext();
const persistedRecent = loadRecentSearches();
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
  setLocale: (locale) =>
    set(() => {
      saveLocale(locale);
      return { locale };
    }),
}));
