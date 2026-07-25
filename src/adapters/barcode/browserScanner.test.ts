import type { ScanTarget } from '../../domain/ports';
import { createBrowserScanner } from './browserScanner';

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

test('decodes with the native detector and stops the camera', async () => {
  const track = fakeTrack();
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: () => ({ detect: async () => [{ rawValue: '19987' }] }),
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
    createNativeDetector: () => null,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'permissionDenied',
  });
});

test('no camera API at all reports unsupported', async () => {
  const scanner = createBrowserScanner({
    mediaDevices: undefined,
    createNativeDetector: () => null,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'unsupported',
  });
});

test('falls back to the bundled decoder when no native detector exists', async () => {
  const track = fakeTrack();
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: () => null,
    loadFallbackDecoder: async () => ({ decode: async () => '1031166', cancel: () => {} }),
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'decoded',
    value: '1031166',
  });
  expect(track.stopped).toBe(true);
});

test('an unloadable fallback decoder reports unsupported', async () => {
  const track = fakeTrack();
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: () => null,
    loadFallbackDecoder: async () => null,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'unsupported',
  });
  expect(track.stopped).toBe(true);
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
    createNativeDetector: () => ({
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
    createNativeDetector: () => ({
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
    createNativeDetector: () => ({
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
    createNativeDetector: () => null,
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
    createNativeDetector: () => null,
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

test('a signal already aborted by the time scanWithNative starts still resolves cancelled', async () => {
  const track = fakeTrack();
  const controller = new AbortController();
  // scan() checks signal.aborted once before this factory call (createNative()) and once again inside
  // scanWithNative's Promise executor, with no suspension point between them. Aborting from inside the
  // factory is the only way to make scanWithNative observe signal.aborted === true on entry through the
  // public scan() API — aborting from getUserMedia instead is caught by scan()'s own earlier guard
  // before scanWithNative is ever reached (verified empirically; that approach does not reproduce this).
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    createNativeDetector: () => {
      controller.abort();
      return { detect: async () => [] };
    },
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
    createNativeDetector: () => null,
  });
  await expect(scanner.scan(fakeTarget(), new AbortController().signal)).resolves.toEqual({
    kind: 'failed',
  });
});
