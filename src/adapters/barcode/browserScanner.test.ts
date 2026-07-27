// The diagnostics flag is frozen at module init in production, so the tests swap it through vi.mock —
// the same idiom bus.test.ts uses. Hoisted above the imports because vi.mock is hoisted too.
const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../diagnostics/enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import { getSnapshot, resetDiagnostics } from '../../diagnostics/bus';
import type { ScanTarget } from '../../domain/ports';
import {
  SCAN_FORMATS,
  createBrowserScanner,
  importBundledDatamatrixReader,
} from './browserScanner';

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
function fakeTarget(): ScanTarget {
  // jsdom has no real media playback; play() must resolve for attach() to proceed.
  const video = { srcObject: null, play: async () => {} } as unknown as HTMLVideoElement;
  return { video };
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

test('the bundled fallback pulls the DataMatrix reader itself, not another zxing reader', async () => {
  // This calls the PRODUCTION import site rather than repeating its module path, so there is exactly
  // one place the path is written. Two ways this could break silently, both fatal to the guarantee
  // above: (a) a package upgrade moves the deep path — loadBundledDecoder's catch would turn that into
  // `unsupported` on every iOS device, no error anywhere; (b) someone swaps the import for another
  // valid zxing reader, say BrowserMultiFormatReader, which decodes 1D again and hands back the
  // packaging's EAN as if it were a pdNo. The assertions below catch both: (a) makes this very await
  // reject, and (b) changes both the wrapper's name and the core reader it wires.
  const Reader = await importBundledDatamatrixReader();
  const reader = new Reader();
  expect(Reader.name).toBe('BrowserDatamatrixCodeReader');
  // The decisive one. Every Browser*CodeReader shares the same wrapper API, so the wrapper's own name
  // proves little on its own — what decides which symbologies get decoded is the core Reader the
  // wrapper constructs itself and keeps in `.reader`. BrowserDatamatrixCodeReader wires a
  // DataMatrixReader; BrowserMultiFormatReader would wire a MultiFormatReader and read 1D again.
  // Constructor NAMES, not `toBe` identity against the '@zxing/library' barrel. Measured under this
  // repo's Vitest setup (2026-07-26): the bare specifier resolves to the package's CJS build — the
  // barrel's export is `===` the one from cjs/index.js and NOT `===` the one from esm/index.js — while
  // the loader deep-imports the ESM build, so the two are separate class objects (cross-`instanceof`
  // is false too). A POSITIVE `expect(Reader).toBe(barrel.BrowserDatamatrixCodeReader)` would
  // therefore FAIL on perfectly correct code; it is the NEGATIVE `not.toBe` that would pass vacuously,
  // proving nothing. Names survive that split, which is why names are what these assert.
  expect((reader as unknown as { reader: object }).reader.constructor.name).toBe(
    'DataMatrixReader',
  );
  expect(typeof reader.decodeOnceFromStream).toBe('function');
  expect(typeof reader.reset).toBe('function');
});

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
    loadFallbackDecoder: async () => ({ decode: async () => '1031166', cancel: () => {} }),
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
    loadFallbackDecoder: async () => ({ decode: async () => '1031166', cancel: () => {} }),
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
      return { decode: async () => '1031166', cancel: () => {} };
    },
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
    loadFallbackDecoder: async () => ({ decode: async () => '1031166', cancel: () => {} }),
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'decoded',
    value: '1031166',
  });
  expect(track.stopped).toBe(true);
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

// The iOS Safari path, and the reason the decoder is resolved BEFORE the camera. The ~92 kB @zxing
// chunk can take seconds on a cold cache; a shopper who closes the overlay during it aborts a scan that
// has not yet touched getUserMedia. Under a camera-first ordering this run would leave the camera on
// until the import settled — here there is no camera to leave on, and the abort is heard immediately
// instead of only after the chunk lands.
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

test('abort cancels an in-progress fallback scan via decoder.cancel() and stops the camera', async () => {
  const track = fakeTrack();
  const controller = new AbortController();
  let cancelCalled = false;
  let rejectDecode!: (err: unknown) => void;
  const decodePromise = new Promise<string>((_resolve, reject) => {
    rejectDecode = reject;
  });
  let resolveDecodeStarted!: () => void;
  const decodeStarted = new Promise<void>((resolve) => {
    resolveDecodeStarted = resolve;
  });
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: async () => null,
    loadFallbackDecoder: async () => ({
      decode: async () => {
        resolveDecodeStarted();
        return decodePromise;
      },
      cancel: () => {
        cancelCalled = true;
        const err = new Error('cancelled by abort');
        rejectDecode(err);
      },
    }),
  });
  const pending = scanner.scan(fakeTarget(), controller.signal);
  // scanWithFallback registers its abort listener before calling decode(), so waiting for decode() to
  // start guarantees the listener is already live when we abort below.
  await decodeStarted;
  controller.abort();
  await expect(pending).resolves.toEqual({ kind: 'cancelled' });
  expect(cancelCalled).toBe(true);
  expect(track.stopped).toBe(true);
});

test('a fallback decoder rejection reports failed and stops the camera', async () => {
  const track = fakeTrack();
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: async () => null,
    loadFallbackDecoder: async () => ({
      decode: async () => {
        throw new Error('decode error');
      },
      cancel: () => {},
    }),
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'failed',
  });
  expect(track.stopped).toBe(true);
});

test('a successful fallback decode still releases the decoder', async () => {
  const track = fakeTrack();
  let cancelCalls = 0;
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: async () => null,
    loadFallbackDecoder: async () => ({
      decode: async () => '1031166',
      cancel: () => {
        cancelCalls += 1;
      },
    }),
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'decoded',
    value: '1031166',
  });
  // Success is a teardown too: without this the zxing reader keeps its listeners on a video element the
  // overlay is about to unmount.
  expect(cancelCalls).toBe(1);
});

test('an empty fallback decode is failed, never a decoded empty value', async () => {
  const track = fakeTrack();
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: async () => null,
    loadFallbackDecoder: async () => ({ decode: async () => '', cancel: () => {} }),
  });
  // The native path already skips empty results; an empty string handed upward would run availability
  // for nothing at all. Mirror it here rather than fabricating a query.
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'failed',
  });
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

  function fakeStream(settings: MediaTrackSettings): MediaStream {
    const track = { stop: () => {}, getSettings: () => settings };
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
        getUserMedia: async () => fakeStream({ width: 1920, height: 1080, deviceId: 'cam-1' }),
      },
      createNativeDetector: async () => ({ detect }),
      pollIntervalMs: 1,
    });
    // fakeTarget(), not a bare `{} as HTMLVideoElement`: this is the only test in this block that
    // reaches attach(), and attach() calls video.play(). A bare object has none, so the TypeError would
    // reject scanWithNative's executor and runScan's catch would report `failed` — measuring the stub,
    // not the instrumentation. The other tests here take the zxing path, which never touches the video.
    const outcome = await scanner.scan(fakeTarget(), new AbortController().signal);
    expect(outcome).toEqual({ kind: 'decoded', value: '19987' });
    const s = getSnapshot().scanner;
    expect(s.decoderPath).toBe('native');
    expect(s.track).toMatchObject({ width: 1920, height: 1080, deviceId: 'cam-1' });
    expect(s.nativePolls).toBeGreaterThanOrEqual(1);
    expect(s.outcome).toBe('decoded');
    expect(s.startedAt).not.toBeNull();
  });

  // The zxing reader retries inside the library, so nativePolls must stay null rather than report 0.
  test('the zxing path publishes its decoder and leaves the poll count unmeasured', async () => {
    const scanner = createBrowserScanner({
      mediaDevices: { getUserMedia: async () => fakeStream({ width: 640, height: 480 }) },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => ({ decode: async () => '19987', cancel: () => {} }),
    });
    await scanner.scan({ video: {} as HTMLVideoElement }, new AbortController().signal);
    const s = getSnapshot().scanner;
    expect(s.decoderPath).toBe('zxing');
    expect(s.nativePolls).toBeNull();
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
      mediaDevices: { getUserMedia: async () => fakeStream({ width: 640, height: 480 }) },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => {
        now(); // resolving the decoder is not free — this tick must land inside decoderReadyMs
        return { decode: async () => '19987', cancel: () => {} };
      },
      now,
    });
    await scanner.scan(fakeTarget(), new AbortController().signal);
    const s = getSnapshot().scanner;
    expect(s.decoderReadyMs).toBe(10);
    expect(s.startedAt).toBe(5);
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
      mediaDevices: { getUserMedia: async () => fakeStream({}) },
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
      loadFallbackDecoder: async () => ({ decode: async () => '19987', cancel: () => {} }),
    });
    const outcome = await scanner.scan(
      { video: {} as HTMLVideoElement },
      new AbortController().signal,
    );
    expect(outcome).toEqual({ kind: 'decoded', value: '19987' });
    expect(getSnapshot().scanner.track).toBeNull();
  });

  test('nothing is published while diagnostics are disabled', async () => {
    flag.enabled = false;
    const scanner = createBrowserScanner({
      mediaDevices: { getUserMedia: async () => fakeStream({ width: 640, height: 480 }) },
      createNativeDetector: async () => null,
      loadFallbackDecoder: async () => ({ decode: async () => '19987', cancel: () => {} }),
    });
    await scanner.scan({ video: {} as HTMLVideoElement }, new AbortController().signal);
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
      mediaDevices: { getUserMedia: async () => fakeStream({ width: 1280, height: 720 }) },
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
      loadFallbackDecoder: async () => ({ decode: async () => '19987', cancel: () => {} }),
    });
    await scanner.scan({ video: {} as HTMLVideoElement }, new AbortController().signal);
    const video = requested?.video as MediaTrackConstraints;
    expect(video.facingMode).toBe('environment');
    expect(video.width).toEqual({ ideal: 1920 });
    expect(video.height).toEqual({ ideal: 1080 });
    expect(JSON.stringify(video)).not.toContain('exact');
    expect(JSON.stringify(video)).not.toContain('min');
  });
});
