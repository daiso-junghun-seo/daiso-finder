const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../diagnostics/enabled', () => ({
  isDiagnosticsEnabled: () => flag.enabled,
  resolveZoomOverride: () => null,
}));

import { getSnapshot, resetDiagnostics } from '../diagnostics/bus';
import {
  createDiagnosticFetch,
  createGeolocation,
  createProductSearch,
  createScanner,
  createStoreDirectory,
  createStoreStockRepository,
} from './composition';
import { mockAnswers } from './mock/fixtures';
import { MOCK_SCAN_VALUE } from './mock/scanner';

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

test('DEV/test build wires the mock product search', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
  }) as typeof fetch;
  try {
    await expect(createProductSearch().search('밀폐용기')).resolves.toHaveLength(3);
    expect(called).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PROD build wires the live /api/search adapter', async () => {
  vi.stubEnv('PROD', true);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
  }) as typeof fetch;
  try {
    await createProductSearch().search('밀폐용기');
    expect(calls.some((u) => u.includes('/api/search'))).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
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

test('DEV/test build wires the mock scanner without touching the camera', async () => {
  let cameraAsked = false;
  const nav = navigator as unknown as {
    mediaDevices?: { getUserMedia: () => Promise<MediaStream> };
  };
  const original = nav.mediaDevices;
  nav.mediaDevices = {
    getUserMedia: async () => {
      cameraAsked = true;
      return {} as MediaStream;
    },
  };
  try {
    const outcome = await createScanner().scan(
      { video: {} as HTMLVideoElement },
      new AbortController().signal,
    );
    expect(outcome).toEqual({ kind: 'decoded', value: MOCK_SCAN_VALUE });
    expect(cameraAsked).toBe(false);
  } finally {
    nav.mediaDevices = original;
  }
});

test('PROD build wires the browser scanner (camera requested, no mock value)', async () => {
  vi.stubEnv('PROD', true);
  let cameraAsked = false;
  const nav = navigator as unknown as {
    mediaDevices?: { getUserMedia: () => Promise<MediaStream> };
  };
  const original = nav.mediaDevices;
  nav.mediaDevices = {
    getUserMedia: async () => {
      cameraAsked = true;
      const err = new Error('denied');
      err.name = 'NotAllowedError';
      throw err;
    },
  };
  try {
    const outcome = await createScanner().scan(
      { video: {} as HTMLVideoElement },
      new AbortController().signal,
    );
    expect(cameraAsked).toBe(true);
    expect(outcome).toEqual({ kind: 'permissionDenied' });
  } finally {
    nav.mediaDevices = original;
    vi.unstubAllEnvs();
  }
});

test('the keyword mock repository answers a scanned pdNo', async () => {
  const repo = createStoreStockRepository();
  expect(
    await repo.query(
      { strCd: '1', strNm: 'x' },
      { keyword: MOCK_SCAN_VALUE, pdNo: MOCK_SCAN_VALUE },
    ),
  ).toEqual(mockAnswers.inStock);
});

describe('diagnostic fetch', () => {
  beforeEach(() => {
    flag.enabled = true;
    resetDiagnostics();
  });

  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };

  test('publishes path, status and duration and returns the response untouched', async () => {
    const original = globalThis.fetch;
    const response = new Response('{}', { status: 200 });
    globalThis.fetch = (async () => response) as typeof fetch;
    let t = 1000;
    try {
      const result = await createDiagnosticFetch(() => {
        t += 25;
        return t;
      })('/api/availability', init);
      expect(result).toBe(response); // identity: instrumentation must not wrap or clone
      expect(getSnapshot().network[0]).toEqual({ path: '/api/availability', status: 200, ms: 25 });
    } finally {
      globalThis.fetch = original;
    }
  });

  test('publishes an error entry and re-throws the original error', async () => {
    const original = globalThis.fetch;
    const boom = new Error('offline');
    globalThis.fetch = (async () => {
      throw boom;
    }) as typeof fetch;
    try {
      await expect(createDiagnosticFetch(() => 0)('/api/stores', init)).rejects.toBe(boom);
      expect(getSnapshot().network[0]?.status).toBe('error');
    } finally {
      globalThis.fetch = original;
    }
  });

  // The availability adapter is NOT wrapped in createDiagnosticFetch — it races several reads and
  // publishes its own per-attempt entries instead. This pins that it is still instrumented (a bare fetch
  // would publish nothing) and that it is instrumented ONCE: the wrapper plus the adapter would double-log
  // every attempt.
  test('the PROD availability adapter publishes its own per-attempt entries, exactly once each', async () => {
    vi.stubEnv('PROD', true);
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ noMatch: true }), { status: 200 })) as typeof fetch;
    try {
      await createStoreStockRepository()
        .query({ strCd: '1', strNm: 'x' }, { keyword: 'x' })
        .catch(() => {});
      const entries = getSnapshot().network.filter((e) => e.path === '/api/availability');
      expect(entries.length).toBeGreaterThan(0);
      // Every entry carries an attempt label, and no label repeats — one publish per attempt.
      const labels = entries.map((e) => `${e.attempt?.index}/${e.attempt?.total}`);
      expect(labels).not.toContain('undefined/undefined');
      expect(new Set(labels).size).toBe(labels.length);
    } finally {
      globalThis.fetch = original;
      vi.unstubAllEnvs();
    }
  });
});
