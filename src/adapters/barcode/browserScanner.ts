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
// "yes" minutes later. Caching the first answer would pin such a device to the ~76 kB zxing fallback for
// the rest of the session; the query is cheap, so it is repeated rather than memoised. Do not "optimise"
// it into a module-level cache.
// Decode-only: no image recognition (Bible, Engineering/in-store-navigation §dependencies).
import {
  type CaptureCapabilityFacts,
  type CaptureRangeFacts,
  type TrackFacts,
  beginScannerRun,
  publishScanner,
} from '../../diagnostics/bus';
import type { ScanOutcome, ScanTarget, ScannerPort } from '../../domain/ports';
import { type FrameDecoder, type FrameLoopDeps, runFrameLoop } from './frameLoop';
import { loadZxingFrameDecoder } from './zxingFrameDecoder';

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

// getSupportedConstraints is optional here, unlike getUserMedia: every existing caller of this file
// constructs a mediaDevices double with only getUserMedia, and requiring the new method on all of them
// (as a bare Pick would) breaks every one for a probe those tests never asked to exercise. Its real
// default, navigator.mediaDevices, always has both, so production is unaffected either way.
type ScannerMediaDevices = Pick<MediaDevices, 'getUserMedia'> &
  Partial<Pick<MediaDevices, 'getSupportedConstraints'>>;

export interface ScannerDeps {
  mediaDevices?: ScannerMediaDevices | undefined;
  // Async because the platform's DataMatrix support can only be learned from the asynchronous static
  // BarcodeDetector.getSupportedFormats() — see defaultNativeDetector.
  createNativeDetector?: () => Promise<NativeDetector | null>;
  // A FRAME decoder, not a stream decoder: the retry loop is runFrameLoop's, so what this hands back
  // decodes exactly one canvas per call. That is what makes the attempt count and the five fallback
  // durations observable at all — inside zxing's own decodeOnce they were not.
  loadFallbackDecoder?: () => Promise<FrameDecoder | null>;
  // Handed straight to runFrameLoop, unread here. Production passes nothing and the loop uses its own
  // defaults; this exists because the loop's frame plumbing cannot run under jsdom at all — getContext()
  // returns null AND prints a "Not implemented" error per attempt — so without a way through, every
  // fallback-path test in this adapter would either measure a canvas that never got drawn on or drown
  // the run in stderr. Same discipline as the four seams above: injectable, defaulted, never branched on.
  frameLoop?: FrameLoopDeps;
  pollIntervalMs?: number;
  // Injectable so decoderReadyMs is assertable without a real clock. Must be epoch-compatible
  // (Date.now-based): the diagnostics panel stamps startedAt from this clock but computes 경과 against
  // its own Date.now(), so a non-epoch clock (e.g. performance.now) would render nonsense elapsed times.
  now?: () => number;
}

export function createBrowserScanner(deps: ScannerDeps = {}): ScannerPort {
  const media =
    'mediaDevices' in deps
      ? deps.mediaDevices
      : typeof navigator === 'undefined'
        ? undefined
        : navigator.mediaDevices;
  const createNative = deps.createNativeDetector ?? defaultNativeDetector;
  const loadFallback = deps.loadFallbackDecoder ?? loadZxingFrameDecoder;
  const pollMs = deps.pollIntervalMs ?? 200;
  const now = deps.now ?? Date.now;
  // Captured here like the five above, rather than read as deps.frameLoop at the call site: one place
  // where the deps object stops mattering, so a caller mutating it after construction cannot change what
  // a run in flight uses.
  const frameLoopDeps = deps.frameLoop;

  // The scan body keeps its many exit points; wrapping it means the outcome is published at exactly one
  // place, so a future early return cannot silently skip instrumentation.
  const runScan = async (target: ScanTarget, signal: AbortSignal): Promise<ScanOutcome> => {
    if (!media?.getUserMedia) return { kind: 'unsupported' };
    if (signal.aborted) return { kind: 'cancelled' };
    // DECODER FIRST, CAMERA SECOND. Deciding native-vs-fallback — the platform's async DataMatrix
    // support query, and then the fallback's dynamic import of the ~76 kB of @zxing chunks, which on a
    // cold iOS Safari cache can take seconds — before touching getUserMedia buys two guarantees the
    // reverse order cannot: (a) a device with no way to decode never has its camera switched on at
    // all, and (b) a shopper who closes the overlay while either is in flight aborts a run that owns
    // no camera, so nothing can outlive the overlay.
    const decoderStart = now();
    let native: NativeDetector | null = null;
    let fallback: FrameDecoder | null = null;
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
    // Stamped around getUserMedia alone. On iOS Safari this call does not settle until the shopper
    // answers the permission prompt, so on a first-of-session run this number is mostly HUMAN time —
    // which is exactly why it has to be separable from the run total (decodeMs), and why a baseline
    // taken with a prompt cannot be compared against a later run that had none (§B30-11).
    const cameraStart = now();
    try {
      // Resolution is a correctness input, not a nicety: a DAISO DataMatrix is ~5-8 mm, and at the
      // common 640x480 default its modules fall under the pixels-per-module floor a decoder needs.
      // `ideal` only — `exact`/`min` would raise OverconstrainedError on a camera that cannot reach
      // the target, converting a blurry-but-usable device into an outright failure.
      stream = await media.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
    } catch (err) {
      // cameraMs stays null here on purpose: no camera was acquired, so there is no acquisition
      // duration to report. A number would read as "the camera came up in Nms" when it never did.
      publishScanner({ cameraError: (err as { name?: string } | null)?.name ?? 'UnknownError' });
      // A denial is the shopper's choice, not an error state to dramatize. `unsupported` asserts a
      // permanent capability fact about this device — it's reserved for "there is no getUserMedia API
      // at all" and "no usable decoder" (no DataMatrix-capable native detector AND no bundled
      // fallback), both settled above before the camera. Any other getUserMedia rejection here
      // (camera busy, no device, unknown) is transient — the camera may well work on retry — so it is
      // `failed`, never `unsupported`, to avoid fabricating a fact this device doesn't actually have.
      return { kind: isPermissionDenial(err) ? 'permissionDenied' : 'failed' };
    }
    publishScanner({ track: readTrackFacts(stream, media), cameraMs: now() - cameraStart });
    const stopCamera = () => {
      for (const track of stream.getTracks()) track.stop();
    };
    try {
      if (signal.aborted) return { kind: 'cancelled' };
      // INSIDE this try, so even a failure mode applyScanZoom itself did not anticipate is caught below and
      // still passes through the finally that stops the camera. Before attach() so no frame the decode loop
      // ever sees is unzoomed — an awaited reconfiguration that landed mid-loop would contaminate the
      // measurement with a mixture of zoomed and unzoomed frames. The "nothing suspends between attach()
      // and the abort listener" ordering scanWithNative depends on is about what comes AFTER attach, so an
      // await placed here does not disturb it.
      //
      // Note the resolution on the 해상도 line was stamped in the publish above, i.e. BEFORE this — so it
      // reports the track settings as acquired, not as reconfigured.
      await applyScanZoom(stream, now);
      // BOTH paths need this now. The old stream-level fallback bound the stream itself, inside
      // zxing's decodeOnceFromStream -> attachStreamToVideo; runFrameLoop does not, because it only
      // ever copies frames OUT of a <video> somebody else fed. Without this the camera would be on
      // with no frames reaching the canvas — and no unit test would catch it, since they all inject
      // decoder doubles. Placed after the aborted guard so an abandoned run never binds a stream, and
      // with nothing suspending between here and either path's abort listener, so the ordering
      // scanWithNative depends on is unchanged.
      attach(target.video, stream);
      if (native) return await scanWithNative(native, target, signal, pollMs);
      // Narrowed by the `!native && !fallback` guard above — reaching here means fallback is set.
      return await runFrameLoop(fallback as FrameDecoder, target, signal, frameLoopDeps);
    } catch {
      return { kind: 'failed' };
    } finally {
      // The camera is never left running — success, cancel and failure all pass through here.
      stopCamera();
    }
  };

  return {
    async scan(target, signal) {
      const startedAt = now();
      beginScannerRun(startedAt);
      const outcome = await runScan(target, signal);
      publishScanner({ outcome: outcome.kind, decodeMs: now() - startedAt });
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
function readTrackFacts(
  stream: MediaStream,
  media: ScannerMediaDevices | undefined,
): TrackFacts | null {
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
      supportedImageCaptureConstraints: readSupportedImageCaptureConstraints(media),
      imageCaptureCapabilities: readImageCaptureCapabilities(track),
    };
  } catch {
    return null;
  }
}

// The five MediaStream Image Capture keys this probe cares about. Not the whole ~20-entry
// MediaTrackSupportedConstraints object — the panel is read on a phone, and every other key (echoCancellation,
// sampleRate, ...) answers a question nobody here is asking. See the 2026-07-30 frame-loop measurement notes:
// the owner's real complaint (a native scanner reads a near subject that this app's decoder does not) looks
// like a focus problem, not a decode-speed one, and this is the capability check that has to run BEFORE any
// focus code is written — if the platform never names `focusMode`, that code would be a silent no-op.
const IMAGE_CAPTURE_KEYS = [
  'focusMode',
  'focusDistance',
  'zoom',
  'torch',
  'pointsOfInterest',
] as const;
type ImageCaptureKey = (typeof IMAGE_CAPTURE_KEYS)[number];

// lib.dom's MediaTrackSupportedConstraints / MediaTrackCapabilities do not declare any of the five keys
// above — they are non-standard extensions Chrome implements and WebKit historically does not, so
// TypeScript only ships the intersection every UA agrees on. Each alias below ADDS optional properties on
// top of the real interface; because every added property is optional, a genuine
// MediaTrackSupportedConstraints/MediaTrackCapabilities value — which never has to name any of them — is
// directly assignable to the wider alias. That is what lets the reads below happen with no cast.
type ExtendedSupportedConstraints = MediaTrackSupportedConstraints &
  Partial<Record<ImageCaptureKey, boolean>>;
type ExtendedCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  focusDistance?: MediaSettingsRange;
  zoom?: MediaSettingsRange;
  torch?: boolean;
  pointsOfInterest?: unknown;
};
// The WRITE and READ-BACK halves of the same omission: lib.dom declares `zoom` on neither
// MediaTrackConstraintSet nor MediaTrackSettings. Same technique as the two aliases above, in both
// directions — each alias only ADDS an optional property, so a genuine value of the real interface stays
// assignable to it (read back), and a value of the alias stays assignable to the real interface the DOM
// method expects (written into applyConstraints). No cast is needed at either end.
type ExtendedConstraintSet = MediaTrackConstraintSet & { zoom?: number };
type ExtendedSettings = MediaTrackSettings & { zoom?: number };

// null = getSupportedConstraints is absent on this platform, or the call threw — an honest "we don't
// know", never reported as an empty list (which would read as "the platform supports none of them").
function readSupportedImageCaptureConstraints(
  media: ScannerMediaDevices | undefined,
): string[] | null {
  if (typeof media?.getSupportedConstraints !== 'function') return null;
  const supported: ExtendedSupportedConstraints = media.getSupportedConstraints();
  // Per spec a supported constraint name maps to `true`; unsupported ones are simply absent, never `false`.
  // The `=== true` check mirrors that rather than trusting truthiness of a value the spec never defines.
  return IMAGE_CAPTURE_KEYS.filter((key) => supported[key] === true);
}

// null = getCapabilities is absent on this track, or the call threw — "we don't know", not a measured
// negative. Otherwise an object holding a value for each of the five keys the platform actually named —
// an absent key here means the platform did not name it, and must stay absent rather than become `false`.
function readImageCaptureCapabilities(track: MediaStreamTrack): CaptureCapabilityFacts | null {
  if (typeof track.getCapabilities !== 'function') return null;
  const capabilities: ExtendedCapabilities = track.getCapabilities();
  const facts: CaptureCapabilityFacts = {};
  if ('focusMode' in capabilities && capabilities.focusMode)
    facts.focusMode = capabilities.focusMode;
  if ('focusDistance' in capabilities && capabilities.focusDistance) {
    facts.focusDistance = toRangeFacts(capabilities.focusDistance);
  }
  if ('zoom' in capabilities && capabilities.zoom) facts.zoom = toRangeFacts(capabilities.zoom);
  // torch is a plain boolean capability (not a range), and a platform that names it CAN legitimately name
  // it `false` — that is a measured negative, distinct from the key being absent altogether.
  if ('torch' in capabilities) facts.torch = Boolean(capabilities.torch);
  // pointsOfInterest has no meaningful range — the spec reports it as `{}` when supported — so naming it
  // at all is the entire fact worth keeping; `!= null` treats an explicit null the same as absence.
  if (capabilities.pointsOfInterest != null) facts.pointsOfInterest = true;
  return facts;
}

function toRangeFacts(range: MediaSettingsRange): CaptureRangeFacts {
  return { min: range.min ?? null, max: range.max ?? null, step: range.step ?? null };
}

// THE ZOOM CEILING, and it is a correctness bound rather than a preference. An iPhone's back camera is a
// VIRTUAL multi-camera device: past the model's virtualDeviceSwitchOverVideoZoomFactors (3x or 5x depending
// on the phone) the system hands the session to the TELEPHOTO lens, and a telephoto cannot focus close. So
// an uncapped request would trade away the one case that already works — the owner reports a code held close
// decodes almost immediately — to chase the one that does not. At 2.0 or below the session stays on the wide
// lens and its minimum focus distance is unchanged. The tests pin the literal `{ zoom: 2 }` that reaches
// applyConstraints rather than reading this constant back, so lifting the cap cannot pass them.
const MAX_SCAN_ZOOM = 2;

// Applies the camera's sensor-crop zoom ONCE, before any frame can reach a decoder, and publishes what the
// platform actually did. Never throws and never rejects: a camera that cannot zoom has to scan exactly as it
// does today, and the caller's finally must remain the only thing that stops it.
//
// WHY zoom, and why it is the lever rather than a guess. The measured numbers ruled CPU out: 150 attempts in
// a 3.1 s scan is 48 attempts/sec against a 30 fps camera, so this loop already samples faster than the
// camera produces distinct frames, and the 12x rise in sample rate that got there cut wall clock only 42% —
// most frames are genuinely unreadable, not merely untried. Apple's TN2325 prescribes exactly this fix for
// barcodes: a raised videoZoomFactor "provides a higher resolution window on a smaller part of the image,
// which means there are more barcode pixels for the decoder to work with." WebKit maps the web `zoom`
// constraint straight onto AVCaptureDevice.videoZoomFactor, which is a CENTRE CROP OF THE SENSOR and not a
// software upscale — so the modules of a symbol at a fixed distance really do land on more pixels. That is
// what this decoder needs: @zxing/library ships only zxing's OLD DataMatrix detector (WhiteRectangleDetector
// plus an integer-precision transitionsBetween — see node_modules/@zxing/library/esm/core/datamatrix/
// detector/Detector.js), the one zxing documents as working on HIGH RESOLUTION scans. The sub-pixel detector
// zxing-cpp added for ~2 pixels-per-module scans is not in this package at all.
//
// Whether it works is NOT asserted here, it is measured: symbolSidePx (see zxingFrameDecoder) is the
// instrument, and the decision rule for the next real-device run is in docs/HANDOFF.md.
async function applyScanZoom(stream: MediaStream, now: () => number): Promise<void> {
  const track = stream.getVideoTracks?.()[0];
  if (!track || typeof track.applyConstraints !== 'function') return;
  const target = zoomTarget(track);
  // Nothing to ask for. zoomMs stays null rather than 0: we did not attempt a reconfiguration, and 0 would
  // claim we did and that it was free.
  if (target === null) return;
  const zoomStart = now();
  try {
    // `advanced` ONLY, and for the same reason width/height are `ideal` only (see getUserMedia above): per
    // spec an advanced constraint set the device cannot satisfy is DROPPED, never escalated into an
    // OverconstrainedError. So a camera that reported a zoom range it cannot actually honour still yields a
    // working scan instead of a failed one.
    const advanced: ExtendedConstraintSet[] = [{ zoom: target }];
    await track.applyConstraints({ advanced });
  } catch {
    // A refused reconfiguration is not a scan failure — the run continues unzoomed. The duration below is
    // still published: the wait happened and it cost what it cost.
  } finally {
    // Stamped exactly like cameraMs — the same injected epoch clock, subtracted at publish time — so the two
    // are directly comparable and neither can hide inside the other. appliedZoom is read back HERE, after
    // the await settles, because that is the only moment at which the platform's answer exists.
    publishScanner({ zoomMs: now() - zoomStart, appliedZoom: readAppliedZoom(track) });
  }
}

// The factor to request: the cap, additionally clamped DOWN to whatever ceiling this camera reported.
// null = this camera named no zoom range at all, so there is nothing to ask it for. A camera whose minimum
// exceeds the cap is deliberately still asked for the cap — `advanced` drops an unsatisfiable set, and
// raising the request to reach such a minimum would breach the lens-switch bound above.
function zoomTarget(track: MediaStreamTrack): number | null {
  if (typeof track.getCapabilities !== 'function') return null;
  try {
    const capabilities: ExtendedCapabilities = track.getCapabilities();
    const max = capabilities.zoom?.max;
    // A reported range with no max is a range whose ceiling we do not know. Ask for the cap and let
    // `advanced` drop it if the device cannot honour it, rather than inventing a ceiling.
    if (typeof max !== 'number' || !Number.isFinite(max))
      return capabilities.zoom ? MAX_SCAN_ZOOM : null;
    return Math.min(MAX_SCAN_ZOOM, max);
  } catch {
    return null;
  }
}

// What the platform says it ACTUALLY DID, never what was asked for. A requested-but-unconfirmed factor
// rendered as applied would be a fabrication — the panel would report a 2x sensor crop on a camera that
// silently ignored the request, and every later reading of symbolSidePx against it would be wrong. So an
// absent or unreadable settings.zoom is null: an honest "the platform would not say".
function readAppliedZoom(track: MediaStreamTrack): number | null {
  if (typeof track.getSettings !== 'function') return null;
  try {
    const settings: ExtendedSettings = track.getSettings();
    const zoom = settings.zoom;
    return typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : null;
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

// The stream is bound by the caller now (see attach() at the dispatch site), so this takes no
// MediaStream. Nothing else about this path moved: the same setInterval cadence, the same detect() call,
// the same outcomes — only its counter was renamed, in Task 1.
function scanWithNative(
  detector: NativeDetector,
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
    // Registered first, with nothing suspending between the caller's attach() and here, so an abort can
    // never land while this run is unable to hear it (Finding 4: a hung play() must not be a gap).
    signal.addEventListener('abort', onAbort);
    // The timer is created here, with nothing in between, so `timer` is always initialised before any
    // path can reach finish(): the already-aborted guard below would otherwise call clearInterval() on a
    // handle still in its temporal dead zone, turning an honest `cancelled` into a `failed`. Starting the
    // interval one statement early is free — its first tick cannot run until this executor returns, by
    // which point the caller's attach() has long since bound the stream.
    const timer = setInterval(() => {
      polls += 1;
      publishScanner({ decodeAttempts: polls });
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
    // addEventListener never fires for a signal that was ALREADY aborted, so without this an abort that
    // landed before the dispatch would leave a run polling forever. In today's call graph the branch is
    // UNREACHABLE — runScan checks `signal.aborted` a few statements earlier and nothing between there and
    // here suspends (attach() does not await play()), so the signal cannot become aborted in between.
    // Kept as defence-in-depth against a future await appearing on that path, not as a live guard.
    if (signal.aborted) finish({ kind: 'cancelled' });
  });
}

// The stream-level fallback that used to live here — a FallbackDecoder over
// BrowserDatamatrixCodeReader.decodeOnceFromStream, plus loadBundledDecoder and
// importBundledDatamatrixReader — is gone. It owned its own retry loop inside the library, which is
// exactly why the attempt count and the three per-attempt durations were unobservable. Its replacement
// is loadZxingFrameDecoder (one canvas per call) driven by runFrameLoop (the loop, the pacing and the
// metrics). The deep-esm-path discipline the old comment here defended now lives in
// zxingFrameDecoder.ts, guarded on that file's source text by browserScanner.test.ts.
