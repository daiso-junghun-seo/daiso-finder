// src/domain/freshness.test.ts
import { classifyFreshness } from './freshness';

const HOUR = 3_600_000;
test('a live answer is always live and is never demoted, regardless of age', () => {
  expect(
    classifyFreshness({ observedAt: 0, now: 999 * HOUR, isLive: true, thresholdMs: HOUR }),
  ).toBe('live');
});
test('cache within the threshold is withinThreshold', () => {
  expect(
    classifyFreshness({ observedAt: 0, now: HOUR, isLive: false, thresholdMs: 2 * HOUR }),
  ).toBe('cachedWithinThreshold');
});
test('cache older than the threshold is beyondThreshold', () => {
  expect(
    classifyFreshness({ observedAt: 0, now: 3 * HOUR, isLive: false, thresholdMs: 2 * HOUR }),
  ).toBe('cachedBeyondThreshold');
});
