// src/ui/AvailabilitySurface.tsx
import { useEffect, useRef, useState } from 'react';
import { createBrowserGeolocation } from '../adapters/geolocation/browserGeolocation';
import { type Scenario, mockAnswers } from '../adapters/mock/fixtures';
import { createKeywordMockRepository, createMockRepository } from '../adapters/mock/mockRepository';
import { createMockStoreDirectory } from '../adapters/mock/storeDirectory';
import { defaultPolicy } from '../domain/policy';
import type { StoreContext, StoreEvent, UiState } from '../domain/types';
import { createIndexedDbCache } from '../infra/cache-storage';
import { createQueryRunner } from '../infra/query-cache';
import { loadStoreContext } from '../infra/store-context';
import { AnswerCard } from './AnswerCard';
import { LiveRegion } from './a11y/LiveRegion';
import { StoreContextLine } from './components/StoreContextLine';
import { StoreSelectionSheet } from './components/StoreSelectionSheet';
import { DEFAULT_HEADLINE, SCAN_BUTTON_LABEL, SEARCH_PLACEHOLDER, announcementFor } from './copy';
import { useAvailabilityStore } from './store';

// Placeholder store for the Inc-0 sweep only — Increment 1 wires the real store-selection sheet (D082).
const PLACEHOLDER_STORE = { strCd: '0', strNm: '명동역점' };

// Injected seams for the D082 sheet: mock store directory (B16 — the live daisomall directory adapter
// is deferred to A9) and the browser geolocation stub (returns [] until A9 wires real nearby lookup).
const storeDirectory = createMockStoreDirectory();
const browserGeolocation = createBrowserGeolocation();

// Dev-only scenario switch driving the mock pipeline for the Playwright sweep. NOT production routing —
// final Flow-1 entry/search/store-selection lands in Increment 1.
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
  const repo = createMockRepository(scenario as Scenario);
  const event = await createQueryRunner({ repo, cache, policy: defaultPolicy, now }).run(store, {
    keyword: scenario,
  });
  dispatch(event);
}

// Testability seam for runQuery: production always uses the live keyword pipeline; tests inject a
// controllable-latency runner to exercise the staleness guard below.
export type QueryOutcomeRunner = (store: StoreContext, keyword: string) => Promise<StoreEvent>;

const liveQueryRunner: QueryOutcomeRunner = (store, keyword) => {
  const cache = createIndexedDbCache();
  const now = () => Date.now();
  return createQueryRunner({
    repo: createKeywordMockRepository(),
    cache,
    policy: defaultPolicy,
    now,
  }).run(store, { keyword });
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

// Live typed-search pipeline: the keyword mock repository (B16) behind the same runner/cache as the
// harness. Every 다시 확인 re-runs this verbatim with the retained query (B15).
export async function runQuery(
  store: StoreContext,
  keyword: string,
  dispatch: (event: StoreEvent) => void,
  runner: QueryOutcomeRunner = liveQueryRunner,
) {
  dispatch({ type: 'SUBMIT', query: keyword });
  let event: StoreEvent;
  try {
    event = await runner(store, keyword);
  } catch {
    // Never a silent hang (Interface §3): a runner that THROWS (e.g. IndexedDB unavailable inside
    // the runner's own failure path) still resolves the surface to error/noCache.
    event = { type: 'FAILURE', cache: { kind: 'noCache' } };
  }
  if (!isCurrentRun(useAvailabilityStore.getState(), { keyword, strCd: store.strCd })) return;
  dispatch(event);
}

export function AvailabilitySurface() {
  const ui = useAvailabilityStore((s) => s.ui);
  const dispatch = useAvailabilityStore((s) => s.dispatch);
  const store = useAvailabilityStore((s) => s.store);
  const sheetOpen = useAvailabilityStore((s) => s.sheetOpen);
  const openSheet = useAvailabilityStore((s) => s.openSheet);
  const closeSheet = useAvailabilityStore((s) => s.closeSheet);
  const selectStore = useAvailabilityStore((s) => s.selectStore);
  const [input, setInput] = useState('');
  const changeStoreRef = useRef<HTMLButtonElement>(null);
  const wasSheetOpen = useRef(sheetOpen);

  useEffect(() => {
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

  const sheet = (
    <StoreSelectionSheet
      current={store}
      directory={storeDirectory}
      geolocation={browserGeolocation}
      onSelect={selectStore}
      onClose={store ? closeSheet : undefined}
    />
  );

  // First run (D082): no Store Context yet — the store-selection surface leads; Flow 1 cannot query
  // without a store, so neither the store line nor the search bar renders.
  if (store === null) {
    return <main>{sheet}</main>;
  }

  const searchBar = (
    <form
      className={ui.state === 'default' ? 'search-bar' : 'search-bar search-bar--demoted'}
      id="search-bar"
      onSubmit={(e) => {
        e.preventDefault();
        const keyword = input.trim();
        if (!keyword) return;
        void runQuery(store, keyword, dispatch);
      }}
    >
      <input
        aria-label="상품 검색"
        placeholder={SEARCH_PLACEHOLDER}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button type="button" aria-label={SCAN_BUTTON_LABEL} className="text-label">
        {SCAN_BUTTON_LABEL}
      </button>
    </form>
  );

  // While the modal sheet is open the background is inert (aria-modal made real): unreachable by
  // keyboard and hidden from AT. First run renders the sheet alone, so no container exists to mark.
  const backgroundInert = sheetOpen ? '' : undefined;

  if (ui.state === 'default') {
    return (
      <main>
        <div className="surface-content" inert={backgroundInert}>
          <StoreContextLine
            store={store}
            onChangeStore={openSheet}
            changeButtonRef={changeStoreRef}
          />
          <h1>{DEFAULT_HEADLINE}</h1>
          {searchBar}
        </div>
        {sheetOpen && sheet}
      </main>
    );
  }

  const nowMs = Date.now();
  const announcement = announcementFor(ui, defaultPolicy, nowMs).join('. ');

  return (
    <main>
      <div className="surface-content" inert={backgroundInert}>
        <StoreContextLine
          store={store}
          onChangeStore={openSheet}
          changeButtonRef={changeStoreRef}
        />
        <LiveRegion message={announcement} />
        <AnswerCard
          ui={ui}
          policy={defaultPolicy}
          nowMs={nowMs}
          onRetry={() => void runQuery(store, ui.query, dispatch)}
        />
        {searchBar}
      </div>
      {sheetOpen && sheet}
    </main>
  );
}
