// Pure formatting for the diagnostics panel. DOM-free on purpose: the no-fabrication rules live here,
// so they are asserted directly on the produced strings.
import type {
  CaptureCapabilityFacts,
  CaptureRangeFacts,
  DiagnosticsSnapshot,
  NetworkEntry,
  ScannerDiagnostics,
  TrackFacts,
} from './bus';
import type { UpstreamLeg } from './serverTiming';

export const UNREPORTED = '미보고';
export const QUERY_FAILED = '질의 실패';
export const SUPPORTS_NONE = '지원 없음';
export const NOT_STARTED = '스캔 전';
export const IN_PROGRESS = '진행 중';
// A request that outran its own deadline, and a request that was cancelled as a duplicate. Both had to be
// named: the existing markers cover capability probes, and neither of these is a 질의 실패 — a timeout is a
// deadline we chose, and a cancellation is a success elsewhere in the same race.
export const TIMED_OUT = '시간 초과';
export const CANCELLED = '취소';

export interface EnvironmentFacts {
  buildMode: 'PROD' | 'DEV';
  adapters: 'live' | 'mock';
  protocol: string;
  host: string;
  secureContext: boolean;
  hasMediaDevices: boolean;
  userAgent: string;
}

export interface AppFacts {
  state: string;
  query: string | null;
  origin: string | null;
  storeId: string | null;
  storeName: string | null;
  candidateCount: number | null;
  freshnessAgeMs: number | null;
}

export function collectEnvironment(): EnvironmentFacts {
  const prod = import.meta.env.PROD;
  return {
    buildMode: prod ? 'PROD' : 'DEV',
    // Derived from the same flag composition.ts branches on, so this line cannot drift from the wiring.
    adapters: prod ? 'live' : 'mock',
    protocol: window.location.protocol,
    host: window.location.host,
    secureContext: window.isSecureContext === true,
    hasMediaDevices:
      typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    userAgent: navigator.userAgent,
  };
}

function value(v: string | number | null | undefined): string {
  return v === null || v === undefined ? UNREPORTED : String(v);
}

function resolution(track: TrackFacts | null): string {
  if (!track) return '카메라 대기';
  return `${value(track.width)}×${value(track.height)}`;
}

export function summaryLine(scanner: ScannerDiagnostics, now: number): string {
  if (scanner.startedAt === null) return NOT_STARTED;
  const decoder = scanner.decoderPath ?? '준비 중';
  const seconds = ((now - scanner.startedAt) / 1000).toFixed(1);
  const status = scanner.outcome ?? IN_PROGRESS;
  return `${decoder} · ${resolution(scanner.track)} · ${seconds}s · ${status}`;
}

function formats(list: string[] | null): string {
  if (list === null) return QUERY_FAILED;
  if (list.length === 0) return SUPPORTS_NONE;
  return list.join(', ');
}

function dataMatrixMembership(list: string[] | null): string {
  if (list === null) return QUERY_FAILED;
  return list.includes('data_matrix') ? '포함' : '미포함';
}

// A single named capability range. min~max are always claimed, so a bound the platform did not report
// prints UNREPORTED rather than being dropped or shown as 0 — the same discipline as every other unmeasured
// field here. `step` is different in kind and so is APPENDED only when the platform named it: it is what
// decides whether an intermediate factor (1.5x) is even requestable, which the zoom sweep needs, but a
// platform that never mentions it must render exactly the line it rendered before step existed here — a
// step=UNREPORTED would be noise about a bound nobody claimed, not a missing measurement. `== null` rather
// than a truthiness check: a step the platform reported as 0 is a measurement and prints as 0.
function rangeText(range: CaptureRangeFacts): string {
  const step = range.step == null ? '' : ` step=${range.step}`;
  return `${value(range.min)}~${value(range.max)}${step}`;
}

// track.getCapabilities(), narrowed to the same five Image Capture keys as the constraint-support line
// above. null (the method is absent, or the track's whole facts object is) prints QUERY_FAILED — "we don't
// know" — never SUPPORTS_NONE, which would read as "this camera measurably supports none of them". An
// empty object (the method answered and named none of the five) is the only case that earns SUPPORTS_NONE.
function captureCapabilitiesLine(capabilities: CaptureCapabilityFacts | null): string {
  if (!capabilities) return QUERY_FAILED;
  const parts: string[] = [];
  if (capabilities.focusMode) parts.push(`focusMode=${capabilities.focusMode.join('/')}`);
  if (capabilities.focusDistance)
    parts.push(`focusDistance=${rangeText(capabilities.focusDistance)}`);
  if (capabilities.zoom) parts.push(`zoom=${rangeText(capabilities.zoom)}`);
  // torch is reported whenever the platform named it, `true` or `false` alike — both are measured facts.
  if (capabilities.torch !== undefined) parts.push(`torch=${capabilities.torch}`);
  if (capabilities.pointsOfInterest) parts.push('pointsOfInterest=지원');
  return parts.length === 0 ? SUPPORTS_NONE : parts.join(' · ');
}

function trackLines(track: TrackFacts | null): string[] {
  if (!track) return ['  트랙: 없음'];
  return [
    `  해상도: ${value(track.width)}×${value(track.height)}`,
    `  frameRate: ${value(track.frameRate)}`,
    `  facingMode: ${value(track.facingMode)}`,
    `  deviceId: ${value(track.deviceId)}`,
    // formats() is the SAME null/[]/join renderer used for supportedFormats above — reused rather than
    // reinvented, since the fact shape is identical: a browser-reported list of names the platform knows.
    `  지원 제약: ${formats(track.supportedImageCaptureConstraints)}`,
    `  카메라 기능: ${captureCapabilitiesLine(track.imageCaptureCapabilities)}`,
  ];
}

// The status segment. `status` stays the primary fact — a number when a response arrived, 'error' when
// none did — and the outcome only ADDS the distinction a number cannot carry: without it a 502, a timeout
// and a cancelled duplicate all read the same, and a cancelled duplicate reads as a failure it is not.
// An unclassified entry (outcome absent, e.g. from createDiagnosticFetch) renders the bare status, so the
// panel never states an outcome nobody observed.
function networkStatus(entry: NetworkEntry): string {
  switch (entry.outcome) {
    case 'timeout':
      return TIMED_OUT;
    case 'aborted':
      return CANCELLED;
    // Both are failures; `status` is what tells them apart — a real code for one, 'error' for the other.
    case 'httpError':
    case 'networkError':
      return `${entry.status} ${QUERY_FAILED}`;
    // 'ok' and an unclassified entry alike: the status code already says it, and adding a marker to a 200
    // would be noise on the line a tester reads most often.
    default:
      return String(entry.status);
  }
}

// Korean labels for the legs the proxy emits today (functions/api/*.ts). An unknown name falls
// through to itself: the panel reports what the server said, and a label map that has not caught up
// must not make a measured leg disappear.
// A Map, not a plain object: a plain object literal inherits Object.prototype, so a leg named
// `toString` would look up a FUNCTION (not undefined) and `??` would not fire -- the panel would
// render the function's source text; a leg named `__proto__` would render `[object Object]`.
// Unreachable today (the proxy only emits five literal leg names), but this file promises an
// unknown name falls through to itself, not to a prototype member. A Map has no prototype chain
// over its keys, so `.get()` returns undefined for any name that was never `.set()`.
const LEG_LABELS = new Map<string, string>([
  ['search', '검색'],
  ['str', '매장'],
  ['auth', '인증'],
  ['disp', '진열'],
  ['stck', '재고'],
]);

function legLabel(name: string): string {
  return LEG_LABELS.get(name) ?? name;
}

function legText(legs: ReadonlyArray<UpstreamLeg>): string {
  return legs.map((leg) => `${legLabel(leg.name)} ${leg.ms}`).join(' · ');
}

function networkLines(entries: NetworkEntry[]): string[] {
  if (entries.length === 0) return ['  (없음)'];
  return entries.flatMap((e) => {
    // `#1/1` labels the lookup's single attempt (the race retired to 1 in §B34; the label
    // shape is unchanged so a re-raise needs no panel change).
    const attempt = e.attempt ? ` #${e.attempt.index}/${e.attempt.total}` : '';
    // The SERVER's wall clock, never a sum of the legs below: wave 1 (search, str, auth) always fires
    // concurrently on both the direct and franchise branches, so a sum always exceeds it and would
    // make the residual (this line's ms minus 상류) go negative. (disp/stck are also parallel, but
    // only on the direct branch.) `== null` and not a truthiness check, so a measured 0 still renders.
    const upstream = e.upstream?.totalMs == null ? '' : ` · 상류 ${e.upstream.totalMs}ms`;
    // Appended LAST, and already flattened + capped by the publisher (ERROR_BODY_MAX_CHARS), so a long
    // body cannot push the path, outcome or duration off the readable start of the line.
    const body = e.errorBody ? ` · ${e.errorBody}` : '';
    const main = `  ${e.path}${attempt} · ${networkStatus(e)} · ${e.ms}ms${upstream}${body}`;
    const legs = e.upstream?.legs ?? [];
    return legs.length === 0 ? [main] : [main, `    ${legText(legs)}`];
  });
}

export function buildReport(
  env: EnvironmentFacts,
  snapshot: DiagnosticsSnapshot,
  app: AppFacts,
  now: number,
): string {
  const s = snapshot.scanner;
  const elapsed =
    s.startedAt === null ? NOT_STARTED : `${((now - s.startedAt) / 1000).toFixed(1)}s`;
  return [
    '[환경]',
    `  빌드: ${env.buildMode} · 어댑터: ${env.adapters}`,
    `  주소: ${env.protocol}//${env.host}`,
    `  secureContext: ${env.secureContext} · mediaDevices: ${env.hasMediaDevices}`,
    `  UA: ${env.userAgent}`,
    '',
    '[스캐너]',
    `  BarcodeDetector: ${s.hasBarcodeDetector === null ? UNREPORTED : s.hasBarcodeDetector}`,
    `  지원 포맷: ${formats(s.supportedFormats)}`,
    `  data_matrix: ${dataMatrixMembership(s.supportedFormats)}`,
    `  디코더: ${value(s.decoderPath)} · 준비 ${value(s.decoderReadyMs)}ms`,
    `  카메라 오류: ${value(s.cameraError)}`,
    ...trackLines(s.track),
    `  경과: ${elapsed}`,
    `  카메라 승인: ${s.cameraMs === null ? UNREPORTED : `${s.cameraMs}ms`}`,
    // Only when a diagnostics session actually asked. Absent — not 미보고 — when nobody did: an
    // unreported marker here would be noise about a bound nobody claimed, the same rule the capability
    // ranges follow. Placed above 줌 적용 so the pair reads request-then-confirmation.
    ...(s.zoomRequested === null ? [] : [`  줌 요청: ${s.zoomRequested}`]),
    // What the camera CONFIRMED, read back from its settings — never the factor that was requested. `=== null`
    // rather than a truthiness check on purpose: a confirmed 1 is the single most interesting answer this
    // line can give (asked for 2, got none of it) and must not render as 미보고.
    `  줌 적용: ${s.appliedZoom === null ? UNREPORTED : s.appliedZoom}`,
    // Its own line because applying zoom can reconfigure the capture session — see ScannerDiagnostics.zoomMs.
    // It also disambiguates the line above: a duration here means the request was made, so a 미보고 next to
    // it reads as "the platform would not say", not as "we never asked".
    `  줌 소요: ${s.zoomMs === null ? UNREPORTED : `${s.zoomMs}ms`}`,
    // Adjacent to the two zoom lines rather than down among the decode segments, because the decision rule
    // this number exists for compares it DIRECTLY against 줌 적용: does the symbol grow roughly in
    // proportion to the applied factor (a sensor crop) or not (a software upscale, or a request ignored)?
    // Pixels, never pixels-per-module — the module count is not in the Result (see bus.ts).
    `  심볼 크기: ${s.symbolSidePx === null ? UNREPORTED : `${s.symbolSidePx}px`}`,
    // NOT pure decode time: the label spells out what is inside it so a reader cannot mistake the run
    // total for the decode loop. The permission prompt lands in 카메라 승인 (§B30-11).
    `  스캔 소요: ${s.decodeMs === null ? UNREPORTED : `${s.decodeMs}ms`} (디코더 준비·카메라 승인 포함)`,
    `  시도 횟수: ${value(s.decodeAttempts)}`,
    // The label carries `조립 포함` because 비트맵 조립 is a SUBSET of this number, not a sibling: the
    // loop times the whole decodeFrame call and the assembly happens inside it. Without the qualifier the
    // two lines invite addition, which double-counts the assembly and inflates the residual.
    `  디코드 점유(조립 포함): ${s.decodeBusyMs === null ? UNREPORTED : `${s.decodeBusyMs}ms`}`,
    `  비트맵 조립: ${s.assembleMs === null ? UNREPORTED : `${s.assembleMs}ms`}`,
    `  프레임 복사: ${s.drawMs === null ? UNREPORTED : `${s.drawMs}ms`}`,
    `  루프 대기: ${s.loopIdleMs === null ? UNREPORTED : `${s.loopIdleMs}ms`}`,
    `  워밍업 대기: ${s.warmupMs === null ? UNREPORTED : `${s.warmupMs}ms`}`,
    `  결과: ${s.outcome ?? IN_PROGRESS}`,
    '',
    '[앱 상태]',
    `  state: ${app.state}`,
    `  query: ${value(app.query)} · origin: ${value(app.origin)}`,
    `  매장: ${value(app.storeName)} (${value(app.storeId)})`,
    `  후보 수: ${value(app.candidateCount)}`,
    `  캐시 나이: ${app.freshnessAgeMs === null ? UNREPORTED : `${app.freshnessAgeMs}ms`}`,
    '',
    '[네트워크]',
    ...networkLines(snapshot.network),
  ].join('\n');
}
