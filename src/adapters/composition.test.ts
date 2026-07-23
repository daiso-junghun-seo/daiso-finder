import { createGeolocation, createStoreDirectory, createStoreStockRepository } from './composition';
import { mockAnswers } from './mock/fixtures';

test('DEV/test build wires the keyword mock repository', async () => {
  const repo = createStoreStockRepository();
  expect(await repo.query({ strCd: '1', strNm: 'x' }, { keyword: '밀폐용기' })).toEqual(
    mockAnswers.inStock,
  );
});

test('DEV/test build wires the mock store directory', async () => {
  const dir = createStoreDirectory();
  await expect(dir.searchStores('명동')).resolves.toEqual([
    { strCd: '001', strNm: '명동역점' },
    { strCd: '002', strNm: '명동중앙점' },
  ]);
});

test('PROD build wires the live /api/availability adapter', async () => {
  vi.stubEnv('PROD', true);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ noMatch: true }), { status: 200 });
  }) as typeof fetch;
  try {
    await createStoreStockRepository()
      .query({ strCd: '1', strNm: 'x' }, { keyword: 'x' })
      .catch(() => {});
    expect(calls.some((u) => u.includes('/api/availability'))).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  }
});

// jsdom (this test env) exposes no navigator.geolocation by default; stub it so getNearbyStores
// actually reaches the fetchNearby seam instead of short-circuiting on the no-geolocation guard.
function stubGeolocation(): { restore: () => void } {
  const fakeGeo = {
    getCurrentPosition: (success: PositionCallback) => {
      success({ coords: { latitude: 37.5, longitude: 127.0 } } as GeolocationPosition);
    },
  } as Geolocation;
  const nav = navigator as unknown as { geolocation?: Geolocation };
  nav.geolocation = fakeGeo;
  return {
    restore: () => {
      nav.geolocation = undefined;
    },
  };
}

test('DEV/test build wires geolocation to the mock store list without hitting the network', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response(JSON.stringify({ stores: [] }), { status: 200 });
  }) as typeof fetch;
  const geo = stubGeolocation();
  try {
    await expect(createGeolocation().getNearbyStores()).resolves.toEqual([
      { strCd: '001', strNm: '명동역점', distanceM: 120 },
      { strCd: '002', strNm: '명동중앙점', distanceM: 340 },
      { strCd: '003', strNm: '을지로점', distanceM: 600 },
    ]);
    expect(called).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
    geo.restore();
  }
});

test('PROD build wires the live /api/stores nearby-fetch behind geolocation', async () => {
  vi.stubEnv('PROD', true);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ stores: [] }), { status: 200 });
  }) as typeof fetch;
  const geo = stubGeolocation();
  try {
    await createGeolocation().getNearbyStores();
    expect(calls.some((u) => u.includes('/api/stores'))).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    geo.restore();
  }
});
