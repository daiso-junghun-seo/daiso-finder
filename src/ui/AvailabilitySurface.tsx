// src/ui/AvailabilitySurface.tsx
import { useEffect } from 'react';
import { type Scenario, mockAnswers } from '../adapters/mock/fixtures';
import { createMockRepository } from '../adapters/mock/mockRepository';
import { defaultPolicy } from '../domain/policy';
import type { StoreEvent } from '../domain/types';
import { createIndexedDbCache } from '../infra/cache-storage';
import { createQueryRunner } from '../infra/query-cache';
import { loadStoreContext } from '../infra/store-context';
import { AnswerCard } from './AnswerCard';
import { LiveRegion } from './a11y/LiveRegion';
import { StoreContextLine } from './components/StoreContextLine';
import { DEFAULT_HEADLINE, SCAN_BUTTON_LABEL, SEARCH_PLACEHOLDER, announcementFor } from './copy';
import { useAvailabilityStore } from './store';

// Placeholder store for the Inc-0 sweep only — Increment 1 wires the real store-selection sheet (D082).
const PLACEHOLDER_STORE = { strCd: '0', strNm: '명동역점' };

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

export function AvailabilitySurface() {
  const ui = useAvailabilityStore((s) => s.ui);
  const dispatch = useAvailabilityStore((s) => s.dispatch);
  const store = loadStoreContext() ?? PLACEHOLDER_STORE;

  useEffect(() => {
    const scenario = new URLSearchParams(window.location.search).get('scenario');
    if (!scenario) return;
    void runScenario(scenario, dispatch);
  }, [dispatch]);

  const searchBar = (
    <div
      className={ui.state === 'default' ? 'search-bar' : 'search-bar search-bar--demoted'}
      id="search-bar"
    >
      <input aria-label="상품 검색" placeholder={SEARCH_PLACEHOLDER} readOnly />
      <button type="button" aria-label={SCAN_BUTTON_LABEL} className="text-label">
        {SCAN_BUTTON_LABEL}
      </button>
    </div>
  );

  if (ui.state === 'default') {
    return (
      <main>
        <StoreContextLine store={store} />
        <h1>{DEFAULT_HEADLINE}</h1>
        {searchBar}
      </main>
    );
  }

  const nowMs = Date.now();
  const announcement = announcementFor(ui, defaultPolicy, nowMs).join('. ');

  return (
    <main>
      <StoreContextLine store={store} />
      <LiveRegion message={announcement} />
      <AnswerCard ui={ui} policy={defaultPolicy} nowMs={nowMs} />
      {searchBar}
    </main>
  );
}
