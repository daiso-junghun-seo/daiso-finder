// src/ui/cart-match.ts — owner decision §B52: check the shopping list against the active store
// plus the three nearest stores. Pure-ish orchestration: the ports are injected, the signal aborts
// every in-flight read, and only an explicit shopper tap can move the list.
//
// Honesty rules:
//  - "All items" requires an in-stock answer for EVERY evaluated row.
//  - franchiseUndeterminable and transport failures are UNKNOWN, never "stocked".
//  - Only the first 10 checked rows are evaluated (bounded batch, server rate limit).
import { createGeolocation, createStoreStockRepository } from '../adapters/composition';
import type { AvailabilityAnswer, Money, StoreContext, StoreLocation } from '../domain/types';
import type { CartItem } from '../infra/cart';

export const CART_MATCH_MAX_ITEMS = 10;
// Active store + three nearest stores (the same bounding rule as the store-selection sheet).
export const CART_MATCH_MAX_STORES = 4;
const CONCURRENCY = 3;

export interface CartItemMatch {
  id: string;
  name: string;
  // true = observed in stock, false = observed not in stock, null = could not be checked.
  available: boolean | null;
  price?: Money;
  location?: StoreLocation;
}

export interface CartStoreMatch {
  store: StoreContext & { distanceM?: number };
  active: boolean;
  items: CartItemMatch[];
  matchedCount: number;
  totalCount: number;
  // Every evaluated row is in stock. Unknown never satisfies this.
  full: boolean;
}

export interface CartMatchResult {
  // Full matches first (active, then nearest), then partial matches by coverage, then distance.
  stores: CartStoreMatch[];
  fullMatch: CartStoreMatch | null;
  active: CartStoreMatch;
  checkedCount: number;
  evaluatedCount: number;
  // True when no nearby store could be resolved (denied geolocation, no GPS, fetch failure).
  nearbyUnavailable: boolean;
  at: number;
}

export interface CartMatchDeps {
  queryStock(store: StoreContext, item: CartItem, signal: AbortSignal): Promise<AvailabilityAnswer>;
  getNearbyStores(): Promise<Array<StoreContext & { distanceM: number }>>;
}

export function createCartMatchDeps(): CartMatchDeps {
  const repository = createStoreStockRepository();
  const geolocation = createGeolocation();
  return {
    queryStock: (store, item, signal) =>
      repository.query(
        store,
        item.pdNo ? { keyword: item.name, pdNo: item.pdNo } : { keyword: item.query },
        signal,
      ),
    getNearbyStores: () => geolocation.getNearbyStores(),
  };
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function toItemMatch(item: CartItem, answer: AvailabilityAnswer): CartItemMatch {
  if (answer.kind === 'inStock') {
    return {
      id: item.id,
      name: item.name,
      available: true,
      price: answer.price,
      location: answer.locations[0],
    };
  }
  return {
    id: item.id,
    name: item.name,
    // A franchise store cannot report stock — treating that as "not stocked" would hide a
    // product the shopper can actually buy after asking staff.
    available: answer.kind === 'franchiseUndeterminable' ? null : false,
    ...('price' in answer ? { price: answer.price } : {}),
  };
}

function rank(match: CartStoreMatch): number {
  if (match.active) return -1;
  return match.store.distanceM ?? Number.POSITIVE_INFINITY;
}

export async function matchCart({
  activeStore,
  items,
  deps,
  signal,
  now = Date.now,
}: {
  activeStore: StoreContext;
  // All checked rows, in cart order. The function applies the 10-row cap itself.
  items: CartItem[];
  deps: CartMatchDeps;
  signal: AbortSignal;
  now?: () => number;
}): Promise<CartMatchResult> {
  if (signal.aborted) throw abortError();

  const evaluated = items.slice(0, CART_MATCH_MAX_ITEMS);
  let nearby: Array<StoreContext & { distanceM: number }> = [];
  try {
    nearby = await deps.getNearbyStores();
  } catch {
    nearby = []; // never blocks the active-store check
  }
  if (signal.aborted) throw abortError();

  const candidates: Array<StoreContext & { distanceM?: number }> = [
    { strCd: activeStore.strCd, strNm: activeStore.strNm },
  ];
  for (const store of [...nearby].sort((a, b) => a.distanceM - b.distanceM)) {
    if (candidates.length >= CART_MATCH_MAX_STORES) break;
    if (candidates.some((candidate) => candidate.strCd === store.strCd)) continue;
    candidates.push({ strCd: store.strCd, strNm: store.strNm, distanceM: store.distanceM });
  }

  const results = new Map<string, CartItemMatch>();
  const key = (strCd: string, id: string) => `${strCd}\u0000${id}`;
  const tasks = candidates.flatMap((store) =>
    evaluated.map((item) => async () => {
      if (signal.aborted) throw abortError();
      try {
        const answer = await deps.queryStock(store, item, signal);
        results.set(key(store.strCd, item.id), toItemMatch(item, answer));
      } catch {
        if (signal.aborted) throw abortError();
        // A failed read is unknown, not out of stock: the verdict must stay honest.
        results.set(key(store.strCd, item.id), {
          id: item.id,
          name: item.name,
          available: null,
        });
      }
    }),
  );

  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      if (!task) return;
      await task();
    }
  });
  await Promise.all(workers);
  if (signal.aborted) throw abortError();

  const stores: CartStoreMatch[] = candidates.map((store, index) => {
    const storeItems = evaluated.map(
      (item) =>
        results.get(key(store.strCd, item.id)) ?? {
          id: item.id,
          name: item.name,
          available: null,
        },
    );
    const matchedCount = storeItems.filter((item) => item.available === true).length;
    return {
      store,
      active: index === 0,
      items: storeItems,
      matchedCount,
      totalCount: storeItems.length,
      full: storeItems.length > 0 && matchedCount === storeItems.length,
    };
  });

  stores.sort((a, b) => {
    if (a.full !== b.full) return a.full ? -1 : 1;
    if (a.full && b.full) return rank(a) - rank(b);
    if (a.matchedCount !== b.matchedCount) return b.matchedCount - a.matchedCount;
    return rank(a) - rank(b);
  });

  const active = stores.find((store) => store.active);
  if (!active) throw new Error('active store missing from cart match'); // unreachable

  return {
    stores,
    fullMatch: stores.find((store) => store.full) ?? null,
    active,
    checkedCount: items.length,
    evaluatedCount: evaluated.length,
    nearbyUnavailable: candidates.length === 1,
    at: now(),
  };
}
