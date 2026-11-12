// src/adapters/mock/alternativeRepository.ts
// DEV/E2E double for Flow 3. Failures reject like a dead network (the pipeline owns the 2s timeout);
// delays honor AbortSignal so a pull/retry that supersedes a query can actually cancel it.
import type { AlternativeRepository } from '../../domain/ports';
import type { NearbyAlternative, SimilarAlternative } from '../../domain/types';
import { type AltScenario, mockNearbyRows, mockSimilarRows } from './alternativeFixtures';

export const ALT_SCENARIO_LATENCY_MS = 1500;

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createMockAlternativeRepository(
  scenario: AltScenario = 'default',
): AlternativeRepository {
  const fail = () => new Error('mock alternatives failure');
  return {
    async querySimilar(_store, _term, signal): Promise<SimilarAlternative[]> {
      if (scenario === 'aFailed' || scenario === 'bothFailed') {
        await delay(ALT_SCENARIO_LATENCY_MS, signal);
        throw fail();
      }
      if (scenario === 'aEmpty' || scenario === 'bothEmpty') return [];
      if (scenario === 'slow') await delay(ALT_SCENARIO_LATENCY_MS, signal);
      return mockSimilarRows;
    },
    async queryNearby(_store, _pdNo, signal): Promise<NearbyAlternative[]> {
      if (scenario === 'bothFailed') throw fail();
      if (scenario === 'bothEmpty') return [];
      if (scenario === 'bSlow') await delay(ALT_SCENARIO_LATENCY_MS, signal);
      return mockNearbyRows;
    },
  };
}
