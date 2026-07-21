// src/domain/freshness.ts
import type { FreshnessClass } from './types';

export function classifyFreshness(params: {
  observedAt: number;
  now: number;
  isLive: boolean;
  thresholdMs: number;
}): FreshnessClass {
  if (params.isLive) return 'live'; // live is never demoted (D061)
  const age = params.now - params.observedAt;
  return age <= params.thresholdMs ? 'cachedWithinThreshold' : 'cachedBeyondThreshold';
}
