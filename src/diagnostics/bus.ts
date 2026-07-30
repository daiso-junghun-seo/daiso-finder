// Single-process observation store for the ?debug=1 panel. Adapters publish facts; the panel subscribes.
// App state does NOT flow through here — Zustand already owns it, and duplicating it would create a
// second, drifting truth.
import type { ScanOutcome } from '../domain/ports';
import { isDiagnosticsEnabled } from './enabled';

// A MediaSettingsRange as reported by track.getCapabilities() — the Image Capture spec's shape for
// focusDistance/zoom. Each bound is independently optional per spec (a UA may report a step with no max,
// etc.), hence null rather than 0 for a bound the platform did not name.
export interface CaptureRangeFacts {
  min: number | null;
  max: number | null;
  step: number | null;
}

// track.getCapabilities() narrowed to the MediaStream Image Capture keys standard lib.dom types omit
// (focusMode/focusDistance/zoom/torch/pointsOfInterest — Chrome implements them, WebKit historically has
// not). A key is present here ONLY when the platform named it; an absent key must read as "not observed",
// never as a measured `false` — that distinction is the entire point of this probe (see readTrackFacts).
// pointsOfInterest carries no min/max/step of its own — the spec reports it as `{}` when supported — so
// its value here is presence-only.
export interface CaptureCapabilityFacts {
  focusMode?: string[];
  focusDistance?: CaptureRangeFacts;
  zoom?: CaptureRangeFacts;
  torch?: boolean;
  pointsOfInterest?: boolean;
}

export interface TrackFacts {
  width: number | null;
  height: number | null;
  frameRate: number | null;
  facingMode: string | null;
  deviceId: string | null;
  // navigator.mediaDevices.getSupportedConstraints(), narrowed to the five Image Capture keys above.
  // null = the method is absent or the query threw — "we don't know" — and must never collapse into an
  // empty list, which would read as a measured "the platform supports none of them". [] = the method
  // answered and named none of the five. Otherwise the subset it named. Same null/[] discipline as
  // ScannerDiagnostics.supportedFormats below.
  supportedImageCaptureConstraints: string[] | null;
  // track.getCapabilities() for the same five keys, values only for the ones THIS camera named. null =
  // getCapabilities is absent on this track (or threw) — "we don't know", not a measured negative.
  imageCaptureCapabilities: CaptureCapabilityFacts | null;
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
  // Both paths count attempts. The five below are FALLBACK-ONLY and stay null on the native path, whose
  // setInterval does not await the previous detect() — overlapping attempts make a per-attempt average
  // meaningless, and a number here would read as one. All five are whole milliseconds: the frame loop's
  // clock is sub-ms, so each sum is rounded once, where it is published.
  decodeAttempts: number | null;
  // Time inside decodeFrame calls. This INCLUDES bitmap assembly — see assembleMs, which is the part of
  // it that is not the decoder. The decoder's own cost is decodeBusyMs − assembleMs.
  decodeBusyMs: number | null;
  // The assembly half of decodeBusyMs: getImageData's CPU readback out of the canvas, the greyscale pass
  // and the binarizer. A SUBSET of decodeBusyMs, never an addend — adding the two double-counts it. This
  // is the boundary a wasm decoder does NOT move (it consumes the same canvas through getImageData),
  // which is exactly why it has to be visible separately. Published by the zxing decoder itself so the
  // loop stays decoder-agnostic; a decoder that assembles nothing leaves it null.
  assembleMs: number | null;
  // The decoded symbol's side length, in whole pixels of the frame that decoded it: the median edge of the
  // quadrilateral the DataMatrix detector reported (exact derivation in zxingFrameDecoder's
  // symbolSideLength). This is the INSTRUMENT for the camera-zoom lever — a sensor crop should raise it
  // roughly in proportion to the applied factor, and that makes the effect an observation rather than a
  // prediction. Deliberately NOT pixels-per-module: the zxing Result carries no module count (only the
  // detector's internal BitMatrix knows it, and it is not exposed), so a PPM field here would be an assumed
  // 16x16 dressed up as a measurement. The conversion, with its assumption named, lives in docs/HANDOFF.md.
  // null = no attempt decoded, or the result carried no usable corner points. Published by the zxing
  // decoder alongside assembleMs, and for the same reason: the loop must not learn that a decoder has
  // symbols.
  symbolSidePx: number | null;
  drawMs: number | null; // time spent copying frames into the canvas (the drawImage call alone)
  // Time the loop DELIBERATELY waited — rAF plus the minimum interval — counted only for frames that
  // already had dimensions. The wait for a frame that had none is warm-up, not pacing, and is reported
  // separately below; folding it in here made "the interval is too long" the reading for a cost no
  // interval change can touch.
  loopIdleMs: number | null;
  // Time waited on frames that had no dimensions yet: the video warming up between srcObject and
  // loadedmetadata, commonly tens to hundreds of ms on iOS. Those frames are excluded from
  // decodeAttempts, so this segment has no per-attempt reading.
  warmupMs: number | null;
  // Wall-clock around the getUserMedia call, so the decode loop can be told apart from the wait for the
  // camera. On iOS Safari that wait CONTAINS the permission prompt — getUserMedia does not settle until
  // the shopper taps 허용 — so a first-of-session run carries human decision time here and nowhere else.
  // null when the camera was never acquired (no decoder, aborted first, or getUserMedia rejected).
  cameraMs: number | null;
  // The zoom factor this run ACTUALLY got, read back from track.getSettings().zoom after the
  // applyConstraints await — never the factor that was requested. null = no zoom was applied, or the
  // platform names no zoom in its settings; either way we did not observe one, and printing the request here
  // would be a fabrication (the panel would claim a 2x sensor crop on a camera that quietly ignored it).
  // zoomMs is what tells the two cases apart: a number there means the request was made and awaited.
  appliedZoom: number | null;
  // Wall-clock around the zoom applyConstraints await ALONE, deliberately kept out of cameraMs. WebKit
  // routes a zoom change through setSessionSizeFrameRateAndZoom — the same path as a resolution change — so
  // applying it can reconfigure the whole capture session and cost real time. Folded into cameraMs that
  // cost would read as a slower permission prompt; folded into decodeMs it would read as a slower decode.
  // null = no zoom was attempted (no zoom capability, no applyConstraints, or no camera at all), never 0 —
  // 0 would claim a session reconfiguration that took no time.
  zoomMs: number | null;
  // Wall-clock from beginScannerRun to the outcome publish — the WHOLE run, decoder resolution
  // (decoderReadyMs) and camera acquisition (cameraMs) included, not the decode loop alone. Subtract
  // those two to isolate decoding. Distinct from the panel's 경과 line, which is recomputed from
  // Date.now() on every render and therefore only ever an upper bound.
  decodeMs: number | null;
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
    decodeAttempts: null,
    decodeBusyMs: null,
    assembleMs: null,
    symbolSidePx: null,
    drawMs: null,
    loopIdleMs: null,
    warmupMs: null,
    cameraMs: null,
    appliedZoom: null,
    zoomMs: null,
    decodeMs: null,
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
