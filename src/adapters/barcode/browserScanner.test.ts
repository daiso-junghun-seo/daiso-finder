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

test('abort cancels the scan and always stops the camera', async () => {
  const track = fakeTrack();
  const controller = new AbortController();
  const scanner = createBrowserScanner({
    mediaDevices: { getUserMedia: async () => fakeStream(track) },
    // never decodes — the camera stays open until abort (Bible: decode failure keeps the camera open)
    createNativeDetector: () => ({ detect: async () => [] }),
    pollIntervalMs: 1,
  });
  const pending = scanner.scan(fakeTarget(), controller.signal);
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
