const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../diagnostics/enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import { getSnapshot, resetDiagnostics, subscribe } from '../../diagnostics/bus';
import type { ScanTarget } from '../../domain/ports';
import { type FrameDecoder, runFrameLoop } from './frameLoop';

beforeEach(() => {
  flag.enabled = true;
  resetDiagnostics();
});

// jsdom has no canvas (getContext returns null), so every test injects the frame plumbing. That is the
// point of the seams: the loop's pacing, abort and metrics contracts are testable without one.
function harness(overrides: Partial<Parameters<typeof runFrameLoop>[3]> = {}) {
  let t = 0;
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
  return {
    now: () => {
      t += 1;
      return t;
    },
    minIntervalMs: 0,
    nextFrame: (cb: () => void) => cb(),
    copyFrame: () => {},
    createCanvas: () => canvas,
    ...overrides,
  };
}

function target(videoWidth = 640, videoHeight = 480): ScanTarget {
  return { video: { videoWidth, videoHeight } as HTMLVideoElement };
}

test('a decoded frame ends the loop with its value', async () => {
  const decoder: FrameDecoder = { decodeFrame: async () => '19987', dispose: () => {} };
  const outcome = await runFrameLoop(decoder, target(), new AbortController().signal, harness());
  expect(outcome).toEqual({ kind: 'decoded', value: '19987' });
});

test('frames with nothing in them are retried until one decodes', async () => {
  let calls = 0;
  const decoder: FrameDecoder = {
    decodeFrame: async () => {
      calls += 1;
      return calls < 3 ? null : '19987';
    },
    dispose: () => {},
  };
  await runFrameLoop(decoder, target(), new AbortController().signal, harness());
  expect(calls).toBe(3);
  expect(getSnapshot().scanner.decodeAttempts).toBe(3);
});

// The whole point of this stage: the loop's own pacing must be visible separately, not buried in a
// residual that then gets read as "focus and framing" (spec §2).
test('the four segments are published once, at the end', async () => {
  let published = 0;
  const unsubscribe = subscribe(() => {
    published += 1;
  });
  const decoder: FrameDecoder = { decodeFrame: async () => '19987', dispose: () => {} };
  await runFrameLoop(decoder, target(), new AbortController().signal, harness());
  unsubscribe();
  expect(published).toBe(1);
  const s = getSnapshot().scanner;
  expect(s.decodeBusyMs).not.toBeNull();
  expect(s.drawMs).not.toBeNull();
  expect(s.loopIdleMs).not.toBeNull();
});

// A real throw ends the run, and its attempt must still be counted — otherwise a failed run reports one
// attempt too few and that attempt's cost vanishes.
test('a real decoder error fails the run and still counts the attempt', async () => {
  const decoder: FrameDecoder = {
    decodeFrame: async () => {
      throw new Error('boom');
    },
    dispose: () => {},
  };
  const outcome = await runFrameLoop(decoder, target(), new AbortController().signal, harness());
  expect(outcome).toEqual({ kind: 'failed' });
  expect(getSnapshot().scanner.decodeAttempts).toBe(1);
});

test('an already-aborted signal cancels before any attempt', async () => {
  const controller = new AbortController();
  controller.abort();
  const decoder: FrameDecoder = { decodeFrame: async () => '19987', dispose: () => {} };
  const outcome = await runFrameLoop(decoder, target(), controller.signal, harness());
  expect(outcome).toEqual({ kind: 'cancelled' });
  expect(getSnapshot().scanner.decodeAttempts).toBe(0);
});

// browserScanner.ts re-checks abort AFTER the decode today. Losing that lets a decode that landed after
// the overlay closed report `decoded`, which then runs an availability lookup for a closed scanner.
test('an abort during the decode is cancelled, not decoded', async () => {
  const controller = new AbortController();
  const decoder: FrameDecoder = {
    decodeFrame: async () => {
      controller.abort();
      return '19987';
    },
    dispose: () => {},
  };
  const outcome = await runFrameLoop(decoder, target(), controller.signal, harness());
  expect(outcome).toEqual({ kind: 'cancelled' });
});

test('dispose runs exactly once, on every exit path', async () => {
  let disposed = 0;
  const decoder: FrameDecoder = {
    decodeFrame: async () => '19987',
    dispose: () => {
      disposed += 1;
    },
  };
  await runFrameLoop(decoder, target(), new AbortController().signal, harness());
  expect(disposed).toBe(1);
});

// A frame with no dimensions cannot be copied. Counting it would dilute the per-attempt average, which
// is the number this whole stage exists to produce.
test('a frame with no dimensions yet is skipped without counting an attempt', async () => {
  const video = { videoWidth: 0, videoHeight: 0 };
  let calls = 0;
  const decoder: FrameDecoder = {
    decodeFrame: async () => {
      calls += 1;
      return '19987';
    },
    dispose: () => {},
  };
  const promise = runFrameLoop(
    decoder,
    { video: video as HTMLVideoElement },
    new AbortController().signal,
    harness(),
  );
  video.videoWidth = 640;
  video.videoHeight = 480;
  await promise;
  expect(calls).toBe(1);
  expect(getSnapshot().scanner.decodeAttempts).toBe(1);
});

test('the canvas is sized to the video and reused across attempts', async () => {
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
  let created = 0;
  let calls = 0;
  const decoder: FrameDecoder = {
    decodeFrame: async (c) => {
      calls += 1;
      expect(c).toBe(canvas);
      expect(c.width).toBe(640);
      expect(c.height).toBe(480);
      return calls < 2 ? null : '19987';
    },
    dispose: () => {},
  };
  await runFrameLoop(
    decoder,
    target(),
    new AbortController().signal,
    harness({
      createCanvas: () => {
        created += 1;
        return canvas;
      },
    }),
  );
  expect(created).toBe(1);
});
