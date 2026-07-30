// The diagnostics flag is frozen at module init in production, so the tests swap it through vi.mock —
// the same idiom bus.test.ts uses. Hoisted above the imports because vi.mock is hoisted too.
const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../diagnostics/enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import { getSnapshot, resetDiagnostics } from '../../diagnostics/bus';
import type { ScanTarget } from '../../domain/ports';
import { SCAN_FORMATS, type ScannerDeps, createBrowserScanner } from './browserScanner';
import type { FrameDecoder } from './frameLoop';

function fakeTrack() {
  return {
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
}
function fakeStream(track: { stop: () => void }) {
  return { getTracks: () => [track] } as unknown as MediaStream;
}
// Every path now goes through attach(), so play() must exist on BOTH paths — it used to be needed only
// by the native one. videoWidth/videoHeight are here for the same reason: the fallback path runs the real
// runFrameLoop, which SKIPS a frame with no dimensions and would otherwise spin forever without ever
// calling the injected decoder.
function fakeTarget(): ScanTarget {
  // jsdom has no real media playback; play() must resolve for attach() to proceed.
  const video = {
    srcObject: null,
    play: async () => {},
    videoWidth: 640,
    videoHeight: 480,
  } as unknown as HTMLVideoElement;
  return { video };
}

// The frame-level replacement for the old `{ decode, cancel }` stream-level double: one canvas in, a
// value or a miss out, with the retrying now owned by runFrameLoop rather than by the decoder.
function frameDecoder(decodeFrame: () => Promise<string | null>, dispose = () => {}): FrameDecoder {
  return { decodeFrame, dispose };
}

// Every fallback-path test below drives the REAL runFrameLoop, and jsdom has no canvas: getContext()
// returns null and ALSO prints a "Not implemented" error to stderr on every single attempt. So the loop's
// frame plumbing is injected here, exactly as frameLoop.test.ts injects it — the difference being that
// there it is the subject and here it is scenery. What these tests are for is the ADAPTER's wiring: that
// the loop is reached at all, that the stream is attached before it, that its outcomes and its counters
// come back out. The loop's own pacing, metric arithmetic and abort contracts are pinned in
// frameLoop.test.ts against an injected clock, and are deliberately not re-asserted here.
//
// minIntervalMs 0 matches the shipped FRAME_LOOP_MIN_INTERVAL_MS default (see frameLoop.ts), and is
// spelled out explicitly rather than relied on so a retrying test does not silently pick up wall-clock
// pacing if that default ever changes. `now` is deliberately NOT injected: two tests below pin exact read
// counts on the SCANNER's clock, and the loop keeping its own clock (monotonicNow, not the scanner's) is
// what makes those counts stable.
//
// nextFrame MUST yield to a macrotask. A synchronous callback plus minIntervalMs 0 gives the loop no
// path back to the macrotask queue at all, so a decoder double that keeps missing starves vitest's own
// timeout timer: the suite hangs forever with no failure and no output. Cheap here — every test below
// settles within a couple of attempts — and the one thing standing between the next such test and a
// wedged CI run.
function frameLoopStub() {
  return {
    minIntervalMs: 0,
    nextFrame: (cb: () => void) => {
      setTimeout(cb, 0);
    },
    copyFrame: () => {},
    createCanvas: () => ({ width: 0, height: 0 }) as HTMLCanvasElement,
  };
}

// The tests below exercise the DEFAULT native-detector resolution (createNativeDetector left out of the
// deps), which reads globalThis.BarcodeDetector — so each one installs a stub and afterEach removes it.
function installNativeBarcodeDetector(ctor: unknown): void {
  (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = ctor;
}
afterEach(() => {
  // Assigned rather than deleted (biome noDelete); the adapter treats a falsy ctor as "no native
  // detector", which is exactly the absent-BarcodeDetector platform the other tests assume.
  (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = undefined;
});

test('only DataMatrix is scanned', () => {
  // DAISO packaging carries a DataMatrix whose payload is exactly the pdNo. A 1D barcode on the same
  // package encodes a different number entirely, so decoding one would query the wrong product.
  expect(SCAN_FORMATS).toEqual(['data_matrix']);
});

// A barrel import would pull every 1D and 2D decoder into the lazy chunks: measured on this tree
// (2026-07-30), the four deep specifiers total 76.31 kB on disk and swapping just one for the bare barrel
// takes that to 417.38 kB — which destroys the very baseline this stage measures against. @zxing/library
// declares no sideEffects, so nothing in the barrel can be tree-shaken away. A guard on the SOURCE TEXT
// rather than on the resolved modules, because the failure being prevented is a bundling failure: a barrel
// specifier and a deep one both resolve to working classes at runtime, so nothing observable at runtime
// tells them apart — only the emitted chunk size does, and that is not visible from inside a test.
//
// The pattern deliberately matches `import(` as well as `from`: every zxing specifier in the decoder is a
// DYNAMIC import, so a `from`-only pattern would find nothing and the guard would pass vacuously — which
// is what the count assertion is here to catch.
//
// STRENGTHENED (2026-07-30 whole-branch review). The old shape had two holes: `^@zxing/library/esm/` admits
// `esm/index` (a 100-export barrel) and `esm/browser` (a barrel of every Browser*Reader — the likelier
// typo of the two), and it read ONE file's text, so a barrel added anywhere else in src was invisible.
// A real segment path is now required, and every non-test source file in src is swept.
const DEEP_ZXING_PATH = /^@zxing\/library\/esm\/(?:core|browser)\/[^']+$/;
const ZXING_SPECIFIER = /(?:from|import)\s*\(?\s*'(@zxing\/library[^']*)'/g;
// Vite's eager raw glob — the repo idiom for source-text guards, and typed by vite/client rather than
// node:fs, which is not a dependency here. Relative to this file, so `../../**` is all of src.
const sourceFiles = import.meta.glob('../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// The rejection cases first, on literal strings: a guard whose regex is wrong would otherwise pass simply
// because today's four specifiers happen to be fine.
test('the deep-path guard rejects the bare barrel and both esm barrel spellings', () => {
  expect('@zxing/library').not.toMatch(DEEP_ZXING_PATH);
  expect('@zxing/library/esm/index').not.toMatch(DEEP_ZXING_PATH);
  expect('@zxing/library/esm/browser').not.toMatch(DEEP_ZXING_PATH);
  // And it still admits the real thing, one from each of the two segments in use.
  expect('@zxing/library/esm/core/BinaryBitmap').toMatch(DEEP_ZXING_PATH);
  expect('@zxing/library/esm/browser/HTMLCanvasElementLuminanceSource').toMatch(DEEP_ZXING_PATH);
});

test('nothing in src imports @zxing/library except by a deep esm path', () => {
  let found = 0;
  for (const [path, text] of Object.entries(sourceFiles)) {
    // Test files are not shipped, and this file itself carries the barrel spellings above as data.
    if (path.includes('.test.')) continue;
    for (const match of String(text).matchAll(ZXING_SPECIFIER)) {
      found += 1;
      expect(`${path}: ${match[1]}`).toMatch(
        /: @zxing\/library\/esm\/(?:core|browser)\/[^']+$/, // DEEP_ZXING_PATH, with the file named on failure
      );
    }
  }
  // The four in zxingFrameDecoder.ts and nowhere else. An exact count, so neither a vacuous sweep (glob
  // returning nothing) nor a fifth import slipping in unreviewed can pass.
  expect(found).toBe(4);
});

// The old test here — `importBundledDatamatrixReader` hands back BrowserDatamatrixCodeReader, whose
// `.reader` is a DataMatrixReader and not a MultiFormatReader that would decode 1D again — went with
// that function. Its guarantee did not: zxingFrameDecoder.test.ts's 'the zxing parts load and are
// constructible' now asserts the same two things about the same production import site (the await
// rejects if a package upgrade moves the deep path; `parts.reader.constructor.name` changes if someone
// swaps in a reader that reads the packaging's EAN as if it were a pdNo).

test('a native detector that cannot read DataMatrix is not used — the bundled decoder is', async () => {
  const track = fakeTrack();
  let constructed = 0;
  class OneDimensionalOnlyDetector {
    static getSupportedFormats = async () => ['ean_13', 'code_128', 'qr_code'];
    constructor() {
      constructed += 1;
    }
    async detect() {
      return [{ rawValue: '8801234567890' }]; // the 1D code on the packaging — NOT the pdNo
    }
  }
  installNativeBarcodeDetector(OneDimensionalOnlyDetector);
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    loadFallbackDecoder: async () => frameDecoder(async () => '1031166'),
    frameLoop: frameLoopStub(),
    pollIntervalMs: 1,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'decoded',
    value: '1031166',
  });
  // Building it anyway would hang the overlay on a detector whose detect() can never fire for
  // DataMatrix — or, worse, hand back the packaging's 1D number as if it were the pdNo.
  expect(constructed).toBe(0);
  expect(track.stopped).toBe(true);
});

test('a native detector that supports DataMatrix is used, asked for data_matrix and nothing else', async () => {
  const track = fakeTrack();
  let requestedFormats: string[] | undefined;
  class DataMatrixCapableDetector {
    static getSupportedFormats = async () => ['ean_13', 'data_matrix', 'qr_code'];
    constructor(options: { formats: string[] }) {
      requestedFormats = options.formats;
    }
    async detect() {
      return [{ rawValue: '1031166' }];
    }
  }
  installNativeBarcodeDetector(DataMatrixCapableDetector);
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    loadFallbackDecoder: async () => {
      throw new Error('the bundled chunk must not be loaded when the platform can decode');
    },
    pollIntervalMs: 1,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'decoded',
    value: '1031166',
  });
  expect(requestedFormats).toEqual(['data_matrix']);
  expect(track.stopped).toBe(true);
});

test('a native detector whose support query rejects falls back instead of throwing', async () => {
  const track = fakeTrack();
  class BrokenDetector {
    static getSupportedFormats = async (): Promise<string[]> => {
      throw new Error('support query blew up');
    };
    async detect() {
      return [];
    }
  }
  installNativeBarcodeDetector(BrokenDetector);
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    loadFallbackDecoder: async () => frameDecoder(async () => '1031166'),
    frameLoop: frameLoopStub(),
  });
  // Unknown support is not usable support: the port never throws, it degrades to the bundled decoder.
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'decoded',
    value: '1031166',
  });
  expect(track.stopped).toBe(true);
});

test('no DataMatrix support and no bundled decoder is unsupported, camera never opened', async () => {
  let getUserMediaCalls = 0;
  class OneDimensionalOnlyDetector {
    static getSupportedFormats = async () => ['ean_13'];
    async detect() {
      return [];
    }
  }
  installNativeBarcodeDetector(OneDimensionalOnlyDetector);
  const scanner = createBrowserScanner({
    mediaDevices: {
      getUserMedia: async () => {
        getUserMediaCalls += 1;
        return fakeStream(fakeTrack());
      },
    },
    loadFallbackDecoder: async () => null,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'unsupported',
  });
  // A detector that exists but cannot read DataMatrix is no decoder at all — so the camera light must
  // never come on, exactly as when BarcodeDetector is absent entirely.
  expect(getUserMediaCalls).toBe(0);
});

test('closing the overlay during the native support check cancels, with no camera and no chunk load', async () => {
  const controller = new AbortController();
  let getUserMediaCalls = 0;
  let fallbackLoads = 0;
  const scanner = createBrowserScanner({
    mediaDevices: {
      getUserMedia: async () => {
        getUserMediaCalls += 1;
        return fakeStream(fakeTrack());
      },
    },
    // getSupportedFormats() is async and can hang on a slow device — the wait for it must be as
    // abortable as the wait for the bundled chunk below.
    createNativeDetector: () => new Promise(() => {}),
    loadFallbackDecoder: async () => {
      fallbackLoads += 1;
      return frameDecoder(async () => '1031166');
    },
    // No frameLoop stub: this run aborts before the decoder is even loaded, so the loop is never reached
    // and a stub here would be dead configuration pretending to matter.
  });
  const pending = scanner.scan(fakeTarget(), controller.signal);
  await Promise.resolve(); // let scan() reach the await on the support check
  controller.abort();
  await expect(pending).resolves.toEqual({ kind: 'cancelled' });
  expect(getUserMediaCalls).toBe(0);
  // An already-abandoned run must not go on to pull the lazy decoder chunk either.
  expect(fallbackLoads).toBe(0);
});

test('decodes with the native detector and stops the camera', async () => {
  const track = fakeTrack();
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: async () => ({ detect: async () => [{ rawValue: '19987' }] }),
    pollIntervalMs: 1,
  });
  const outcome = await scanner.scan(fakeTarget(), new AbortController().signal);
  expect(outcome).toEqual({ kind: 'decoded', value: '19987' });
  expect(track.stopped).toBe(true);
});

test('a permission denial is an outcome, never a throw', async () => {
  const scanner = createBrowserScanner({
    mediaDevices: {
      getUserMedia: async () => {
        const err = new Error('denied');
        err.name = 'NotAllowedError';
        throw err;
      },
    },
    createNativeDetector: async () => null,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'permissionDenied',
  });
});

test('no camera API at all reports unsupported', async () => {
  const scanner = createBrowserScanner({
    mediaDevices: undefined,
    createNativeDetector: async () => null,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'unsupported',
  });
});

test('falls back to the bundled decoder when no native detector exists', async () => {
  const track = fakeTrack();
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: async () => null,
    loadFallbackDecoder: async () => frameDecoder(async () => '1031166'),
    frameLoop: frameLoopStub(),
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'decoded',
    value: '1031166',
  });
  expect(track.stopped).toBe(true);
});

// THE ONE THING THIS REWIRING COULD BREAK WITH EVERY OTHER TEST STILL GREEN. The stream-level fallback
// bound the stream itself, deep inside zxing (decodeOnceFromStream -> attachStreamToVideo); runFrameLoop
// does not, because it only copies frames out of a <video> somebody else fed. Every other fallback test
// in this file injects a decoder double that answers from a closure and never looks at its canvas, so all
// of them would keep passing with attach() deleted — while a real iPhone would show a live camera whose
// frames never reach the decoder, and a scan that simply never resolves. So the binding is asserted
// directly, on the fallback path, rather than inferred from an outcome.
test('the fallback path attaches the stream to the video, or the loop copies nothing', async () => {
  const track = fakeTrack();
  const stream = fakeStream(track);
  let playCalls = 0;
  const video = {
    srcObject: null,
    play: async () => {
      playCalls += 1;
    },
    videoWidth: 640,
    videoHeight: 480,
  } as unknown as HTMLVideoElement;
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => stream },
    createNativeDetector: async () => null,
    loadFallbackDecoder: async () => frameDecoder(async () => '1031166'),
    frameLoop: frameLoopStub(),
  });
  await expect(scanner.scan({ video }, new AbortController().signal)).resolves.toEqual({
    kind: 'decoded',
    value: '1031166',
  });
  expect(video.srcObject).toBe(stream);
  // Playback matters as much as the binding: a paused <video> has dimensions but hands drawImage the
  // same frozen first frame forever.
  expect(playCalls).toBe(1);
});

test('an unloadable fallback decoder reports unsupported without ever opening the camera', async () => {
  let getUserMediaCalls = 0;
  const scanner = createBrowserScanner({
    mediaDevices: {
      getUserMedia: async () => {
        getUserMediaCalls += 1;
        return fakeStream(fakeTrack());
      },
    },
    createNativeDetector: async () => null,
    loadFallbackDecoder: async () => null,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'unsupported',
  });
  // Decoder-before-camera: with no way to decode, the camera light must never come on at all.
  expect(getUserMediaCalls).toBe(0);
});

// The iOS Safari path, and the reason the decoder is resolved BEFORE the camera. The ~76 kB of @zxing
// chunks can take seconds on a cold cache; a shopper who closes the overlay during it aborts a scan that
// has not yet touched getUserMedia. Under a camera-first ordering this run would leave the camera on
// until the import settled — here there is no camera to leave on, and the abort is heard immediately
// instead of only after the chunks land.
test('closing the overlay while the decoder is still loading cancels and never starts the camera', async () => {
  const controller = new AbortController();
  let getUserMediaCalls = 0;
  const scanner = createBrowserScanner({
    mediaDevices: {
      getUserMedia: async () => {
        getUserMediaCalls += 1;
        return fakeStream(fakeTrack());
      },
    },
    createNativeDetector: async () => null,
    loadFallbackDecoder: () => new Promise(() => {}), // import in flight, never settles
  });
  const pending = scanner.scan(fakeTarget(), controller.signal);
  await Promise.resolve(); // let scan() reach the await on the import
  controller.abort();
  await expect(pending).resolves.toEqual({ kind: 'cancelled' });
  expect(getUserMediaCalls).toBe(0);
});

test('abort cancels an in-progress native scan and always stops the camera', async () => {
  const track = fakeTrack();
  const controller = new AbortController();
  let resolveGetUserMedia!: (stream: MediaStream) => void;
  const getUserMediaPromise = new Promise<MediaStream>((resolve) => {
    resolveGetUserMedia = resolve;
  });
  let resolveFirstDetect!: () => void;
  const firstDetect = new Promise<void>((resolve) => {
    resolveFirstDetect = resolve;
  });
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => getUserMediaPromise },
    // never decodes — the camera stays open until abort (Bible: decode failure keeps the camera open)
    createNativeDetector: async () => ({
      detect: async () => {
        resolveFirstDetect();
        return [];
      },
    }),
    pollIntervalMs: 1,
  });
  const pending = scanner.scan(fakeTarget(), controller.signal);
  resolveGetUserMedia(fakeStream(track));
  // Wait until the native polling loop has actually run at least once — proves the abort below lands
  // while scanWithNative's interval and abort listener are live, not while still suspended on
  // getUserMedia (a vacuous version of this test could pass via the early aborted-before-camera guard).
  await firstDetect;
  controller.abort();
  await expect(pending).resolves.toEqual({ kind: 'cancelled' });
  expect(track.stopped).toBe(true);
});

test('abort cancels the scan even when video.play() never settles (a real-device stall)', async () => {
  const track = fakeTrack();
  const controller = new AbortController();
  let resolveFirstDetect!: () => void;
  const firstDetect = new Promise<void>((resolve) => {
    resolveFirstDetect = resolve;
  });
  const video = {
    srcObject: null,
    play: () => new Promise<void>(() => {}), // never settles — simulates a hung real-device play()
  } as unknown as HTMLVideoElement;
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: async () => ({
      detect: async () => {
        resolveFirstDetect();
        return [];
      },
    }),
    pollIntervalMs: 1,
  });
  const pending = scanner.scan({ video }, controller.signal);
  // detect() only runs once the polling loop has started — proves a hung play() did not block it.
  await firstDetect;
  controller.abort();
  await expect(pending).resolves.toEqual({ kind: 'cancelled' });
  expect(track.stopped).toBe(true);
});

test('a transient detect() failure keeps scanning instead of failing the run', async () => {
  const track = fakeTrack();
  let calls = 0;
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: async () => ({
      detect: async () => {
        calls += 1;
        if (calls === 1) throw new Error('frame not ready');
        return [{ rawValue: '19987' }];
      },
    }),
    pollIntervalMs: 1,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'decoded',
    value: '19987',
  });
});

// REWRITTEN for the frame seam, not renamed. The old test asserted that cancel() REJECTS the in-flight
// decode, which is how the stream-level reader was interrupted. That mechanism no longer exists:
// dispose() interrupts nothing, cancellation happens between attempts, and an in-flight decodeFrame runs
// to completion regardless. So the thing worth pinning is the opposite of the old one — the decode is
// deliberately released with a REAL value AFTER the abort, and the loop's post-decode aborted re-check is
// the only thing standing between a closed overlay and a `decoded` that would fire an availability
// lookup for a scanner nobody is looking at.
test('an abort during an in-flight fallback decode is cancelled even when that decode then succeeds', async () => {
  const track = fakeTrack();
  const controller = new AbortController();
  let disposeCalls = 0;
  let releaseDecode!: (value: string) => void;
  const pendingDecode = new Promise<string>((resolve) => {
    releaseDecode = resolve;
  });
  let resolveDecodeStarted!: () => void;
  const decodeStarted = new Promise<void>((resolve) => {
    resolveDecodeStarted = resolve;
  });
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: async () => null,
    loadFallbackDecoder: async () =>
      frameDecoder(
        async () => {
          resolveDecodeStarted();
          return pendingDecode;
        },
        () => {
          disposeCalls += 1;
        },
      ),
    frameLoop: frameLoopStub(),
  });
  const pending = scanner.scan(fakeTarget(), controller.signal);
  // runFrameLoop registers its abort listener before the first attempt, so waiting for decodeFrame to
  // start guarantees the listener is already live when we abort below.
  await decodeStarted;
  controller.abort();
  releaseDecode('1031166'); // the frame decodes fine — it just landed too late to matter
  await expect(pending).resolves.toEqual({ kind: 'cancelled' });
  // dispose() is still the teardown contract, it just no longer interrupts anything.
  expect(disposeCalls).toBe(1);
  expect(track.stopped).toBe(true);
});

test('a fallback decoder rejection reports failed and stops the camera', async () => {
  const track = fakeTrack();
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: async () => null,
    loadFallbackDecoder: async () =>
      frameDecoder(async () => {
        throw new Error('decode error');
      }),
    frameLoop: frameLoopStub(),
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'failed',
  });
  expect(track.stopped).toBe(true);
});

test('a successful fallback decode still releases the decoder', async () => {
  const track = fakeTrack();
  let disposeCalls = 0;
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: async () => null,
    loadFallbackDecoder: async () =>
      frameDecoder(
        async () => '1031166',
        () => {
          disposeCalls += 1;
        },
      ),
    frameLoop: frameLoopStub(),
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'decoded',
    value: '1031166',
  });
  // Success is a teardown too, and exactly once: the loop's abort listener and its finally must not
  // double-dispose a decoder that a future stage may back with a wasm instance.
  expect(disposeCalls).toBe(1);
});

// REWRITTEN too, and its outcome inverted. Under the stream seam an empty decode was terminal —
// `failed` — because the library's own retry loop had already given up by the time it answered. Under
// the frame seam an empty string is one frame's miss, indistinguishable from the `null` the contract
// asks for, so the loop keeps the camera open and tries the next frame (Bible: a decode failure keeps
// the camera open). What must NEVER happen is unchanged: '' handed upward as a decoded value would run
// an availability lookup for nothing at all.
test('an empty fallback decode is retried, never handed up as a decoded empty value', async () => {
  const track = fakeTrack();
  let calls = 0;
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: async () => null,
    loadFallbackDecoder: async () =>
      frameDecoder(async () => {
        calls += 1;
        return calls < 2 ? '' : '1031166';
      }),
    frameLoop: frameLoopStub(),
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'decoded',
    value: '1031166',
  });
  // The decisive assertion: had '' ended the run, this would be 1 and the outcome above would have been
  // `{ kind: 'decoded', value: '' }`.
  expect(calls).toBe(2);
  expect(track.stopped).toBe(true);
});

test('an abort landing while the camera is being acquired still stops it', async () => {
  const track = fakeTrack();
  const controller = new AbortController();
  // The shopper closes the overlay while getUserMedia is still pending (permission prompt / camera
  // warm-up). The camera is handed over AFTER the abort, so the only thing standing between this and a
  // camera that outlives the overlay is scan()'s post-acquisition aborted guard plus its finally.
  const scanner = createBrowserScanner({
    mediaDevices: {
      getUserMedia: async () => {
        controller.abort();
        return fakeStream(track);
      },
    },
    createNativeDetector: async () => ({ detect: async () => [] }),
    pollIntervalMs: 1,
  });
  await expect(scanner.scan(fakeTarget(), controller.signal)).resolves.toEqual({
    kind: 'cancelled',
  });
  expect(track.stopped).toBe(true);
});

test('a getUserMedia failure other than permission denial reports failed, not unsupported', async () => {
  const scanner = createBrowserScanner({
    mediaDevices: {
      getUserMedia: async () => {
        const err = new Error('camera busy');
        err.name = 'NotReadableError';
        throw err;
      },
    },
    createNativeDetector: async () => null,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'failed',
  });
});

describe('diagnostics instrumentation', () => {
  beforeEach(() => {
    flag.enabled = true;
    resetDiagnostics();
  });

  // Named apart from the module-level fakeStream(track) on purpose: that one takes a track object,
  // this one takes the settings the track should report. Same name, incompatible parameter.
  function fakeStreamWithSettings(settings: MediaTrackSettings): MediaStream {
    const track = { stop: () => {}, getSettings: () => settings };
    return {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
  }

  // Adds an optional getCapabilities to the track fakeStreamWithSettings makes. A second helper rather
  // than an optional parameter on the first: most tests in this file want a track that simply lacks
  // getCapabilities (the common real-world case on WebKit), and this keeps that the default without every
  // call site passing `undefined` explicitly.
  function fakeStreamWithCapabilities(
    settings: MediaTrackSettings,
    getCapabilities: () => unknown,
  ): MediaStream {
    const track = { stop: () => {}, getSettings: () => settings, getCapabilities };
    return {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
  }

  test('the native path publishes its decoder, formats, track settings and poll count', async () => {
    const detect = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ rawValue: '19987' }]);
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () =>
          fakeStreamWithSettings({ width: 1920, height: 1080, deviceId: 'cam-1' }),
      },
      createNativeDetector: async () => ({ detect }),
      pollIntervalMs: 1,
    });
    // fakeTarget(), not a bare `{} as HTMLVideoElement`: attach() calls video.play(), and a bare object
    // has none, so the TypeError would reach runScan's catch and report `failed` — measuring the stub,
    // not the instrumentation. Every test in this block needs it now: attach() runs on the fallback path
    // too, and that path additionally reads videoWidth/videoHeight to decide there is a frame to copy.
    const outcome = await scanner.scan(fakeTarget(), new AbortController().signal);
    expect(outcome).toEqual({ kind: 'decoded', value: '19987' });
    const s = getSnapshot().scanner;
    expect(s.decoderPath).toBe('native');
    expect(s.track).toMatchObject({ width: 1920, height: 1080, deviceId: 'cam-1' });
    expect(s.decodeAttempts).toBeGreaterThanOrEqual(1);
    expect(s.outcome).toBe('decoded');
    expect(s.startedAt).not.toBeNull();
    // FALLBACK-ONLY, and nothing pinned it before this: the five durations must stay null here. The
    // native loop is a setInterval that does not await the previous detect(), so attempts overlap and
    // their sum can exceed real time — a per-attempt average would be meaningless and a number on this
    // line would read as one. `decodeAttempts` is the deliberate exception: both paths count.
    expect(s.decodeBusyMs).toBeNull();
    expect(s.assembleMs).toBeNull();
    expect(s.drawMs).toBeNull();
    expect(s.loopIdleMs).toBeNull();
    expect(s.warmupMs).toBeNull();
  });

  // REWRITTEN, and its assertion inverted. The old version pinned decodeAttempts to null on this path
  // and explained why: the zxing reader retried inside the library, so there was no attempt count to
  // report and reporting 0 would have been a fabrication. That premise is gone — runFrameLoop owns the
  // retrying now, so the count is a measured fact on the fallback path and null would be the
  // fabrication. This is the whole point of the stage, so it is asserted here on the adapter's own
  // wiring and not left to frameLoop.test.ts: a rewiring that dropped the loop would still pass every
  // outcome assertion in this file, and only the count would notice.
  test('the zxing path publishes its decoder and now counts its attempts too', async () => {
    let calls = 0;
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () => fakeStreamWithSettings({ width: 640, height: 480 }),
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () =>
        frameDecoder(async () => {
          calls += 1;
          return '19987';
        }),
      frameLoop: frameLoopStub(),
    });
    await scanner.scan(fakeTarget(), new AbortController().signal);
    const s = getSnapshot().scanner;
    expect(s.decoderPath).toBe('zxing');
    expect(s.decodeAttempts).toBe(calls);
    expect(s.decodeAttempts).toBeGreaterThan(0);
    // The three fallback-only durations come with it. Exact values belong to frameLoop.test.ts; what
    // this pins is that they are measured AT ALL once the adapter is wired to the loop — with the old
    // stream-level decoder all three stayed null.
    expect(s.decodeBusyMs).not.toBeNull();
    expect(s.drawMs).not.toBeNull();
    expect(s.loopIdleMs).not.toBeNull();
    expect(s.track).toMatchObject({ width: 640, height: 480 });
  });

  // decoderReadyMs is published on both decoder exits but pinned by nothing else, so this is the only
  // guard on its arithmetic: that the elapsed time is measured from BEFORE the decoder resolution — the
  // resolution's own cost is the whole point of the number, so it has to fall inside it — and that the
  // subtraction is not inverted. The injected clock advances a fixed 5ms per read, which makes the
  // published duration an exact number rather than a range.
  //
  // now() is read four times on this path, in this order:
  //   1.  5  scan()'s beginScannerRun(now())  -> startedAt
  //   2. 10  runScan's `const decoderStart = now()`
  //   3. 15  the fallback loader below, standing in for time actually spent resolving the decoder
  //   4. 20  the success-side publishScanner({ decoderPath, decoderReadyMs })
  // so decoderReadyMs is 20 - 10 = 10. Capturing decoderStart on the far side of the await would
  // report 5 (reading 3 excluded), and an inverted subtraction would report -10.
  test('decoderReadyMs measures from before the decoder resolution and is not inverted', async () => {
    let t = 0;
    const now = () => {
      t += 5;
      return t;
    };
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () => fakeStreamWithSettings({ width: 640, height: 480 }),
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => {
        now(); // resolving the decoder is not free — this tick must land inside decoderReadyMs
        return frameDecoder(async () => '19987');
      },
      frameLoop: frameLoopStub(),
      now,
    });
    await scanner.scan(fakeTarget(), new AbortController().signal);
    const s = getSnapshot().scanner;
    expect(s.decoderReadyMs).toBe(10);
    expect(s.startedAt).toBe(5);
  });

  // The clock advances 5ms per read, and the zxing success path reads it six times in this order:
  //   1.  5  scan()'s beginScannerRun(now())            -> startedAt
  //   2. 10  runScan's `const decoderStart = now()`
  //   3. 15  the decoder publish (decoderReadyMs = 15 - 10)
  //   4. 20  `const cameraStart = now()`, just before getUserMedia
  //   5. 25  the track publish (cameraMs = 25 - 20)
  //   6. 30  scan()'s outcome publish (decodeMs = 30 - 5)
  // So the run total is 25 and the camera window is 5. The run total is deliberately larger than either
  // segment: it CONTAINS them (§B30-11). A stamp measured from the wrong anchor, or subtracted the wrong
  // way round, cannot produce these numbers.
  test('the run duration is stamped when the run settles, with the camera window inside it', async () => {
    let t = 0;
    const now = () => {
      t += 5;
      return t;
    };
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () => fakeStreamWithSettings({ width: 640, height: 480 }),
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => frameDecoder(async () => '19987'),
      frameLoop: frameLoopStub(),
      now,
    });
    await scanner.scan(fakeTarget(), new AbortController().signal);
    const s = getSnapshot().scanner;
    expect(s.startedAt).toBe(5);
    expect(s.decodeMs).toBe(25);
    expect(s.cameraMs).toBe(5);
  });

  // A camera that never came up has no acquisition duration. Reporting one — 0ms, or the time spent
  // waiting for the rejection — would read as "the camera came up", which it did not.
  test('a rejected getUserMedia leaves the camera duration unmeasured', async () => {
    const err = new Error('no camera here');
    err.name = 'NotFoundError';
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () => {
          throw err;
        },
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => frameDecoder(async () => '19987'),
      frameLoop: frameLoopStub(),
    });
    const outcome = await scanner.scan(fakeTarget(), new AbortController().signal);
    const s = getSnapshot().scanner;
    expect(outcome).toEqual({ kind: 'failed' });
    expect(s.cameraMs).toBeNull();
    // The run total is still stamped: the run itself settled, it just never owned a camera.
    expect(s.decodeMs).not.toBeNull();
  });

  // Nothing to acquire and nothing to time: the run ends before getUserMedia is ever reached.
  test('a run that never reaches the camera leaves the camera duration unmeasured', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: { getUserMedia: async () => fakeStreamWithSettings({}) },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => null,
    });
    const outcome = await scanner.scan(fakeTarget(), new AbortController().signal);
    expect(outcome).toEqual({ kind: 'unsupported' });
    expect(getSnapshot().scanner.cameraMs).toBeNull();
  });

  test('a camera rejection publishes the error name only', async () => {
    const err = new Error('user said no, and this message must not be published');
    err.name = 'NotAllowedError';
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () => {
          throw err;
        },
      },
      createNativeDetector: async () => ({ detect: async () => [] }),
    });
    await scanner.scan({ video: {} as HTMLVideoElement }, new AbortController().signal);
    const s = getSnapshot().scanner;
    expect(s.cameraError).toBe('NotAllowedError');
    expect(s.outcome).toBe('permissionDenied');
  });

  test('having no usable decoder publishes decoderPath none', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: { getUserMedia: async () => fakeStreamWithSettings({}) },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => null,
    });
    const outcome = await scanner.scan(
      { video: {} as HTMLVideoElement },
      new AbortController().signal,
    );
    expect(outcome).toEqual({ kind: 'unsupported' });
    expect(getSnapshot().scanner.decoderPath).toBe('none');
  });

  test('a stream whose tracks expose no getSettings publishes a null track instead of throwing', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () =>
          ({ getTracks: () => [{ stop: () => {} }] }) as unknown as MediaStream,
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => frameDecoder(async () => '19987'),
      frameLoop: frameLoopStub(),
    });
    const outcome = await scanner.scan(fakeTarget(), new AbortController().signal);
    expect(outcome).toEqual({ kind: 'decoded', value: '19987' });
    expect(getSnapshot().scanner.track).toBeNull();
  });

  // The camera-capability probe (2026-07-30): before any focus-control code gets written, the panel has
  // to say whether this platform even supports asking the camera to focus. Every other test in this
  // describe block already injects a mediaDevices double with no getSupportedConstraints and a track with
  // no getCapabilities — this is the common WebKit-shaped case — so this test pins that the honest
  // "we don't know" comes out, not a fabricated empty list that would read as a measured negative.
  test('a platform with neither getSupportedConstraints nor getCapabilities publishes null for both, not an empty measurement', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () => fakeStreamWithSettings({ width: 640, height: 480 }),
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => frameDecoder(async () => '19987'),
      frameLoop: frameLoopStub(),
    });
    await scanner.scan(fakeTarget(), new AbortController().signal);
    const track = getSnapshot().scanner.track;
    expect(track?.supportedImageCaptureConstraints).toBeNull();
    expect(track?.imageCaptureCapabilities).toBeNull();
  });

  // A platform can name a constraint (Chrome/Android does) on a track that still cannot report
  // getCapabilities for it — the two APIs are queried independently and must be published independently:
  // one real, one honestly unknown, never both collapsed to the same value.
  test('a platform naming focusMode is reported even when this track cannot report getCapabilities', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () => fakeStreamWithSettings({ width: 640, height: 480 }),
        getSupportedConstraints: () =>
          ({ focusMode: true, aspectRatio: true }) as unknown as MediaTrackSupportedConstraints,
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => frameDecoder(async () => '19987'),
      frameLoop: frameLoopStub(),
    });
    await scanner.scan(fakeTarget(), new AbortController().signal);
    const track = getSnapshot().scanner.track;
    // aspectRatio is a real MediaTrackSupportedConstraints key but not one of the five this probe cares
    // about — its presence must not leak into the reported list.
    expect(track?.supportedImageCaptureConstraints).toEqual(['focusMode']);
    expect(track?.imageCaptureCapabilities).toBeNull();
  });

  // Both APIs answering for real: the values getCapabilities reports must reach the bus verbatim, and a
  // capability outside the five of interest (frameRate, a real MediaTrackCapabilities key) must not leak
  // in alongside them.
  test('real capability values are published, narrowed to the five keys of interest', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () =>
          fakeStreamWithCapabilities({ width: 1920, height: 1080 }, () => ({
            focusMode: ['continuous', 'manual'],
            focusDistance: { min: 10, max: 500, step: 1 },
            zoom: { min: 1, max: 8, step: 0.1 },
            torch: true,
            pointsOfInterest: {},
            frameRate: { min: 1, max: 30 },
          })),
        getSupportedConstraints: () =>
          ({
            focusMode: true,
            focusDistance: true,
            zoom: true,
            torch: true,
            pointsOfInterest: true,
          }) as unknown as MediaTrackSupportedConstraints,
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => frameDecoder(async () => '19987'),
      frameLoop: frameLoopStub(),
    });
    await scanner.scan(fakeTarget(), new AbortController().signal);
    const track = getSnapshot().scanner.track;
    expect(track?.supportedImageCaptureConstraints).toEqual([
      'focusMode',
      'focusDistance',
      'zoom',
      'torch',
      'pointsOfInterest',
    ]);
    expect(track?.imageCaptureCapabilities).toEqual({
      focusMode: ['continuous', 'manual'],
      focusDistance: { min: 10, max: 500, step: 1 },
      zoom: { min: 1, max: 8, step: 0.1 },
      torch: true,
      pointsOfInterest: true,
    });
  });

  // torch is the one boolean-valued key of the five — the one place a fabricated `false` and a genuinely
  // absent key are hardest to tell apart by eye. A platform that never names torch at all must leave it
  // out of the published facts entirely, not default it to false.
  test('a capabilities object that never names torch does not fabricate a torch reading', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () =>
          fakeStreamWithCapabilities({ width: 640, height: 480 }, () => ({
            focusMode: ['continuous'],
          })),
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => frameDecoder(async () => '19987'),
      frameLoop: frameLoopStub(),
    });
    await scanner.scan(fakeTarget(), new AbortController().signal);
    const capabilities = getSnapshot().scanner.track?.imageCaptureCapabilities;
    expect(capabilities).toEqual({ focusMode: ['continuous'] });
    expect(capabilities).not.toHaveProperty('torch');
  });

  // THE OTHER HALF of that distinction, and the half that was pinned by nothing. A platform that NAMES torch
  // and reports it unsupported has measured a negative, and the adapter has to be able to put that on the
  // bus — a truthiness check (`if (capabilities.torch) …`) would silently drop it. report.test.ts's
  // "including an explicit false as a measured fact" does not close this: it hand-builds the fact, so it
  // proves only that a `false` RENDERS once it reaches the bus, never that the producer can produce one.
  test('a platform that names torch and reports it false publishes the measured false', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () =>
          fakeStreamWithCapabilities({ width: 640, height: 480 }, () => ({ torch: false })),
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => frameDecoder(async () => '19987'),
      frameLoop: frameLoopStub(),
    });
    await scanner.scan(fakeTarget(), new AbortController().signal);
    // Key present, value the measured `false` — not an absent key, and not a fabricated `true`.
    expect(getSnapshot().scanner.track?.imageCaptureCapabilities).toEqual({ torch: false });
  });

  // ONE THROWING QUERY MUST COST ONLY ITS OWN FIELD. Both capability queries are documented as degrading to
  // null for themselves, but the only catch used to be the one wrapping the whole of readTrackFacts — so a
  // single throw discarded width/height/frameRate/facingMode/deviceId that getSettings() had already
  // answered, and the panel would print `트랙: 없음` for a live, scanning camera.
  test('a getCapabilities that throws nulls only that field and keeps the settings the track reported', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () =>
          fakeStreamWithCapabilities({ width: 1920, height: 1080, deviceId: 'cam-1' }, () => {
            throw new Error('this camera refuses to describe itself');
          }),
        getSupportedConstraints: () =>
          ({ zoom: true }) as unknown as MediaTrackSupportedConstraints,
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => frameDecoder(async () => '19987'),
      frameLoop: frameLoopStub(),
    });
    await scanner.scan(fakeTarget(), new AbortController().signal);
    const track = getSnapshot().scanner.track;
    expect(track).toMatchObject({ width: 1920, height: 1080, deviceId: 'cam-1' });
    expect(track?.imageCaptureCapabilities).toBeNull();
    // And the independently-queried sibling field is untouched by the other one's failure.
    expect(track?.supportedImageCaptureConstraints).toEqual(['zoom']);
  });

  // The mirror image, so the symmetric guard is not left to inference. A non-object return is covered by the
  // same wrapper: `supported[key]` on a null would throw a TypeError rather than reporting a capability.
  test('a getSupportedConstraints that throws nulls only that field and keeps the rest of the facts', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () =>
          fakeStreamWithCapabilities({ width: 640, height: 480 }, () => ({ torch: true })),
        getSupportedConstraints: () => {
          throw new Error('this platform refuses to enumerate its constraints');
        },
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => frameDecoder(async () => '19987'),
      frameLoop: frameLoopStub(),
    });
    await scanner.scan(fakeTarget(), new AbortController().signal);
    const track = getSnapshot().scanner.track;
    expect(track).toMatchObject({ width: 640, height: 480 });
    expect(track?.supportedImageCaptureConstraints).toBeNull();
    expect(track?.imageCaptureCapabilities).toEqual({ torch: true });
  });

  // A track that can be asked ABOUT zoom and asked TO zoom. The three surfaces are deliberately
  // independent, because on a real device they are: a camera can report a zoom range, accept the request,
  // and still name no zoom in its settings — and the adapter must publish only what it can read back.
  // Returns the request log and the stop flag alongside the stream, so a test can assert what was asked
  // for, that it was asked exactly once, and that the camera was released either way.
  function fakeZoomStream(spec: {
    zoom?: { min?: number; max?: number; step?: number };
    settings?: MediaTrackSettings;
    onApply?: () => Promise<void>;
  }): { stream: MediaStream; requests: MediaTrackConstraints[]; stopped: () => boolean } {
    const requests: MediaTrackConstraints[] = [];
    let stopped = false;
    const track = {
      stop: () => {
        stopped = true;
      },
      getSettings: () => spec.settings ?? {},
      // Omitted entirely when the test gives no range — that is the WebKit-shaped "this camera never named
      // zoom" case, and a getCapabilities returning `{}` would be a different fact.
      ...(spec.zoom ? { getCapabilities: () => ({ zoom: spec.zoom }) } : {}),
      applyConstraints: async (constraints: MediaTrackConstraints) => {
        requests.push(constraints);
        if (spec.onApply) await spec.onApply();
      },
    };
    return {
      stream: {
        getTracks: () => [track],
        getVideoTracks: () => [track],
      } as unknown as MediaStream,
      requests,
      stopped: () => stopped,
    };
  }

  // The defaults route through the ZXING path, because that is the platform the zoom lever was written for
  // (WebKit ships no BarcodeDetector at all). `extra` is spread last so a test can override any of them —
  // and one below overrides createNativeDetector specifically, because a helper that hardcoded
  // `async () => null` would leave the native path's zoom pinned by nothing at all.
  function zoomScanner(stream: MediaStream, extra: ScannerDeps = {}) {
    return createBrowserScanner({
      mediaDevices: { getUserMedia: async () => stream },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => frameDecoder(async () => '19987'),
      frameLoop: frameLoopStub(),
      ...extra,
    });
  }

  // THE CAP, and it is a correctness bound rather than a preference: above the model's
  // virtualDeviceSwitchOverVideoZoomFactors (3x or 5x) an iPhone hands the session to the telephoto lens,
  // which cannot focus close — so an uncapped request would trade away the near-scan case that already
  // works. The measured device reports zoom 0.5~10, so without the cap this request would be 10.
  test('zoom is requested once, capped at 2, and only through the best-effort advanced list', async () => {
    const { stream, requests } = fakeZoomStream({
      zoom: { min: 0.5, max: 10, step: 0.1 },
      settings: { width: 1920, height: 1080 },
    });
    await zoomScanner(stream).scan(fakeTarget(), new AbortController().signal);
    expect(requests).toEqual([{ advanced: [{ zoom: 2 }] }]);
    // `advanced` is what makes an unsupported entry get DROPPED rather than raise OverconstrainedError —
    // the same reasoning as the ideal-only width/height rule. A top-level or exact/min zoom would turn a
    // camera that cannot honour the range it reported into a total scan failure.
    expect(JSON.stringify(requests[0])).not.toContain('exact');
    expect(JSON.stringify(requests[0])).not.toContain('ideal');
  });

  test('zoom is clamped down to the ceiling this camera reported when that is below the cap', async () => {
    const { stream, requests } = fakeZoomStream({
      zoom: { min: 1, max: 1.5, step: 0.1 },
      settings: { width: 1920, height: 1080, zoom: 1.5 },
    });
    await zoomScanner(stream).scan(fakeTarget(), new AbortController().signal);
    // Asking for 2 on a camera whose maximum is 1.5 must not happen at all.
    expect(requests).toEqual([{ advanced: [{ zoom: 1.5 }] }]);
    expect(getSnapshot().scanner.appliedZoom).toBe(1.5);
  });

  test('a camera that reports no zoom range is never asked to zoom, and no duration is invented', async () => {
    const { stream, requests } = fakeZoomStream({ settings: { width: 1920, height: 1080 } });
    await zoomScanner(stream).scan(fakeTarget(), new AbortController().signal);
    expect(requests).toEqual([]);
    const s = getSnapshot().scanner;
    // 0 would claim we asked and that a session reconfiguration was free; we never asked.
    expect(s.zoomMs).toBeNull();
    expect(s.appliedZoom).toBeNull();
  });

  test('a rejected applyConstraints leaves the scan working and still stops the camera', async () => {
    const { stream, stopped } = fakeZoomStream({
      zoom: { min: 0.5, max: 10 },
      settings: { width: 1920, height: 1080 },
      onApply: async () => {
        throw new Error('the capture session refused to reconfigure');
      },
    });
    await expect(
      zoomScanner(stream).scan(fakeTarget(), new AbortController().signal),
    ).resolves.toEqual({ kind: 'decoded', value: '19987' });
    expect(stopped()).toBe(true);
    const s = getSnapshot().scanner;
    // The wait happened and cost what it cost, so it is still reported — but nothing was applied, and this
    // platform names no zoom in its settings, so there is no applied factor to claim.
    expect(s.zoomMs).not.toBeNull();
    expect(s.appliedZoom).toBeNull();
  });

  // THE NO-FABRICATION ONE. The camera was asked for 2 and answered 1.8; publishing the request would
  // render a 2x crop that never happened, and every later reading of the symbol-size instrument against it
  // would be wrong.
  test('the applied zoom is read back from the track, never echoed from the request', async () => {
    const { stream, requests } = fakeZoomStream({
      zoom: { min: 0.5, max: 10 },
      settings: { width: 1920, height: 1080, zoom: 1.8 },
    });
    await zoomScanner(stream).scan(fakeTarget(), new AbortController().signal);
    expect(requests).toEqual([{ advanced: [{ zoom: 2 }] }]);
    expect(getSnapshot().scanner.appliedZoom).toBe(1.8);
  });

  test('a platform that names no zoom in its settings reports none applied, though one was requested', async () => {
    const { stream, requests } = fakeZoomStream({
      zoom: { min: 0.5, max: 10 },
      settings: { width: 1920, height: 1080 },
    });
    await zoomScanner(stream).scan(fakeTarget(), new AbortController().signal);
    expect(requests).toHaveLength(1);
    const s = getSnapshot().scanner;
    expect(s.appliedZoom).toBeNull();
    // zoomMs is what tells "we never asked" apart from "we asked and could not read the answer".
    expect(s.zoomMs).not.toBeNull();
  });

  // The clock advances 5ms per read, and this path reads it eight times in this order:
  //   1.  5  scan()'s beginScannerRun(now())        -> startedAt
  //   2. 10  runScan's `const decoderStart = now()`
  //   3. 15  the decoder publish (decoderReadyMs = 5)
  //   4. 20  `const cameraStart = now()`, just before getUserMedia
  //   5. 25  the track publish (cameraMs = 25 - 20 = 5)
  //   6. 30  `const zoomStart = now()`, just before the applyConstraints await
  //   7. 35  the zoom publish (zoomMs = 35 - 30 = 5)
  //   8. 40  scan()'s outcome publish (decodeMs = 40 - 5 = 35)
  // So cameraMs stays 5 with the zoom wait OUTSIDE it. Moving the zoom above the track publish — the way
  // it would hide if the two shared a stamp — makes cameraMs 15, and folding zoom into cameraMs instead of
  // giving it its own counter leaves zoomMs null. Neither mutation can produce these three numbers.
  test('the zoom wait is timed on its own and stays outside the camera window', async () => {
    let t = 0;
    const now = () => {
      t += 5;
      return t;
    };
    const { stream } = fakeZoomStream({
      zoom: { min: 0.5, max: 10 },
      settings: { width: 1920, height: 1080, zoom: 2 },
    });
    await zoomScanner(stream, { now }).scan(fakeTarget(), new AbortController().signal);
    const s = getSnapshot().scanner;
    expect(s.cameraMs).toBe(5);
    expect(s.zoomMs).toBe(5);
    expect(s.decodeMs).toBe(35);
  });

  // THE ZOOM LEVER REACHES BOTH DECODER PATHS, and nothing else in this file says so. Every other
  // applyConstraints assertion goes through zoomScanner's default `createNativeDetector: async () => null`,
  // and every native-path test elsewhere uses fakeStreamWithSettings, whose track has no getCapabilities —
  // so zoomTarget() returns null there and no native run in the suite ever reaches applyConstraints. Moving
  // `await applyScanZoom(stream, now)` below the native dispatch would therefore make zoom inert on
  // Chrome/Android — the very platform this adapter documents as able to install the Play Services barcode
  // module mid-session — with the whole suite still green.
  test('a native-detector run applies the same capped zoom as the fallback path', async () => {
    const { stream, requests } = fakeZoomStream({
      zoom: { min: 0.5, max: 10, step: 0.1 },
      settings: { width: 1920, height: 1080, zoom: 2 },
    });
    const scanner = zoomScanner(stream, {
      createNativeDetector: async () => ({ detect: async () => [{ rawValue: '19987' }] }),
      pollIntervalMs: 1,
    });
    await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
      kind: 'decoded',
      value: '19987',
    });
    expect(requests).toEqual([{ advanced: [{ zoom: 2 }] }]);
    const s = getSnapshot().scanner;
    // Guards against a vacuous pass: if the run had quietly gone down the fallback path, the request above
    // would be satisfied by the very code path the other zoom tests already cover.
    expect(s.decoderPath).toBe('native');
    expect(s.appliedZoom).toBe(2);
  });

  // THE ZOOM AWAIT IS A SUSPENSION POINT between runScan's aborted guard and attach(), and this is the
  // window it opened: a shopper who closes the overlay while the capture session is reconfiguring must not
  // end up with the stream bound to a <video> nobody is looking at and play() called on it. The outcome
  // alone cannot catch that — the decode loops re-check the signal, so the run reports `cancelled` either
  // way; only the binding tells the two apart.
  test('an abort landing inside the zoom await never binds the stream to the video', async () => {
    const controller = new AbortController();
    let playCalls = 0;
    const video = {
      srcObject: null,
      play: async () => {
        playCalls += 1;
      },
      videoWidth: 640,
      videoHeight: 480,
    } as unknown as HTMLVideoElement;
    const { stream, requests, stopped } = fakeZoomStream({
      zoom: { min: 0.5, max: 10 },
      settings: { width: 1920, height: 1080 },
      onApply: async () => {
        controller.abort();
      },
    });
    await expect(zoomScanner(stream).scan({ video }, controller.signal)).resolves.toEqual({
      kind: 'cancelled',
    });
    // The abort landed INSIDE the reconfiguration, not before it — otherwise the earlier guard would have
    // returned first and this test would prove nothing about the zoom await.
    expect(requests).toHaveLength(1);
    expect(video.srcObject).toBeNull();
    expect(playCalls).toBe(0);
    expect(stopped()).toBe(true);
  });

  test('nothing is published while diagnostics are disabled', async () => {
    flag.enabled = false;
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () => fakeStreamWithSettings({ width: 640, height: 480 }),
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => frameDecoder(async () => '19987'),
      frameLoop: frameLoopStub(),
    });
    await scanner.scan(fakeTarget(), new AbortController().signal);
    expect(getSnapshot().scanner.startedAt).toBeNull();
  });

  // Every test above injects createNativeDetector, which bypasses defaultNativeDetector entirely — so
  // hasBarcodeDetector and supportedFormats would assert vacuously against the injected double there.
  // This one leaves createNativeDetector OUT so the REAL default resolver runs against an installed
  // BarcodeDetector stub, and what it publishes is what the platform actually reported.
  test('the default native resolver publishes the BarcodeDetector facts the platform reported', async () => {
    const reported = ['ean_13', 'data_matrix', 'qr_code'];
    class DataMatrixCapableDetector {
      static getSupportedFormats = async () => reported;
      async detect() {
        return [{ rawValue: '19987' }];
      }
    }
    installNativeBarcodeDetector(DataMatrixCapableDetector);
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async () => fakeStreamWithSettings({ width: 1280, height: 720 }),
      },
      pollIntervalMs: 1,
    });
    const outcome = await scanner.scan(fakeTarget(), new AbortController().signal);
    expect(outcome).toEqual({ kind: 'decoded', value: '19987' });
    const s = getSnapshot().scanner;
    expect(s.hasBarcodeDetector).toBe(true);
    expect(s.supportedFormats).toEqual(reported);
  });

  // `ideal` is a preference the browser may miss; `exact`/`min` raise OverconstrainedError and would turn
  // a low-resolution-but-working webcam into a total failure. The owner's 2026-07-27 decision was NOT to
  // exclude such devices, so this test guards the distinction rather than the numbers.
  test('the camera is requested with ideal-only resolution hints', async () => {
    let requested: MediaStreamConstraints | undefined;
    const scanner = createBrowserScanner({
      mediaDevices: {
        getUserMedia: async (constraints) => {
          requested = constraints;
          return { getTracks: () => [{ stop: () => {} }] } as unknown as MediaStream;
        },
      },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => frameDecoder(async () => '19987'),
      frameLoop: frameLoopStub(),
    });
    await scanner.scan(fakeTarget(), new AbortController().signal);
    const video = requested?.video as MediaTrackConstraints;
    expect(video.facingMode).toBe('environment');
    expect(video.width).toEqual({ ideal: 1920 });
    expect(video.height).toEqual({ ideal: 1080 });
    expect(JSON.stringify(video)).not.toContain('exact');
    expect(JSON.stringify(video)).not.toContain('min');
  });
});
