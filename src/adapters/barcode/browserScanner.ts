// src/adapters/barcode/browserScanner.ts
// Camera + barcode decode behind ScannerPort. Mirrors browserGeolocation's discipline: every capability
// is INJECTABLE via ScannerDeps and defaults to the corresponding global (navigator.mediaDevices,
// globalThis.BarcodeDetector, the bundled @zxing import) read once at construction, so tests substitute
// all three without touching globals; and no path throws — failures surface as ScanOutcome variants.
// Decode-only: no image recognition (Bible, Engineering/in-store-navigation §dependencies).
import type { ScanOutcome, ScanTarget, ScannerPort } from '../../domain/ports';

// 1D retail symbologies only. QR/DataMatrix stay out: a product query has no defined QR payload, and
// D082 already removed QR as an entry mechanism — decoding one would invite a fabricated mapping.
export const SCAN_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
] as const;

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
  createNativeDetector?: () => NativeDetector | null;
  loadFallbackDecoder?: () => Promise<FallbackDecoder | null>;
  pollIntervalMs?: number;
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

  return {
    async scan(target, signal) {
      if (!media?.getUserMedia) return { kind: 'unsupported' };
      if (signal.aborted) return { kind: 'cancelled' };
      // DECODER FIRST, CAMERA SECOND. Deciding native-vs-fallback — including the fallback's dynamic
      // import of the ~415 kB @zxing chunk, which on a cold iOS Safari cache can take seconds — before
      // touching getUserMedia buys two guarantees the reverse order cannot: (a) a device with no way to
      // decode never has its camera switched on at all, and (b) a shopper who closes the overlay while
      // that import is in flight aborts a run that owns no camera, so nothing can outlive the overlay.
      let native: NativeDetector | null;
      let fallback: FallbackDecoder | null = null;
      try {
        native = createNative();
        // The import itself is not cancellable, but the WAIT for it is: untilAbort settles the moment
        // the signal fires instead of parking until the chunk lands.
        if (!native) fallback = await untilAbort(loadFallback(), signal);
      } catch {
        return { kind: 'failed' };
      }
      if (signal.aborted) return { kind: 'cancelled' }; // checked before `unsupported`: an abort is not a capability fact
      if (!native && !fallback) return { kind: 'unsupported' };
      let stream: MediaStream;
      try {
        stream = await media.getUserMedia({ video: { facingMode: 'environment' } });
      } catch (err) {
        // A denial is the shopper's choice, not an error state to dramatize. `unsupported` asserts a
        // permanent capability fact about this device — it's reserved for "there is no getUserMedia API
        // at all" and "the fallback decoder could not be loaded". Any other getUserMedia rejection here
        // (camera busy, no device, unknown) is transient — the camera may well work on retry — so it is
        // `failed`, never `unsupported`, to avoid fabricating a fact this device doesn't actually have.
        return { kind: isPermissionDenial(err) ? 'permissionDenied' : 'failed' };
      }
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

function defaultNativeDetector(): NativeDetector | null {
  const ctor = (
    globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => NativeDetector }
  ).BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: [...SCAN_FORMATS] });
  } catch {
    return null; // constructed with an unsupported format list → treat as no native detector
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

// Dynamic import: @zxing stays out of the initial PWA chunk and loads only on a device with no native
// BarcodeDetector (iOS Safari) whose shopper actually opened the scanner. Bundled — never a CDN.
async function loadBundledDecoder(): Promise<FallbackDecoder | null> {
  try {
    const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import(
      '@zxing/library'
    );
    const hints = new Map<number, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
    ]);
    const reader = new BrowserMultiFormatReader(hints as never);
    return {
      decode: async (stream, video) => (await reader.decodeOnceFromStream(stream, video)).getText(),
      cancel: () => reader.reset(),
    };
  } catch {
    return null;
  }
}
