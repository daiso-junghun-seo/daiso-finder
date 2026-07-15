// src/domain/errors.ts — typed query outcomes the freshness orchestrator routes on.
// NoCatalogMatchError = the keyword matched no catalog product → NO_MATCH → Empty. It is NOT a network failure and
//   must never serve stale cache. UnmappableAnswerError = a payload that cannot be safely mapped (unknown sleStsCd
//   combo, absent store row) → safe fallback (Error/Partial via the cache path), NEVER a fabricated Success
//   (design spec §6.3; Engineering §7 read-only, no optimistic availability).
export class NoCatalogMatchError extends Error {
  constructor(public readonly suggestions: string[] = []) {
    super('no catalog match');
    this.name = 'NoCatalogMatchError';
  }
}
export class UnmappableAnswerError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'UnmappableAnswerError';
  }
}
