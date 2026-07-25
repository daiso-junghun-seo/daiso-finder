// src/ui/store.ts
import { create } from 'zustand';
import { initialState, reduce } from '../domain/state-machine';
import type { StoreContext, StoreEvent, UiState } from '../domain/types';
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
  dispatch: (event: StoreEvent) => void;
  openSheet: () => void;
  closeSheet: () => void;
  openScanner: () => void;
  closeScanner: () => void;
  selectStore: (store: StoreContext) => void;
  recordSearch: (keyword: string) => void;
}

const persisted = loadStoreContext();
const persistedRecent = loadRecentSearches();

export const useAvailabilityStore = create<AvailabilityStore>((set) => ({
  ui: initialState,
  store: persisted,
  sheetOpen: persisted === null,
  scannerOpen: false,
  recentSearches: persistedRecent,
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
}));
