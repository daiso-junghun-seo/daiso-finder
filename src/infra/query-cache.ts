import { NoCatalogMatchError } from '../domain/errors';
import { classifyFreshness } from '../domain/freshness';
import type { DataOwnerPolicy } from '../domain/policy';
import type { StoreStockRepository } from '../domain/ports';
import type {
  AvailabilityAnswer,
  CacheOutcome,
  Freshness,
  StoreContext,
  StoreEvent,
} from '../domain/types';
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
      const repoPromise = deps.repo.query(store, term, ctrl.signal);
      // A losing repoPromise may reject AFTER the timeout already won the race; without a handler that
      // late rejection is an unhandledRejection crash in some hosts. The side .catch marks it handled —
      // the race still sees the original promise.
      repoPromise.catch(() => {});
      try {
        const answer = await Promise.race([repoPromise, timeout]);
        clearTimeout(timer);
        const observedAt = deps.now();
        // Caching is best-effort bookkeeping: a write failure (quota, blocked/corrupt IndexedDB) must
        // NEVER demote a live answer that already arrived to the FAILURE path. Swallow it here so the
        // outer catch only ever sees genuine query failures (F1).
        try {
          await deps.cache.writeAnswer(key, answer, observedAt);
        } catch {
          /* best-effort cache write — the live answer stands */
        }
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
        // A cache read can itself fail (blocked/corrupt IndexedDB). Treat a read failure exactly like an
        // absent cache — degrade to noCache rather than throwing out of the runner (F1).
        let cached: { answer: AvailabilityAnswer; observedAt: number } | null;
        try {
          cached = await deps.cache.readAnswer(key);
        } catch {
          cached = null;
        }
        if (!cached) return { type: 'FAILURE', cache: { kind: 'noCache' } };
        const cls = classifyFreshness({
          observedAt: cached.observedAt,
          now: deps.now(),
          isLive: false,
          thresholdMs: deps.policy.stalenessThresholdMs,
        });
        // Beyond the staleness threshold, the reducer frames the cached answer as Partial(staleCache),
        // whose copy asserts "…에는 있었어요" — a POSITIVE past observation. That is only truthful for a
        // cached inStock answer; replaying it over a cached NEGATIVE observation (품절/단종/미취급) would
        // fabricate a past availability the shopper never had. Until the Bible rules the stale-negative
        // copy (§A10 interim), a stale negative degrades to noCache rather than inventing a positive past.
        if (cls === 'cachedBeyondThreshold' && cached.answer.kind !== 'inStock') {
          return { type: 'FAILURE', cache: { kind: 'noCache' } };
        }
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
