import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockAnswers } from '../adapters/mock/fixtures';
import type { ProductSearchPort, ScannerPort } from '../domain/ports';
import type { ProductCandidate, StoreEvent } from '../domain/types';
import {
  AvailabilitySurface,
  type QueryOutcomeRunner,
  isCurrentRun,
  planStoreSwitch,
  runByPdNo,
  runByScan,
  runQuery,
} from './AvailabilitySurface';
import { RECENT_SEARCHES_LABEL, RESULTS_NOTICE, SCAN_BUTTON_LABEL, emptyBody } from './copy';
import { useAvailabilityStore } from './store';

// A search step that finds no literal candidates — forces runQuery straight to the availability path
// with the raw keyword, bypassing the search-first candidate branch (used by tests below whose intent
// is the runner/token guard, not the search-first routing itself, which has its own dedicated tests).
const noCandidates = async () => [];

// Retry-focus harness (P6-4 decision 6): when the flag is on, the surface's live pipeline gets a
// never-resolving runner so the test can observe focus while Loading is still on screen.
const retryFocus = vi.hoisted(() => ({ neverResolve: false }));

vi.mock('../infra/query-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../infra/query-cache')>();
  const createQueryRunner: typeof actual.createQueryRunner = (deps) =>
    retryFocus.neverResolve
      ? { run: () => new Promise<never>(() => {}) }
      : actual.createQueryRunner(deps);
  return { ...actual, createQueryRunner };
});

// Scan-timing harness. The DEV/test scanner (createMockScanner) decodes the instant it is asked, so the
// overlay would open and close inside the very click that opened it — no assertion could ever observe
// the dialog, and no test could separate "opened" from "decoded". These tests own the decode moment at
// the composition seam instead (same vi.hoisted control the retry runner above uses): the scan stays
// pending until the test decodes, and an abort (overlay unmount) resolves it as cancelled.
const scanControl = vi.hoisted(() => ({
  decode: undefined as ((value: string) => void) | undefined,
}));

// Records every ProductSearchPort call the surface's production pipeline makes, delegating to the real
// mock search so no other test's behaviour changes. Used to prove the scan path never searches at all.
const searchControl = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock('../adapters/composition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../adapters/composition')>();
  const createScanner = (): ScannerPort => ({
    scan: (_target, signal) =>
      new Promise((resolve) => {
        scanControl.decode = (value) => resolve({ kind: 'decoded', value });
        signal.addEventListener('abort', () => resolve({ kind: 'cancelled' }));
      }),
  });
  const createProductSearch = (): ProductSearchPort => {
    const real = actual.createProductSearch();
    return {
      search: (keyword) => {
        searchControl.calls.push(keyword);
        return real.search(keyword);
      },
    };
  };
  return { ...actual, createScanner, createProductSearch };
});

beforeEach(() => {
  localStorage.clear();
  useAvailabilityStore.setState({
    ui: { state: 'default' },
    store: { strCd: '001', strNm: '명동역점' },
    sheetOpen: false,
    scannerOpen: false,
    locale: 'ko',
  });
});

test('default surface shows the purpose headline', () => {
  render(<AvailabilitySurface />);
  expect(screen.getByText('이 매장에 있는지 바로 확인해 보세요')).toBeInTheDocument();
  expect(screen.getByText('바코드를 스캔하거나 상품명을 입력해 보세요')).toBeInTheDocument();
});

test('the locale control switches guidance to English and persists the choice', async () => {
  const user = userEvent.setup();
  render(<AvailabilitySurface />);
  await user.click(screen.getByRole('button', { name: 'EN' }));
  expect(screen.getByRole('button', { name: 'Scan' })).toBeInTheDocument();
  expect(screen.getByText('Check if this store has it')).toBeInTheDocument();
  // Match tokens stay Korean (D069) while guidance translates.
  expect(screen.getByText('DAISO 명동역점')).toBeInTheDocument();
  expect(localStorage.getItem('daiso.locale')).toBe('en');
  await user.click(screen.getByRole('button', { name: 'KO' }));
  expect(screen.getByRole('button', { name: '바코드 스캔' })).toBeInTheDocument();
});

test('a RESULT event renders the real Bible copy for the in-stock answer, not a raw state name', () => {
  render(<AvailabilitySurface />);
  act(() => {
    useAvailabilityStore.getState().dispatch({
      type: 'RESULT',
      answer: mockAnswers.inStock,
      freshness: { class: 'live', observedAt: Date.now() },
    });
  });
  expect(screen.getByText('이 매장에 있어요')).toBeInTheDocument();
  expect(screen.queryByText('success')).not.toBeInTheDocument();
});

describe('first run (D082)', () => {
  beforeEach(() => {
    useAvailabilityStore.setState({ store: null, sheetOpen: true });
  });

  test('leads with only the store-selection sheet — no store line, no search bar', async () => {
    render(<AvailabilitySurface />);
    expect(screen.getByRole('dialog', { name: '매장 선택' })).toBeInTheDocument();
    expect(screen.queryByLabelText('상품 검색')).not.toBeInTheDocument();
    expect(screen.queryByText('다이소 명동역점')).not.toBeInTheDocument();
    // Await the sheet's async geolocation settle inside act — jsdom has no position source, so the
    // no-location note is the settled signal (act() hygiene, P6-4).
    expect(
      await screen.findByText('위치를 사용할 수 없어요. 매장명이나 지역명으로 검색해 주세요.'),
    ).toBeInTheDocument();
  });

  test('selecting a store lands on Default with the chosen store in the store line', async () => {
    render(<AvailabilitySurface />);
    await userEvent.type(screen.getByPlaceholderText('매장명 또는 지역명으로 검색'), '명동');
    await userEvent.click(await screen.findByRole('button', { name: '명동역점' }));
    expect(await screen.findByText('이 매장에 있는지 바로 확인해 보세요')).toBeInTheDocument();
    expect(screen.getByText('다이소 명동역점')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('store change (D082)', () => {
  test('매장 변경 opens the sheet over the current state and 닫기 closes it without changing the store', async () => {
    render(<AvailabilitySurface />);
    await userEvent.click(screen.getByRole('button', { name: '매장 변경' }));
    expect(await screen.findByRole('dialog', { name: '매장 선택' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('다이소 명동역점')).toBeInTheDocument();
  });
});

describe('keep product on store switch (2026-10-13)', () => {
  test('planStoreSwitch stays on Default and on blank lookups, keeps the rest', () => {
    const loading = { state: 'loading', query: '밀폐용기', slow: false } as const;
    const typed = { kind: 'typed', keyword: '밀폐용기' } as const;
    const blank = { kind: 'typed', keyword: '   ' } as const;
    const scanned = { kind: 'scan', value: '19987' } as const;
    const tapped = {
      kind: 'candidate',
      candidate: { pdNo: '19987', name: '리빙 밀폐용기 1.2L', price: 2000 },
    } as const;
    expect(planStoreSwitch({ state: 'default' }, typed)).toBeNull();
    expect(planStoreSwitch({ state: 'default' }, null)).toBeNull();
    expect(planStoreSwitch(loading, blank)).toBeNull();
    expect(planStoreSwitch(loading, { kind: 'scan', value: '  ' })).toBeNull();
    expect(planStoreSwitch(loading, typed)).toBe(typed);
    expect(planStoreSwitch(loading, tapped)).toBe(tapped);
    expect(
      planStoreSwitch(
        {
          state: 'success',
          query: '19987',
          answer: mockAnswers.inStock,
          freshness: { class: 'live' as const, observedAt: 0 },
        },
        scanned,
      ),
    ).toBe(scanned);
  });

  // Mock adapters: 밀폐용기 re-searches to the 3-candidate list under ANY store, so the
  // switch lands back on candidates instead of resetting to Default — with the new store
  // on the store line and no extra recent-search bump.
  test('switching stores re-runs the retained query under the new store', async () => {
    const user = userEvent.setup();
    render(<AvailabilitySurface />);
    await user.type(screen.getByLabelText('상품 검색'), '밀폐용기{Enter}');
    expect(await screen.findByText(RESULTS_NOTICE, { selector: 'p' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '매장 변경' }));
    await user.type(screen.getByPlaceholderText('매장명 또는 지역명으로 검색'), '을지로');
    await user.click(await screen.findByRole('button', { name: '을지로점' }));
    expect(await screen.findByText('다이소 을지로점')).toBeInTheDocument();
    expect(await screen.findByText(RESULTS_NOTICE, { selector: 'p' })).toBeInTheDocument();
    expect(useAvailabilityStore.getState().recentSearches).toEqual(['밀폐용기']);
  });
});

describe('live search', () => {
  // The mock ProductSearchPort (createMockProductSearch, wired via createProductSearch() in the
  // composition root) returns 3 candidates for "밀폐용기" — search-first routes to the candidate list,
  // not straight to an answer. Picking the first candidate re-queries by pdNo and lands on Success.
  test('submitting 밀폐용기 shows the candidate list with the Bible notice, then tapping a candidate resolves its availability', async () => {
    render(<AvailabilitySurface />);
    const input = screen.getByLabelText('상품 검색');
    await userEvent.type(input, '밀폐용기{Enter}');
    expect(input).toHaveValue('밀폐용기');
    // RESULTS_NOTICE renders in the visible CandidateList <p>; the a11y LiveRegion carries
    // the same sentence for screen readers only (visually-hidden since the 2026-10-12 polish).
    expect(await screen.findByText(RESULTS_NOTICE, { selector: 'p' })).toBeInTheDocument();
    const candidateButton = await screen.findByRole('button', { name: /리빙 밀폐용기 1\.2L/ });
    // Candidate rows never show availability — identity only (photo/name/price), stock checked on tap.
    expect(screen.queryByText('이 매장에 있어요')).not.toBeInTheDocument();
    await userEvent.click(candidateButton);
    expect(await screen.findByText('이 매장에 있어요')).toBeInTheDocument();
  });

  test('submitting an unknown keyword ends in Empty with the Bible body', async () => {
    render(<AvailabilitySurface />);
    await userEvent.type(screen.getByLabelText('상품 검색'), '락앤락같은통{Enter}');
    // The a11y LiveRegion announces the same sentence from behind visually-hidden paint.
    expect(
      await screen.findByText(emptyBody('락앤락같은통'), { selector: 'p' }),
    ).toBeInTheDocument();
  });

  // UI polish dedup (2026-10-12): the surface LiveRegion must never paint a second copy of
  // what the card/list already shows — announcements stay audible via role=status either way.
  test('the surface live regions announce without painting a duplicate line', async () => {
    render(<AvailabilitySurface />);
    await userEvent.type(screen.getByLabelText('상품 검색'), '밀폐용기{Enter}');
    expect(await screen.findByText(RESULTS_NOTICE, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('visually-hidden');
    // …and onward into an answer: the card carries every announced sentence visibly.
    await userEvent.click(await screen.findByRole('button', { name: /리빙 밀폐용기 1\.2L/ }));
    expect(await screen.findByText('이 매장에 있어요')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('visually-hidden');
  });

  test('submitting a blank query does nothing', async () => {
    render(<AvailabilitySurface />);
    await userEvent.type(screen.getByLabelText('상품 검색'), '   {Enter}');
    expect(useAvailabilityStore.getState().ui).toEqual({ state: 'default' });
  });

  // Redesign (Bible Empty L2): the card's own scan button re-opens the scanner.
  test('the empty card scan button re-opens the scanner', async () => {
    const user = userEvent.setup();
    const { container } = render(<AvailabilitySurface />);
    await user.type(screen.getByLabelText('상품 검색'), '락앤락같은통{Enter}');
    expect(
      await screen.findByText(emptyBody('락앤락같은통'), { selector: 'p' }),
    ).toBeInTheDocument();
    // Two scan buttons now: the bottom bar's and the card's — the card's is the one
    // under test (the bar's opener is covered by the scanner entry tests).
    const cardScan = container.querySelector('.answer-card button');
    expect(cardScan).not.toBeNull();
    await user.click(cardScan as HTMLElement);
    expect(useAvailabilityStore.getState().scannerOpen).toBe(true);
  });
});

describe('modal behavior (F4)', () => {
  test('background content is inert while the sheet is open and focus returns to 매장 변경 on close', async () => {
    const { container } = render(<AvailabilitySurface />);
    expect(container.querySelector('.surface-content')).not.toHaveAttribute('inert');
    await userEvent.click(screen.getByRole('button', { name: '매장 변경' }));
    expect(container.querySelector('.surface-content')).toHaveAttribute('inert');
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(container.querySelector('.surface-content')).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: '매장 변경' })).toHaveFocus();
  });

  test('focus returns to 매장 변경 after selecting a store from the sheet', async () => {
    render(<AvailabilitySurface />);
    await userEvent.click(screen.getByRole('button', { name: '매장 변경' }));
    await userEvent.type(screen.getByPlaceholderText('매장명 또는 지역명으로 검색'), '을지로');
    await userEvent.click(await screen.findByRole('button', { name: '을지로점' }));
    expect(screen.getByText('다이소 을지로점')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '매장 변경' })).toHaveFocus();
  });
});

describe('staleness guard (F2)', () => {
  const storeA = { strCd: '001', strNm: '명동역점' };

  test('isCurrentRun accepts only the loading state matching the started run', () => {
    const started = { keyword: '밀폐용기', strCd: '001' };
    const loading = { state: 'loading', query: '밀폐용기', slow: false } as const;
    expect(isCurrentRun({ ui: loading, store: storeA }, started)).toBe(true);
    expect(isCurrentRun({ ui: { state: 'default' }, store: storeA }, started)).toBe(false);
    expect(
      isCurrentRun(
        { ui: { state: 'loading', query: '다른검색어', slow: false }, store: storeA },
        started,
      ),
    ).toBe(false);
    expect(isCurrentRun({ ui: loading, store: { strCd: '003', strNm: '을지로점' } }, started)).toBe(
      false,
    );
    expect(isCurrentRun({ ui: loading, store: null }, started)).toBe(false);
  });

  test('a stale outcome is dropped after selectStore (old store answer never lands)', async () => {
    let resolveSlow: (event: StoreEvent) => void = () => {};
    const slowRunner = () =>
      new Promise<StoreEvent>((resolve) => {
        resolveSlow = resolve;
      });
    const dispatch = useAvailabilityStore.getState().dispatch;
    const run = runQuery(storeA, '밀폐용기', dispatch, {
      search: noCandidates,
      runner: slowRunner,
    });
    expect(useAvailabilityStore.getState().ui).toMatchObject({
      state: 'loading',
      query: '밀폐용기',
    });
    // search-first: let the (empty) search step resolve so the slow runner is actually invoked and
    // registers its resolver BEFORE we go stale — otherwise the resolveSlow below would be a no-op.
    await Promise.resolve();
    useAvailabilityStore.getState().selectStore({ strCd: '003', strNm: '을지로점' });
    resolveSlow({
      type: 'RESULT',
      answer: mockAnswers.inStock,
      freshness: { class: 'live', observedAt: Date.now() },
    });
    await run;
    expect(useAvailabilityStore.getState().ui).toEqual({ state: 'default' });
    expect(useAvailabilityStore.getState().store).toEqual({ strCd: '003', strNm: '을지로점' });
  });

  test('the second submit wins: the first (slower) outcome is dropped, query stays retained', async () => {
    let resolveA: (event: StoreEvent) => void = () => {};
    const runnerA = () =>
      new Promise<StoreEvent>((resolve) => {
        resolveA = resolve;
      });
    const runnerB = async (): Promise<StoreEvent> => ({
      type: 'RESULT',
      answer: mockAnswers.inStock,
      freshness: { class: 'live', observedAt: Date.now() },
    });
    const dispatch = useAvailabilityStore.getState().dispatch;
    const runA = runQuery(storeA, 'temporarilyOut', dispatch, {
      search: noCandidates,
      runner: runnerA,
    });
    const runB = runQuery(storeA, '밀폐용기', dispatch, { search: noCandidates, runner: runnerB });
    await runB;
    resolveA({ type: 'FAILURE', cache: { kind: 'noCache' } });
    await runA;
    expect(useAvailabilityStore.getState().ui).toMatchObject({
      state: 'success',
      query: '밀폐용기',
    });
  });

  test('same keyword+store submitted twice: the LATER run wins even when the earlier lands first (run token, not keyword — F6)', async () => {
    let resolveFirst: (event: StoreEvent) => void = () => {};
    const firstRunner = () =>
      new Promise<StoreEvent>((resolve) => {
        resolveFirst = resolve;
      });
    let resolveSecond: (event: StoreEvent) => void = () => {};
    const secondRunner = () =>
      new Promise<StoreEvent>((resolve) => {
        resolveSecond = resolve;
      });
    const dispatch = useAvailabilityStore.getState().dispatch;
    // Identical keyword + store for both runs — isCurrentRun cannot tell them apart; only the token can.
    const runFirst = runQuery(storeA, '밀폐용기', dispatch, {
      search: noCandidates,
      runner: firstRunner,
    });
    const runSecond = runQuery(storeA, '밀폐용기', dispatch, {
      search: noCandidates,
      runner: secondRunner,
    });
    // The EARLIER submit resolves FIRST, as a failure. It is superseded, so it must be dropped, not land.
    resolveFirst({ type: 'FAILURE', cache: { kind: 'noCache' } });
    await runFirst;
    expect(useAvailabilityStore.getState().ui).toMatchObject({
      state: 'loading',
      query: '밀폐용기',
    });
    // The later submit resolves second, as a success, and wins.
    resolveSecond({
      type: 'RESULT',
      answer: mockAnswers.inStock,
      freshness: { class: 'live', observedAt: Date.now() },
    });
    await runSecond;
    expect(useAvailabilityStore.getState().ui).toMatchObject({
      state: 'success',
      query: '밀폐용기',
    });
  });
});

describe('candidates (search-first flow)', () => {
  const storeA = { strCd: '001', strNm: '명동역점' };

  test('runQuery routes ≥2 candidates to the candidates state, capped at 3 (reducer)', async () => {
    const candidates: ProductCandidate[] = [
      { pdNo: '1', name: '밀폐용기 A', price: 1000 },
      { pdNo: '2', name: '밀폐용기 B', price: 2000 },
    ];
    const dispatch = useAvailabilityStore.getState().dispatch;
    await runQuery(storeA, '밀폐용기', dispatch, { search: async () => candidates });
    expect(useAvailabilityStore.getState().ui).toEqual({
      state: 'candidates',
      query: '밀폐용기',
      candidates,
    });
  });

  // Critical guard (Task 4 brief): the 1-candidate path re-queries with the CANDIDATE's name (runKeyword),
  // but the loading state's retained query is still the ORIGINAL submitted keyword. isCurrentRun must be
  // checked against that original keyword — checking against the candidate name would never match (the
  // loading query never becomes the candidate name for this path) and would silently drop every outcome.
  test('runQuery 1-candidate path checks isCurrentRun against the ORIGINAL keyword, not the candidate name', async () => {
    const candidate: ProductCandidate = { pdNo: '1', name: '완전히 다른 상품명', price: 1000 };
    const search = async () => [candidate];
    let received: { store: unknown; keyword: string; pdNo?: string } | null = null;
    const runner = async (store: unknown, keyword: string, pdNo?: string): Promise<StoreEvent> => {
      received = { store, keyword, pdNo };
      return {
        type: 'RESULT',
        answer: mockAnswers.inStock,
        freshness: { class: 'live', observedAt: Date.now() },
      };
    };
    const dispatch = useAvailabilityStore.getState().dispatch;
    await runQuery(storeA, '밀폐용기', dispatch, { search, runner });
    // The runner IS called with the candidate's name+pdNo (the unambiguous literal match)...
    expect(received).toEqual({ store: storeA, keyword: '완전히 다른 상품명', pdNo: '1' });
    // ...but the outcome still lands: isCurrentRun is checked against the loading state's query, which is
    // the ORIGINAL submitted keyword ('밀폐용기'), not the candidate's name.
    expect(useAvailabilityStore.getState().ui).toMatchObject({
      state: 'success',
      query: '밀폐용기',
    });
  });

  test('runByPdNo dispatches SELECT_CANDIDATE (loading with the candidate name), then the runner outcome', async () => {
    const candidate: ProductCandidate = { pdNo: '19987', name: '리빙 밀폐용기 1.2L', price: 2000 };
    const runner = async (): Promise<StoreEvent> => ({
      type: 'RESULT',
      answer: mockAnswers.inStock,
      freshness: { class: 'live', observedAt: Date.now() },
    });
    const dispatch = useAvailabilityStore.getState().dispatch;
    const run = runByPdNo(storeA, candidate, dispatch, runner);
    expect(useAvailabilityStore.getState().ui).toMatchObject({
      state: 'loading',
      query: '리빙 밀폐용기 1.2L',
    });
    await run;
    expect(useAvailabilityStore.getState().ui).toMatchObject({
      state: 'success',
      query: '리빙 밀폐용기 1.2L',
    });
  });

  test('runByPdNo: a stale outcome is dropped when a newer run supersedes it (F6 token)', async () => {
    let resolveFirst: (event: StoreEvent) => void = () => {};
    const firstRunner = () =>
      new Promise<StoreEvent>((resolve) => {
        resolveFirst = resolve;
      });
    const candidate: ProductCandidate = { pdNo: '19987', name: '리빙 밀폐용기 1.2L', price: 2000 };
    const dispatch = useAvailabilityStore.getState().dispatch;
    const runFirst = runByPdNo(storeA, candidate, dispatch, firstRunner);
    const runSecond = runQuery(storeA, '수납 바구니', dispatch, {
      search: noCandidates,
      runner: async (): Promise<StoreEvent> => ({
        type: 'RESULT',
        answer: mockAnswers.temporarilyOut,
        freshness: { class: 'live', observedAt: Date.now() },
      }),
    });
    await runSecond;
    // The earlier runByPdNo resolves AFTER the newer runQuery already landed — it must be dropped.
    resolveFirst({
      type: 'RESULT',
      answer: mockAnswers.inStock,
      freshness: { class: 'live', observedAt: Date.now() },
    });
    await runFirst;
    expect(useAvailabilityStore.getState().ui).toMatchObject({
      state: 'success',
      query: '수납 바구니',
    });
  });
});

describe('scenario harness is dev-only (F4)', () => {
  test('a ?scenario= URL is ignored in a production build — no fabricated answer paints over Default', () => {
    vi.stubEnv('DEV', false);
    window.history.pushState({}, '', '/?scenario=temporarilyOut');
    try {
      render(<AvailabilitySurface />);
      // Gated off in prod: the harness never dispatches SUBMIT, so the surface stays on Default.
      expect(useAvailabilityStore.getState().ui).toEqual({ state: 'default' });
      expect(screen.getByText('이 매장에 있는지 바로 확인해 보세요')).toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
      window.history.pushState({}, '', '/');
    }
  });
});

describe('runner failure (F6)', () => {
  test('a thrown runner error dispatches FAILURE noCache instead of hanging on Loading', async () => {
    const dispatch = useAvailabilityStore.getState().dispatch;
    await runQuery({ strCd: '001', strNm: '명동역점' }, '밀폐용기', dispatch, {
      search: noCandidates,
      runner: () => Promise.reject(new Error('IndexedDB unavailable')),
    });
    expect(useAvailabilityStore.getState().ui).toEqual({
      state: 'error',
      variant: 'noCache',
      query: '밀폐용기',
    });
  });
});

describe('retry focus (P6-4 decision 6)', () => {
  test('다시 확인 moves focus to the answer card, never body, when the button unmounts on Loading', async () => {
    retryFocus.neverResolve = true;
    try {
      // 'inStock' (not '밀폐용기'): retry re-runs the FULL search-first pipeline (runQuery), and
      // '밀폐용기' now matches 3 mock candidates — it would route to the candidate list, never
      // reaching the (mocked never-resolving) availability runner this test needs to stay on Loading.
      // 'inStock' is an exact mock-scenario key: 0 candidates → straight to the availability path.
      useAvailabilityStore.setState({
        ui: { state: 'error', variant: 'noCache', query: 'inStock' },
      });
      const { container } = render(<AvailabilitySurface />);
      await userEvent.click(screen.getByRole('button', { name: '다시 확인' }));
      const card = container.querySelector('.answer-card');
      expect(card).not.toBeNull();
      expect(document.activeElement).toBe(card);
      expect(document.activeElement).not.toBe(document.body);
    } finally {
      retryFocus.neverResolve = false;
    }
  });
});

describe('retry (B15)', () => {
  test('다시 확인 re-runs the retained query, not the input field', async () => {
    // 'inStock' (not '밀폐용기'): retry re-runs the FULL search-first pipeline — '밀폐용기' now
    // matches 3 mock candidates and would route to the candidate list instead of an answer.
    // 'inStock' is an exact mock-scenario key: 0 candidates → straight to the availability path.
    useAvailabilityStore.setState({
      ui: { state: 'error', variant: 'noCache', query: 'inStock' },
    });
    render(<AvailabilitySurface />);
    await userEvent.click(screen.getByRole('button', { name: '다시 확인' }));
    expect(await screen.findByText('이 매장에 있어요')).toBeInTheDocument();
    expect(useAvailabilityStore.getState().ui).toMatchObject({
      state: 'success',
      query: 'inStock',
    });
  });
});

describe('recent searches', () => {
  beforeEach(() => {
    useAvailabilityStore.setState({ recentSearches: [] });
  });

  test('first render with no saved recent searches renders no 최근 검색 caption', () => {
    render(<AvailabilitySurface />);
    expect(screen.queryByText(RECENT_SEARCHES_LABEL)).not.toBeInTheDocument();
  });

  // recordSearch(keyword) fires with the TYPED keyword before search-first routing, so the recent-search
  // entry is always '밀폐용기' — even though submitting it now surfaces the candidate list first (3 mock
  // candidates); the flow reaches Success only after tapping a candidate.
  test('submitting 밀폐용기 records it, and it shows under 최근 검색 back on Default', async () => {
    render(<AvailabilitySurface />);
    await userEvent.type(screen.getByLabelText('상품 검색'), '밀폐용기{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: /리빙 밀폐용기 1\.2L/ }));
    expect(await screen.findByText('이 매장에 있어요')).toBeInTheDocument();
    act(() => {
      useAvailabilityStore.setState({ ui: { state: 'default' } });
    });
    expect(screen.getByText(RECENT_SEARCHES_LABEL)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '밀폐용기' })).toBeInTheDocument();
  });

  test('tapping a recent search re-runs the query, shows the candidate list, and tapping a candidate resolves it', async () => {
    useAvailabilityStore.setState({ recentSearches: ['밀폐용기'] });
    render(<AvailabilitySurface />);
    await userEvent.click(screen.getByRole('button', { name: '밀폐용기' }));
    await userEvent.click(await screen.findByRole('button', { name: /리빙 밀폐용기 1\.2L/ }));
    expect(await screen.findByText('이 매장에 있어요')).toBeInTheDocument();
  });
});

describe('barcode scan entry', () => {
  const storeA = { strCd: '001', strNm: '명동역점' };

  beforeEach(() => {
    scanControl.decode = undefined; // armed again by the next overlay mount
    searchControl.calls = [];
  });

  test('runByScan queries availability by the decoded value as both keyword and pdNo', async () => {
    const calls: Array<{ keyword: string; pdNo?: string }> = [];
    const runner: QueryOutcomeRunner = async (_store, keyword, pdNo) => {
      calls.push({ keyword, pdNo });
      return { type: 'NO_MATCH', query: keyword, suggestions: [] };
    };
    await runByScan(storeA, '19987', useAvailabilityStore.getState().dispatch, runner);
    expect(calls).toEqual([{ keyword: '19987', pdNo: '19987' }]);
    expect(useAvailabilityStore.getState().ui).toMatchObject({ state: 'empty', origin: 'scan' });
  });

  // A decoded barcode is already an exact identifier. Routing it through /api/search would add a round
  // trip AND risk the store-carryable filter dropping the exact match — the decision that the scan path
  // skips the search entirely (spec §3.3). Nothing else in the suite would notice it regressing to the
  // search-first pipeline, because the mock search happens to return [] for a digit string.
  test('a scan never calls ProductSearchPort — the decoded value goes straight to availability', async () => {
    const user = userEvent.setup();
    render(<AvailabilitySurface />);
    await user.click(screen.getByRole('button', { name: SCAN_BUTTON_LABEL }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      scanControl.decode?.('19987');
    });
    expect(await screen.findByText('이 매장에 있어요')).toBeInTheDocument();
    expect(searchControl.calls).toEqual([]);
  });

  // Verbatim pass-through, proved with a value no normalisation could leave intact: a stray
  // value.replace(/\D/g, '') (or a trim/uppercase) keeps every numeric fixture in this block green.
  test('a non-numeric decoded value reaches the runner unchanged, as both keyword and pdNo', async () => {
    const calls: Array<{ keyword: string; pdNo?: string }> = [];
    const runner: QueryOutcomeRunner = async (_store, keyword, pdNo) => {
      calls.push({ keyword, pdNo });
      return { type: 'NO_MATCH', query: keyword, suggestions: [] };
    };
    await runByScan(storeA, 'CODE39-AB1', useAvailabilityStore.getState().dispatch, runner);
    expect(calls).toEqual([{ keyword: 'CODE39-AB1', pdNo: 'CODE39-AB1' }]);
    // ...and the surface retains it verbatim too (the Empty body quotes the scanned value back).
    expect(useAvailabilityStore.getState().ui).toMatchObject({
      state: 'empty',
      query: 'CODE39-AB1',
      origin: 'scan',
    });
  });

  test('a scan outcome that lands after a newer submit is dropped', async () => {
    const dispatch = useAvailabilityStore.getState().dispatch;
    let release: (() => void) | undefined;
    const slow: QueryOutcomeRunner = async () => {
      await new Promise<void>((r) => {
        release = r;
      });
      return { type: 'NO_MATCH', query: '19987', suggestions: [] };
    };
    const pending = runByScan(storeA, '19987', dispatch, slow);
    dispatch({ type: 'SUBMIT', query: '밀폐용기' }); // newer typed run supersedes the scan
    release?.();
    await pending;
    expect(useAvailabilityStore.getState().ui).toMatchObject({
      state: 'loading',
      query: '밀폐용기',
    });
  });

  // Teeth for the run TOKEN specifically. The test above is superseded by a DIFFERENT query, so
  // isCurrentRun's query mismatch alone would drop the late outcome — it passes even with the token
  // check deleted. Here both runs carry the SAME decoded value and the SAME store (a shopper rescanning
  // the same barcode), so isCurrentRun cannot tell them apart: only the monotonic token can. Mirrors the
  // same-keyword token tests runQuery and runByPdNo already have (F6).
  test('a rescan of the same barcode: the LATER run wins even when the earlier lands first (token)', async () => {
    let resolveFirst: (event: StoreEvent) => void = () => {};
    const firstRunner = () =>
      new Promise<StoreEvent>((resolve) => {
        resolveFirst = resolve;
      });
    let resolveSecond: (event: StoreEvent) => void = () => {};
    const secondRunner = () =>
      new Promise<StoreEvent>((resolve) => {
        resolveSecond = resolve;
      });
    const dispatch = useAvailabilityStore.getState().dispatch;
    const runFirst = runByScan(storeA, '19987', dispatch, firstRunner);
    const runSecond = runByScan(storeA, '19987', dispatch, secondRunner);
    // The EARLIER scan resolves FIRST, as a no-match. It is superseded, so it must be dropped, not land.
    resolveFirst({ type: 'NO_MATCH', query: '19987', suggestions: [] });
    await runFirst;
    expect(useAvailabilityStore.getState().ui).toMatchObject({
      state: 'loading',
      query: '19987',
      origin: 'scan',
    });
    // The later scan resolves second and wins.
    resolveSecond({
      type: 'RESULT',
      answer: mockAnswers.inStock,
      freshness: { class: 'live', observedAt: Date.now() },
    });
    await runSecond;
    expect(useAvailabilityStore.getState().ui).toMatchObject({ state: 'success', query: '19987' });
  });

  test('a scanned barcode is not recorded as a recent search', async () => {
    const before = useAvailabilityStore.getState().recentSearches;
    const runner: QueryOutcomeRunner = async () => ({
      type: 'NO_MATCH',
      query: '19987',
      suggestions: [],
    });
    await runByScan(storeA, '19987', useAvailabilityStore.getState().dispatch, runner);
    expect(useAvailabilityStore.getState().recentSearches).toEqual(before);
  });

  test('tapping 바코드 스캔 opens the scanner dialog', async () => {
    const user = userEvent.setup();
    const { container } = render(<AvailabilitySurface />);
    await user.click(screen.getByRole('button', { name: SCAN_BUTTON_LABEL }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // The overlay mounts OUTSIDE .surface-content, as a sibling of the sheet. That container carries
    // `inert` while a modal is open, so an overlay nested inside it would render itself inert; and
    // stacking here is pure DOM order (no z-index anywhere in src/styles/**), so it must come last.
    expect(container.querySelector('.surface-content')).not.toContainElement(dialog);
    // ...and the background is inert while it is open, exactly as for the store sheet (F4).
    expect(container.querySelector('.surface-content')).toHaveAttribute('inert');
  });

  // The same placement holds in the answer-card branch — the load-bearing one: it is the state a
  // shopper rescans from, and it is a separate `return` with its own copy of the modal mount.
  test('the scanner mounts outside the inert background in the answer-card branch too', async () => {
    const user = userEvent.setup();
    useAvailabilityStore.setState({
      ui: {
        state: 'success',
        query: '19987',
        answer: mockAnswers.inStock,
        freshness: { class: 'live', observedAt: Date.now() },
      },
    });
    const { container } = render(<AvailabilitySurface />);
    await user.click(screen.getByRole('button', { name: SCAN_BUTTON_LABEL }));
    const dialog = await screen.findByRole('dialog');
    expect(container.querySelector('.surface-content')).not.toContainElement(dialog);
    expect(container.querySelector('.surface-content')).toHaveAttribute('inert');
  });

  test('closing the scanner returns focus to the scan button', async () => {
    const user = userEvent.setup();
    render(<AvailabilitySurface />);
    const scanButton = screen.getByRole('button', { name: SCAN_BUTTON_LABEL });
    await user.click(scanButton);
    await user.click(await screen.findByRole('button', { name: '닫기' }));
    await waitFor(() => expect(scanButton).toHaveFocus());
  });

  // End to end through the surface: the decoded value closes the viewfinder and runs availability for
  // that value (mock repo → inStock), without ever passing through the typed search bar.
  test('a decode closes the scanner and answers for the decoded value', async () => {
    const user = userEvent.setup();
    const recentBefore = useAvailabilityStore.getState().recentSearches;
    render(<AvailabilitySurface />);
    await user.click(screen.getByRole('button', { name: SCAN_BUTTON_LABEL }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      scanControl.decode?.('19987');
    });
    expect(await screen.findByText('이 매장에 있어요')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The answer copy alone would not catch a handler that dropped or mangled the decoded value — assert
    // the resulting state retains that exact value. (It carries no `origin`: the reducer threads
    // provenance only into `empty`, the one state with scan-specific copy; runByScan's own empty+origin
    // case is asserted in the first test of this block.)
    expect(useAvailabilityStore.getState().ui).toMatchObject({ state: 'success', query: '19987' });
    // The barcode never enters the recent-search list (a digit string has no recall value).
    expect(useAvailabilityStore.getState().recentSearches).toEqual(recentBefore);
  });
});
