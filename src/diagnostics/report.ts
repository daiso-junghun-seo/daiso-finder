// Pure formatting for the diagnostics panel. DOM-free on purpose: the no-fabrication rules live here,
// so they are asserted directly on the produced strings.
import type { DiagnosticsSnapshot, NetworkEntry, ScannerDiagnostics, TrackFacts } from './bus';

export const UNMEASURED = '측정 불가 (zxing 내부 루프)';
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

function trackLines(track: TrackFacts | null): string[] {
  if (!track) return ['  트랙: 없음'];
  return [
    `  해상도: ${value(track.width)}×${value(track.height)}`,
    `  frameRate: ${value(track.frameRate)}`,
    `  facingMode: ${value(track.facingMode)}`,
    `  deviceId: ${value(track.deviceId)}`,
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
    `  시도 횟수: ${s.nativePolls === null ? UNMEASURED : s.nativePolls}`,
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
