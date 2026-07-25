// src/adapters/barcode/browserScanner.ts
// Camera + barcode decode behind ScannerPort. Mirrors browserGeolocation's discipline: every capability
// is injected (never read off a global inside), and no path throws — failures surface as ScanOutcome
// variants. Decode-only: no image recognition (Bible, Engineering/in-store-navigation §dependencies).
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
      let stream: MediaStream;
      try {
        stream = await media.getUserMedia({ video: { facingMode: 'environment' } });
      } catch (err) {
        // A denial is the shopper's choice, not an error state to dramatize; anything else (no camera,
        // hardware busy) is reported as unsupported so no technical term reaches the copy layer.
        return { kind: isPermissionDenial(err) ? 'permissionDenied' : 'unsupported' };
      }
      const stopCamera = () => {
        for (const track of stream.getTracks()) track.stop();
      };
      try {
        if (signal.aborted) return { kind: 'cancelled' };
        const native = createNative();
        if (native) return await scanWithNative(native, stream, target, signal, pollMs);
        const fallback = await loadFallback();
        if (!fallback) return { kind: 'unsupported' };
        return await scanWithFallback(fallback, stream, target, signal);
      } catch {
        return { kind: 'failed' };
      } finally {
        // The camera is never left running — success, cancel and failure all pass through here.
        stopCamera();
      }
    },
  };
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

async function attach(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    // An autoplay rejection is not fatal: frames still flow and detect() can read them.
  }
}

async function scanWithNative(
  detector: NativeDetector,
  stream: MediaStream,
  target: ScanTarget,
  signal: AbortSignal,
  pollMs: number,
): Promise<ScanOutcome> {
  await attach(target.video, stream);
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
    signal.addEventListener('abort', onAbort);
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
    if (signal.aborted) finish({ kind: 'cancelled' });
  });
}

async function scanWithFallback(
  decoder: FallbackDecoder,
  stream: MediaStream,
  target: ScanTarget,
  signal: AbortSignal,
): Promise<ScanOutcome> {
  if (signal.aborted) return { kind: 'cancelled' };
  const onAbort = () => decoder.cancel();
  signal.addEventListener('abort', onAbort);
  try {
    const value = await decoder.decode(stream, target.video);
    return signal.aborted ? { kind: 'cancelled' } : { kind: 'decoded', value };
  } catch {
    return signal.aborted ? { kind: 'cancelled' } : { kind: 'failed' };
  } finally {
    signal.removeEventListener('abort', onAbort);
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
