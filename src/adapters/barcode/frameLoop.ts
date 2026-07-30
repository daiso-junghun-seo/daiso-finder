// src/adapters/barcode/frameLoop.ts
// The decode retry loop, owned by the app rather than by @zxing. Owning it is what makes the attempt
// count and the loop's four durations observable at all — inside BrowserCodeReader.decodeOnce they were
// not. (The fifth fallback duration, assembleMs, belongs to the decoder and is published by it.)
// Decoder-agnostic on purpose: stage 2 swaps what sits behind FrameDecoder without touching this file.
import { publishScanner } from '../../diagnostics/bus';
import type { ScanOutcome, ScanTarget } from '../../domain/ports';

/**
 * One frame in, a value or nothing out. A retryable miss is `null`, never a throw.
 *
 * `dispose()` may be called while a `decodeFrame` call is still pending — an abort tears the decoder
 * down without waiting for the in-flight decode to settle. An implementer must tolerate a decode that
 * resolves or throws after `dispose()` has already run.
 */
export interface FrameDecoder {
  decodeFrame(canvas: HTMLCanvasElement): Promise<string | null>;
  dispose(): void;
}

// The frame loop's own knob, deliberately NOT the native path's pollIntervalMs. The two loops are
// structurally opposite: the native one fires on a fixed period with a cheap async detect(), this one
// waits a minimum interval AFTER a costly synchronous decode returns. Tuning one for the other's
// benefit makes both worse.
export const FRAME_LOOP_MIN_INTERVAL_MS = 200;

// DELTA-ONLY, which is why the adapter's epoch requirement does not apply here: ScannerDeps.now must be
// Date.now-based because the panel stamps startedAt from it and recomputes 경과 against its own
// Date.now(), but every number this loop publishes is the difference between two reads of ONE clock and
// never a timestamp. For that job a monotonic sub-millisecond clock is strictly better — Date.now
// quantises a sub-ms frame copy to 0 or 1, and it can step backwards if the system clock is adjusted
// mid-scan, which would publish a negative segment.
export function monotonicNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export interface FrameLoopDeps {
  now?: () => number;
  minIntervalMs?: number;
  // Injectable because jsdom has no canvas: getContext() returns null and the `canvas` package is not
  // installed, so without these seams the loop could only ever be exercised on a physical device.
  nextFrame?: (cb: () => void) => void;
  copyFrame?: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => void;
  createCanvas?: () => HTMLCanvasElement;
}

function defaultNextFrame(cb: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => cb());
  else setTimeout(cb, 0);
}

function defaultCopyFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): void {
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
}

export async function runFrameLoop(
  decoder: FrameDecoder,
  target: ScanTarget,
  signal: AbortSignal,
  deps: FrameLoopDeps = {},
): Promise<ScanOutcome> {
  const now = deps.now ?? monotonicNow;
  const minIntervalMs = deps.minIntervalMs ?? FRAME_LOOP_MIN_INTERVAL_MS;
  const nextFrame = deps.nextFrame ?? defaultNextFrame;
  const copyFrame = deps.copyFrame ?? defaultCopyFrame;
  const createCanvas = deps.createCanvas ?? (() => document.createElement('canvas'));

  let attempts = 0;
  let waits = 0;
  let busyMs = 0;
  let drawMs = 0;
  let idleMs = 0;
  let warmupMs = 0;
  let canvas: HTMLCanvasElement | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    decoder.dispose();
  };
  signal.addEventListener('abort', dispose);

  try {
    for (;;) {
      if (signal.aborted) return { kind: 'cancelled' };
      const idleStart = now();
      await new Promise<void>((resolve) => nextFrame(resolve));
      const waited = now() - idleStart;
      waits += 1;

      const { videoWidth, videoHeight } = target.video;
      const warmingUp = !videoWidth || !videoHeight;
      // The wait is attributed by WHAT THE FRAME TURNED OUT TO BE, and before the abort check so no
      // measured wait is dropped. Waiting for the first frame is not deliberate pacing: the caller sets
      // srcObject and this loop starts running before loadedmetadata, so on iOS the first tens to
      // hundreds of ms are the video warming up. Inside loopIdleMs that time reads as "our minimum
      // interval is too long" — and shortening the interval would do nothing about it.
      if (warmingUp) {
        warmupMs += waited;
      } else {
        idleMs += waited;
      }
      if (signal.aborted) return { kind: 'cancelled' };
      // Before the video has metadata there is nothing to copy. Counting this as an attempt would
      // dilute the per-attempt average this stage exists to measure.
      if (warmingUp) continue;

      canvas ??= createCanvas();
      if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
        canvas.width = videoWidth;
        canvas.height = videoHeight;
      }
      const drawStart = now();
      copyFrame(target.video, canvas);
      drawMs += now() - drawStart;

      const decodeStart = now();
      let value: string | null;
      try {
        value = await decoder.decodeFrame(canvas);
      } finally {
        // In the finally so a real throw still contributes its cost and its count: otherwise a failed
        // run reports one attempt too few and that attempt's time disappears.
        busyMs += now() - decodeStart;
        attempts += 1;
      }
      // Re-checked AFTER the decode, as the stream-level implementation did: a decode that lands once
      // the overlay has closed must not report `decoded` and trigger an availability lookup.
      if (signal.aborted) return { kind: 'cancelled' };
      if (value) return { kind: 'decoded', value };
      const remaining = minIntervalMs - (now() - decodeStart);
      if (remaining > 0) {
        const waitStart = now();
        await new Promise<void>((resolve) => setTimeout(resolve, remaining));
        idleMs += now() - waitStart;
      }
    }
  } catch {
    // The abort listener above disposes the decoder while a decodeFrame call may still be in flight, so
    // a decoder that throws on use-after-dispose must still report `cancelled`: every other exit in this
    // loop gives abort precedence, and the loop's own teardown must not be the one path that doesn't.
    return signal.aborted ? { kind: 'cancelled' } : { kind: 'failed' };
  } finally {
    signal.removeEventListener('abort', dispose);
    dispose();
    // ONE publish, at the end. Publishing per attempt would notify every subscriber and re-render the
    // whole diagnostics report each time — and the measured run is by definition a ?debug=1 run, so
    // that cost would land inside the numbers being compared.
    //
    // Rounded ONCE here, not per iteration: the clock is sub-millisecond and the panel reports whole
    // milliseconds, so truncating per iteration would quietly lose up to half a millisecond per frame.
    publishScanner({
      decodeAttempts: attempts,
      // null, never 0. A run aborted before its first attempt measured no decode at all, and 0 would
      // claim the decoder ran and cost nothing. `decodeAttempts: 0` and `loopIdleMs: 0` DO stay numbers:
      // both are measurements of this loop ("no attempt ran", "we chose to wait this long"), not claims
      // about a decoder or a video we never observed.
      decodeBusyMs: attempts === 0 ? null : Math.round(busyMs),
      drawMs: attempts === 0 ? null : Math.round(drawMs),
      // warmupMs's denominator is a frame we actually looked at, not an attempt: a run cancelled while
      // the video was still warming up keeps its measurement, while a run that never reached a frame
      // reports null rather than claiming the video was ready in 0ms.
      warmupMs: waits === 0 ? null : Math.round(warmupMs),
      loopIdleMs: Math.round(idleMs),
    });
  }
}
