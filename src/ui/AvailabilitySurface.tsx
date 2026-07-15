// src/ui/AvailabilitySurface.tsx
import { useEffect } from 'react';
import { type Scenario, mockAnswers } from '../adapters/mock/fixtures';
import { createMockRepository } from '../adapters/mock/mockRepository';
import { defaultPolicy } from '../domain/policy';
import type { StoreEvent } from '../domain/types';
import { createIndexedDbCache } from '../infra/cache-storage';
import { createQueryRunner } from '../infra/query-cache';
import { loadStoreContext } from '../infra/store-context';
import { LiveRegion } from './a11y/LiveRegion';
import { GlassSurface } from './components/GlassSurface';
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

  useEffect(() => {
    const scenario = new URLSearchParams(window.location.search).get('scenario');
    if (!scenario) return;
    void runScenario(scenario, dispatch);
  }, [dispatch]);

  if (ui.state === 'default') {
    return (
      <main>
        <h1>이 매장에 있는지 바로 확인해 보세요</h1>
      </main>
    );
  }

  return (
    <main>
      <GlassSurface>
        <LiveRegion message={ui.state} />
        <p>{ui.state}</p>
      </GlassSurface>
    </main>
  );
}
