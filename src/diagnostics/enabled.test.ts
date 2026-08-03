import { DEBUG_STORAGE_KEY, resolveDebugEnabled, resolveZoomOverride } from './enabled';

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

function throwingStorage(): Storage {
  return {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
    clear: () => {},
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

test('?debug=1 enables and persists', () => {
  const storage = memoryStorage();
  expect(resolveDebugEnabled('?debug=1', storage)).toBe(true);
  expect(storage.getItem(DEBUG_STORAGE_KEY)).toBe('1');
});

test('?debug=0 disables and clears the persisted flag', () => {
  const storage = memoryStorage({ [DEBUG_STORAGE_KEY]: '1' });
  expect(resolveDebugEnabled('?debug=0', storage)).toBe(false);
  expect(storage.getItem(DEBUG_STORAGE_KEY)).toBeNull();
});

test('no parameter falls back to the persisted flag', () => {
  expect(resolveDebugEnabled('', memoryStorage({ [DEBUG_STORAGE_KEY]: '1' }))).toBe(true);
  expect(resolveDebugEnabled('', memoryStorage())).toBe(false);
});

// Proves only that an unrelated value cannot turn the flag ON from empty storage. It deliberately does
// NOT prove the flag cannot stay on: with the flag persisted, only ?debug=0 clears it (see the
// falls-back-to-the-persisted-flag test above) — that is the recorded design, not an oversight.
test('an unrelated parameter value does not enable on its own', () => {
  expect(resolveDebugEnabled('?debug=yes', memoryStorage())).toBe(false);
});

// Safari private mode throws on sessionStorage access. The URL parameter must still decide, and the
// call must not propagate — a diagnostics helper may never be the reason the app fails to boot.
test('storage failures are swallowed and the URL parameter still decides', () => {
  expect(() => resolveDebugEnabled('?debug=1', throwingStorage())).not.toThrow();
  expect(resolveDebugEnabled('?debug=1', throwingStorage())).toBe(true);
  expect(resolveDebugEnabled('', throwingStorage())).toBe(false);
});

test('a null storage is accepted', () => {
  expect(resolveDebugEnabled('?debug=1', null)).toBe(true);
  expect(resolveDebugEnabled('', null)).toBe(false);
});

// The sweep parameter. Gated on diagnostics being ON — which is `isDiagnosticsEnabled()`, not "the URL
// carries debug=1", because that flag persists in sessionStorage and a session enabled that way must
// still honour the override. Requiring the parameter on every load is backwards for a test session
// driven from a phone.
test('a valid zoom override is accepted when diagnostics is on', () => {
  expect(resolveZoomOverride('?zoom=1', true)).toBe(1);
  expect(resolveZoomOverride('?zoom=1.5', true)).toBe(1.5);
  // The production cap itself is allowed: it is the other half of the 1.0-vs-2.0 comparison.
  expect(resolveZoomOverride('?zoom=2', true)).toBe(2);
});

// 2 is written as a literal rather than imported from the adapter: a URL parser must not depend on a
// camera module, and the coupling is stated in the design (§0) instead. Above the cap the value is
// REJECTED, never clamped — a silently clamped 3 would record a 2.0 run under a URL that says 3.
test('an override above the production cap is rejected outright, not clamped', () => {
  expect(resolveZoomOverride('?zoom=3', true)).toBeNull();
  expect(resolveZoomOverride('?zoom=2.0001', true)).toBeNull();
});

test('a non-positive, non-numeric or non-finite override is rejected', () => {
  for (const raw of ['0', '-1', 'abc', '', 'NaN', 'Infinity', '1e400']) {
    expect(resolveZoomOverride(`?zoom=${raw}`, true)).toBeNull();
  }
  // Absent entirely — the ordinary production case.
  expect(resolveZoomOverride('', true)).toBeNull();
});

// The gate, both directions. The second half is the one that would have broken in the field: a tester
// who enabled ?debug=1 on a previous load and then opened ?zoom=1 must still get the override.
test('the override is honoured only while diagnostics is on, whatever turned it on', () => {
  expect(resolveZoomOverride('?zoom=1', false)).toBeNull();
  expect(resolveZoomOverride('?debug=1&zoom=1', false)).toBeNull();
  expect(resolveZoomOverride('?zoom=1', true)).toBe(1);
});
