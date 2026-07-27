// src/adapters/barcode/browserScanner.ts
// Camera + barcode decode behind ScannerPort. Mirrors browserGeolocation's discipline: every capability
// is INJECTABLE via ScannerDeps and defaults to the corresponding global (navigator.mediaDevices,
// globalThis.BarcodeDetector, the bundled @zxing import), so tests substitute all three without
// touching globals; and no path throws — failures surface as ScanOutcome variants.
//
// The three defaults resolve at DIFFERENT times, deliberately. navigator.mediaDevices is read once, at
// construction. globalThis.BarcodeDetector is read — and its DataMatrix support re-queried — on EVERY
// scan, because that answer is not a constant: Chrome on Android answers from the Play Services barcode
// module, which can install mid-session, so a first scan's "no data_matrix" can legitimately become
// "yes" minutes later. Caching the first answer would pin such a device to the ~92 kB zxing fallback for
// the rest of the session; the query is cheap, so it is repeated rather than memoised. Do not "optimise"
// it into a module-level cache.
// Decode-only: no image recognition (Bible, Engineering/in-store-navigation §dependencies).
import { type TrackFacts, beginScannerRun, publishScanner } from '../../diagnostics/bus';
import type { ScanOutcome, ScanTarget, ScannerPort } from '../../domain/ports';

// DataMatrix ONLY — and the exclusivity is correctness, not scope. DAISO packaging carries a 2D
// DataMatrix whose payload is exactly the 품번 (pdNo) and nothing else, so it is the one symbology that
// answers "which product is this". The 1D barcode printed on the same package encodes a DIFFERENT
// number (a retail EAN/UPC), and nothing maps it to a pdNo: decoding it would silently query the wrong
// product or return an honest-looking Empty for a code the catalogue never had. Reading fewer
// symbologies is therefore the safer scanner, not the weaker one.
export const SCAN_FORMATS = ['data_matrix'] as const;

export interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}

// The bundled fallback, shaped so the adapter never imports @zxing types at module scope (keeps the
// dynamic import a separate chunk).
export interface FallbackDecoder {
  decode(stream: MediaStream, video: HTMLVideoElement): Promise<string>;
  cancel(): void;
}

export interface ScannerDeps {
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'> | undefined;
  // Async because the platform's DataMatrix support can only be learned from the asynchronous static
  // BarcodeDetector.getSupportedFormats() — see defaultNativeDetector.
  createNativeDetector?: () => Promise<NativeDetector | null>;
  loadFallbackDecoder?: () => Promise<FallbackDecoder | null>;
  pollIntervalMs?: number;
  now?: () => number; // injectable so decoderReadyMs is assertable without a real clock
}

export function createBrowserScanner(deps: ScannerDeps = {}): ScannerPort {
  const media =
    'mediaDevices' in deps
      ? deps.mediaDevices
      : typeof navigator === 'undefined'
        ? undefined
        : navigator.mediaDevices;
  const createNative = deps.createNativeDetector ?? defaultNativeDetector;
  const loadFallback = deps.loadFallbackDecoder ?? loadBundledDecoder;
  const pollMs = deps.pollIntervalMs ?? 200;
  const now = deps.now ?? Date.now;

  // The scan body keeps its many exit points; wrapping it means the outcome is published at exactly one
  // place, so a future early return cannot silently skip instrumentation.
  const runScan = async (target: ScanTarget, signal: AbortSignal): Promise<ScanOutcome> => {
    if (!media?.getUserMedia) return { kind: 'unsupported' };
    if (signal.aborted) return { kind: 'cancelled' };
    // DECODER FIRST, CAMERA SECOND. Deciding native-vs-fallback — the platform's async DataMatrix
    // support query, and then the fallback's dynamic import of the ~92 kB @zxing chunk, which on a
    // cold iOS Safari cache can take seconds — before touching getUserMedia buys two guarantees the
    // reverse order cannot: (a) a device with no way to decode never has its camera switched on at
    // all, and (b) a shopper who closes the overlay while either is in flight aborts a run that owns
    // no camera, so nothing can outlive the overlay.
    const decoderStart = now();
    let native: NativeDetector | null = null;
    let fallback: FallbackDecoder | null = null;
    try {
      // Neither wait is cancellable in itself, but the WAIT for each is: untilAbort settles the moment
      // the signal fires instead of parking until the support query answers or the chunk lands.
      native = await untilAbort(createNative(), signal);
      // An already-aborted run must not go on to pull the lazy decoder chunk it will never use.
      if (!signal.aborted && !native) fallback = await untilAbort(loadFallback(), signal);
    } catch {
      publishScanner({ decoderPath: 'none', decoderReadyMs: now() - decoderStart });
      return { kind: 'failed' };
    }
    publishScanner({
      decoderPath: native ? 'native' : fallback ? 'zxing' : 'none',
      decoderReadyMs: now() - decoderStart,
    });
    if (signal.aborted) return { kind: 'cancelled' }; // checked before `unsupported`: an abort is not a capability fact
    if (!native && !fallback) return { kind: 'unsupported' };
    let stream: MediaStream;
    try {
      stream = await media.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (err) {
      publishScanner({ cameraError: (err as { name?: string } | null)?.name ?? 'UnknownError' });
      // A denial is the shopper's choice, not an error state to dramatize. `unsupported` asserts a
      // permanent capability fact about this device — it's reserved for "there is no getUserMedia API
      // at all" and "no usable decoder" (no DataMatrix-capable native detector AND no bundled
      // fallback), both settled above before the camera. Any other getUserMedia rejection here
      // (camera busy, no device, unknown) is transient — the camera may well work on retry — so it is
      // `failed`, never `unsupported`, to avoid fabricating a fact this device doesn't actually have.
      return { kind: isPermissionDenial(err) ? 'permissionDenied' : 'failed' };
    }
    publishScanner({ track: readTrackFacts(stream) });
    const stopCamera = () => {
      for (const track of stream.getTracks()) track.stop();
    };
    try {
      if (signal.aborted) return { kind: 'cancelled' };
      if (native) return await scanWithNative(native, stream, target, signal, pollMs);
      // Narrowed by the `!native && !fallback` guard above — reaching here means fallback is set.
      return await scanWithFallback(fallback as FallbackDecoder, stream, target, signal);
    } catch {
      return { kind: 'failed' };
    } finally {
      // The camera is never left running — success, cancel and failure all pass through here.
      stopCamera();
    }
  };

  return {
    async scan(target, signal) {
      beginScannerRun(now());
      const outcome = await runScan(target, signal);
      publishScanner({ outcome: outcome.kind });
      return outcome;
    },
  };
}

// Resolves as soon as EITHER `work` settles or the signal aborts, whichever comes first. On abort it
// yields null and the caller reads signal.aborted to tell that apart from "loaded nothing"; a rejection
// still rejects, so a broken loader stays a `failed`, not a fabricated `unsupported`.
function untilAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    const onAbort = () => resolve(null);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err); // a no-op if the abort already settled this promise
      },
    );
  });
}

function isPermissionDenial(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError';
}

// Observation only: a stream shaped differently than expected (an older browser, a test double) must
// degrade to "we didn't observe it" rather than break a scan that would otherwise have worked.
function readTrackFacts(stream: MediaStream): TrackFacts | null {
  try {
    const track = stream.getVideoTracks?.()[0];
    if (!track?.getSettings) return null;
    const s = track.getSettings();
    return {
      width: s.width ?? null,
      height: s.height ?? null,
      frameRate: s.frameRate ?? null,
      facingMode: s.facingMode ?? null,
      deviceId: s.deviceId ?? null,
    };
  } catch {
    return null;
  }
}

// A BarcodeDetector that EXISTS is not a BarcodeDetector that can read DataMatrix — support is per
// platform and, on several, 2D formats are absent. Constructing one blindly is the worst failure mode
// available here: detect() would simply never fire, so the camera would stay on and the overlay would
// wait forever with no error to classify and no fallback ever tried. So ask first, via the asynchronous
// static getSupportedFormats(), and treat anything short of an explicit data_matrix — an older
// implementation without the static, a rejected query, a list that omits it — as no native detector at
// all, which routes the run to the bundled DataMatrix reader instead. Never throws.
async function defaultNativeDetector(): Promise<NativeDetector | null> {
  const ctor = (
    globalThis as {
      BarcodeDetector?: (new (o: { formats: string[] }) => NativeDetector) & {
        getSupportedFormats?: () => Promise<string[]>;
      };
    }
  ).BarcodeDetector;
  publishScanner({ hasBarcodeDetector: Boolean(ctor) });
  if (!ctor) return null;
  try {
    const supported = await ctor.getSupportedFormats?.();
    publishScanner({ supportedFormats: supported ?? null });
    if (!supported?.includes('data_matrix')) return null;
    return new ctor({ formats: [...SCAN_FORMATS] });
  } catch {
    publishScanner({ supportedFormats: null });
    return null; // unknown support, or a constructor that rejected the format list
  }
}

// Fire-and-forget: sets the stream and kicks off playback without awaiting it. A play() that never
// settles (a real-device stall) must not block the caller — frames still flow into detect() even before
// play() resolves, and an unresolved play() must never delay the abort listener below from registering.
function attach(video: HTMLVideoElement, stream: MediaStream): void {
  video.srcObject = stream;
  video.play().catch(() => {
    // An autoplay rejection is not fatal: frames still flow and detect() can read them.
  });
}

function scanWithNative(
  detector: NativeDetector,
  stream: MediaStream,
  target: ScanTarget,
  signal: AbortSignal,
  pollMs: number,
): Promise<ScanOutcome> {
  return new Promise<ScanOutcome>((resolve) => {
    let settled = false;
    let polls = 0;
    const finish = (outcome: ScanOutcome) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(outcome);
    };
    const onAbort = () => finish({ kind: 'cancelled' });
    // Registered before attach() — nothing between here and the interval below can suspend, so an abort
    // can never land while this run is unable to hear it (Finding 4: a hung play() must not be a gap).
    signal.addEventListener('abort', onAbort);
    // The timer is created here, with nothing in between, so `timer` is always initialised before any
    // path can reach finish(): the already-aborted guard below would otherwise call clearInterval() on a
    // handle still in its temporal dead zone, turning an honest `cancelled` into a `failed`. Starting the
    // interval one statement early is free — its first tick cannot run until this executor returns, by
    // which point attach() has already bound the stream.
    const timer = setInterval(() => {
      polls += 1;
      publishScanner({ nativePolls: polls });
      detector
        .detect(target.video)
        .then((codes) => {
          const value = codes[0]?.rawValue;
          if (value) finish({ kind: 'decoded', value });
        })
        .catch(() => {
          // A frame that cannot be read is not a failure: the Bible keeps the camera open on decode
          // failure and the overlay shows a hint instead (Engineering §5).
        });
    }, pollMs);
    if (signal.aborted) {
      finish({ kind: 'cancelled' });
      return;
    }
    attach(target.video, stream);
  });
}

async function scanWithFallback(
  decoder: FallbackDecoder,
  stream: MediaStream,
  target: ScanTarget,
  signal: AbortSignal,
): Promise<ScanOutcome> {
  if (signal.aborted) return { kind: 'cancelled' };
  // Released exactly once, on every exit path including success: without it the zxing reader keeps its
  // listeners bound to a <video> the overlay is about to unmount. Idempotent so the abort path (which
  // cancels to interrupt the pending decode) and the finally below cannot double-reset the reader.
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    decoder.cancel();
  };
  signal.addEventListener('abort', release);
  try {
    const value = await decoder.decode(stream, target.video);
    if (signal.aborted) return { kind: 'cancelled' };
    // An empty decode is not a value: the native path already skips empty results, and handing '' up
    // would run availability for nothing at all.
    return value ? { kind: 'decoded', value } : { kind: 'failed' };
  } catch {
    return signal.aborted ? { kind: 'cancelled' } : { kind: 'failed' };
  } finally {
    signal.removeEventListener('abort', release);
    release();
  }
}

// THE ONLY PLACE THE BUNDLED READER IS NAMED. Exported so the test asserts what this very call hands
// back instead of repeating the path and proving nothing about production — a swap to another valid
// zxing reader (BrowserMultiFormatReader decodes 1D again) or a path moved by a package upgrade would
// otherwise both pass a duplicated guard, the first reintroducing wrong-product decodes and the second
// hiding inside loadBundledDecoder's catch as a silent `unsupported` on every iOS device.
//
// The dedicated reader, not BrowserMultiFormatReader narrowed by a POSSIBLE_FORMATS hint: the
// multi-format reader links every 1D and 2D decoder into the chunk whatever the hints say. Deep path,
// not the '@zxing/library' barrel: the package declares no `sideEffects`, so nothing in the barrel can
// be tree-shaken and the lazy chunk stays 415.76 kB instead of 91.96 kB. Rollup needs a literal here,
// which is why this is a shared FUNCTION and not a shared path constant.
export async function importBundledDatamatrixReader() {
  const { BrowserDatamatrixCodeReader } = await import(
    '@zxing/library/esm/browser/BrowserDatamatrixCodeReader'
  );
  return BrowserDatamatrixCodeReader;
}

// Dynamic import: @zxing stays out of the initial PWA chunk and loads only on a device with no native
// DataMatrix-capable BarcodeDetector (iOS Safari) whose shopper actually opened the scanner. Bundled —
// never a CDN.
async function loadBundledDecoder(): Promise<FallbackDecoder | null> {
  try {
    const BrowserDatamatrixCodeReader = await importBundledDatamatrixReader();
    const reader = new BrowserDatamatrixCodeReader();
    return {
      decode: async (stream, video) => (await reader.decodeOnceFromStream(stream, video)).getText(),
      cancel: () => reader.reset(),
    };
  } catch {
    return null;
  }
}
