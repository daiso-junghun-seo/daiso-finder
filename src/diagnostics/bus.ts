// Single-process observation store for the ?debug=1 panel. Adapters publish facts; the panel subscribes.
// App state does NOT flow through here — Zustand already owns it, and duplicating it would create a
// second, drifting truth.
import type { ScanOutcome } from '../domain/ports';
import { isDiagnosticsEnabled } from './enabled';

export interface TrackFacts {
  width: number | null;
  height: number | null;
  frameRate: number | null;
  facingMode: string | null;
  deviceId: string | null;
}

export interface ScannerDiagnostics {
  startedAt: number | null;
  hasBarcodeDetector: boolean | null;
  // null = the support query failed or the API is absent; [] = the platform explicitly supports none.
  // Collapsing the two would turn "we don't know" into "we know it's empty".
  supportedFormats: string[] | null;
  decoderPath: 'native' | 'zxing' | 'none' | null;
  decoderReadyMs: number | null;
  cameraError: string | null; // error.name only — never message or stack
  track: TrackFacts | null;
  nativePolls: number | null; // null on the zxing path: its retries happen inside the library
  outcome: ScanOutcome['kind'] | null;
}

export interface NetworkEntry {
  path: string; // pathname only
  status: number | 'error';
  ms: number;
}

export interface DiagnosticsSnapshot {
  scanner: ScannerDiagnostics;
  network: NetworkEntry[];
}

export const NETWORK_LIMIT = 5;

function emptyScanner(): ScannerDiagnostics {
  return {
    startedAt: null,
    hasBarcodeDetector: null,
    supportedFormats: null,
    decoderPath: null,
    decoderReadyMs: null,
    cameraError: null,
    track: null,
    nativePolls: null,
    outcome: null,
  };
}

let snapshot: DiagnosticsSnapshot = { scanner: emptyScanner(), network: [] };
const listeners = new Set<() => void>();

// The ONLY writer. Replacing the snapshot object here — and nowhere else — is what makes getSnapshot()
// reference-stable between publishes, which useSyncExternalStore requires.
function commit(next: DiagnosticsSnapshot): void {
  snapshot = next;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // Swallow subscriber errors. A failing React component or UI callback must never break
      // the bus or prevent other subscribers from being notified.
    }
  }
}

export function beginScannerRun(startedAt: number): void {
  if (!isDiagnosticsEnabled()) return;
  commit({ ...snapshot, scanner: { ...emptyScanner(), startedAt } });
}

export function publishScanner(patch: Partial<ScannerDiagnostics>): void {
  if (!isDiagnosticsEnabled()) return;
  commit({ ...snapshot, scanner: { ...snapshot.scanner, ...patch } });
}

export function publishNetwork(entry: NetworkEntry): void {
  if (!isDiagnosticsEnabled()) return;
  const path = entry.path.split('?')[0] ?? entry.path;
  commit({ ...snapshot, network: [...snapshot.network, { ...entry, path }].slice(-NETWORK_LIMIT) });
}

export function getSnapshot(): DiagnosticsSnapshot {
  return snapshot;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset. Production has exactly one bus for the life of the page. */
export function resetDiagnostics(): void {
  snapshot = { scanner: emptyScanner(), network: [] };
  listeners.clear();
}
