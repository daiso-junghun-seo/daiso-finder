// src/ui/AvailabilitySurface.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createGeolocation,
  createProductSearch,
  createScanner,
  createStoreDirectory,
  createStoreStockRepository,
} from '../adapters/composition';
import { type Scenario, mockAnswers } from '../adapters/mock/fixtures';
import { createMockRepository } from '../adapters/mock/mockRepository';
import { defaultPolicy } from '../domain/policy';
import type {
  AvailabilityAnswer,
  Freshness,
  ProductCandidate,
  StoreContext,
  StoreEvent,
  UiState,
} from '../domain/types';
import { strings } from '../i18n/strings';
import { createIndexedDbCache } from '../infra/cache-storage';
import { type CartItem, cartFor, cartQtyCount, cartTotal, itemFromAnswer } from '../infra/cart';
import { createQueryRunner } from '../infra/query-cache';
import { type RecentView, viewFromResult } from '../infra/recent-views';
import { loadStoreContext } from '../infra/store-context';
import { AnswerCard } from './AnswerCard';
import { LiveRegion } from './a11y/LiveRegion';
import { isCrossStoreImport, parseCartImport } from './cart-share';
import { CandidateList } from './components/CandidateList';
import { CartSheet } from './components/CartSheet';
import { GlassSurface } from './components/GlassSurface';
import { ScannerOverlay } from './components/ScannerOverlay';
import { StoreContextLine } from './components/StoreContextLine';
import { StoreSelectionSheet } from './components/StoreSelectionSheet';
import { announcementFor } from './copy';
import { formatPrice } from './format';
import { useAvailabilityStore } from './store';

// Placeholder store for the Inc-0 sweep only — the sheet exists (D082); this is now only the E2E
// sweep's default store when no store context has been saved yet.
const PLACEHOLDER_STORE = { strCd: '0', strNm: '명동역점' };

// Store directory + geolocation for the D082 sheet: the composition root selects the live /api adapters
// in prod builds and the mocks in dev/test. GPS only recommends nearby stores (A9) — it never sets the store.
const storeDirectory = createStoreDirectory();
const browserGeolocation = createGeolocation();
// Literal product search for the search-first candidate flow: the composition root selects the live
// /api/search adapter in prod, the mock (3 fixture candidates on "밀폐용기") in dev/test.
const productSearch = createProductSearch();
// Barcode scanner for the 바코드 스캔 entry: the composition root selects the real camera adapter in
// prod, the no-camera mock in dev/test. Module scope keeps its identity stable across renders — the
// overlay's scan effect depends on it, so a per-render instance would restart the camera.
const scanner = createScanner();

// Dev-only scenario switch driving the mock pipeline for the Playwright sweep. NOT production routing —
// Flow-1 entry/search/store-selection landed in Phase 5; this harness remains the E2E state sweep.
async function runScenario(scenario: string, dispatch: (event: StoreEvent) => void) {
  const store = loadStoreContext() ?? PLACEHOLDER_STORE;
  const cache = createIndexedDbCache();
  const now = () => Date.now();

  dispatch({ type: 'SUBMIT', query: scenario });

  if (scenario === 'empty') {
    const repo = createMockRepository('inStock', { noMatch: true });
    const event = await createQueryRunner({ repo, cache, policy: defaultPolicy, now }).run(store, {
      keyword: scenario,
    });
    dispatch(event);
    return;
  }
  if (scenario === 'errorNoCache') {
    const repo = createMockRepository('inStock', { fail: true });
    const event = await createQueryRunner({ repo, cache, policy: defaultPolicy, now }).run(store, {
      keyword: scenario,
    });
    dispatch(event);
    return;
  }
  if (scenario === 'errorCached') {
    const key = `${store.strCd}:${scenario}`;
    await cache.writeAnswer(key, mockAnswers.inStock, now()); // pre-seed a fresh cache entry
    const repo = createMockRepository('inStock', { fail: true });
    const event = await createQueryRunner({ repo, cache, policy: defaultPolicy, now }).run(store, {
      keyword: scenario,
    });
    dispatch(event);
    return;
  }
  if (!Object.hasOwn(mockAnswers, scenario)) return; // unknown ?scenario= → stay Default (dev harness)
  const repo = createMockRepository(scenario as Scenario);
  const event = await createQueryRunner({ repo, cache, policy: defaultPolicy, now }).run(store, {
    keyword: scenario,
  });
  dispatch(event);
}

// Testability seam for runQuery/runByPdNo: production always uses the live keyword/pdNo pipeline;
// tests inject a controllable-latency runner to exercise the staleness guard below. pdNo is optional —
// the 0/1-candidate paths in runQuery pass it only when a single literal candidate was chosen.
export type QueryOutcomeRunner = (
  store: StoreContext,
  keyword: string,
  pdNo?: string,
) => Promise<StoreEvent>;

const liveQueryRunner: QueryOutcomeRunner = (store, keyword, pdNo) => {
  const cache = createIndexedDbCache();
  const now = () => Date.now();
  return createQueryRunner({
    repo: createStoreStockRepository(),
    cache,
    policy: defaultPolicy,
    now,
  }).run(store, { keyword, pdNo });
};

// A late outcome may land only while the surface is still waiting for THIS run: same loading query
// and same store as when the run started. A newer SUBMIT or selectStore invalidates it — the
// reducer stays pure (B15), so the guard lives at the dispatch site.
export function isCurrentRun(
  current: { ui: UiState; store: StoreContext | null },
  started: { keyword: string; strCd: string },
): boolean {
  return (
    current.ui.state === 'loading' &&
    current.ui.query === started.keyword &&
    current.store?.strCd === started.strCd
  );
}

// Monotonic run token: every runQuery claims the next value. A late outcome only lands if its token is
// still the newest. isCurrentRun compares keyword+store, so it cannot tell two SUBMITs of the SAME
// keyword+store apart (a double-submit or a double-tapped 다시 확인) — without the token the FIRST run
// to resolve would win and the later submit's outcome would be dropped. The token makes the LAST submit
// authoritative (F6). It is process-wide and only ever increases; no test depends on its absolute value.
let latestRunToken = 0;

// Interface §3: the delay line appears only once the wait stops feeling instant. Nothing dispatched
// SLOW before this, so ui.slow (and LOADING_DELAY_LINE) was unreachable in production even though the
// reducer, the copy and their tests all existed. Each pipeline arms it after entering loading and
// clears it in a finally, so a fast answer never leaves a pending timer behind.
export const SLOW_HINT_MS = 1200;

export function armSlowHint(
  dispatch: (event: StoreEvent) => void,
  ms: number = SLOW_HINT_MS,
): () => void {
  const timer = setTimeout(() => dispatch({ type: 'SLOW' }), ms);
  return () => clearTimeout(timer);
}

// Testability seam for runQuery's search step (search-first flow): production searches the live/mock
// ProductSearchPort; tests inject a controllable search to exercise the candidate-count branches below.
export type CandidateSearch = (keyword: string) => Promise<ProductCandidate[]>;

// What the surface retains across a store switch so the product survives it. Typed
// submits keep the keyword (re-searched); candidate taps keep the whole candidate
// (exact pdNo identity via runByPdNo, no re-search); scans keep the decoded value
// (verbatim pdNo via runByScan — B29). A blank keyword retains nothing.
export type SubmittedQuery =
  | { kind: 'typed'; keyword: string }
  | { kind: 'candidate'; candidate: ProductCandidate }
  | { kind: 'scan'; value: string };

// Pure plan for a store switch: null = stay on Default (no lookup to keep), otherwise the
// lookup to re-run under the new store. The run itself goes through runQuery/runByPdNo/runByScan,
// so tokens, guards and the retained-query semantics all behave exactly like a fresh submit.
export function planStoreSwitch(
  current: UiState,
  last: SubmittedQuery | null,
): SubmittedQuery | null {
  if (current.state === 'default') return null;
  if (!last) return null;
  if (last.kind === 'typed' && !last.keyword.trim()) return null;
  if (last.kind === 'scan' && !last.value.trim()) return null;
  return last;
}

// The priced answer behind a state, when one exists (success + locationMissing + staleCache +
// error/cached — every kind EXCEPT the priceless notCarried/franchise). 담기 exists only here:
// priceless answers get no button (§B47), so itemFromAnswer's undefined is unreachable, not a branch.
export function pricedAnswerOf(
  ui: UiState,
): { answer: AvailabilityAnswer; freshness: Freshness | null; query: string } | null {
  const found =
    ui.state === 'success'
      ? { answer: ui.answer, freshness: ui.freshness, query: ui.query }
      : ui.state === 'partial' && ui.trigger !== 'franchise'
        ? { answer: ui.answer, freshness: ui.freshness, query: ui.query }
        : ui.state === 'error' && ui.variant === 'cached'
          ? { answer: ui.answer, freshness: ui.freshness, query: ui.query }
          : null;
  // A stale-cached negative (e.g. notCarried) carries no price — no total, no walk-to, no button.
  if (!found || !('price' in found.answer)) return null;
  return found;
}

// View-recording seam (§B47): every pipeline that resolves an answer records a recent view.
// Production records into the zustand store (persisted to localStorage); tests inject a spy.
export type OnView = (view: RecentView) => void;

function defaultOnView(view: RecentView): void {
  useAvailabilityStore.getState().recordView(view);
}

// Live typed-search pipeline (search-first, Interface §copy-table AI-low): every submitted keyword is
// searched for literal candidates FIRST. ≥2 → show the candidate list (a pre-answer state; picking one
// re-queries via runByPdNo). 0 or 1 → fall straight through to the availability pipeline — 1 candidate
// carries its own pdNo+name (an unambiguous literal match skips the extra tap); 0 falls back to the raw
// keyword (→ noMatch/answer/FAILURE+cache, same as before candidates existed). Every 다시 확인 re-runs
// this verbatim with the retained query (B15).
export async function runQuery(
  store: StoreContext,
  keyword: string,
  dispatch: (event: StoreEvent) => void,
  deps: { search?: CandidateSearch; runner?: QueryOutcomeRunner; onView?: OnView } = {},
) {
  const search = deps.search ?? ((k: string) => productSearch.search(k));
  const runner = deps.runner ?? liveQueryRunner;
  const onView = deps.onView ?? defaultOnView;
  const token = ++latestRunToken;
  dispatch({ type: 'SUBMIT', query: keyword }); // → loading(query=keyword)
  const stopSlowHint = armSlowHint(dispatch);
  try {
    let candidates: ProductCandidate[];
    try {
      candidates = await search(keyword);
    } catch {
      // A search failure degrades to "no literal candidates" — falls through to the keyword availability
      // path below rather than hanging or erroring the whole run (F1: never a silent hang).
      candidates = [];
    }
    if (token !== latestRunToken) return; // superseded while searching
    if (candidates.length >= 2) {
      if (!isCurrentRun(useAvailabilityStore.getState(), { keyword, strCd: store.strCd })) return;
      dispatch({ type: 'CANDIDATES', query: keyword, candidates });
      return;
    }
    // 0 or 1 candidate → availability. 1: use the chosen product's pdNo+name (unambiguous literal match).
    // 0: keyword only (→ noMatch, or an answer, or FAILURE+cache — unchanged from the pre-candidates path).
    const [onlyCandidate] = candidates;
    const pdNo = onlyCandidate?.pdNo;
    const runKeyword = onlyCandidate?.name ?? keyword;
    let event: StoreEvent;
    try {
      event = await runner(store, runKeyword, pdNo);
    } catch {
      // Never a silent hang (Interface §3): a runner that THROWS (e.g. IndexedDB unavailable inside
      // the runner's own failure path) still resolves the surface to error/noCache.
      event = { type: 'FAILURE', cache: { kind: 'noCache' } };
    }
    // A newer run superseded this one (same keyword resubmitted, or a different one) → drop this outcome.
    if (token !== latestRunToken) return;
    // isCurrentRun compares against the LOADING state's query, which is the ORIGINAL submitted keyword —
    // NOT runKeyword. In the 1-candidate path runKeyword is the candidate's name, which never equals the
    // loading query; comparing against it would always mismatch and silently drop every 1-candidate outcome.
    if (!isCurrentRun(useAvailabilityStore.getState(), { keyword, strCd: store.strCd })) return;
    // Only resolved answers become recent views — candidates/NO_MATCH/FAILURE never do.
    if (event.type === 'RESULT') onView(viewFromResult(runKeyword, pdNo, event.answer, Date.now()));
    dispatch(event);
  } finally {
    stopSlowHint();
  }
}

// Candidate-tap pipeline: the shopper picked one literal candidate out of the list runQuery surfaced.
// Re-queries availability directly by pdNo+name — no re-search (the candidate IS the chosen product).
export async function runByPdNo(
  store: StoreContext,
  candidate: ProductCandidate,
  dispatch: (event: StoreEvent) => void,
  runner: QueryOutcomeRunner = liveQueryRunner,
  onView: OnView = defaultOnView,
) {
  const token = ++latestRunToken;
  dispatch({ type: 'SELECT_CANDIDATE', query: candidate.name, pdNo: candidate.pdNo }); // → loading(query=candidate.name)
  const stopSlowHint = armSlowHint(dispatch);
  try {
    let event: StoreEvent;
    try {
      event = await runner(store, candidate.name, candidate.pdNo);
    } catch {
      event = { type: 'FAILURE', cache: { kind: 'noCache' } };
    }
    if (token !== latestRunToken) return;
    if (
      !isCurrentRun(useAvailabilityStore.getState(), {
        keyword: candidate.name,
        strCd: store.strCd,
      })
    )
      return;
    if (event.type === 'RESULT')
      onView(viewFromResult(candidate.name, candidate.pdNo, event.answer, Date.now()));
    dispatch(event);
  } finally {
    stopSlowHint();
  }
}

// Scan pipeline: a decoded barcode is already an exact identifier, so it skips the literal candidate
// search entirely (a candidate list would be noise, /api/search's store-carryable filter could drop the
// exact match, and it saves a round trip). The decoded value goes in verbatim as BOTH keyword (the
// server requires one) and pdNo (B29 pdNo-identity) — no EAN→pdNo guessing anywhere (spec §0 D3).
// The barcode is deliberately NOT recorded as a recent search: a digit string has no recall value.
export async function runByScan(
  store: StoreContext,
  value: string,
  dispatch: (event: StoreEvent) => void,
  runner: QueryOutcomeRunner = liveQueryRunner,
  onView: OnView = defaultOnView,
) {
  const token = ++latestRunToken;
  dispatch({ type: 'SUBMIT', query: value, origin: 'scan' }); // → loading(query=value, origin=scan)
  const stopSlowHint = armSlowHint(dispatch);
  try {
    let event: StoreEvent;
    try {
      event = await runner(store, value, value);
    } catch {
      event = { type: 'FAILURE', cache: { kind: 'noCache' } };
    }
    if (token !== latestRunToken) return;
    if (!isCurrentRun(useAvailabilityStore.getState(), { keyword: value, strCd: store.strCd }))
      return;
    // The recorded view carries the resolved product name, not the digit string (B30-6's recall
    // rationale holds for searches; a named product row has recall value).
    if (event.type === 'RESULT') onView(viewFromResult(value, value, event.answer, Date.now()));
    dispatch(event);
  } finally {
    stopSlowHint();
  }
}

export function AvailabilitySurface() {
  const ui = useAvailabilityStore((s) => s.ui);
  const dispatch = useAvailabilityStore((s) => s.dispatch);
  const store = useAvailabilityStore((s) => s.store);
  const sheetOpen = useAvailabilityStore((s) => s.sheetOpen);
  const openSheet = useAvailabilityStore((s) => s.openSheet);
  const closeSheet = useAvailabilityStore((s) => s.closeSheet);
  const selectStore = useAvailabilityStore((s) => s.selectStore);
  const recentSearches = useAvailabilityStore((s) => s.recentSearches);
  const recordSearch = useAvailabilityStore((s) => s.recordSearch);
  const recentViews = useAvailabilityStore((s) => s.recentViews);
  const carts = useAvailabilityStore((s) => s.carts);
  const cartOpen = useAvailabilityStore((s) => s.cartOpen);
  const openCart = useAvailabilityStore((s) => s.openCart);
  const closeCart = useAvailabilityStore((s) => s.closeCart);
  const addItem = useAvailabilityStore((s) => s.addItem);
  const setItemQty = useAvailabilityStore((s) => s.setItemQty);
  const toggleItemChecked = useAvailabilityStore((s) => s.toggleItemChecked);
  const removeCartItem = useAvailabilityStore((s) => s.removeItem);
  const importCart = useAvailabilityStore((s) => s.importCart);
  const scannerOpen = useAvailabilityStore((s) => s.scannerOpen);
  const openScanner = useAvailabilityStore((s) => s.openScanner);
  const closeScanner = useAvailabilityStore((s) => s.closeScanner);
  const locale = useAvailabilityStore((s) => s.locale);
  const setLocale = useAvailabilityStore((s) => s.setLocale);
  const S = strings(locale);
  const [input, setInput] = useState('');
  const [cartNotice, setCartNotice] = useState<{ id: number; text: string } | null>(null);
  const changeStoreRef = useRef<HTMLButtonElement>(null);
  const cartButtonRef = useRef<HTMLButtonElement>(null);
  const answerCardRef = useRef<HTMLDivElement>(null);
  const scanButtonRef = useRef<HTMLButtonElement>(null);
  // Last submitted lookup (UI-shell memory, not domain): kept across store switches so the
  // product survives them. Overwritten by every new submit/tap/decode; never cleared (a switch
  // with no prior lookup simply finds nothing to keep — see planStoreSwitch).
  const lastSubmit = useRef<SubmittedQuery | null>(null);
  const wasSheetOpen = useRef(sheetOpen);
  const wasScannerOpen = useRef(scannerOpen);
  const wasCartOpen = useRef(cartOpen);

  useEffect(() => {
    // The ?scenario= harness drives the Playwright state sweep against the MOCK pipeline. It must never
    // run in a production build: a crafted URL could otherwise paint a fabricated answer over live data,
    // violating the read-only/no-fabrication boundary (F4). DEV is true under vitest and the dev server.
    if (!import.meta.env.DEV) return;
    const scenario = new URLSearchParams(window.location.search).get('scenario');
    if (!scenario) return;
    void runScenario(scenario, dispatch);
  }, [dispatch]);

  // Modal close (닫기 / Escape / store select) returns focus to the 매장 변경 opener — never body
  // (Interface §6 focus order). After a first-run select the button mounts on the same commit.
  useEffect(() => {
    if (wasSheetOpen.current && !sheetOpen) changeStoreRef.current?.focus();
    wasSheetOpen.current = sheetOpen;
  }, [sheetOpen]);

  // Closing the scanner (닫기 / Escape / a decode) returns focus to its opener — never <body>.
  useEffect(() => {
    if (wasScannerOpen.current && !scannerOpen) scanButtonRef.current?.focus();
    wasScannerOpen.current = scannerOpen;
  }, [scannerOpen]);

  // Closing the cart sheet returns focus to the 장바구니 opener — never <body> (sheet contract).
  useEffect(() => {
    if (wasCartOpen.current && !cartOpen) cartButtonRef.current?.focus();
    wasCartOpen.current = cartOpen;
  }, [cartOpen]);

  // Memoised on purpose: ScannerOverlay's scan effect has deps [scanner, onDecoded], so a fresh inline
  // arrow on every parent render would abort the in-flight scan and restart the camera each time the
  // surface re-renders. Its deps are all stable (zustand actions and the selected store).
  const handleDecoded = useCallback(
    (value: string) => {
      closeScanner(); // the camera stops on unmount; the answer takes the surface from here
      if (!store) return; // unreachable: the scan button only exists once a store is chosen (D082)
      lastSubmit.current = { kind: 'scan', value };
      void runByScan(store, value, dispatch);
    },
    [store, dispatch, closeScanner],
  );

  // Store switch that keeps the product: the reducer still lands Default (D082 context swap),
  // then the retained lookup re-runs under the new store — scans and candidate taps keep exact
  // pdNo identity (runByScan/runByPdNo), typed keywords go search-first. No recent-search bump
  // (not a new submit).
  // The plan reads the PRE-switch ui: selectStore resets to Default first, so planning after
  // it would always find nothing to keep.
  const handleSelectStore = (next: StoreContext) => {
    const keep = planStoreSwitch(ui, lastSubmit.current);
    selectStore(next);
    if (!keep) return;
    if (keep.kind === 'scan') void runByScan(next, keep.value, dispatch);
    else if (keep.kind === 'candidate') void runByPdNo(next, keep.candidate, dispatch);
    else void runQuery(next, keep.keyword, dispatch);
  };

  // Owner-exception §B47: snapshot the priced answer into this store's list. pdNo identity comes
  // from the retained submit (candidate/scan carry it, typed keywords don't) — the same source
  // the recheck below reuses, so add and recheck can never disagree on identity.
  const handleAddToCart = () => {
    if (!store) return;
    const priced = pricedAnswerOf(ui);
    if (!priced) return; // unreachable: 담기 renders only for priced answers
    const last = lastSubmit.current;
    const pdNo =
      last?.kind === 'candidate'
        ? last.candidate.pdNo
        : last?.kind === 'scan'
          ? last.value
          : undefined;
    const item = itemFromAnswer(
      priced.query,
      pdNo,
      priced.answer,
      priced.freshness?.observedAt ?? Date.now(),
      Date.now(),
    );
    if (!item) return; // unreachable (priced gate above) — never a silent wrong row
    addItem(store, item);
    setCartNotice((n) => ({ id: (n?.id ?? 0) + 1, text: S.CART_ADDED_NOTICE }));
  };

  // Per-item 다시 확인: the SAME two paths a fresh submit takes (exact pdNo when the row
  // resolved one, search-first otherwise). The sheet closes first — the answer lands on the
  // surface behind it, never inside an inert modal. Not a new submit: no recent-search bump
  // (retry semantics, B15).
  const handleRecheckItem = (item: CartItem) => {
    if (!store) return;
    closeCart();
    if (item.pdNo) {
      const candidate = {
        pdNo: item.pdNo,
        name: item.name,
        price: item.price,
        imageUrl: item.imageUrl,
      };
      lastSubmit.current = { kind: 'candidate', candidate };
      void runByPdNo(store, candidate, dispatch);
    } else {
      lastSubmit.current = { kind: 'typed', keyword: item.query };
      void runQuery(store, item.query, dispatch);
    }
  };

  // Pasted-JSON import lands in THIS store's list with the same dedup/caps as adding by
  // hand (mergeImportedCart). Strict parse: garbage reports failure, never a half-loaded list.
  // crossStore tells the sheet that the imported rows lost their shelf snapshots.
  const handleImportJson = (text: string): { ok: boolean; count: number; crossStore: boolean } => {
    if (!store) return { ok: false, count: 0, crossStore: false };
    const parsed = parseCartImport(text);
    if (!parsed) return { ok: false, count: 0, crossStore: false };
    importCart(store.strCd, store.strNm, parsed);
    return {
      ok: true,
      count: parsed.items.length,
      crossStore: isCrossStoreImport(parsed, store.strCd),
    };
  };
  // Active store's list + the honest count caption for the other stores' lists.
  const activeCart = store ? cartFor(carts, store.strCd) : null;
  const activeCartCount = activeCart ? cartQtyCount(activeCart) : 0;
  const activeCartTotal = activeCart ? cartTotal(activeCart) : 0;
  const otherStoreCount = store
    ? Object.entries(carts).filter(([cd, c]) => cd !== store.strCd && c.items.length > 0).length
    : 0;
  // The link is a shortcut to a memo, not content — hidden while every list is empty.
  const showCartLink = activeCartCount > 0 || otherStoreCount > 0;

  const sheet = (
    <StoreSelectionSheet
      current={store}
      locale={locale}
      directory={storeDirectory}
      geolocation={browserGeolocation}
      onSelect={handleSelectStore}
      onClose={store ? closeSheet : undefined}
    />
  );

  // First run (D082): no Store Context yet — the store-selection surface leads; Flow 1 cannot query
  // without a store, so neither the store line nor the search bar renders.
  if (store === null) {
    return <main>{sheet}</main>;
  }

  // D083: the bottom search/scan bar is a glass surface; the form inside is unchanged.
  const searchBar = (
    <GlassSurface className="search-bar-surface">
      <form
        className={ui.state === 'default' ? 'search-bar' : 'search-bar search-bar--demoted'}
        id="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          const keyword = input.trim();
          if (!keyword) return;
          recordSearch(keyword);
          lastSubmit.current = { kind: 'typed', keyword };
          void runQuery(store, keyword, dispatch);
        }}
      >
        <div className="search-field">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="8" cy="8" r="6" />
            <path d="M12.5 12.5 16.5 16.5" />
          </svg>
          <input
            aria-label={S.SEARCH_INPUT_LABEL}
            placeholder={S.SEARCH_PLACEHOLDER}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <button
          ref={scanButtonRef}
          type="button"
          aria-label={S.SCAN_BUTTON_LABEL}
          className="text-label scan-button--primary"
          onClick={openScanner}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M1 6V1h5M12 1h5v5M17 12v5h-5M6 17H1v-5" />
          </svg>
          {S.SCAN_BUTTON_LABEL}
        </button>
      </form>
    </GlassSurface>
  );

  // The viewfinder is a modal sibling of the sheet, NOT a child of .surface-content, for two reasons:
  // (a) .surface-content carries `inert` while a modal is open (see backgroundInert below), so an
  // overlay nested inside it would make ITSELF inert — unreachable by keyboard and hidden from AT;
  // (b) stacking in this codebase is pure DOM order (there is no z-index anywhere in src/styles/**),
  // so the overlay must be rendered LAST in every branch to sit above the rest of the surface.
  const scannerModal = scannerOpen && (
    <>
      <div className="sheet-scrim" aria-hidden="true" />
      <ScannerOverlay
        scanner={scanner}
        locale={locale}
        onDecoded={handleDecoded}
        onClose={closeScanner}
      />
    </>
  );

  // Owner-exception §B47: the cart sheet is a modal sibling like the store sheet and the
  // viewfinder — same scrim, same inert background, same focus-return, rendered LAST so DOM
  // order keeps it above the rest (no z-index anywhere in src/styles/**).
  const cartModal = cartOpen && store && (
    <>
      <div className="sheet-scrim" aria-hidden="true" />
      <CartSheet
        cart={activeCart}
        otherStoreCount={otherStoreCount}
        locale={locale}
        onClose={closeCart}
        onSetQty={(id, qty) => setItemQty(store.strCd, id, qty)}
        onToggle={(id) => toggleItemChecked(store.strCd, id)}
        onRemove={(id) => removeCartItem(store.strCd, id)}
        onRecheck={handleRecheckItem}
        onImportJson={handleImportJson}
      />
    </>
  );

  // One-line shortcut to the memo (§B47): a link, not content — hidden while every list is empty
  // so Default keeps its single primary action. The count/total label IS the add feedback (I4):
  // it updates on the same commit as the snapshot write, and the notice below announces it.
  const cartLink = showCartLink && (
    <button ref={cartButtonRef} type="button" className="text-body cart-link" onClick={openCart}>
      {S.cartLinkLabel(activeCartCount, activeCartTotal)}
    </button>
  );
  const cartNoticeRegion = cartNotice && (
    <LiveRegion key={cartNotice.id} message={cartNotice.text} visuallyHidden />
  );

  // While a modal (sheet, scanner, or cart) is open the background is inert (aria-modal made real):
  // unreachable by keyboard and hidden from AT. First run renders the sheet alone, so no container
  // exists to mark.
  const backgroundInert = sheetOpen || scannerOpen || cartOpen ? '' : undefined;

  if (ui.state === 'default') {
    return (
      <main>
        <div className="surface-content" inert={backgroundInert}>
          <GlassSurface className="store-context-surface">
            <StoreContextLine
              store={store}
              locale={locale}
              onSelectLocale={setLocale}
              onChangeStore={openSheet}
              changeButtonRef={changeStoreRef}
            />
          </GlassSurface>
          <h1>{S.DEFAULT_HEADLINE}</h1>
          <p className="text-caption">{S.DEFAULT_SUBHEAD}</p>
          {recentSearches.length > 0 && (
            <div className="recent-searches">
              <p className="text-caption">{S.RECENT_SEARCHES_LABEL}</p>
              <ul>
                {recentSearches.map((keyword) => (
                  <li key={keyword}>
                    <button
                      type="button"
                      className="text-body"
                      onClick={() => {
                        setInput(keyword);
                        recordSearch(keyword); // re-bump to front — keeps recency order consistent on re-tap
                        lastSubmit.current = { kind: 'typed', keyword };
                        void runQuery(store, keyword, dispatch);
                      }}
                    >
                      {keyword}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Owner-exception §B47: resolved products, most-recent-first. Dual class reuses the
              recent-searches rhythm (no new CSS); rows re-run the lookup, never show availability
              (a row is a shortcut, not an answer — D061). */}
          {recentViews.length > 0 && (
            <div className="recent-searches recent-views">
              <p className="text-caption">{S.RECENT_VIEWS_LABEL}</p>
              <ul>
                {recentViews.map((view) => (
                  <li key={view.key}>
                    <button
                      type="button"
                      className="text-body"
                      onClick={() => {
                        // Exact pdNo identity when the view resolved one (runByPdNo); otherwise the
                        // typed keyword goes search-first — the same two paths a fresh submit takes.
                        if (view.pdNo && view.price !== undefined) {
                          const candidate = {
                            pdNo: view.pdNo,
                            name: view.name,
                            price: view.price,
                            imageUrl: view.imageUrl,
                          };
                          lastSubmit.current = { kind: 'candidate', candidate };
                          void runByPdNo(store, candidate, dispatch);
                        } else {
                          setInput(view.query);
                          recordSearch(view.query);
                          lastSubmit.current = { kind: 'typed', keyword: view.query };
                          void runQuery(store, view.query, dispatch);
                        }
                      }}
                    >
                      {view.name}
                      {view.price !== undefined && ` · ${formatPrice(view.price, locale)}`}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cartLink}
          {cartNoticeRegion}
          {searchBar}
        </div>
        {sheetOpen && (
          <>
            <div className="sheet-scrim" aria-hidden="true" />
            {sheet}
          </>
        )}
        {scannerModal}
        {cartModal}
      </main>
    );
  }

  // Pre-answer literal candidates (search-first): rendered BEFORE the answer-card branch below — a
  // candidate list is not an AvailabilityAnswer, so AnswerCard never mounts for it (Interface §copy-table
  // AI-low; honesty — candidate rows never show availability, only after a tap via runByPdNo).
  if (ui.state === 'candidates') {
    return (
      <main>
        <div className="surface-content" inert={backgroundInert}>
          <GlassSurface className="store-context-surface">
            <StoreContextLine
              store={store}
              locale={locale}
              onSelectLocale={setLocale}
              onChangeStore={openSheet}
              changeButtonRef={changeStoreRef}
            />
          </GlassSurface>
          <LiveRegion message={S.RESULTS_NOTICE} visuallyHidden />
          <CandidateList
            candidates={ui.candidates}
            locale={locale}
            onSelect={(c) => {
              lastSubmit.current = { kind: 'candidate', candidate: c };
              void runByPdNo(store, c, dispatch);
            }}
          />
          {searchBar}
        </div>
        {sheetOpen && (
          <>
            <div className="sheet-scrim" aria-hidden="true" />
            {sheet}
          </>
        )}
        {scannerModal}
        {cartModal}
      </main>
    );
  }

  const nowMs = Date.now();
  const announcement = announcementFor(ui, defaultPolicy, nowMs, locale).join('. ');
  // 담기 exists only for priced answers (§B47) — priceless kinds render no button at all.
  const priced = pricedAnswerOf(ui);

  return (
    <main>
      <div className="surface-content" inert={backgroundInert}>
        <GlassSurface className="store-context-surface">
          <StoreContextLine
            store={store}
            locale={locale}
            onSelectLocale={setLocale}
            onChangeStore={openSheet}
            changeButtonRef={changeStoreRef}
          />
        </GlassSurface>
        <LiveRegion message={announcement} visuallyHidden />
        <AnswerCard
          ui={ui}
          policy={defaultPolicy}
          nowMs={nowMs}
          locale={locale}
          cardRef={answerCardRef}
          onScan={openScanner}
          onAdd={priced ? handleAddToCart : undefined}
          onRetry={() => {
            void runQuery(store, ui.query, dispatch);
            // The retry button unmounts on the Loading swap — move focus to the persistent card
            // surface so it never falls to <body> (decision 6).
            answerCardRef.current?.focus();
          }}
        />
        {cartLink}
        {cartNoticeRegion}
        {searchBar}
      </div>
      {sheetOpen && (
        <>
          <div className="sheet-scrim" aria-hidden="true" />
          {sheet}
        </>
      )}
      {scannerModal}
      {cartModal}
    </main>
  );
}
