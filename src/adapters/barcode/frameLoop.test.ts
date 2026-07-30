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
//
// nextFrame MUST yield to a macrotask, exactly as browserScanner.test.ts's stub does. A synchronous
// callback plus minIntervalMs 0 leaves the loop no path back to the macrotask queue, so any test whose
// decoder keeps missing starves vitest's own timeout timer and the suite hangs with no failure and no
// output. Nothing here depends on synchrony — the clock is injected, so the exact segment arithmetic
// below is unaffected by wall time.
function harness(overrides: Partial<Parameters<typeof runFrameLoop>[3]> = {}) {
  let t = 0;
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
  return {
    now: () => {
      t += 1;
      return t;
    },
    minIntervalMs: 0,
    nextFrame: (cb: () => void) => {
      setTimeout(cb, 0);
    },
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
// residual that then gets read as "focus and framing" (spec §2). A decoder that decodes on the first
// frame cannot tell once-per-run from once-per-attempt apart — both publish exactly once when there is
// only one attempt — so this reuses the three-attempt shape from the retry test above, where a
// per-attempt publish would show up as 3.
test('the five segments are published once, at the end', async () => {
  let published = 0;
  const unsubscribe = subscribe(() => {
    published += 1;
  });
  let calls = 0;
  const decoder: FrameDecoder = {
    decodeFrame: async () => {
      calls += 1;
      return calls < 3 ? null : '19987';
    },
    dispose: () => {},
  };
  await runFrameLoop(decoder, target(), new AbortController().signal, harness());
  unsubscribe();
  expect(published).toBe(1);
  const s = getSnapshot().scanner;
  // The harness clock advances by exactly 1 on every now() call and minIntervalMs is 0, so across 3
  // attempts each accumulator advances by exactly 1 per iteration — 3 total. Exact numbers, not
  // `not.toBeNull()`, so this proves the segments are genuinely separated rather than merely present.
  expect(s.decodeAttempts).toBe(3);
  expect(s.decodeBusyMs).toBe(3);
  expect(s.drawMs).toBe(3);
  expect(s.loopIdleMs).toBe(3);
  // Every frame here had dimensions, so nothing was warm-up — a measured 0, not an unmeasured one.
  expect(s.warmupMs).toBe(0);
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

// A run that never reached an attempt must not publish zeros for segments it never measured — 0 for an
// unmeasured value is the one thing this project's diagnostics never do. The distinction is what the
// number is a claim ABOUT: `decodeAttempts: 0` and `loopIdleMs: 0` are claims about this loop ("no
// attempt ran", "we waited no time"), both true; `decodeBusyMs: 0` would be a claim about a decoder that
// never ran, and `warmupMs: 0` a claim that the video was ready, which we never looked to see.
test('an already-aborted signal cancels before any attempt, and publishes no zeros for it', async () => {
  const controller = new AbortController();
  controller.abort();
  const decoder: FrameDecoder = { decodeFrame: async () => '19987', dispose: () => {} };
  const outcome = await runFrameLoop(decoder, target(), controller.signal, harness());
  expect(outcome).toEqual({ kind: 'cancelled' });
  const s = getSnapshot().scanner;
  expect(s.decodeAttempts).toBe(0);
  expect(s.decodeBusyMs).toBeNull();
  expect(s.drawMs).toBeNull();
  expect(s.warmupMs).toBeNull();
  expect(s.loopIdleMs).toBe(0);
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

// Aborting disposes the decoder while decodeFrame may still be in flight (see the loop's abort
// listener). A decoder that throws on use-after-dispose — plausible for a future wasm decoder — must
// still report `cancelled`: every other exit in the loop gives abort precedence, and this is the one
// path where the loop's own teardown could otherwise mask that with `failed`.
test('an abort during the decode that then throws is cancelled, not failed', async () => {
  const controller = new AbortController();
  const decoder: FrameDecoder = {
    decodeFrame: async () => {
      controller.abort();
      throw new Error('boom');
    },
    dispose: () => {},
  };
  const outcome = await runFrameLoop(decoder, target(), controller.signal, harness());
  expect(outcome).toEqual({ kind: 'cancelled' });
});

// RENAMED and widened: the old name claimed "every exit path" while exercising the decoded one alone.
// Now it drives the three exits the loop actually has, because "exactly once" is the interesting half of
// the contract — the abort listener and the finally both call dispose, so a cancelled run is the case
// where a missing idempotence guard would show up as 2.
const disposeExits: Array<[string, (c: AbortController) => FrameDecoder['decodeFrame']]> = [
  ['decoded', () => async () => '19987'],
  [
    'failed',
    () => async () => {
      throw new Error('boom');
    },
  ],
  // Aborting from INSIDE the decode is what makes this row worth having: the abort listener disposes and
  // then the finally disposes again, so this is the exit where a missing idempotence guard shows up as 2.
  [
    'cancelled',
    (controller) => async () => {
      controller.abort();
      return '19987';
    },
  ],
];
test.each(disposeExits)(
  'dispose runs exactly once on the %s exit',
  async (_kind, decodeFrameFor) => {
    const controller = new AbortController();
    let disposed = 0;
    const decoder: FrameDecoder = {
      decodeFrame: decodeFrameFor(controller),
      dispose: () => {
        disposed += 1;
      },
    };
    await runFrameLoop(decoder, target(), controller.signal, harness());
    expect(disposed).toBe(1);
  },
);

// THE WARM-UP SPLIT. Before it, this wait landed in loopIdleMs, and the measurement protocol then told
// the owner to look for the warm-up in a RESIDUAL it could never appear in — while the same signature
// (large 루프 대기, few attempts) read as "the minimum interval is too long", whose fix does nothing here.
// Three iterations: two frames with no dimensions yet, then one that decodes. The harness clock advances
// by exactly 1 per read, so each iteration's wait is exactly 1 — 2 warm-up, 1 deliberate.
test('the wait for a frame with no dimensions is warm-up, not deliberate idling', async () => {
  let reads = 0;
  const video = {
    get videoWidth() {
      reads += 1;
      return reads <= 2 ? 0 : 640;
    },
    get videoHeight() {
      return reads <= 2 ? 0 : 480;
    },
  } as HTMLVideoElement;
  const decoder: FrameDecoder = { decodeFrame: async () => '19987', dispose: () => {} };
  const outcome = await runFrameLoop(decoder, { video }, new AbortController().signal, harness());
  expect(outcome).toEqual({ kind: 'decoded', value: '19987' });
  const s = getSnapshot().scanner;
  expect(s.warmupMs).toBe(2);
  expect(s.loopIdleMs).toBe(1);
  // The warm-up frames are excluded from the attempt count, so the per-attempt averages stay honest.
  expect(s.decodeAttempts).toBe(1);
});

// A frame with no dimensions cannot be copied. Counting it would dilute the per-attempt average, which
// is the number this whole stage exists to produce.
//
// A counting getter, not a "mutate after starting the promise": that approach races the loop instead of
// testing it (a real run recorded the reads as [640] — the zero dimensions were never observed). Here the
// first read always answers 0x0 and every read after answers the real dimensions, so the loop is FORCED
// to see a zero-dimension frame regardless of timing.
//
// NOTE: the skip path is not paced by minIntervalMs, so a getter changed to never return non-zero
// dimensions makes this loop forever. It now yields a macrotask per iteration (harness), so vitest's
// timeout still fires and the test FAILS rather than wedging the suite.
test('a frame with no dimensions yet is skipped without counting an attempt', async () => {
  let dimensionReads = 0;
  const video = {
    get videoWidth() {
      dimensionReads += 1;
      return dimensionReads === 1 ? 0 : 640;
    },
    get videoHeight() {
      return dimensionReads === 1 ? 0 : 480;
    },
  } as HTMLVideoElement;
  let calls = 0;
  const decoder: FrameDecoder = {
    decodeFrame: async () => {
      calls += 1;
      return '19987';
    },
    dispose: () => {},
  };
  const outcome = await runFrameLoop(decoder, { video }, new AbortController().signal, harness());
  expect(outcome).toEqual({ kind: 'decoded', value: '19987' });
  expect(calls).toBe(1);
  expect(getSnapshot().scanner.decodeAttempts).toBe(1);
  // Proves the zero-dimension frame was actually skipped and looped past, not just read once and
  // happened to work out: with the skip guard deleted, the loop would decode on the very first
  // (zero-dimension) read and this would still be 1.
  expect(dimensionReads).toBeGreaterThan(1);
});

test('the canvas is sized to the video and reused across attempts', async () => {
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
  let created = 0;
  let calls = 0;
  // Captured into locals and asserted AFTER the await, not inside decodeFrame: an expect() thrown from
  // inside decodeFrame propagates into the loop's own catch-all, which converts it to `{ kind: 'failed'
  // }` — the test would then never see the AssertionError and would pass on `created === 1` alone
  // regardless of what canvas was actually handed to the decoder.
  let observedCanvas: HTMLCanvasElement | null = null;
  let observedWidth = -1;
  let observedHeight = -1;
  const decoder: FrameDecoder = {
    decodeFrame: async (c) => {
      calls += 1;
      observedCanvas = c;
      observedWidth = c.width;
      observedHeight = c.height;
      return calls < 2 ? null : '19987';
    },
    dispose: () => {},
  };
  const outcome = await runFrameLoop(
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
  // Guards against a swallowed throw hiding as `failed` with no assertion ever failing.
  expect(outcome).toEqual({ kind: 'decoded', value: '19987' });
  expect(observedCanvas).toBe(canvas);
  expect(observedWidth).toBe(640);
  expect(observedHeight).toBe(480);
  expect(created).toBe(1);
});
