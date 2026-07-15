import { NoCatalogMatchError } from '../domain/errors';
import { classifyFreshness } from '../domain/freshness';
import type { DataOwnerPolicy } from '../domain/policy';
import type { StoreStockRepository } from '../domain/ports';
import type { CacheOutcome, Freshness, StoreContext, StoreEvent } from '../domain/types';
import type { CacheStorage } from './cache-storage';

export function createQueryRunner(deps: {
  repo: StoreStockRepository;
  cache: CacheStorage;
  policy: DataOwnerPolicy;
  now: () => number;
  timeoutMs?: number;
}) {
  const timeoutMs = deps.timeoutMs ?? 2000;
  return {
    async run(store: StoreContext, term: { keyword?: string; pdNo?: string }): Promise<StoreEvent> {
      const key = `${store.strCd}:${term.keyword ?? term.pdNo ?? ''}`;
      const ctrl = new AbortController();
      // The runner enforces its OWN timeout by racing the repo call against a rejecting timer — it does NOT
      // depend on the repository honoring AbortSignal. ctrl.signal is still passed so a well-behaved repo CAN
      // cancel early, but a repo that ignores it (the mock, or a real backend that doesn't abort mid-flight)
      // still times out here → FAILURE, honoring the submit→first-result ≤ 2s budget.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctrl.abort();
          reject(new Error('query timeout'));
        }, timeoutMs);
      });
      try {
        const answer = await Promise.race([deps.repo.query(store, term, ctrl.signal), timeout]);
        clearTimeout(timer);
        const observedAt = deps.now();
        await deps.cache.writeAnswer(key, answer, observedAt);
        const freshness: Freshness = { class: 'live', observedAt }; // live is never demoted
        return { type: 'RESULT', answer, freshness };
      } catch (err) {
        clearTimeout(timer);
        // A no-catalog-match is a successful query with zero results, NOT a network failure: it must not serve
        // stale cache. Route it straight to NO_MATCH → Empty. Everything else (UnmappableAnswerError, network,
        // timeout/abort) falls through to the cache-classify failure path.
        if (err instanceof NoCatalogMatchError) {
          return {
            type: 'NO_MATCH',
            query: term.keyword ?? term.pdNo ?? '',
            suggestions: err.suggestions,
          };
        }
        const cached = await deps.cache.readAnswer(key);
        if (!cached) return { type: 'FAILURE', cache: { kind: 'noCache' } };
        const cls = classifyFreshness({
          observedAt: cached.observedAt,
          now: deps.now(),
          isLive: false,
          thresholdMs: deps.policy.stalenessThresholdMs,
        });
        const freshness: Freshness = { class: cls, observedAt: cached.observedAt };
        const cache: CacheOutcome =
          cls === 'cachedWithinThreshold'
            ? { kind: 'withinThreshold', answer: cached.answer, freshness }
            : { kind: 'beyondThreshold', answer: cached.answer, freshness };
        return { type: 'FAILURE', cache };
      }
    },
  };
}
