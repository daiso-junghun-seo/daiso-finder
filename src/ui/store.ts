// src/ui/store.ts
import { create } from 'zustand';
import { initialState, reduce } from '../domain/state-machine';
import type { StoreEvent, UiState } from '../domain/types';

interface AvailabilityStore {
  ui: UiState;
  dispatch: (event: StoreEvent) => void;
}
export const useAvailabilityStore = create<AvailabilityStore>((set) => ({
  ui: initialState,
  dispatch: (event) => set((s) => ({ ui: reduce(s.ui, event) })),
}));
