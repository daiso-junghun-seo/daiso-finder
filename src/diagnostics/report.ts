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

export const UNREPORTED = '미보고';
export const QUERY_FAILED = '질의 실패';
export const SUPPORTS_NONE = '지원 없음';
export const NOT_STARTED = '스캔 전';
export const IN_PROGRESS = '진행 중';

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

// min/max/step for a single named capability range. A bound the platform did not report prints UNREPORTED
// rather than being dropped or shown as 0 — the same discipline as every other unmeasured field here.
function rangeText(range: CaptureRangeFacts): string {
  return `${value(range.min)}~${value(range.max)}`;
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

function networkLines(entries: NetworkEntry[]): string[] {
  if (entries.length === 0) return ['  (없음)'];
  return entries.map((e) => `  ${e.path} · ${e.status} · ${e.ms}ms`);
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
