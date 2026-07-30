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
      decodeAttempts: null,
      decodeBusyMs: null,
      assembleMs: null,
      drawMs: null,
      loopIdleMs: null,
      warmupMs: null,
      outcome: null,
      cameraMs: null,
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

// The old marker claimed the count was unmeasurable because the loop lived inside zxing. The app owns
// that loop now, so both paths count attempts and the marker would be a false statement.
test('a measured attempt count is printed', () => {
  expect(buildReport(env, snapshotWith({ decodeAttempts: 14 }), app, 2000)).toContain(
    '시도 횟수: 14',
  );
});

test('an unmeasured attempt count is named, not defaulted to zero', () => {
  const report = buildReport(env, snapshotWith({ decodeAttempts: null }), app, 2000);
  expect(report).toContain(`시도 횟수: ${UNREPORTED}`);
  expect(report).not.toMatch(/시도 횟수: 0/);
});

// The five fallback-only segments. Splitting them is the point of this stage: the loop's own pacing must
// not hide inside a residual that gets read as "focus and framing" (spec §2), the video warm-up must not
// hide inside the pacing, and the bitmap assembly must not hide inside the decoder's own cost.
test('the fallback segments are printed when measured', () => {
  const report = buildReport(
    env,
    snapshotWith({
      decodeBusyMs: 4200,
      assembleMs: 2600,
      drawMs: 380,
      loopIdleMs: 900,
      warmupMs: 240,
    }),
    app,
    2000,
  );
  // The label states the containment, so nobody adds 비트맵 조립 to 디코드 점유 and double-counts it.
  expect(report).toContain('디코드 점유(조립 포함): 4200ms');
  expect(report).toContain('비트맵 조립: 2600ms');
  expect(report).toContain('프레임 복사: 380ms');
  expect(report).toContain('루프 대기: 900ms');
  expect(report).toContain('워밍업 대기: 240ms');
});

test('the fallback segments are named as unreported on the native path', () => {
  const report = buildReport(
    env,
    snapshotWith({
      decodeBusyMs: null,
      assembleMs: null,
      drawMs: null,
      loopIdleMs: null,
      warmupMs: null,
    }),
    app,
    2000,
  );
  expect(report).toContain(`디코드 점유(조립 포함): ${UNREPORTED}`);
  expect(report).toContain(`비트맵 조립: ${UNREPORTED}`);
  expect(report).toContain(`프레임 복사: ${UNREPORTED}`);
  expect(report).toContain(`루프 대기: ${UNREPORTED}`);
  expect(report).toContain(`워밍업 대기: ${UNREPORTED}`);
});

// The zero these fields must never print is the UNMEASURED one; a measured 0 is a real observation (no
// frame lacked dimensions, the assembly cost under a millisecond) and must print as 0.
test('a measured zero segment prints as zero, not as unreported', () => {
  const report = buildReport(env, snapshotWith({ warmupMs: 0, assembleMs: 0 }), app, 2000);
  expect(report).toContain('워밍업 대기: 0ms');
  expect(report).toContain('비트맵 조립: 0ms');
});

// A settled run reports how long the whole run took. This is NOT the 경과 line: that one is derived
// from Date.now() on every render, so it keeps growing after the run ends. The label is asserted with
// the number: `decodeMs` is the run total, not the decode loop, and a line that says otherwise is the
// misreading this field was added to close (§B30-11).
test('a measured run duration is printed under a label that names what is inside it', () => {
  const report = buildReport(env, snapshotWith({ decodeMs: 8200 }), app, 2000);
  expect(report).toContain('스캔 소요: 8200ms');
  expect(report).toContain('디코더 준비·카메라 승인 포함');
  // The old label claimed pure decode time; nothing may reintroduce it.
  expect(report).not.toMatch(/디코드: \d/);
});

test('an unmeasured run duration is named, not defaulted to zero', () => {
  const report = buildReport(env, snapshotWith({ decodeMs: null }), app, 2000);
  expect(report).toContain(`스캔 소요: ${UNREPORTED}`);
  expect(report).not.toMatch(/스캔 소요: 0ms/);
});

// The camera wait is reported on its own line because on iOS Safari it contains the permission prompt —
// i.e. human decision time. Folded into the run total it silently inflates a first-of-session baseline.
test('a measured camera acquisition is printed', () => {
  expect(buildReport(env, snapshotWith({ cameraMs: 640 }), app, 2000)).toContain(
    '카메라 승인: 640ms',
  );
});

test('a camera that was never acquired is named, not defaulted to zero', () => {
  const report = buildReport(env, snapshotWith({ cameraMs: null }), app, 2000);
  expect(report).toContain(`카메라 승인: ${UNREPORTED}`);
  expect(report).not.toMatch(/카메라 승인: 0ms/);
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
