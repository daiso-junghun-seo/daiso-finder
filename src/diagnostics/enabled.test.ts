import { DEBUG_STORAGE_KEY, resolveDebugEnabled } from './enabled';

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

test('an unrelated parameter value does not enable', () => {
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
