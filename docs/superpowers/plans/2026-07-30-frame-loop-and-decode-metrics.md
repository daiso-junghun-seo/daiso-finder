# Frame Loop and Decode Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take ownership of the decode retry loop so the ~5.7 s a real iPhone spends decoding can be split into per-attempt decode cost, frame-copy cost, and time the loop chose to wait.

**Architecture:** The fallback seam drops from stream-level to frame-level. `FallbackDecoder` (which owned the stream, the video attachment, the retry loop and its own cancellation) becomes `FrameDecoder`, which sees one canvas and answers "value or nothing". A new loop in the adapter owns pacing, frame copying, abort checks and four counters. The zxing adapter behind that seam assembles a `BinaryBitmap` directly — `createBinaryBitmap` cannot take a canvas — and translates all three retryable zxing exceptions to `null`.

**Tech Stack:** TypeScript strict, `@zxing/library` 0.21.3 (deep ESM paths only), Vitest + Testing Library, Playwright, Biome, Vite 5.

**Spec:** [`../specs/2026-07-29-frame-loop-and-decode-metrics-design.md`](../specs/2026-07-29-frame-loop-and-decode-metrics-design.md) (rev 2)

## Global Constraints

- **No fabrication.** An unmeasured value is `null`, never `0`. `null` renders as `미보고`. This binds comments and docs as strictly as code.
- **Deep imports only.** Every `@zxing/library` import must be a deep `@zxing/library/esm/…` path. The barrel declares no `sideEffects`, so a single barrel import inflates the lazy chunk from 91.96 kB to 415.76 kB and destroys this stage's own baseline.
- **No new dependency.** `zxing-wasm` is NOT installed in this plan. The decoder stays `@zxing/library`.
- **Metrics must not perturb the run they measure.** The four counters publish **once**, when the loop ends — never per attempt.
- **Native path behaviour is unchanged.** Its `setInterval` cadence, its `detect()` call, its outcomes: untouched. Only its counter is renamed.
- **`decodeBusyMs` / `drawMs` / `loopIdleMs` are fallback-only** and stay `null` on the native path, whose overlapping attempts make a per-attempt average meaningless.
- **Unchanged:** `SCAN_FORMATS = ['data_matrix']`; `getUserMedia` with `ideal` 1920×1080 (`exact`/`min` forbidden); `ScanOutcome`; the Zustand wiring; every UX string; the bracket CSS. No 1D decoding.
- **Language:** code, identifiers, comments and commit messages in English. User-visible strings in Korean.
- **Verification gate for every task:** `npm test`, `npm run typecheck`, `npm run lint` must pass before commit.
- **Local only.** No push, no deploy, no PR.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/adapters/barcode/frameLoop.ts` | The pacing/abort/metrics loop, decoder-agnostic and canvas-injectable |
| `src/adapters/barcode/frameLoop.test.ts` | Loop tests, driven by a `FrameDecoder` double and a fake frame sink |
| `src/adapters/barcode/zxingFrameDecoder.ts` | `FrameDecoder` over `@zxing/library`: bitmap assembly + exception translation |
| `src/adapters/barcode/zxingFrameDecoder.test.ts` | Tests for the above |

**Modify**

| File | Change |
|---|---|
| `src/diagnostics/bus.ts` | Add `decodeAttempts`, `decodeBusyMs`, `drawMs`, `loopIdleMs`; remove `nativePolls` |
| `src/diagnostics/bus.test.ts` | Update the empty-snapshot pin |
| `src/diagnostics/report.ts` | Render the four lines; delete `UNMEASURED` |
| `src/diagnostics/report.test.ts` | Replace the `UNMEASURED` assertions |
| `src/adapters/barcode/browserScanner.ts` | `FallbackDecoder` → `FrameDecoder`; `scanWithFallback` delegates to the loop; native counter renamed |
| `src/adapters/barcode/browserScanner.test.ts` | Rewrite the fallback-path tests the new seam invalidates |
| `docs/notes/open-questions.md` | §B30-14 |
| `docs/HANDOFF.md` | Resume record |

---

## Task 1: The four counters

**Files:**
- Modify: `src/diagnostics/bus.ts`, `src/diagnostics/bus.test.ts`
- Modify: `src/diagnostics/report.ts`, `src/diagnostics/report.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: on `ScannerDiagnostics` — `decodeAttempts: number | null`, `decodeBusyMs: number | null`, `drawMs: number | null`, `loopIdleMs: number | null`. `nativePolls` is **removed**. `UNMEASURED` is **removed** from `report.ts`.

**Context:** `nativePolls` was native-only, so the fallback always rendered `시도 횟수: 측정 불가 (zxing 내부 루프)`. Once the app owns the fallback loop that sentence is false, and a false marker is worse than no marker. `decodeAttempts` covers both paths; the other three are fallback-only and stay `null` on the native path (its `setInterval` does not await the previous `detect()`, so attempts overlap and a per-attempt average would be nonsense).

This task lands the fields and the rendering first so Tasks 2-4 have somewhere to publish.

- [ ] **Step 1: Write the failing tests**

In `src/diagnostics/bus.test.ts`, extend the fresh-bus test:

```ts
test('a fresh bus has measured no decode segments', () => {
  const { scanner } = getSnapshot();
  expect(scanner.decodeAttempts).toBeNull();
  expect(scanner.decodeBusyMs).toBeNull();
  expect(scanner.drawMs).toBeNull();
  expect(scanner.loopIdleMs).toBeNull();
});
```

In `src/diagnostics/report.test.ts`, replace the two tests that reference `UNMEASURED` with:

```ts
// The old marker claimed the count was unmeasurable because the loop lived inside zxing. The app owns
// that loop now, so both paths count attempts and the marker would be a false statement.
test('a measured attempt count is printed', () => {
  expect(buildReport(env, snapshotWith({ decodeAttempts: 14 }), app, 2000)).toContain('시도 횟수: 14');
});

test('an unmeasured attempt count is named, not defaulted to zero', () => {
  const report = buildReport(env, snapshotWith({ decodeAttempts: null }), app, 2000);
  expect(report).toContain(`시도 횟수: ${UNREPORTED}`);
  expect(report).not.toMatch(/시도 횟수: 0/);
});

// The three fallback-only segments. Splitting them is the point of this stage: the loop's own pacing
// must not hide inside a residual that gets read as "focus and framing" (spec §2).
test('the fallback segments are printed when measured', () => {
  const report = buildReport(
    env,
    snapshotWith({ decodeBusyMs: 4200, drawMs: 380, loopIdleMs: 900 }),
    app,
    2000,
  );
  expect(report).toContain('디코드 점유: 4200ms');
  expect(report).toContain('프레임 복사: 380ms');
  expect(report).toContain('루프 대기: 900ms');
});

test('the fallback segments are named as unreported on the native path', () => {
  const report = buildReport(
    env,
    snapshotWith({ decodeBusyMs: null, drawMs: null, loopIdleMs: null }),
    app,
    2000,
  );
  expect(report).toContain(`디코드 점유: ${UNREPORTED}`);
  expect(report).toContain(`프레임 복사: ${UNREPORTED}`);
  expect(report).toContain(`루프 대기: ${UNREPORTED}`);
});
```

Also update `snapshotWith`'s base literal: remove `nativePolls`, add the four new fields set to `null`. Remove the now-unused `UNMEASURED` import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/diagnostics/`
Expected: FAIL — the fields do not exist and `UNMEASURED` is still exported.

- [ ] **Step 3: Change the bus**

In `src/diagnostics/bus.ts`, delete the `nativePolls` line from `ScannerDiagnostics` and from `emptyScanner()`, and add in its place:

```ts
  // Both paths count attempts. The three below are FALLBACK-ONLY and stay null on the native path,
  // whose setInterval does not await the previous detect() — overlapping attempts make a per-attempt
  // average meaningless, and a number here would read as one.
  decodeAttempts: number | null;
  decodeBusyMs: number | null; // time inside decodeFrame calls
  drawMs: number | null; // time spent copying frames into the canvas
  loopIdleMs: number | null; // time the loop deliberately waited (rAF + minimum interval)
```

and to `emptyScanner()`:

```ts
    decodeAttempts: null,
    decodeBusyMs: null,
    drawMs: null,
    loopIdleMs: null,
```

- [ ] **Step 4: Change the report**

In `src/diagnostics/report.ts`, delete the `UNMEASURED` export and replace the `시도 횟수` line with these four:

```ts
    `  시도 횟수: ${value(s.decodeAttempts)}`,
    `  디코드 점유: ${s.decodeBusyMs === null ? UNREPORTED : `${s.decodeBusyMs}ms`}`,
    `  프레임 복사: ${s.drawMs === null ? UNREPORTED : `${s.drawMs}ms`}`,
    `  루프 대기: ${s.loopIdleMs === null ? UNREPORTED : `${s.loopIdleMs}ms`}`,
```

- [ ] **Step 5: Fix the one remaining `nativePolls` producer**

`src/adapters/barcode/browserScanner.ts`'s `scanWithNative` publishes `nativePolls`. Rename that one field to `decodeAttempts` — `let polls = 0; polls += 1; publishScanner({ decodeAttempts: polls })`. Change nothing else about the native path: its `setInterval` cadence, its `detect()` call and its outcomes stay exactly as they are.

Also update `browserScanner.test.ts`'s assertions on `nativePolls` to `decodeAttempts`. The test that pins "the zxing path leaves the poll count unmeasured" (`nativePolls` null on the fallback path) is about to be inverted by Task 3 — for now, change only the field name so it still expresses today's behaviour.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/diagnostics/ src/adapters/barcode/`
Expected: PASS — new tests plus every pre-existing test in those files.

- [ ] **Step 7: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/diagnostics/bus.ts src/diagnostics/bus.test.ts src/diagnostics/report.ts src/diagnostics/report.test.ts src/adapters/barcode/browserScanner.ts src/adapters/barcode/browserScanner.test.ts
git commit -m "feat(diagnostics): count decode attempts and split the loop's segments"
```

---

## Task 2: The frame loop

**Files:**
- Create: `src/adapters/barcode/frameLoop.ts`, `src/adapters/barcode/frameLoop.test.ts`

**Interfaces:**
- Consumes: `ScanOutcome`, `ScanTarget` from `src/domain/ports.ts`; `publishScanner` from `src/diagnostics/bus.ts`; the four fields from Task 1.
- Produces:
  - `interface FrameDecoder { decodeFrame(canvas: HTMLCanvasElement): Promise<string | null>; dispose(): void }`
  - `FRAME_LOOP_MIN_INTERVAL_MS = 200`
  - `interface FrameLoopDeps { now?: () => number; minIntervalMs?: number; nextFrame?: (cb: () => void) => void; copyFrame?: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => void; createCanvas?: () => HTMLCanvasElement }`
  - `runFrameLoop(decoder: FrameDecoder, target: ScanTarget, signal: AbortSignal, deps?: FrameLoopDeps): Promise<ScanOutcome>`

**Context:** this file exists so the loop can be tested without a canvas. **jsdom has no canvas** — `HTMLCanvasElement.getContext` returns `null` and the `canvas` package is not installed — so `copyFrame` and `createCanvas` are injectable seams. Without them the loop would only ever be exercised on a physical device.

The loop must not attach the stream or stop the camera: `browserScanner.ts` already owns both (`attach()` and `stopCamera()`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/adapters/barcode/frameLoop.test.ts
const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../diagnostics/enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import { getSnapshot, resetDiagnostics } from '../../diagnostics/bus';
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
    now: () => (t += 1),
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
  const decoder: FrameDecoder = { decodeFrame: async () => '19987', dispose: () => (disposed += 1) };
  await runFrameLoop(decoder, target(), new AbortController().signal, harness());
  expect(disposed).toBe(1);
});

// A frame with no dimensions cannot be copied. Counting it would dilute the per-attempt average, which
// is the number this whole stage exists to produce.
test('a frame with no dimensions yet is skipped without counting an attempt', async () => {
  const video = { videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;
  let calls = 0;
  const decoder: FrameDecoder = {
    decodeFrame: async () => {
      calls += 1;
      return '19987';
    },
    dispose: () => {},
  };
  const promise = runFrameLoop(decoder, { video }, new AbortController().signal, harness());
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
```

Add `subscribe` to the bus import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/adapters/barcode/frameLoop.test.ts`
Expected: FAIL — `Failed to resolve import "./frameLoop"`.

- [ ] **Step 3: Write the loop**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/adapters/barcode/frameLoop.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/barcode/frameLoop.ts src/adapters/barcode/frameLoop.test.ts
git commit -m "feat(scan): own the decode loop so its segments can be measured"
```

---

## Task 3: The zxing frame decoder

**Files:**
- Create: `src/adapters/barcode/zxingFrameDecoder.ts`, `src/adapters/barcode/zxingFrameDecoder.test.ts`
- Modify: `src/adapters/barcode/browserScanner.ts`, `src/adapters/barcode/browserScanner.test.ts`

**Interfaces:**
- Consumes: `FrameDecoder` from Task 2.
- Produces: `loadZxingFrameDecoder(): Promise<FrameDecoder | null>`, `importZxingFrameParts()`, `RETRYABLE_ZXING_KINDS`. `ScannerDeps.loadFallbackDecoder` keeps its name but its type becomes `() => Promise<FrameDecoder | null>`. `FallbackDecoder` and `scanWithFallback`'s old body are removed.

**Context — two things that will silently break if got wrong:**

**`createBinaryBitmap` cannot take a canvas.** Its parameter type is `HTMLVisualMediaElement = HTMLVideoElement | HTMLImageElement`, and internally it reads `naturalWidth`/`naturalHeight`, which a canvas does not have — nothing gets drawn, the internal capture canvas stays 0×0, and `getImageData(0,0,0,0)` throws something that is *not* a `NotFoundException`. Assemble the bitmap directly instead: `new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas, false)))`. That luminance source **does** take a canvas and reads `canvas.width`/`canvas.height`.

**zxing retries three exceptions, not one.** `BrowserCodeReader` retries `NotFoundException`, `ChecksumException` **and** `FormatException`; `DataMatrixReader` documents throwing the latter two on a code it cannot decode or whose error correction fails — exactly what a blurry frame produces. Treating only `NotFoundException` as retryable would end the run on the first partial read. Detect by **`getKind()`**, not `instanceof`: `Exception.prototype.getKind()` returns `constructor.kind`, and the repo already records that cross-realm `instanceof` is false here because of the CJS/ESM split.

**Every import must be a deep `esm/…` path** — a barrel import inflates the lazy chunk from 91.96 kB to 415.76 kB.

- [ ] **Step 1: Write the failing tests**

```ts
// src/adapters/barcode/zxingFrameDecoder.test.ts
import { RETRYABLE_ZXING_KINDS, importZxingFrameParts, loadZxingFrameDecoder } from './zxingFrameDecoder';

// zxing retries NotFound, Checksum AND Format. DataMatrixReader throws the latter two on a code it
// cannot decode or whose error correction fails — a blurry frame. Treating only NotFound as retryable
// would end the run on the first partial read and take the measurement with it.
test('all three retryable zxing exception kinds are translated', () => {
  expect(RETRYABLE_ZXING_KINDS).toEqual(
    new Set(['NotFoundException', 'ChecksumException', 'FormatException']),
  );
});

test('the zxing parts load and are constructible', async () => {
  const parts = await importZxingFrameParts();
  expect(typeof parts.BinaryBitmap).toBe('function');
  expect(typeof parts.HybridBinarizer).toBe('function');
  expect(typeof parts.HTMLCanvasElementLuminanceSource).toBe('function');
  expect(parts.reader.constructor.name).toBe('DataMatrixReader');
});

test('a retryable miss becomes null, not a throw', async () => {
  const decoder = await loadZxingFrameDecoder({
    assemble: () => ({}) as never,
    decode: () => {
      throw { getKind: () => 'NotFoundException' };
    },
  });
  await expect(decoder?.decodeFrame({} as HTMLCanvasElement)).resolves.toBeNull();
});

test('a checksum failure is also a retryable miss', async () => {
  const decoder = await loadZxingFrameDecoder({
    assemble: () => ({}) as never,
    decode: () => {
      throw { getKind: () => 'ChecksumException' };
    },
  });
  await expect(decoder?.decodeFrame({} as HTMLCanvasElement)).resolves.toBeNull();
});

// A genuine fault must stay a fault — swallowing it would turn a broken decoder into an endless scan.
test('any other error propagates', async () => {
  const decoder = await loadZxingFrameDecoder({
    assemble: () => ({}) as never,
    decode: () => {
      throw new Error('boom');
    },
  });
  await expect(decoder?.decodeFrame({} as HTMLCanvasElement)).rejects.toThrow('boom');
});

test('a decoded result yields its text', async () => {
  const decoder = await loadZxingFrameDecoder({
    assemble: () => ({}) as never,
    decode: () => ({ getText: () => '19987' }) as never,
  });
  await expect(decoder?.decodeFrame({} as HTMLCanvasElement)).resolves.toBe('19987');
});
```

Then add to `src/adapters/barcode/browserScanner.test.ts` a guard that the chunk discipline holds:

```ts
// A barrel import would pull every 1D and 2D decoder into the lazy chunk: 91.96 kB becomes 415.76 kB,
// which destroys the very baseline this stage measures against. @zxing/library declares no sideEffects,
// so nothing in the barrel can be tree-shaken away.
test('the zxing frame decoder imports only deep esm paths', async () => {
  const source = await readFile(
    new URL('./zxingFrameDecoder.ts', import.meta.url),
    'utf8',
  );
  const specifiers = [...source.matchAll(/from\s+'(@zxing\/library[^']*)'/g)].map((m) => m[1]);
  expect(specifiers.length).toBeGreaterThan(0);
  for (const specifier of specifiers) {
    expect(specifier).toMatch(/^@zxing\/library\/esm\//);
  }
});
```

Import `readFile` from `node:fs/promises`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/adapters/barcode/`
Expected: FAIL — `Failed to resolve import "./zxingFrameDecoder"`.

- [ ] **Step 3: Write the decoder**

```ts
// src/adapters/barcode/zxingFrameDecoder.ts
// A FrameDecoder over @zxing/library. It exists because BrowserCodeReader.createBinaryBitmap CANNOT
// take a canvas — its parameter is HTMLVideoElement | HTMLImageElement and it reads naturalWidth, so a
// canvas produces an empty 0x0 capture and an exception that is not a retryable miss. The bitmap is
// therefore assembled here from the three parts directly.
//
// Deep esm paths only: the package declares no sideEffects, so one barrel import stops tree-shaking and
// the lazy chunk goes from 91.96 kB to 415.76 kB.
import type { FrameDecoder } from './frameLoop';

// zxing's own loop retries all three of these (BrowserCodeReader), and DataMatrixReader documents
// throwing Format/Checksum for a code it cannot decode or whose error correction fails. Matched by
// getKind() rather than instanceof: the CJS/ESM split makes cross-realm instanceof false, which this
// repo has already been bitten by.
export const RETRYABLE_ZXING_KINDS = new Set([
  'NotFoundException',
  'ChecksumException',
  'FormatException',
]);

export async function importZxingFrameParts() {
  // Export shapes verified against the installed 0.21.3: three default exports, but
  // HTMLCanvasElementLuminanceSource is a NAMED export (`export { HTMLCanvasElementLuminanceSource }`).
  // Destructuring `default` off that one yields undefined and throws at construction.
  const [{ default: BinaryBitmap }, { default: HybridBinarizer }, { HTMLCanvasElementLuminanceSource }, { default: DataMatrixReader }] =
    await Promise.all([
      import('@zxing/library/esm/core/BinaryBitmap'),
      import('@zxing/library/esm/core/common/HybridBinarizer'),
      import('@zxing/library/esm/browser/HTMLCanvasElementLuminanceSource'),
      import('@zxing/library/esm/core/datamatrix/DataMatrixReader'),
    ]);
  return {
    BinaryBitmap,
    HybridBinarizer,
    HTMLCanvasElementLuminanceSource,
    reader: new DataMatrixReader(),
  };
}

interface ZxingFrameParts {
  assemble: (canvas: HTMLCanvasElement) => unknown;
  decode: (bitmap: unknown) => { getText(): string };
}

function isRetryableMiss(err: unknown): boolean {
  const kind = (err as { getKind?: () => string } | null)?.getKind?.();
  return kind !== undefined && RETRYABLE_ZXING_KINDS.has(kind);
}

export async function loadZxingFrameDecoder(
  override?: ZxingFrameParts,
): Promise<FrameDecoder | null> {
  try {
    let parts = override;
    if (!parts) {
      const { BinaryBitmap, HybridBinarizer, HTMLCanvasElementLuminanceSource, reader } =
        await importZxingFrameParts();
      parts = {
        // doAutoInvert stays FALSE. The stream path alternated inverted frames via a static toggle
        // that only engaged for HTMLVideoElement, so this is a deliberate change in decode behaviour,
        // recorded rather than hidden (spec D2b).
        assemble: (canvas) =>
          new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas, false))),
        decode: (bitmap) => reader.decode(bitmap as never),
      };
    }
    const { assemble, decode } = parts;
    return {
      decodeFrame: async (canvas) => {
        try {
          return decode(assemble(canvas)).getText();
        } catch (err) {
          if (isRetryableMiss(err)) return null;
          throw err;
        }
      },
      // The reader holds no stream or timer of its own — this loop owns both — so there is nothing to
      // release. Kept to satisfy the seam, which stage 2's decoder will need.
      dispose: () => {},
    };
  } catch {
    return null;
  }
}
```

The four export shapes above were verified against the installed 0.21.3 — do not assume, but do not re-derive either unless something fails. If a shape turns out different, read the module and adjust; **never** switch to a barrel import to make it easier.

- [ ] **Step 4: Rewire the adapter**

In `src/adapters/barcode/browserScanner.ts`:

- Delete the `FallbackDecoder` interface and the whole `scanWithFallback` function.
- Delete `loadBundledDecoder` and `importBundledDatamatrixReader`.
- Import `type FrameDecoder`, `runFrameLoop` from `./frameLoop` and `loadZxingFrameDecoder` from `./zxingFrameDecoder`.
- `ScannerDeps.loadFallbackDecoder` becomes `() => Promise<FrameDecoder | null>`; its default becomes `loadZxingFrameDecoder`.
- Change the local `let fallback: FallbackDecoder | null` to `FrameDecoder | null`.
- Replace the fallback call site with `return await runFrameLoop(fallback as FrameDecoder, target, signal)`.
- **`attach(target.video, stream)` must now run on the fallback path too.** The stream-level decoder used to attach the stream itself; the loop does not. Attach before dispatching to either path.

- [ ] **Step 5: Rewrite the fallback tests the new seam invalidates**

In `src/adapters/barcode/browserScanner.test.ts`, every `loadFallbackDecoder` double returns `{ decode, cancel }` today and must become `{ decodeFrame, dispose }`. Two tests change meaning and must be rewritten rather than renamed:

- The one asserting `cancel()` rejects an in-flight decode — cancellation now happens between attempts and `dispose()` interrupts nothing. Rewrite it to assert the outcome is `cancelled` when the signal fires during a decode.
- The one asserting the zxing path leaves the attempt count unmeasured — that is now false; the fallback counts attempts. Rewrite it to assert a positive count.

Also: the tests that inject a `FrameDecoder` will run the real loop, so they need `videoWidth`/`videoHeight` on the video double and the loop's frame seams. Prefer passing a `minIntervalMs: 0` loop dep through `ScannerDeps` if that is cleaner than reworking each double — but if `ScannerDeps` gains a loop-deps passthrough, say so in the report; it is a real interface change.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/adapters/barcode/`
Expected: PASS — new files plus the rewritten fallback tests plus every native-path test unchanged.

- [ ] **Step 7: Run the full gate including the chunk check**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all pass. **In the build output, confirm the DataMatrix lazy chunk is still ≈92 kB.** If it is ≈415 kB, a barrel import slipped in — find it and use a deep path.

- [ ] **Step 8: Commit**

```bash
git add src/adapters/barcode/zxingFrameDecoder.ts src/adapters/barcode/zxingFrameDecoder.test.ts src/adapters/barcode/browserScanner.ts src/adapters/barcode/browserScanner.test.ts
git commit -m "feat(scan): decode one frame at a time behind a decoder-agnostic seam"
```

---

## Task 4: Records

**Files:**
- Modify: `docs/notes/open-questions.md`, `docs/HANDOFF.md`

**Interfaces:** none.

**Context:** `§B30` tracks the scan decisions. Read `§B30-9` through `§B30-13` before writing and match their four-column shape (`# | 항목 | 결정 | 근거·검증`), their Korean register and their bold conventions.

- [ ] **Step 1: Add the decision row**

Add **B30-14** to the `§B30` table recording, in that register:

- The seam dropped from stream-level to frame-level, and why: the retry loop was inside `BrowserCodeReader.decodeOnce`, so attempts could not be counted at all.
- `createBinaryBitmap` **cannot** take a canvas (parameter type `HTMLVideoElement | HTMLImageElement`, reads `naturalWidth`); the bitmap is assembled from `BinaryBitmap` + `HybridBinarizer` + `HTMLCanvasElementLuminanceSource`, which does take one. Note that the first draft of the spec got this wrong and would have killed every iOS scan on the first attempt.
- All three retryable zxing kinds are translated, matched by `getKind()` because the CJS/ESM split makes `instanceof` false across realms.
- `doAutoInvert` is now `false`, where the stream path alternated inverted frames — a deliberate change in decode behaviour, not a pure refactor.
- Deep `esm/…` imports only, with the 91.96 kB / 415.76 kB figures and the guard test that enforces it.
- The four counters, that the three duration fields are fallback-only, and that they publish **once at the end** because per-attempt publishing re-renders the whole diagnostics report and would land inside the numbers being compared.
- `FRAME_LOOP_MIN_INTERVAL_MS` is separate from `pollIntervalMs` because the two loops are structurally opposite.
- **That the measurement is still outstanding** — this task ships the instrument, not the answer.

- [ ] **Step 2: Refresh the resume record**

In `docs/HANDOFF.md`, update the resume record with the measured gate counts from your own step 3 run (not predicted ones), and rewrite the next-step line to the measurement protocol:

- Compare against the branch state whose code equals `de5b49a` (everything above it is docs-only).
- PowerShell: `$env:HOST='0.0.0.0'; npm run dev:live`. **A phone needs HTTPS** — a LAN IP over plain http yields `secureContext: false` and no camera, so the tunnel is a requirement, not an alternative.
- Same device, same product, permission already granted, **at least two runs each**. Exclude the first post-prompt run and any run that was backgrounded mid-scan.
- Record `스캔 소요` · `카메라 승인` · `디코더 준비` · `시도 횟수` · `디코드 점유` · `프레임 복사` · `루프 대기`.
- The decision rule: `디코드 점유 / 시도 횟수` large → the decoder is slow, stage 2 (`zxing-wasm`) is justified. `프레임 복사` large → resolution or cropping, wasm is irrelevant. `루프 대기` large with few attempts → the interval is too long, tune the constant. A large **residual** after subtracting all three → there is an unmeasured segment, most likely the video warm-up (`playing` event) that no stamp covers today.
  - **⚠️ 2026-07-30 정정(전체-브랜치 최종 리뷰)**: 이 문단의 규칙 중 **둘이 틀렸다** — 잔차 규칙은 워밍업이 `루프 대기`에 흡수되어 발화 불가였고, `프레임 복사` 규칙은 조립 비용이 `디코드 점유`에 들어 있어 발화 불가였다. 실행된 계측은 이 문단을 그대로 따랐다. 정정 정본 = `docs/HANDOFF.md` 판정 규칙 표 + `open-questions.md §B30-15`.
- **Success is not "it got faster."** It is that the four segments separate and the 5.7 s is finally attributable. If it got slower, record that and tune the interval.

- [ ] **Step 3: Run the full gate**

Run: `npm test && npm run typecheck && npm run lint && npm run build && npm run e2e`
Expected: all pass. Record the measured counts and the DataMatrix chunk size.

- [ ] **Step 4: Commit**

```bash
git add docs/notes/open-questions.md docs/HANDOFF.md
git commit -m "docs(scan): record the frame-loop seam and the measurement protocol"
```

---

## Verification Summary

After Task 4 the branch delivers:

1. `시도 횟수` reports a real count on **both** decode paths, and the false `측정 불가 (zxing 내부 루프)` marker is gone because it is no longer true.
2. Three further lines — `디코드 점유`, `프레임 복사`, `루프 대기` — split the fallback loop into decoder cost, frame-copy cost, and deliberate waiting.
3. The decoder sits behind a one-method seam, so stage 2 swaps `zxing-wasm` in without touching the loop.
4. The lazy chunk stays ≈92 kB, enforced by a test rather than by a comment.

**What it does not deliver:** the answer. Whether the ~5.7 s is decoder cost or waiting is what the real-device protocol in `docs/HANDOFF.md` settles, and until those numbers exist the `zxing-wasm` migration stays unjustified.
