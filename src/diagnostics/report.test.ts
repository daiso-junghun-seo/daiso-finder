const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('./enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import type { DiagnosticsSnapshot } from './bus';
import { getSnapshot, publishNetwork, resetDiagnostics } from './bus';
import {
  type AppFacts,
  type EnvironmentFacts,
  NOT_STARTED,
  QUERY_FAILED,
  SUPPORTS_NONE,
  UNMEASURED,
  UNREPORTED,
  buildReport,
  collectEnvironment,
  summaryLine,
} from './report';

const env: EnvironmentFacts = {
  buildMode: 'PROD',
  adapters: 'live',
  protocol: 'http:',
  host: '192.168.0.10:8790',
  secureContext: false,
  hasMediaDevices: false,
  userAgent: 'TestAgent/1.0',
};

const app: AppFacts = {
  state: 'success',
  query: '밀폐용기',
  origin: 'scan',
  storeId: '001',
  storeName: '명동역점',
  candidateCount: null,
  freshnessAgeMs: 4200,
};

beforeEach(() => {
  flag.enabled = true;
  resetDiagnostics();
});

function snapshotWith(scanner: Partial<DiagnosticsSnapshot['scanner']>): DiagnosticsSnapshot {
  return {
    scanner: {
      startedAt: 1000,
      hasBarcodeDetector: false,
      supportedFormats: null,
      decoderPath: 'zxing',
      decoderReadyMs: 412,
      cameraError: null,
      track: { width: 640, height: 480, frameRate: 30, facingMode: null, deviceId: 'cam-1' },
      nativePolls: null,
      outcome: null,
      decodeMs: null,
      ...scanner,
    },
    network: [{ path: '/api/availability', status: 200, ms: 318 }],
  };
}

test('summaryLine reports the decoder, resolution, elapsed time and status', () => {
  expect(summaryLine(snapshotWith({}).scanner, 12_400)).toBe('zxing · 640×480 · 11.4s · 진행 중');
});

test('summaryLine says so before any scan has started', () => {
  expect(summaryLine(snapshotWith({ startedAt: null }).scanner, 5000)).toBe(NOT_STARTED);
});

test('summaryLine shows the final outcome once the run ends', () => {
  expect(summaryLine(snapshotWith({ outcome: 'decoded' }).scanner, 2000)).toContain('decoded');
});

// The zxing reader retries inside decodeOnceFromStream, so we genuinely cannot count its attempts.
// Printing a number here would invent evidence that a §B9 field decision then rests on.
test('an unmeasurable poll count is named as unmeasurable, not zero', () => {
  const report = buildReport(env, snapshotWith({ nativePolls: null }), app, 2000);
  expect(report).toContain(UNMEASURED);
  expect(report).not.toMatch(/시도 횟수: 0/);
});

test('a measured poll count is printed', () => {
  expect(buildReport(env, snapshotWith({ nativePolls: 14 }), app, 2000)).toContain('14');
});

// A settled run reports how long the decode actually took. This is NOT the 경과 line: that one is
// derived from Date.now() on every render, so it keeps growing after the run ends.
test('a measured decode duration is printed', () => {
  expect(buildReport(env, snapshotWith({ decodeMs: 8200 }), app, 2000)).toContain('8200ms');
});

test('an unmeasured decode is named, not defaulted to zero', () => {
  const report = buildReport(env, snapshotWith({ decodeMs: null }), app, 2000);
  expect(report).toContain(`디코드: ${UNREPORTED}`);
  expect(report).not.toMatch(/디코드: 0ms/);
});

// "the query failed" and "the platform supports nothing" are different facts about the device.
test('a failed format query and an empty format list render differently', () => {
  const failed = buildReport(env, snapshotWith({ supportedFormats: null }), app, 2000);
  const empty = buildReport(env, snapshotWith({ supportedFormats: [] }), app, 2000);
  expect(failed).toContain(QUERY_FAILED);
  expect(empty).toContain(SUPPORTS_NONE);
  expect(failed).not.toBe(empty);
});

test('the format list and its data_matrix membership are both reported', () => {
  const report = buildReport(
    env,
    snapshotWith({ supportedFormats: ['qr_code', 'data_matrix'] }),
    app,
    2000,
  );
  expect(report).toContain('qr_code, data_matrix');
  expect(report).toContain('data_matrix: 포함');
});

test('track keys the browser did not report are named as unreported', () => {
  const report = buildReport(env, snapshotWith({}), app, 2000);
  expect(report).toContain(`facingMode: ${UNREPORTED}`);
});

test('the report carries environment, app state and network lines', () => {
  const report = buildReport(env, snapshotWith({}), app, 2000);
  expect(report).toContain('PROD');
  expect(report).toContain('192.168.0.10:8790');
  expect(report).toContain('명동역점');
  expect(report).toContain('/api/availability');
  expect(report).toContain('200');
});

// The report is copied and pasted into notes; a leaked query string would carry sensitive data.
// The bus strips query strings at the single choke point (publishNetwork), so the report built
// from its snapshot must never carry a query string or any secrets from it.
test('query strings published to the bus are stripped before reaching the report', () => {
  publishNetwork({ path: '/api/search?token=xyz-secret-789', status: 200, ms: 10 });
  const snapshot = getSnapshot();
  const report = buildReport(env, { ...snapshotWith({}), network: snapshot.network }, app, 2000);
  expect(report).toContain('/api/search');
  expect(report).not.toContain('?');
  expect(report).not.toContain('xyz-secret-789');
});

test('collectEnvironment reads the live globals without throwing', () => {
  const facts = collectEnvironment();
  expect(facts.buildMode).toBe('DEV'); // Vitest runs the DEV env
  expect(facts.adapters).toBe('mock');
  expect(typeof facts.userAgent).toBe('string');
});
