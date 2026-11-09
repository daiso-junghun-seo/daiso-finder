// src/ui/availability/scenario.ts
// Dev-only ?scenario= harness that drives the Playwright state sweep against the MOCK pipeline.
// Never imported into a production decision path — the caller gates on import.meta.env.DEV.
import { type Scenario, mockAnswers } from '../../adapters/mock/fixtures';
import { createMockRepository } from '../../adapters/mock/mockRepository';
import { defaultPolicy } from '../../domain/policy';
import type { StoreEvent } from '../../domain/types';
import { createIndexedDbCache } from '../../infra/cache-storage';
import { createQueryRunner } from '../../infra/query-cache';
import { loadStoreContext } from '../../infra/store-context';

// Placeholder store for the Inc-0 sweep only — the sheet exists (D082); this is now only the E2E
// sweep's default store when no store context has been saved yet.
const PLACEHOLDER_STORE = { strCd: '0', strNm: '명동역점' };

export async function runScenario(
  scenario: string,
  dispatch: (event: StoreEvent) => void,
): Promise<void> {
  const store = loadStoreContext() ?? PLACEHOLDER_STORE;
  const cache = createIndexedDbCache();
  const now = () => Date.now();

  dispatch({ type: 'SUBMIT', query: scenario });

  // Freeze Loading for the a11y sweep: the answer never lands, so the skeleton stays on screen.
  if (scenario === 'loading') return;

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
