// src/ui/cart-match.test.ts — owner decision §B52: honest batch matching of the shopping list
// against the active store plus the three nearest stores.
import type { AvailabilityAnswer, StoreContext } from '../domain/types';
import type { CartItem } from '../infra/cart';
import {
  CART_MATCH_MAX_ITEMS,
  CART_MATCH_MAX_STORES,
  type CartMatchDeps,
  matchCart,
} from './cart-match';

const activeStore: StoreContext = { strCd: '001', strNm: '명동역점' };

function item(id: string, name = `상품 ${id}`): CartItem {
  return {
    id,
    name,
    query: name,
    price: 1000,
    qty: 1,
    checked: true,
    addedAt: 1,
    observedAt: 1,
  };
}

function inStock(productName: string, price = 1000): AvailabilityAnswer {
  return {
    kind: 'inStock',
    productName,
    price,
    locations: [{ floor: '11', zone: '56' }],
    qtyUpperBound: 3,
  };
}

function notCarried(productName: string): AvailabilityAnswer {
  return { kind: 'notCarried', productName };
}

function franchise(productName: string): AvailabilityAnswer {
  return { kind: 'franchiseUndeterminable', productName };
}

type StockFn = (storeCd: string, id: string) => AvailabilityAnswer | Error;

function deps(options: {
  nearby?: Array<StoreContext & { distanceM: number }>;
  nearbyError?: boolean;
  stock: StockFn;
  calls?: string[];
}): CartMatchDeps {
  return {
    getNearbyStores: async () => {
      if (options.nearbyError) throw new Error('gps denied');
      return options.nearby ?? [];
    },
    queryStock: async (store, cartItem) => {
      options.calls?.push(`${store.strCd}:${cartItem.id}`);
      const answer = options.stock(store.strCd, cartItem.id);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

async function run(options: {
  items: CartItem[];
  deps: CartMatchDeps;
  signal?: AbortSignal;
  now?: () => number;
}) {
  return matchCart({
    activeStore,
    items: options.items,
    deps: options.deps,
    signal: options.signal ?? new AbortController().signal,
    ...(options.now ? { now: options.now } : {}),
  });
}

const nearbyA = { strCd: 'A', strNm: '가까운점', distanceM: 100 };
const nearbyB = { strCd: 'B', strNm: '먼점', distanceM: 200 };

test('full matches come first (active before nearer stores), then coverage, then distance', async () => {
  const calls: string[] = [];
  const result = await run({
    items: [item('a'), item('b')],
    deps: deps({
      calls,
      nearby: [{ strCd: 'C', strNm: '멀리점', distanceM: 300 }, { ...nearbyB }, { ...nearbyA }],
      // Active and C miss b; A and B have both.
      stock: (storeCd, id) =>
        (storeCd === '001' || storeCd === 'C') && id === 'b'
          ? notCarried('상품 b')
          : inStock(`상품 ${id}`),
    }),
  });

  expect(result.stores.map((entry) => entry.store.strCd)).toEqual(['A', 'B', '001', 'C']);
  expect(result.fullMatch?.store.strCd).toBe('A');
  expect(result.stores[0]?.full).toBe(true);
  expect(result.stores[0]?.matchedCount).toBe(2);
  expect(result.active.store.strCd).toBe('001');
  expect(result.active.matchedCount).toBe(1);
  expect(result.checkedCount).toBe(2);
  expect(result.evaluatedCount).toBe(2);
  expect(result.nearbyUnavailable).toBe(false);
  // Only one variant answers the same normalized identity: 4 stores × 2 items.
  expect(calls).toHaveLength(8);
});

test('unknown (franchise) is neither missing nor stocked: it can never produce a full match', async () => {
  const result = await run({
    items: [item('a')],
    deps: deps({ stock: () => franchise('상품 a') }),
  });

  const row = result.active.items[0];
  expect(row?.available).toBeNull();
  expect(result.active.matchedCount).toBe(0);
  expect(result.active.full).toBe(false);
  expect(result.fullMatch).toBeNull();
});

test('a failed read is unknown, not out of stock', async () => {
  const result = await run({
    items: [item('a')],
    deps: deps({ stock: () => new Error('network down') }),
  });

  expect(result.active.items[0]?.available).toBeNull();
  expect(result.active.full).toBe(false);
});

test('in-stock rows carry the observed price and primary shelf position', async () => {
  const result = await run({
    items: [item('a')],
    deps: deps({ stock: () => inStock('상품 a', 2500) }),
  });

  expect(result.active.items[0]).toMatchObject({
    id: 'a',
    name: '상품 a',
    available: true,
    price: 2500,
    location: { floor: '11', zone: '56' },
  });
});

test('the batch is capped at 10 rows; un-evaluated rows stay only in checkedCount', async () => {
  const calls: string[] = [];
  const items = Array.from({ length: 12 }, (_, index) => item(String(index)));
  const result = await run({
    items,
    deps: deps({ calls, nearbyError: true, stock: () => inStock('상품') }),
  });

  expect(CART_MATCH_MAX_ITEMS).toBe(10);
  expect(result.evaluatedCount).toBe(10);
  expect(result.checkedCount).toBe(12);
  expect(result.active.totalCount).toBe(10);
  expect(calls).toHaveLength(10);
});

test('nearby failures and empty geolocation both degrade to the active store only', async () => {
  for (const scenario of [{ nearbyError: true }, { nearby: [] }]) {
    const result = await run({
      items: [item('a')],
      deps: deps({ ...scenario, stock: () => inStock('상품 a') }),
    });
    expect(result.nearbyUnavailable).toBe(true);
    expect(result.stores).toHaveLength(1);
    expect(result.active.full).toBe(true);
  }
});

test('the active store is never duplicated and candidates stop at four stores', async () => {
  const result = await run({
    items: [item('a')],
    deps: deps({
      nearby: [
        { strCd: '001', strNm: '명동역점', distanceM: 1 }, // same store, closer "copy"
        { strCd: 'A', strNm: '가까운점', distanceM: 100 },
        { strCd: 'B', strNm: '먼점', distanceM: 200 },
        { strCd: 'C', strNm: '멀리점', distanceM: 300 },
        { strCd: 'D', strNm: '아주먼점', distanceM: 400 },
      ],
      stock: () => inStock('상품 a'),
    }),
  });

  const codes = result.stores.map((entry) => entry.store.strCd);
  expect(CART_MATCH_MAX_STORES).toBe(4);
  expect(codes).toHaveLength(4);
  expect(new Set(codes).size).toBe(4);
  expect(codes).toContain('001');
  expect(codes).not.toContain('D');
  expect(result.nearbyUnavailable).toBe(false);
});

test('an aborted run rejects and never reports a verdict', async () => {
  const controller = new AbortController();
  const started: string[] = [];
  const hanging: CartMatchDeps = {
    getNearbyStores: async () => [],
    queryStock: (_store, cartItem, signal) =>
      new Promise((_resolve, reject) => {
        started.push(cartItem.id);
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      }),
  };

  const pending = matchCart({
    activeStore,
    items: [item('a'), item('b'), item('c'), item('d')],
    deps: hanging,
    signal: controller.signal,
  });
  // Let the nearby lookup settle and the first worker wave dispatch before aborting.
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();

  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  // Concurrency is 3, so the fourth row must not have been dispatched.
  expect(started).toHaveLength(3);
});

test('a signal that is already aborted skips every read', async () => {
  const controller = new AbortController();
  controller.abort();
  const calls: string[] = [];
  await expect(
    run({
      items: [item('a')],
      signal: controller.signal,
      deps: deps({ calls, stock: () => inStock('상품 a') }),
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(calls).toHaveLength(0);
});

test('at is the injected observation time', async () => {
  const result = await run({
    items: [item('a')],
    deps: deps({ stock: () => inStock('상품 a') }),
    now: () => 1234,
  });
  expect(result.at).toBe(1234);
});
