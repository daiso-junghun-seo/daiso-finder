const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('./enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import type { DiagnosticsSnapshot, TrackFacts } from './bus';
import { getSnapshot, publishNetwork, resetDiagnostics } from './bus';
import {
  type AppFacts,
  CANCELLED,
  type EnvironmentFacts,
  NOT_STARTED,
  QUERY_FAILED,
  SUPPORTS_NONE,
  TIMED_OUT,
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
      track: {
        width: 640,
        height: 480,
        frameRate: 30,
        facingMode: null,
        deviceId: 'cam-1',
        supportedImageCaptureConstraints: null,
        imageCaptureCapabilities: null,
      },
      decodeAttempts: null,
      decodeBusyMs: null,
      assembleMs: null,
      drawMs: null,
      loopIdleMs: null,
      warmupMs: null,
      outcome: null,
      cameraMs: null,
      appliedZoom: null,
      zoomRequested: null,
      zoomMs: null,
      symbolSidePx: null,
      decodeMs: null,
      ...scanner,
    },
    network: [{ path: '/api/availability', status: 200, ms: 318 }],
  };
}

function trackWith(overrides: Partial<TrackFacts>): TrackFacts {
  return {
    width: 640,
    height: 480,
    frameRate: 30,
    facingMode: null,
    deviceId: 'cam-1',
    supportedImageCaptureConstraints: null,
    imageCaptureCapabilities: null,
    ...overrides,
  };
}

// Thin wrapper over snapshotWith/buildReport for tests that only care about the rendered string — reused
// rather than sitting beside a second snapshot-building helper.
function renderFor(scanner: Partial<DiagnosticsSnapshot['scanner']>): string {
  return buildReport(env, snapshotWith(scanner), app, 2000);
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

// The zoom lever (§B30-17). Two lines rather than one: the factor the platform CONFIRMED and the cost of
// asking for it are different facts, and the cost needs its own line because WebKit routes a zoom change
// through the same capture-session reconfiguration path as a resolution change.
test('the applied zoom and the cost of applying it are printed when measured', () => {
  const report = buildReport(env, snapshotWith({ appliedZoom: 2, zoomMs: 41 }), app, 2000);
  expect(report).toContain('줌 적용: 2');
  expect(report).toContain('줌 소요: 41ms');
});

// 1 is a real, measured answer — the camera was asked for 2 and confirmed 1 — and it is the single most
// interesting answer this line can give, so it must render as a number and not as 미보고.
//
// The 0 case is what gives this test teeth, and it is the same rule as 워밍업 대기: 0ms above: readAppliedZoom
// passes through ANY finite number the platform names, 0 included, and a measured 0 is an observation about
// the camera rather than an absence of one. A `s.appliedZoom ? … : UNREPORTED` truthiness check renders 1
// perfectly well and only breaks here — which is exactly why the assertion on 1 alone was not enough.
test('an applied zoom is printed as a measurement, including a measured zero', () => {
  const one = buildReport(env, snapshotWith({ appliedZoom: 1, zoomMs: 3 }), app, 2000);
  expect(one).toContain('줌 적용: 1');
  expect(one).not.toContain(`줌 적용: ${UNREPORTED}`);
  const zero = buildReport(env, snapshotWith({ appliedZoom: 0, zoomMs: 3 }), app, 2000);
  expect(zero).toContain('줌 적용: 0');
  expect(zero).not.toContain(`줌 적용: ${UNREPORTED}`);
});

// The two fabrications this line must never commit: printing the number we ASKED for as though the camera
// confirmed it, and printing 0ms for a session reconfiguration that never happened.
test('an unapplied zoom is named, not defaulted to zero or to a requested value', () => {
  const report = buildReport(env, snapshotWith({ appliedZoom: null, zoomMs: null }), app, 2000);
  expect(report).toContain(`줌 적용: ${UNREPORTED}`);
  expect(report).toContain(`줌 소요: ${UNREPORTED}`);
  expect(report).not.toMatch(/줌 소요: 0ms/);
  expect(report).not.toMatch(/줌 적용: \d/);
});

// The instrument that verifies the zoom did what a sensor crop is supposed to do. Printed in PIXELS, never
// as pixels-per-module: the zxing Result carries no module count, so a PPM line here would be an assumed
// 16x16 dressed up as a measurement (§B30-17).
test('the decoded symbol size is printed in pixels when measured', () => {
  expect(buildReport(env, snapshotWith({ symbolSidePx: 168 }), app, 2000)).toContain(
    '심볼 크기: 168px',
  );
});

test('an unmeasured symbol size is named, not defaulted to zero', () => {
  const report = buildReport(env, snapshotWith({ symbolSidePx: null }), app, 2000);
  expect(report).toContain(`심볼 크기: ${UNREPORTED}`);
  expect(report).not.toMatch(/심볼 크기: 0px/);
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

// The camera-capability probe (2026-07-30): before any focus-control code is written, the panel has to
// say whether the platform even NAMES the constraint at all. An absent getSupportedConstraints and a
// query that measured zero of the five interesting keys are different facts about the device and must
// render as different strings — collapsing them would silently turn "we don't know" into "measured none".
test('the constraint-support line distinguishes an absent API from a platform that names nothing', () => {
  const unknown = buildReport(
    env,
    snapshotWith({ track: trackWith({ supportedImageCaptureConstraints: null }) }),
    app,
    2000,
  );
  const none = buildReport(
    env,
    snapshotWith({ track: trackWith({ supportedImageCaptureConstraints: [] }) }),
    app,
    2000,
  );
  expect(unknown).toContain(`지원 제약: ${QUERY_FAILED}`);
  expect(none).toContain(`지원 제약: ${SUPPORTS_NONE}`);
  expect(unknown).not.toBe(none);
});

test('the constraint-support line names the keys the platform reported', () => {
  const report = buildReport(
    env,
    snapshotWith({ track: trackWith({ supportedImageCaptureConstraints: ['focusMode', 'zoom'] }) }),
    app,
    2000,
  );
  expect(report).toContain('지원 제약: focusMode, zoom');
});

// Same null/{} discipline, one level down: getCapabilities can be absent on a track even when the
// platform-level getSupportedConstraints named the key, and that must read as "we don't know" too, not
// as "this camera measurably supports none of them".
test('the capability-values line distinguishes an absent getCapabilities from a track that named nothing', () => {
  const unknown = buildReport(
    env,
    snapshotWith({ track: trackWith({ imageCaptureCapabilities: null }) }),
    app,
    2000,
  );
  const none = buildReport(
    env,
    snapshotWith({ track: trackWith({ imageCaptureCapabilities: {} }) }),
    app,
    2000,
  );
  expect(unknown).toContain(`카메라 기능: ${QUERY_FAILED}`);
  expect(none).toContain(`카메라 기능: ${SUPPORTS_NONE}`);
  expect(unknown).not.toBe(none);
});

// torch is the one boolean-valued key in the set, so it is the one place a real `false` and an absent key
// could be confused. A platform that names torch and reports it unsupported must still print `false`
// literally — omitting it would misreport the fact as unmeasured rather than measured-and-negative.
test('the capability-values line reports real values, including an explicit false as a measured fact', () => {
  const report = buildReport(
    env,
    snapshotWith({
      track: trackWith({
        imageCaptureCapabilities: {
          focusMode: ['continuous', 'manual'],
          zoom: { min: 1, max: 8, step: 0.1 },
          torch: false,
        },
      }),
    }),
    app,
    2000,
  );
  expect(report).toContain(
    '카메라 기능: focusMode=continuous/manual · zoom=1~8 step=0.1 · torch=false',
  );
});

// The step is what decides whether an INTERMEDIATE factor is even requestable — the next real-device run is
// a zoom sweep that asks for values between min and max — so a step the platform named has to reach the
// line instead of being collected and dropped. A step reported as 0 is a measured value like any other (the
// same rule as 워밍업 대기: 0ms), so a truthiness check here would drop the one value that says "this
// camera quantises to nothing".
test('a reported range step reaches the capability line, including a measured zero', () => {
  const report = buildReport(
    env,
    snapshotWith({
      track: trackWith({
        imageCaptureCapabilities: {
          focusDistance: { min: 0.02, max: null, step: 0.01 },
          zoom: { min: 0.5, max: 10, step: 0.1 },
        },
      }),
    }),
    app,
    2000,
  );
  expect(report).toContain(
    `카메라 기능: focusDistance=0.02~${UNREPORTED} step=0.01 · zoom=0.5~10 step=0.1`,
  );
  const quantisedToNothing = buildReport(
    env,
    snapshotWith({
      track: trackWith({ imageCaptureCapabilities: { zoom: { min: 1, max: 2, step: 0 } } }),
    }),
    app,
    2000,
  );
  expect(quantisedToNothing).toContain('카메라 기능: zoom=1~2 step=0');
});

// The other half of the rule, and the case a real iPhone actually produced (2026-07-30): a platform that
// never mentions step must render EXACTLY the line it rendered before step was printed at all. Nothing new
// is known there, so a `step=미보고` would be noise about a bound nobody asked about rather than a missing
// measurement — unlike min/max, which are always claimed and so must name their absence.
test('a range the platform reported without a step renders unchanged, with no unreported-step noise', () => {
  const report = buildReport(
    env,
    snapshotWith({
      track: trackWith({
        imageCaptureCapabilities: {
          focusDistance: { min: 0.02, max: null, step: null },
          zoom: { min: 0.5, max: 10, step: null },
          torch: true,
        },
      }),
    }),
    app,
    2000,
  );
  expect(report).toContain(
    `카메라 기능: focusDistance=0.02~${UNREPORTED} · zoom=0.5~10 · torch=true`,
  );
  expect(report).not.toContain('step=');
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

// ---------------------------------------------------------------------------------------------------
// Network lines: every outcome kind must render distinguishably (§B30-18)
// ---------------------------------------------------------------------------------------------------

function networkReport(network: DiagnosticsSnapshot['network']): string[] {
  const report = buildReport(env, { ...snapshotWith({}), network }, app, 2000);
  const start = report.indexOf('[네트워크]');
  return report
    .slice(start)
    .split('\n')
    .slice(1)
    .filter((line) => line !== '');
}

test('a successful raced attempt renders its index, status and duration', () => {
  expect(
    networkReport([
      {
        path: '/api/availability',
        status: 200,
        ms: 977,
        attempt: { index: 2, total: 3 },
        outcome: 'ok',
      },
    ]),
  ).toEqual(['  /api/availability #2/3 · 200 · 977ms']);
});

test('a non-ok status renders the code AND a failure marker, with its error body', () => {
  expect(
    networkReport([
      {
        path: '/api/availability',
        status: 502,
        ms: 214,
        attempt: { index: 1, total: 3 },
        outcome: 'httpError',
        errorBody: '{"error":"upstream_unavailable"}',
      },
    ]),
  ).toEqual([
    '  /api/availability #1/3 · 502 질의 실패 · 214ms · {"error":"upstream_unavailable"}',
  ]);
});

// A timeout is not a 질의 실패 and carries no status code — it is a deadline WE chose.
test('a timeout renders as 시간 초과 and never as a status code', () => {
  const lines = networkReport([
    {
      path: '/api/availability',
      status: 'error',
      ms: 1801,
      attempt: { index: 3, total: 3 },
      outcome: 'timeout',
    },
  ]);
  expect(lines).toEqual([`  /api/availability #3/3 · ${TIMED_OUT} · 1801ms`]);
  expect(lines[0]).not.toContain(QUERY_FAILED);
  expect(lines[0]).not.toContain('error');
});

// The single most important rendering guarantee: a cancelled duplicate must not look like a failure.
test('a cancelled race loser renders as 취소 and carries no failure marker', () => {
  const lines = networkReport([
    {
      path: '/api/availability',
      status: 'error',
      ms: 981,
      attempt: { index: 1, total: 3 },
      outcome: 'aborted',
    },
  ]);
  expect(lines).toEqual([`  /api/availability #1/3 · ${CANCELLED} · 981ms`]);
  expect(lines[0]).not.toContain(QUERY_FAILED);
  expect(lines[0]).not.toContain(TIMED_OUT);
  expect(lines[0]).not.toContain('error');
});

test('a transport failure renders a failure marker without inventing a status code', () => {
  const lines = networkReport([
    {
      path: '/api/availability',
      status: 'error',
      ms: 43,
      attempt: { index: 2, total: 3 },
      outcome: 'networkError',
    },
  ]);
  expect(lines).toEqual([`  /api/availability #2/3 · error ${QUERY_FAILED} · 43ms`]);
  expect(lines[0]).not.toContain(TIMED_OUT);
  expect(lines[0]).not.toContain(CANCELLED);
});

// An unclassified entry (createDiagnosticFetch, which cannot tell a timeout from an abort) must render the
// bare status exactly as before — the panel may never state an outcome nobody observed.
test('an unraced, unclassified entry renders the bare status with no attempt label', () => {
  expect(networkReport([{ path: '/api/stores', status: 200, ms: 318 }])).toEqual([
    '  /api/stores · 200 · 318ms',
  ]);
});

test('an unclassified transport failure still renders only what was observed', () => {
  const lines = networkReport([{ path: '/api/stores', status: 'error', ms: 2002 }]);
  expect(lines).toEqual(['  /api/stores · error · 2002ms']);
  expect(lines[0]).not.toContain(TIMED_OUT);
  expect(lines[0]).not.toContain(CANCELLED);
  expect(lines[0]).not.toContain(QUERY_FAILED);
});

// Three entries for one lookup have to read AS one lookup: the owner has already misread a
// session-accumulated list as a single lookup's requests.
test("one lookup's three attempts render as three labelled, distinguishable lines", () => {
  expect(
    networkReport([
      {
        path: '/api/availability',
        status: 'error',
        ms: 1190,
        attempt: { index: 1, total: 3 },
        outcome: 'aborted',
      },
      {
        path: '/api/availability',
        status: 200,
        ms: 442,
        attempt: { index: 2, total: 3 },
        outcome: 'ok',
      },
      {
        path: '/api/availability',
        status: 'error',
        ms: 1190,
        attempt: { index: 3, total: 3 },
        outcome: 'aborted',
      },
    ]),
  ).toEqual([
    `  /api/availability #1/3 · ${CANCELLED} · 1190ms`,
    '  /api/availability #2/3 · 200 · 442ms',
    `  /api/availability #3/3 · ${CANCELLED} · 1190ms`,
  ]);
});

test('collectEnvironment reads the live globals without throwing', () => {
  const facts = collectEnvironment();
  expect(facts.buildMode).toBe('DEV'); // Vitest runs the DEV env
  expect(facts.adapters).toBe('mock');
  expect(typeof facts.userAgent).toBe('string');
});

// THE FEEDBACK THAT MAKES THE PARAMETER USABLE. Without it a mistyped URL is indistinguishable from a
// working one: the tester records a 2.0 run believing it was 1.0, and the sweep concludes "changing
// zoom does not change symbol size" — the inverse of the truth.
test('an override that was honoured is reported as a REQUEST, beside what the camera confirmed', () => {
  const report = renderFor({ zoomRequested: 1, appliedZoom: 1 });
  // Newline-anchored, not a bare substring: '줌 요청: 1' is a PREFIX of '줌 요청: 1.5' and '줌 요청: 12', so a
  // bare toContain would pass for either and this test would stop pinning the actual requested value.
  // Each zoom line is followed by another line (줌 적용 comes right after), so the line's own '\n' is
  // always present to anchor against.
  expect(report).toContain('줌 요청: 1\n');
  expect(report).toContain('줌 적용: 1\n');
});

// No override is the production case, and the panel must look exactly as it did before this parameter
// existed — an absent line, not `줌 요청: 미보고`, which would be noise about something nobody asked for.
test('with no override the request line is absent entirely', () => {
  expect(renderFor({ zoomRequested: null })).not.toContain('줌 요청');
});
