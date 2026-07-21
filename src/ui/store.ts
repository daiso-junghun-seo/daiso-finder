// src/ui/store.ts
import { create } from 'zustand';
import { initialState, reduce } from '../domain/state-machine';
import type { StoreContext, StoreEvent, UiState } from '../domain/types';
import { loadStoreContext, saveStoreContext } from '../infra/store-context';

interface AvailabilityStore {
  ui: UiState;
  store: StoreContext | null; // null = first run — the store-selection surface leads (D082)
  sheetOpen: boolean;
  dispatch: (event: StoreEvent) => void;
  openSheet: () => void;
  closeSheet: () => void;
  selectStore: (store: StoreContext) => void;
}

const persisted = loadStoreContext();

export const useAvailabilityStore = create<AvailabilityStore>((set) => ({
  ui: initialState,
  store: persisted,
  sheetOpen: persisted === null,
  dispatch: (event) => set((s) => ({ ui: reduce(s.ui, event) })),
  openSheet: () => set({ sheetOpen: true }),
  closeSheet: () => set({ sheetOpen: false }),
  selectStore: (store) =>
    set((s) => {
      saveStoreContext(store);
      return { store, sheetOpen: false, ui: reduce(s.ui, { type: 'CHANGE_STORE', store }) };
    }),
}));
