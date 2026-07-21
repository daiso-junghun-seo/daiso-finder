// src/domain/policy.test.ts
import { defaultPolicy, nullAliasResolver } from './policy';

test('placeholder policy carries data-owner-unresolved values, clearly marked provisional', () => {
  expect(defaultPolicy.stalenessThresholdMs).toBeGreaterThan(0); // A2 — provisional
  expect(defaultPolicy.lowQtyCutoff).toBeGreaterThan(0); // A3 — provisional
  expect(defaultPolicy.discontinuedScope).toBe('store'); // A7 — switchable
  expect(defaultPolicy.provisional).toBe(true); // never treated as a ratified value
});
test('alias resolver is a null impl until data owners supply aliases (A4)', () => {
  expect(nullAliasResolver.resolve('lock and lock')).toBeNull();
});
