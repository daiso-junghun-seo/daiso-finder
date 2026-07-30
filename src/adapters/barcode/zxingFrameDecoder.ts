// src/adapters/barcode/zxingFrameDecoder.ts
// A FrameDecoder over @zxing/library. It exists because BrowserCodeReader.createBinaryBitmap CANNOT
// take a canvas — its parameter is HTMLVideoElement | HTMLImageElement and it reads naturalWidth, so a
// canvas produces an empty 0x0 capture and an exception that is not a retryable miss. The bitmap is
// therefore assembled here from the three parts directly.
//
// This file's job is translating between the frame seam and zxing: bitmap assembly, the timing of that
// assembly (see decodeFrame — it is not decoder cost and must not read as such), and exception
// translation. It owns no loop, no stream and no timer — runFrameLoop owns all three, and stays
// decoder-agnostic so stage 2 can swap what sits behind FrameDecoder without touching it.
//
// Deep esm paths only: the package declares no sideEffects, so one barrel import stops tree-shaking.
// Measured on this tree (2026-07-30, `npm run build`): the four deep specifiers below emit 76.31 kB of
// lazy chunks in total; replacing just ONE of them with the bare '@zxing/library' barrel takes that to
// 417.38 kB, because the barrel drags in every 1D and 2D reader. browserScanner.test.ts guards this on
// this file's source text, since both spellings resolve to working classes at runtime and only the
// emitted chunk tells them apart.
import { publishScanner } from '../../diagnostics/bus';
import { type FrameDecoder, monotonicNow } from './frameLoop';

// zxing's own loop retries all three of these (BrowserCodeReader), and DataMatrixReader documents
// throwing Format/Checksum for a code it cannot decode or whose error correction fails. Matched by
// getKind() rather than instanceof: the CJS/ESM split makes cross-realm instanceof false, which this
// repo has already been bitten by.
export const RETRYABLE_ZXING_KINDS = new Set([
  'NotFoundException',
  'ChecksumException',
  'FormatException',
]);

// THE ONE BEHAVIOUR-CHANGING DECISION IN THIS STAGE (owner decision, 2026-07-30), lifted out of the
// assembly below so a test can pin the value that actually ships. It was an inline literal, and the only
// test near it built its own luminance source — so reverting this to false left the whole suite green on
// the single decode path iOS ever takes.
//
// TRUE restores the stream path's parity: that path passed true for every HTMLVideoElement, so a
// light-on-dark print still had a chance. The alternation is the LIBRARY's, not ours —
// HTMLCanvasElementLuminanceSource flips a static FRAME_INDEX on every buffer it builds and inverts only
// when that flag is false AND doAutoInvert is true, so a constant true yields normal, inverted, normal, …
// across attempts. Do NOT alternate this value as well: the two toggles then cancel and nothing is ever
// inverted. Verified against HTMLCanvasElementLuminanceSource.js:36-39 in 0.21.3.
export const ZXING_DO_AUTO_INVERT = true;

export async function importZxingFrameParts() {
  // Export shapes verified against the installed 0.21.3: three default exports, but
  // HTMLCanvasElementLuminanceSource is a NAMED export (`export { HTMLCanvasElementLuminanceSource }`).
  // Destructuring `default` off that one yields undefined and throws at construction.
  const [
    { default: BinaryBitmap },
    { default: HybridBinarizer },
    { HTMLCanvasElementLuminanceSource },
    { default: DataMatrixReader },
  ] = await Promise.all([
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

// Every member the result side declares is OPTIONAL on purpose. zxing's real Result has all of them, but
// these shapes are also what an injected double and a future package version present, and this file must
// degrade to "not observed" rather than throw on a result that is missing one — a TypeError here would turn
// a good decode into a `failed` run.
interface ZxingResultPoint {
  getX?: () => number;
  getY?: () => number;
}
interface ZxingDecodeResult {
  getText(): string;
  getResultPoints?: () => ZxingResultPoint[] | null | undefined;
}
interface ZxingFrameParts {
  assemble: (canvas: HTMLCanvasElement) => unknown;
  decode: (bitmap: unknown) => ZxingDecodeResult;
}

// THE DECODED SYMBOL'S SIDE LENGTH IN PIXELS, derived from the four corner points the DataMatrix detector
// puts on the Result — verified in the installed 0.21.3 at datamatrix/DataMatrixReader.js:57-62
// (`points = detectorResult.getPoints()`), exposed by `Result.prototype.getResultPoints`.
//
// EXACTLY HOW, so the number's meaning is unambiguous. Four corners give SIX pairwise distances: the four
// sides and the two diagonals. They are sorted ascending, the two largest are discarded as the diagonals,
// and what is published is the MEDIAN of the remaining four — the mean of the 2nd and 3rd smallest of the
// six. In one sentence: **the median edge length of the quadrilateral the detector reported, in pixels of
// the frame that decoded it, rounded to whole pixels.** Two properties that buys:
//   - It is independent of the order the detector returns the corners in (it happens to be topLeft,
//     bottomLeft, bottomRight, topRight, but nothing here relies on that).
//   - A symbol is usually ROTATED in the frame, and an axis-aligned bounding box overstates a rotated one —
//     a square turned 45 degrees has a bounding box the length of its diagonal, 41% too big. Discarding the
//     two longest distances is what excludes the diagonals. Taking the median of the four rather than their
//     mean additionally absorbs one displaced corner, which matters because this detector's corners come
//     from an integer-precision scan.
//
// NOT pixels-per-module, deliberately. PPM needs the symbol's module count, and the Result does not carry
// it — only the detector's internal BitMatrix knows the dimension and it is never exposed — so publishing
// PPM would mean baking in an assumed module count (a 16x16 guess from a single sample) and dressing it as a
// measurement. Pixels is the honest measurement; the conversion, with its assumption named, belongs in
// docs/HANDOFF.md. One caveat that belongs with the derivation: the detector shifts each corner to a MODULE
// CENTRE before returning it (`shiftToModuleCenter`, Detector.js — "shift points to the center of each
// modules"), so this span is a fraction of a module shorter than the printed symbol's outer edge. The bias
// is proportional to the module size, so it does not disturb a ratio taken across two zoom levels.
function symbolSideLength(result: ZxingDecodeResult): number | null {
  if (typeof result.getResultPoints !== 'function') return null;
  const points = result.getResultPoints();
  // Fewer than four corners is not a measurement. The empty NO_POINTS case belongs to the PURE_BARCODE path,
  // which this decoder never takes (it passes no hints at all) — guarded anyway, because a length derived
  // from three corners would be a silent fabrication rather than a visible crash.
  if (!points || points.length < 4) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const point of points.slice(0, 4)) {
    const x = point?.getX?.();
    const y = point?.getY?.();
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    xs.push(x);
    ys.push(y);
  }
  const distances: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    for (let j = i + 1; j < 4; j += 1) {
      distances.push(Math.hypot((xs[i] ?? 0) - (xs[j] ?? 0), (ys[i] ?? 0) - (ys[j] ?? 0)));
    }
  }
  distances.sort((a, b) => a - b);
  // Six sorted distances: [0..3] are the sides, [4] and [5] are the diagonals. The median of the sides is
  // the mean of [1] and [2].
  const lower = distances[1];
  const upper = distances[2];
  if (lower === undefined || upper === undefined) return null;
  const side = (lower + upper) / 2;
  return Number.isFinite(side) ? Math.round(side) : null;
}

function isRetryableMiss(err: unknown): boolean {
  const kind = (err as { getKind?: () => string } | null)?.getKind?.();
  return kind !== undefined && RETRYABLE_ZXING_KINDS.has(kind);
}

export async function loadZxingFrameDecoder(
  override?: ZxingFrameParts,
  // Delta-only, like the loop's — see monotonicNow. Injectable so assembleMs is assertable without a
  // real clock.
  now: () => number = monotonicNow,
): Promise<FrameDecoder | null> {
  try {
    let parts = override;
    if (!parts) {
      const { BinaryBitmap, HybridBinarizer, HTMLCanvasElementLuminanceSource, reader } =
        await importZxingFrameParts();
      parts = {
        // The flag is the exported constant, never an inline literal — see ZXING_DO_AUTO_INVERT for why
        // it must be, and for the library toggle that makes a constant true alternate.
        assemble: (canvas) =>
          new BinaryBitmap(
            new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas, ZXING_DO_AUTO_INVERT)),
          ),
        decode: (bitmap) => reader.decode(bitmap as never),
      };
    }
    const { assemble, decode } = parts;
    // ASSEMBLY IS TIMED SEPARATELY because it is not decoder cost, and folding it into the loop's
    // decodeBusyMs hid the cheapest lever available. `assemble` runs getImageData(0, 0, 1920, 1080) — an
    // 8.3 MB CPU readback out of the canvas — then a 2.07-million-pixel greyscale pass and HybridBinarizer.
    // The loop's drawMs times only the GPU-side drawImage and comes out small, so all of that
    // resolution-proportional cost read as "the decoder is slow → migrate to wasm". But zxing-wasm consumes
    // the same canvas through the same getImageData (spec D2), so it does not move this boundary at all,
    // while cropping to the aiming brackets — about a FIFTH of the pixels, since the box is a square on
    // 60% of the short side: (0.6*1080)^2 / (1920*1080) = 20.25% — moves all of it. Neither
    // could be ranked before this split.
    let assembleMs = 0;
    let frames = 0;
    // Stashed rather than published where it is measured: see dispose() below.
    let symbolSidePx: number | null = null;
    const timedAssemble = (canvas: HTMLCanvasElement): unknown => {
      const start = now();
      try {
        return assemble(canvas);
      } finally {
        // In the finally for the same reason the loop's busy counter is: a throw's cost is still cost.
        assembleMs += now() - start;
        frames += 1;
      }
    };
    return {
      decodeFrame: async (canvas) => {
        try {
          const result = decode(timedAssemble(canvas));
          const text = result.getText();
          // Only on the attempt that actually produced a value. A miss carries no corner points, and an
          // empty string is a miss as far as the loop is concerned (it keeps scanning), so measuring one
          // would attach a symbol size to a run that never read a symbol.
          if (text) symbolSidePx = symbolSideLength(result);
          return text;
        } catch (err) {
          if (isRetryableMiss(err)) return null;
          throw err;
        }
      },
      // The reader holds no stream or timer of its own — the loop owns both — so there is nothing to
      // release. What dispose does own is the ONE publish of this decoder's own segment: it runs exactly
      // once per run, at teardown, which keeps the "never publish per attempt" discipline and keeps
      // frameLoop.ts decoder-agnostic — the loop cannot know that a decoder assembles anything.
      // null, not 0, when no frame was ever assembled: nothing was measured.
      //
      // symbolSidePx rides along here rather than publishing where it is measured, and the reason is not
      // just tidiness. A symbol size exists on exactly ONE attempt, so publishing it inside decodeFrame
      // would technically still be "once per run" — but that publish would land INSIDE the loop's timed
      // decode window, i.e. inside decodeBusyMs and inside assembleMs's own attempt, notifying every bus
      // subscriber and rebuilding the whole diagnostics report in the middle of the numbers this run exists
      // to compare. dispose() runs after the last decodeFrame has returned, so from here it cannot. null,
      // not 0, when nothing decoded: 0px would claim we measured a symbol with no size.
      dispose: () => {
        publishScanner({ assembleMs: frames === 0 ? null : Math.round(assembleMs), symbolSidePx });
      },
    };
  } catch {
    return null;
  }
}
