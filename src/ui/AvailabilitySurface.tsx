// src/ui/AvailabilitySurface.tsx
import { useEffect, useState } from 'react';
import { createBrowserGeolocation } from '../adapters/geolocation/browserGeolocation';
import { type Scenario, mockAnswers } from '../adapters/mock/fixtures';
import { createKeywordMockRepository, createMockRepository } from '../adapters/mock/mockRepository';
import { createMockStoreDirectory } from '../adapters/mock/storeDirectory';
import { defaultPolicy } from '../domain/policy';
import type { StoreContext, StoreEvent } from '../domain/types';
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

// Live typed-search pipeline: the keyword mock repository (B16) behind the same runner/cache as the
// harness. Every 다시 확인 re-runs this verbatim with the retained query (B15).
async function runQuery(
  store: StoreContext,
  keyword: string,
  dispatch: (event: StoreEvent) => void,
) {
  const cache = createIndexedDbCache();
  const now = () => Date.now();
  dispatch({ type: 'SUBMIT', query: keyword });
  const event = await createQueryRunner({
    repo: createKeywordMockRepository(),
    cache,
    policy: defaultPolicy,
    now,
  }).run(store, { keyword });
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

  useEffect(() => {
    const scenario = new URLSearchParams(window.location.search).get('scenario');
    if (!scenario) return;
    void runScenario(scenario, dispatch);
  }, [dispatch]);

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

  if (ui.state === 'default') {
    return (
      <main>
        <StoreContextLine store={store} onChangeStore={openSheet} />
        <h1>{DEFAULT_HEADLINE}</h1>
        {searchBar}
        {sheetOpen && sheet}
      </main>
    );
  }

  const nowMs = Date.now();
  const announcement = announcementFor(ui, defaultPolicy, nowMs).join('. ');

  return (
    <main>
      <StoreContextLine store={store} onChangeStore={openSheet} />
      <LiveRegion message={announcement} />
      <AnswerCard
        ui={ui}
        policy={defaultPolicy}
        nowMs={nowMs}
        onRetry={() => void runQuery(store, ui.query, dispatch)}
      />
      {searchBar}
      {sheetOpen && sheet}
    </main>
  );
}
