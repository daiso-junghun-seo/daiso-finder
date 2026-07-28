// The flag is frozen at module init in production, so the tests swap it through vi.mock — the same
// idiom AvailabilitySurface.test.tsx uses for the composition root.
const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('./enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import {
  NETWORK_LIMIT,
  beginScannerRun,
  getSnapshot,
  publishNetwork,
  publishScanner,
  resetDiagnostics,
  subscribe,
} from './bus';

beforeEach(() => {
  flag.enabled = true;
  resetDiagnostics();
});

test('a fresh bus reports nothing observed', () => {
  const snapshot = getSnapshot();
  expect(snapshot.scanner.startedAt).toBeNull();
  expect(snapshot.scanner.decoderPath).toBeNull();
  expect(snapshot.network).toEqual([]);
});

test('a fresh bus has not measured a decode', () => {
  expect(getSnapshot().scanner.decodeMs).toBeNull();
});

test('a fresh bus has not measured a camera acquisition', () => {
  expect(getSnapshot().scanner.cameraMs).toBeNull();
});

test('publishScanner merges a patch without clearing earlier fields', () => {
  publishScanner({ decoderPath: 'zxing' });
  publishScanner({ decoderReadyMs: 412 });
  expect(getSnapshot().scanner).toMatchObject({ decoderPath: 'zxing', decoderReadyMs: 412 });
});

// useSyncExternalStore compares the snapshot by reference. A getSnapshot() that builds a new object
// every call re-renders forever, so identity stability is a contract, not an optimisation.
test('getSnapshot returns the same reference until something is published', () => {
  const first = getSnapshot();
  expect(getSnapshot()).toBe(first);
  publishScanner({ decoderPath: 'native' });
  expect(getSnapshot()).not.toBe(first);
});

test('beginScannerRun clears the previous run and stamps the start', () => {
  publishScanner({ decoderPath: 'zxing', outcome: 'failed', nativePolls: 7 });
  beginScannerRun(1000);
  expect(getSnapshot().scanner).toMatchObject({
    startedAt: 1000,
    decoderPath: null,
    outcome: null,
    nativePolls: null,
  });
});

test('the network log keeps only the most recent NETWORK_LIMIT entries, newest last', () => {
  for (let i = 0; i < NETWORK_LIMIT + 3; i += 1) {
    publishNetwork({ path: `/api/${i}`, status: 200, ms: i });
  }
  const { network } = getSnapshot();
  expect(network).toHaveLength(NETWORK_LIMIT);
  expect(network[network.length - 1]?.path).toBe(`/api/${NETWORK_LIMIT + 2}`);
});

// Defence in depth at the single choke point: even if a caller hands over a full URL, a query string
// can carry a search term or identifier and must never reach a copyable report.
test('publishNetwork stores the pathname only, stripping any query string', () => {
  publishNetwork({ path: '/api/search?keyword=secret&uid=abc', status: 200, ms: 5 });
  expect(getSnapshot().network[0]?.path).toBe('/api/search');
});

test('subscribers are notified on publish and stop after unsubscribing', () => {
  let calls = 0;
  const unsubscribe = subscribe(() => {
    calls += 1;
  });
  publishScanner({ decoderPath: 'native' });
  expect(calls).toBe(1);
  unsubscribe();
  publishScanner({ decoderPath: 'zxing' });
  expect(calls).toBe(1);
});

test('every publish is a no-op while disabled', () => {
  flag.enabled = false;
  const before = getSnapshot();
  beginScannerRun(1);
  publishScanner({ decoderPath: 'native' });
  publishNetwork({ path: '/api/x', status: 200, ms: 1 });
  expect(getSnapshot()).toBe(before);
});

// A failing React component or diagnostics UI callback must never break the bus or prevent
// other subscribers from being notified. Subscriber errors are swallowed so the app can survive
// a misbehaving panel component, and the publish must complete normally.
test('a throwing subscriber does not prevent other subscribers from being notified', () => {
  let secondCalls = 0;
  const unsubscribe1 = subscribe(() => {
    throw new Error('subscriber 1 fails');
  });
  const unsubscribe2 = subscribe(() => {
    secondCalls += 1;
  });

  // This must not throw, even though the first subscriber throws.
  expect(() => {
    publishScanner({ decoderPath: 'native' });
  }).not.toThrow();

  // The second subscriber must still have been notified.
  expect(secondCalls).toBe(1);

  // The snapshot must reflect the published change.
  expect(getSnapshot().scanner.decoderPath).toBe('native');

  unsubscribe1();
  unsubscribe2();
});
