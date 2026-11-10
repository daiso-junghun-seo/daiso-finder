// src/ui/navigation/dev-refresh.ts
// Dev-only ?navRefresh= harness for the Playwright Flow 2 sweep. It fabricates outcomes for the mock
// pipeline only; the caller gates on import.meta.env.DEV and the real adapter is never touched.
import type { StoreStockRepository } from '../../domain/ports';
import type { StoreLocation } from '../../domain/types';
import type { NavigationEntry } from './navigation-refresh';

export type DevRefreshMode =
  | 'failed'
  | 'soldOut'
  | 'other'
  | 'still'
  | 'recoverStale'
  | 'unapplied';

const MODES = new Set<DevRefreshMode>([
  'failed',
  'soldOut',
  'other',
  'still',
  'recoverStale',
  'unapplied',
]);

export function parseDevRefreshMode(search: string): DevRefreshMode | null {
  const raw = new URLSearchParams(search).get('navRefresh');
  return raw !== null && MODES.has(raw as DevRefreshMode) ? (raw as DevRefreshMode) : null;
}

function nextLocation(entry: NavigationEntry): StoreLocation {
  const candidates: StoreLocation[] = [
    { floor: '2', zone: '14' },
    { floor: '3', zone: '12' },
  ];
  return (
    candidates.find(
      (candidate) =>
        !entry.answer.locations.some(
          (location) => location.floor === candidate.floor && location.zone === candidate.zone,
        ),
    ) ?? { floor: '9', zone: '99' }
  );
}

export function createDevRefreshRepository(
  entry: NavigationEntry,
  mode: DevRefreshMode,
): StoreStockRepository {
  let calls = 0;
  return {
    async query() {
      calls += 1;
      // The entry refresh must leave the card intact so the E2E can tap 못 찾겠어요 first.
      if (mode === 'failed') throw new Error('dev navRefresh=failed');
      if (mode === 'recoverStale' && calls === 1) {
        throw new Error('dev navRefresh=recoverStale entry failure');
      }
      if (calls === 1) return entry.answer;
      switch (mode) {
        case 'soldOut':
          return {
            kind: 'temporarilyOut',
            productName: entry.answer.productName,
            price: entry.answer.price,
            restockOfferable: false,
          };
        case 'other':
          return {
            ...entry.answer,
            locations: [...entry.answer.locations, nextLocation(entry)],
          };
        case 'still':
        case 'recoverStale':
          return entry.answer;
        case 'unapplied':
          return {
            kind: 'discontinued',
            productName: entry.answer.productName,
            price: entry.answer.price,
          };
      }
    },
  };
}
