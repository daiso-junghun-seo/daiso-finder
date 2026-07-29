// src/adapters/barcode/frameLoop.ts
// The decode retry loop, owned by the app rather than by @zxing. Owning it is what makes the attempt
// count and the three durations observable at all — inside BrowserCodeReader.decodeOnce they were not.
// Decoder-agnostic on purpose: stage 2 swaps what sits behind FrameDecoder without touching this file.
import { publishScanner } from '../../diagnostics/bus';
import type { ScanOutcome, ScanTarget } from '../../domain/ports';

/** One frame in, a value or nothing out. A retryable miss is `null`, never a throw. */
export interface FrameDecoder {
  decodeFrame(canvas: HTMLCanvasElement): Promise<string | null>;
  dispose(): void;
}

// The frame loop's own knob, deliberately NOT the native path's pollIntervalMs. The two loops are
// structurally opposite: the native one fires on a fixed period with a cheap async detect(), this one
// waits a minimum interval AFTER a costly synchronous decode returns. Tuning one for the other's
// benefit makes both worse.
export const FRAME_LOOP_MIN_INTERVAL_MS = 200;

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
  const now = deps.now ?? Date.now;
  const minIntervalMs = deps.minIntervalMs ?? FRAME_LOOP_MIN_INTERVAL_MS;
  const nextFrame = deps.nextFrame ?? defaultNextFrame;
  const copyFrame = deps.copyFrame ?? defaultCopyFrame;
  const createCanvas = deps.createCanvas ?? (() => document.createElement('canvas'));

  let attempts = 0;
  let busyMs = 0;
  let drawMs = 0;
  let idleMs = 0;
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
      idleMs += now() - idleStart;
      if (signal.aborted) return { kind: 'cancelled' };

      const { videoWidth, videoHeight } = target.video;
      // Before the video has metadata there is nothing to copy. Counting this as an attempt would
      // dilute the per-attempt average this stage exists to measure.
      if (!videoWidth || !videoHeight) continue;

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
    return { kind: 'failed' };
  } finally {
    signal.removeEventListener('abort', dispose);
    dispose();
    // ONE publish, at the end. Publishing per attempt would notify every subscriber and re-render the
    // whole diagnostics report each time — and the measured run is by definition a ?debug=1 run, so
    // that cost would land inside the numbers being compared.
    publishScanner({ decodeAttempts: attempts, decodeBusyMs: busyMs, drawMs, loopIdleMs: idleMs });
  }
}
