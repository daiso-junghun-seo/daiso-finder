import { mockAnswers } from '../../adapters/mock/fixtures';
import type { StoreStockRepository } from '../../domain/ports';
import type { AvailabilityAnswer, StoreContext } from '../../domain/types';
import {
  type InStockAnswer,
  NAV_REFRESH_TIMEOUT_MS,
  type NavigationEntry,
  isWellFormedAnswer,
  otherLocationOf,
  refreshNavigation,
  sameGuidance,
  sameLocation,
} from './navigation-refresh';

const NOW = new Date(2026, 6, 15, 9, 0).getTime();
const STORE: StoreContext = { strCd: '001', strNm: '명동역점' };
const ANSWER = mockAnswers.inStock as InStockAnswer;

function entry(overrides: Partial<NavigationEntry> = {}): NavigationEntry {
  return {
    store: STORE,
    answer: ANSWER,
    freshness: { class: 'live', observedAt: NOW },
    term: { kind: 'keyword', keyword: '밀폐용기' },
    ...overrides,
  };
}

function repoReturning(
  answer: AvailabilityAnswer | Promise<AvailabilityAnswer>,
): StoreStockRepository {
  return { query: vi.fn(() => Promise.resolve(answer)) };
}

test('timeout budget matches the Engineering contract (2 s)', () => {
  expect(NAV_REFRESH_TIMEOUT_MS).toBe(2000);
});

test('an identical answer is unchanged and refreshes the live stamp', async () => {
  const repo = repoReturning(ANSWER);
  const outcome = await refreshNavigation(entry(), { repo, now: () => NOW + 1000 });
  expect(outcome).toEqual({
    kind: 'unchanged',
    answer: ANSWER,
    freshness: { class: 'live', observedAt: NOW + 1000 },
  });
  expect(repo.query).toHaveBeenCalledWith(STORE, { keyword: '밀폐용기' }, expect.any(AbortSignal));
});

test('quantity and photo changes alone keep the guidance unchanged', async () => {
  const refreshed: InStockAnswer = { ...ANSWER, qtyUpperBound: 3, imageUrl: undefined };
  const outcome = await refreshNavigation(entry(), {
    repo: repoReturning(refreshed),
    now: () => NOW,
  });
  expect(outcome.kind).toBe('unchanged');
});

test('a moved or added position is changed', async () => {
  const moved: InStockAnswer = { ...ANSWER, locations: [{ floor: '2', zone: '14' }] };
  const outcome = await refreshNavigation(entry(), {
    repo: repoReturning(moved),
    now: () => NOW,
  });
  expect(outcome).toEqual({
    kind: 'changed',
    answer: moved,
    freshness: { class: 'live', observedAt: NOW },
  });
});

test('temporarilyOut is the sold-out exit', async () => {
  const outcome = await refreshNavigation(entry(), {
    repo: repoReturning(mockAnswers.temporarilyOut),
    now: () => NOW,
  });
  expect(outcome.kind).toBe('soldOut');
});

test('every other negative answer is unapplied, not a made-up exit', async () => {
  for (const answer of [
    mockAnswers.discontinued,
    mockAnswers.notCarried,
    mockAnswers.restockArriving,
    mockAnswers.franchise,
  ]) {
    const outcome = await refreshNavigation(entry(), {
      repo: repoReturning(answer),
      now: () => NOW,
    });
    expect(outcome.kind).toBe('unapplied');
  }
});

test('a rejected request fails without touching the guidance', async () => {
  const repo: StoreStockRepository = { query: vi.fn(() => Promise.reject(new Error('offline'))) };
  await expect(refreshNavigation(entry(), { repo, now: () => NOW })).resolves.toEqual({
    kind: 'failed',
  });
});

test('a malformed 200 is a failed refresh, not a partial application', async () => {
  const malformed = {
    kind: 'inStock',
    productName: '',
    price: 2000,
    locations: [{ floor: '11', zone: '56' }],
    qtyUpperBound: 1,
  } as unknown as AvailabilityAnswer;
  await expect(
    refreshNavigation(entry(), { repo: repoReturning(malformed), now: () => NOW }),
  ).resolves.toEqual({ kind: 'failed' });

  const noLocations = { ...ANSWER, locations: [] } as unknown as AvailabilityAnswer;
  await expect(
    refreshNavigation(entry(), { repo: repoReturning(noLocations), now: () => NOW }),
  ).resolves.toEqual({ kind: 'failed' });
});

test('an empty term never reaches the network', async () => {
  const repo = repoReturning(ANSWER);
  await expect(
    refreshNavigation(entry({ term: { kind: 'keyword', keyword: '  ' } }), { repo }),
  ).resolves.toEqual({ kind: 'failed' });
  expect(repo.query).not.toHaveBeenCalled();
});

test('a candidate term keeps exact pdNo identity', async () => {
  const repo = repoReturning(ANSWER);
  await refreshNavigation(
    entry({ term: { kind: 'pdNo', pdNo: '19987', keyword: '리빙 밀폐용기 1.2L' } }),
    { repo },
  );
  expect(repo.query).toHaveBeenCalledWith(
    STORE,
    { keyword: '리빙 밀폐용기 1.2L', pdNo: '19987' },
    expect.any(AbortSignal),
  );
});

test('a request slower than the timeout fails and aborts the adapter signal', async () => {
  vi.useFakeTimers();
  let seen: AbortSignal | undefined;
  const repo: StoreStockRepository = {
    query: vi.fn((_store, _term, signal) => {
      seen = signal;
      return new Promise<AvailabilityAnswer>(() => {});
    }),
  };
  const pending = refreshNavigation(entry(), { repo, timeoutMs: 50, now: () => NOW });
  await vi.advanceTimersByTimeAsync(50);
  await expect(pending).resolves.toEqual({ kind: 'failed' });
  expect(seen?.aborted).toBe(true);
  vi.useRealTimers();
});

test('an external abort (unmount) settles as failed', async () => {
  const controller = new AbortController();
  const repo: StoreStockRepository = {
    query: vi.fn(() => new Promise<AvailabilityAnswer>(() => {})),
  };
  const pending = refreshNavigation(entry(), {
    repo,
    timeoutMs: 60_000,
    signal: controller.signal,
  });
  controller.abort();
  await expect(pending).resolves.toEqual({ kind: 'failed' });
});

test('sameGuidance compares name, price and the ORDERED locations only', () => {
  const reordered: InStockAnswer = {
    ...ANSWER,
    locations: [...ANSWER.locations].reverse().concat({ floor: '2', zone: '14' }),
  };
  expect(sameGuidance(ANSWER, ANSWER)).toBe(true);
  expect(sameGuidance(ANSWER, { ...ANSWER, qtyUpperBound: 1 })).toBe(true);
  expect(sameGuidance(ANSWER, { ...ANSWER, price: 3000 })).toBe(false);
  expect(sameGuidance(ANSWER, { ...ANSWER, productName: '다른 상품' })).toBe(false);
  expect(sameGuidance(ANSWER, reordered)).toBe(false);
});

test('sameLocation compares floor and zone', () => {
  expect(sameLocation({ floor: '11', zone: '56' }, { floor: '11', zone: '56' })).toBe(true);
  expect(sameLocation({ floor: '11', zone: '56' }, { floor: '11', zone: '57' })).toBe(false);
});

test('otherLocationOf offers another position only while the current one remains listed', () => {
  const multi = mockAnswers.inStockMultiLocation as InStockAnswer;
  expect(otherLocationOf(multi, { floor: '11', zone: '56' })).toEqual({ floor: '2', zone: '14' });
  expect(otherLocationOf(multi, { floor: '9', zone: '9' })).toBeNull();
  expect(otherLocationOf(ANSWER, { floor: '11', zone: '56' })).toBeNull();
});

test('isWellFormedAnswer rejects shapes that cannot back guidance', () => {
  expect(isWellFormedAnswer(ANSWER)).toBe(true);
  expect(isWellFormedAnswer(mockAnswers.temporarilyOut)).toBe(true);
  expect(isWellFormedAnswer(null)).toBe(false);
  expect(isWellFormedAnswer({ kind: 'inStock' })).toBe(false);
  expect(isWellFormedAnswer({ kind: 'unknown' })).toBe(false);
  expect(isWellFormedAnswer({ ...ANSWER, locations: [{ floor: '', zone: '1' }] })).toBe(false);
});
