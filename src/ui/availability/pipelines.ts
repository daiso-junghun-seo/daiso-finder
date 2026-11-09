// src/ui/availability/pipelines.ts
// The three lookup pipelines (typed search, candidate tap, scan) plus the guards that make a late
// answer harmless. Extracted from AvailabilitySurface so the surface holds composition, not policy.
import { createProductSearch, createStoreStockRepository } from '../../adapters/composition';
import { defaultPolicy } from '../../domain/policy';
import type {
  AvailabilityAnswer,
  Freshness,
  ProductCandidate,
  StoreContext,
  StoreEvent,
  UiState,
} from '../../domain/types';
import { createIndexedDbCache } from '../../infra/cache-storage';
import { createQueryRunner } from '../../infra/query-cache';
import { type RecentView, viewFromResult } from '../../infra/recent-views';
import { useAvailabilityStore } from '../store';

// Live typed-search pipeline (search-first, Interface §copy-table AI-low): every submitted keyword is
// searched for literal candidates FIRST. ≥2 → show the candidate list (a pre-answer state; picking one
// re-queries via runByPdNo). 0 or 1 → fall straight through to the availability pipeline — 1 candidate
// carries its own pdNo+name (an unambiguous literal match skips the extra tap); 0 falls back to the raw
// keyword (→ noMatch/answer/FAILURE+cache, same as before candidates existed). Every 다시 확인 re-runs
// this verbatim with the retained query (B15).
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

const productSearch = createProductSearch();

// View-recording seam (§B47): every pipeline that resolves an answer records a recent view.
// Production records into the zustand store (persisted to localStorage); tests inject a spy.
export type OnView = (view: RecentView) => void;

function defaultOnView(view: RecentView): void {
  useAvailabilityStore.getState().recordView(view);
}

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
