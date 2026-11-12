import type { AlternativeRepository } from '../../domain/ports';
import type { NearbyAlternative, SimilarAlternative } from '../../domain/types';
import { createAlternativeCache } from './alternative-cache';
import {
  refreshAlternative,
  retryAlternativeSlot,
  startAlternativeQuery,
} from './alternative-query';
import type { AlternativeEntry, AlternativeSnapshot } from './alternative-types';

const STORE = { strCd: '10803', strNm: '명동역점' };
const SIMILAR: SimilarAlternative = {
  pdNo: '20001',
  productName: '리빙 밀폐용기 1.4L',
  price: 3000,
  qtyUpperBound: 12,
  locations: [{ floor: '11', zone: '56' }],
};
const NEARBY: NearbyAlternative = {
  strCd: '11043',
  strNm: '을지로입구점',
  distanceM: 850,
  address: '서울 중구 을지로 2',
  closingTime: '21:00',
  closedToday: false,
  qtyUpperBound: 2,
};

const A_ONLY: AlternativeEntry = {
  store: STORE,
  reason: 'temporarilyOut',
  productName: '밀폐용기 6P 세트',
  pdNo: '19987',
  keyword: '밀폐용기',
  issued: { similar: true, nearby: false },
  lead: 'similar',
  origin: 'flow1',
};
const BOTH: AlternativeEntry = {
  ...A_ONLY,
  reason: 'notCarried',
  issued: { similar: true, nearby: true },
  lead: 'nearby',
};
const B_ONLY: AlternativeEntry = {
  ...A_ONLY,
  reason: 'franchise',
  issued: { similar: false, nearby: true },
  lead: 'nearby',
};

interface Repo {
  repo: AlternativeRepository;
  similarCalls: number;
  nearbyCalls: number;
  lastSimilarSignal?: AbortSignal;
}

function fakeRepo(
  handlers: {
    similar?: (signal?: AbortSignal) => Promise<SimilarAlternative[]>;
    nearby?: (signal?: AbortSignal) => Promise<NearbyAlternative[]>;
  } = {},
): Repo {
  const state: Repo = {
    similarCalls: 0,
    nearbyCalls: 0,
    repo: {
      async querySimilar(_store, _term, signal) {
        state.similarCalls += 1;
        state.lastSimilarSignal = signal;
        return handlers.similar ? handlers.similar(signal) : [SIMILAR];
      },
      async queryNearby(_store, _pdNo, signal) {
        state.nearbyCalls += 1;
        return handlers.nearby ? handlers.nearby(signal) : [NEARBY];
      },
    },
  };
  return state;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('a production A-only entry never calls the nearby port', async () => {
  const f = fakeRepo();
  const updates: AlternativeSnapshot[] = [];
  const handle = startAlternativeQuery(A_ONLY, {
    repo: f.repo,
    now: () => 1_000,
    onUpdate: (s) => updates.push(s),
  });
  await handle.promise;
  expect(f.nearbyCalls).toBe(0);
  expect(updates[0]?.slots).toEqual({
    similar: { status: 'pending' },
    nearby: { status: 'withheld' },
  });
  expect(updates.at(-1)).toMatchObject({
    settled: true,
    source: 'live',
    observedAt: 1_000,
    slots: { similar: { status: 'ready', rows: [SIMILAR] }, nearby: { status: 'withheld' } },
  });
});

test('the first answer renders while the sibling is still pending; the stamp waits for both', async () => {
  const a = deferred<SimilarAlternative[]>();
  let clock = 1_000;
  const { repo } = fakeRepo({ similar: () => a.promise });
  const updates: AlternativeSnapshot[] = [];
  const handle = startAlternativeQuery(BOTH, {
    repo,
    now: () => clock,
    onUpdate: (s) => updates.push(s),
  });

  await vi.waitFor(() =>
    expect(updates.at(-1)?.slots.nearby).toEqual({ status: 'ready', rows: [NEARBY] }),
  );
  expect(updates.at(-1)?.slots.similar).toEqual({ status: 'pending' });
  expect(updates.at(-1)?.observedAt).toBeNull();
  expect(updates.at(-1)?.settled).toBe(false);

  clock = 1_400;
  a.resolve([SIMILAR]);
  const final = await handle.promise;
  expect(final.observedAt).toBe(1_000); // min(nearby@1000, similar@1400) — the OLDEST claim
  expect(final.settled).toBe(true);
});

test('one slot failing does not block or fail the other', async () => {
  const { repo } = fakeRepo({
    similar: () => Promise.reject(new Error('similar down')),
  });
  const snapshot = await startAlternativeQuery(BOTH, { repo, now: () => 7 }).promise;
  expect(snapshot.slots.similar).toEqual({ status: 'failed' });
  expect(snapshot.slots.nearby).toEqual({ status: 'ready', rows: [NEARBY] });
  expect(snapshot.observedAt).toBe(7);
});

test('a request slower than the deadline fails and aborts its own signal', async () => {
  vi.useFakeTimers();
  const hanging = deferred<SimilarAlternative[]>();
  const f = fakeRepo({ similar: () => hanging.promise });
  const pending = startAlternativeQuery(A_ONLY, {
    repo: f.repo,
    timeoutMs: 50,
    now: () => 1,
  }).promise;
  await vi.advanceTimersByTimeAsync(50);
  const snapshot = await pending;
  expect(snapshot.slots.similar).toEqual({ status: 'failed' });
  expect(f.lastSimilarSignal?.aborted).toBe(true);
  vi.useRealTimers();
});

test('all issued slots failing with a cached answer serves the cache, never a live claim', async () => {
  const cache = createAlternativeCache(() => 9_000);
  cache.save(A_ONLY, {
    slots: { similar: { status: 'empty' }, nearby: { status: 'withheld' } },
    issued: A_ONLY.issued,
    observedAt: 1_000,
    source: 'live',
    settled: true,
  });
  const { repo } = fakeRepo({ similar: () => Promise.reject(new Error('down')) });
  const updates: AlternativeSnapshot[] = [];
  const final = await startAlternativeQuery(A_ONLY, {
    repo,
    cache,
    onUpdate: (s) => updates.push(s),
  }).promise;
  expect(final.source).toBe('cache');
  expect(final.observedAt).toBe(9_000);
  expect(final.slots.similar).toEqual({ status: 'empty' });
  expect(updates.at(-1)?.source).toBe('cache');
});

test('all failing without a cache stays an honest live failure (no stamp)', async () => {
  const cache = createAlternativeCache();
  const { repo } = fakeRepo({
    similar: () => Promise.reject(new Error('down')),
    nearby: () => Promise.reject(new Error('down')),
  });
  const final = await startAlternativeQuery(BOTH, { repo, cache, now: () => 5 }).promise;
  expect(final).toMatchObject({ settled: true, source: 'live', observedAt: null });
  expect(final.slots).toEqual({
    similar: { status: 'failed' },
    nearby: { status: 'failed' },
  });
});

test('a successful answer is stored; a mixed one is not', async () => {
  const cache = createAlternativeCache(() => 9_000);
  const ok = fakeRepo();
  await startAlternativeQuery(A_ONLY, { repo: ok.repo, cache, now: () => 1 }).promise;
  expect(cache.load(A_ONLY)).not.toBeNull();

  const mixedCache = createAlternativeCache();
  const mixed = fakeRepo({ nearby: () => Promise.reject(new Error('down')) });
  await startAlternativeQuery(BOTH, { repo: mixed.repo, cache: mixedCache, now: () => 1 }).promise;
  expect(mixedCache.load(BOTH)).toBeNull();
});

test('cache is judged against the entry’s own issued slots', async () => {
  const cache = createAlternativeCache();
  cache.save(A_ONLY, {
    slots: { similar: { status: 'ready', rows: [SIMILAR] }, nearby: { status: 'withheld' } },
    issued: A_ONLY.issued,
    observedAt: 1,
    source: 'live',
    settled: true,
  });
  // Same store/identity but the widened entry asks a question the cache cannot answer.
  const { repo } = fakeRepo({
    similar: () => Promise.reject(new Error('down')),
    nearby: () => Promise.reject(new Error('down')),
  });
  const final = await startAlternativeQuery(BOTH, { repo, cache }).promise;
  expect(final.source).toBe('live');
  expect(final.slots.nearby).toEqual({ status: 'failed' });
});

test('a B-only entry asks only the nearby port', async () => {
  const f = fakeRepo();
  const snapshot = await startAlternativeQuery(B_ONLY, {
    repo: f.repo,
    now: () => 3,
  }).promise;
  expect(f.similarCalls).toBe(0);
  expect(snapshot.slots).toEqual({
    similar: { status: 'withheld' },
    nearby: { status: 'ready', rows: [NEARBY] },
  });
});

test('cancelling stops late updates and aborts the adapters', async () => {
  const a = deferred<SimilarAlternative[]>();
  const f = fakeRepo({ similar: () => a.promise });
  const updates: AlternativeSnapshot[] = [];
  const handle = startAlternativeQuery(A_ONLY, {
    repo: f.repo,
    onUpdate: (s) => updates.push(s),
  });
  handle.cancel();
  const before = updates.length;
  a.resolve([SIMILAR]);
  await handle.promise;
  expect(updates.length).toBe(before);
  expect(f.lastSimilarSignal?.aborted).toBe(true);
});

test('an external abort settles as a failure and never hangs the flow', async () => {
  const controller = new AbortController();
  const hanging = deferred<SimilarAlternative[]>();
  const { repo } = fakeRepo({ similar: () => hanging.promise });
  const pending = startAlternativeQuery(A_ONLY, {
    repo,
    signal: controller.signal,
    timeoutMs: 60_000,
  }).promise;
  controller.abort();
  const snapshot = await pending;
  expect(snapshot.slots.similar).toEqual({ status: 'failed' });
});

test('refresh keeps the rows on screen when the read fails and lets the stamp age', async () => {
  const current: AlternativeSnapshot = {
    slots: { similar: { status: 'ready', rows: [SIMILAR] }, nearby: { status: 'withheld' } },
    issued: A_ONLY.issued,
    observedAt: 1_000,
    source: 'live',
    settled: true,
  };
  const { repo } = fakeRepo({ similar: () => Promise.reject(new Error('down')) });
  const next = await refreshAlternative(A_ONLY, current, { repo, now: () => 8_000 });
  expect(next.slots.similar).toEqual({ status: 'ready', rows: [SIMILAR] });
  expect(next.observedAt).toBe(1_000);
});

test('refresh turns a never-answered slot into a failed one, but a declined empty replaces ready', async () => {
  const pendingSlot: AlternativeSnapshot = {
    slots: { similar: { status: 'failed' }, nearby: { status: 'withheld' } },
    issued: A_ONLY.issued,
    observedAt: null,
    source: 'live',
    settled: true,
  };
  const failedAgain = await refreshAlternative(A_ONLY, pendingSlot, {
    repo: fakeRepo({ similar: () => Promise.reject(new Error('down')) }).repo,
    now: () => 8_000,
  });
  expect(failedAgain.slots.similar).toEqual({ status: 'failed' });
  expect(failedAgain.observedAt).toBeNull();

  const nowEmpty = await refreshAlternative(A_ONLY, pendingSlot, {
    repo: fakeRepo({ similar: async () => [] }).repo,
    now: () => 8_000,
  });
  expect(nowEmpty.slots.similar).toEqual({ status: 'empty' });
  expect(nowEmpty.observedAt).toBe(8_000);
});

test('a fully successful refresh is stored; a half-failed one is not', async () => {
  const current: AlternativeSnapshot = {
    slots: {
      similar: { status: 'ready', rows: [SIMILAR] },
      nearby: { status: 'ready', rows: [NEARBY] },
    },
    issued: BOTH.issued,
    observedAt: 1_000,
    source: 'live',
    settled: true,
  };
  const goodCache = createAlternativeCache();
  await refreshAlternative(BOTH, current, {
    repo: fakeRepo().repo,
    cache: goodCache,
    now: () => 2,
  });
  expect(goodCache.load(BOTH)).not.toBeNull();

  const mixedCache = createAlternativeCache();
  await refreshAlternative(BOTH, current, {
    repo: fakeRepo({ nearby: () => Promise.reject(new Error('down')) }).repo,
    cache: mixedCache,
    now: () => 2,
  });
  expect(mixedCache.load(BOTH)).toBeNull();
});

test('slot retry asks only that slot', async () => {
  const f = fakeRepo();
  const outcome = await retryAlternativeSlot(BOTH, 'nearby', { repo: f.repo, now: () => 4 });
  expect(f.nearbyCalls).toBe(1);
  expect(f.similarCalls).toBe(0);
  expect(outcome).toEqual({ result: { status: 'ready', rows: [NEARBY] }, observedAt: 4 });
});

test('a retry of a withheld slot answers withheld without a request', async () => {
  const f = fakeRepo();
  const outcome = await retryAlternativeSlot(A_ONLY, 'nearby', { repo: f.repo });
  expect(f.nearbyCalls).toBe(0);
  expect(outcome).toEqual({ result: { status: 'withheld' }, observedAt: null });
});

test('there is no periodic timer: a settled query makes no further calls', async () => {
  vi.useFakeTimers();
  const f = fakeRepo();
  await startAlternativeQuery(A_ONLY, { repo: f.repo, now: () => 1 }).promise;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(f.similarCalls).toBe(1);
  vi.useRealTimers();
});
