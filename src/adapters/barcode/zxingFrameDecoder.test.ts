const flag = vi.hoisted(() => ({ enabled: true }));
vi.mock('../../diagnostics/enabled', () => ({ isDiagnosticsEnabled: () => flag.enabled }));

import { getSnapshot, resetDiagnostics } from '../../diagnostics/bus';
import {
  RETRYABLE_ZXING_KINDS,
  ZXING_DO_AUTO_INVERT,
  importZxingFrameParts,
  loadZxingFrameDecoder,
} from './zxingFrameDecoder';
// This module's own source text, via Vite's ?raw — see the doAutoInvert test for why the flag can only be
// pinned this way.
import decoderSource from './zxingFrameDecoder.ts?raw';

beforeEach(() => {
  flag.enabled = true;
  resetDiagnostics();
});

// A fixed +10 per read, so assembleMs is an exact number rather than a range: two reads per assembly
// makes every frame cost exactly 10.
function clock() {
  let t = 0;
  return () => {
    t += 10;
    return t;
  };
}

// zxing retries NotFound, Checksum AND Format. DataMatrixReader throws the latter two on a code it
// cannot decode or whose error correction fails — a blurry frame. Treating only NotFound as retryable
// would end the run on the first partial read and take the measurement with it.
test('all three retryable zxing exception kinds are translated', () => {
  expect(RETRYABLE_ZXING_KINDS).toEqual(
    new Set(['NotFoundException', 'ChecksumException', 'FormatException']),
  );
});

// Also inherits the guarantee the deleted browserScanner test carried: the reader wired here is the
// DataMatrix one and not a MultiFormatReader, which would decode the 1D code on the same packaging and
// hand back a retail EAN as if it were a pdNo. And the await itself fails if a package upgrade moves any
// of the four deep paths — which loadZxingFrameDecoder's catch would otherwise turn into a silent
// `unsupported` on every iOS device, with no error anywhere.
// Four lazy-chunk imports: under full-suite parallel load the honest load outruns the
// 5s default (observed timeouts when the box also serves dev/proxy/tunnels). What this
// pins is constructibility, not load speed.
test('the zxing parts load and are constructible', async () => {
  const parts = await importZxingFrameParts();
  expect(typeof parts.BinaryBitmap).toBe('function');
  expect(typeof parts.HybridBinarizer).toBe('function');
  expect(typeof parts.HTMLCanvasElementLuminanceSource).toBe('function');
  expect(parts.reader.constructor.name).toBe('DataMatrixReader');
}, 20_000);

// THE END-TO-END ONE, and the only test here that runs the REAL assembly and the REAL reader. Every
// other test in this file injects the parts, so all of them would keep passing with an `assemble` that
// cannot work at all — which is exactly the trap this decoder exists to avoid: BrowserCodeReader's own
// createBinaryBitmap takes HTMLVideoElement | HTMLImageElement and reads naturalWidth, so handing it a
// canvas yields a 0x0 capture and a getImageData throw that is NOT a retryable miss. On iOS this is the
// only decoder that ever runs, so a mistake here is not a degraded scan, it is no scan.
//
// A duck-typed canvas, not a real one: jsdom has no canvas and the `canvas` package is not installed.
// It is enough because HTMLCanvasElementLuminanceSource reads exactly `canvas.width`, `canvas.height`
// and `getContext('2d').getImageData(...)` — the very fact that this passes is the proof that the
// luminance source takes a CANVAS and never looks for naturalWidth.
test('the real assembly decodes a blank frame as a miss rather than an error', async () => {
  const width = 120;
  const height = 120;
  // Uniform mid-grey: no finder pattern, so a correct pipeline reaches the reader and the reader
  // legitimately finds nothing.
  const data = new Uint8ClampedArray(width * height * 4).fill(160);
  const canvas = {
    width,
    height,
    getContext: () => ({ getImageData: () => ({ data, width, height }) }),
  } as unknown as HTMLCanvasElement;
  const decoder = await loadZxingFrameDecoder();
  // Not null: a load failure is reported as null, and that would make the assertion below vacuous.
  expect(decoder).not.toBeNull();
  // null, not a throw — via a REAL zxing exception matched by getKind(). This is also what pins the
  // getKind() choice: the exception crosses the CJS/ESM boundary, where instanceof is false.
  await expect(decoder?.decodeFrame(canvas)).resolves.toBeNull();
});

// THE PRODUCTION WIRING, which nothing pinned before: the flag was an inline literal and the test below
// builds its own luminance source, so reverting `true` to `false` — the one behaviour-changing decision in
// this stage, on the only decode path iOS ever takes — left the entire suite green.
//
// Pinned on the source text (the repo idiom, see browserScanner.test.ts's chunk guard) because the flag's
// effect is a static toggle inside the library that no seam here exposes: `assemble` is built from
// dynamically imported classes, and injecting doubles for them cannot be typed without the casts this
// repo forbids. Two assertions, so both mutations are caught — flipping the constant, and re-inlining a
// literal at the call site.
test('the production assembly passes the doAutoInvert constant, not an inline literal', () => {
  expect(ZXING_DO_AUTO_INVERT).toBe(true);
  expect(decoderSource).toMatch(
    /new HTMLCanvasElementLuminanceSource\(\s*canvas,\s*ZXING_DO_AUTO_INVERT,?\s*\)/,
  );
});

// THE LIBRARY'S MECHANISM, not our wiring — and deliberately kept, because it is the evidence for WHY the
// value must be a constant rather than something we alternate ourselves: zxing flips a static FRAME_INDEX
// on every buffer it builds, so a constant `true` already yields normal, inverted, normal, … Alternating
// the argument ourselves would cancel that toggle and disable inversion forever. This test constructs the
// luminance source itself, so it says nothing about what the production assembly passes — the test above
// is what pins that.
test('the library alternates normal and inverted reads while the flag stays on', async () => {
  const width = 8;
  const height = 8;
  // Deliberately asymmetric: a uniform frame would grayscale identically inverted or not, and the
  // assertion below would pass without any inversion happening.
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const level = (i / 4) % 3 === 0 ? 20 : 230;
    data[i] = level;
    data[i + 1] = level;
    data[i + 2] = level;
    data[i + 3] = 255;
  }
  const canvas = {
    width,
    height,
    getContext: () => ({ getImageData: () => ({ data, width, height }) }),
  } as unknown as HTMLCanvasElement;
  const { BinaryBitmap, HybridBinarizer, HTMLCanvasElementLuminanceSource } =
    await importZxingFrameParts();
  const rowOf = (invert: boolean) => {
    const bitmap = new BinaryBitmap(
      new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas, invert)),
    );
    return bitmap.getBlackRow(0, undefined as never).toString();
  };
  // Two constructions with the flag ON must differ, because the static FRAME_INDEX flipped between
  // them. Two with it OFF must match. That difference IS the alternation.
  expect(rowOf(true)).not.toBe(rowOf(true));
  expect(rowOf(false)).toBe(rowOf(false));
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

// THE ASSEMBLY COST, split out of decodeBusyMs. It is 8.3 MB of getImageData readback plus a
// 2.07-million-pixel greyscale pass at 1920x1080 — resolution-proportional cost that a wasm decoder does
// NOT remove (it consumes the same canvas the same way) and that cropping removes almost entirely. Folded
// into 디코드 점유 it read as "the decoder is slow", which is the one conclusion it does not support.
test('the bitmap assembly is timed and published once, on dispose', async () => {
  const decoder = await loadZxingFrameDecoder(
    { assemble: () => ({}) as never, decode: () => ({ getText: () => null }) as never },
    clock(),
  );
  await decoder?.decodeFrame({} as HTMLCanvasElement);
  await decoder?.decodeFrame({} as HTMLCanvasElement);
  // Nothing published mid-run: publishing per attempt re-renders the whole diagnostics report, and the
  // measured run is by definition a ?debug=1 run, so that cost would land inside the numbers compared.
  expect(getSnapshot().scanner.assembleMs).toBeNull();
  decoder?.dispose();
  expect(getSnapshot().scanner.assembleMs).toBe(20);
});

// Same discipline as the loop's counters: a segment nothing was measured for is null, never 0.
test('a decoder that assembled nothing publishes null, not zero', async () => {
  const decoder = await loadZxingFrameDecoder(
    { assemble: () => ({}) as never, decode: () => ({ getText: () => null }) as never },
    clock(),
  );
  decoder?.dispose();
  expect(getSnapshot().scanner.assembleMs).toBeNull();
});

// The accumulation sits in a finally for the same reason the loop's does: a frame whose assembly threw
// still cost what it cost, and dropping it would understate exactly the segment being investigated.
test('an assembly that throws still contributes its cost', async () => {
  const decoder = await loadZxingFrameDecoder(
    {
      assemble: () => {
        throw new Error('boom');
      },
      decode: () => ({ getText: () => null }) as never,
    },
    clock(),
  );
  await expect(decoder?.decodeFrame({} as HTMLCanvasElement)).rejects.toThrow('boom');
  decoder?.dispose();
  expect(getSnapshot().scanner.assembleMs).toBe(10);
});

// A zxing Result double carrying detector corner points — only the two methods the derivation reads. On a
// real camera decode DataMatrixReader puts four of these on the Result (`points = detectorResult.getPoints()`,
// DataMatrixReader.js:57-62) and Result.getResultPoints exposes them.
function resultWith(text: string, points: Array<[number, number]> | null) {
  return {
    getText: () => text,
    getResultPoints: () =>
      points === null ? null : points.map(([x, y]) => ({ getX: () => x, getY: () => y })),
  };
}

async function symbolSideFor(points: Array<[number, number]> | null): Promise<number | null> {
  const decoder = await loadZxingFrameDecoder({
    assemble: () => ({}),
    decode: () => resultWith('19987', points),
  });
  await decoder?.decodeFrame({} as HTMLCanvasElement);
  decoder?.dispose();
  return getSnapshot().scanner.symbolSidePx;
}

// THE INSTRUMENT FOR THE ZOOM LEVER (§B30-17), and the case that pins the derivation rather than merely
// exercising it: a square rotated 45 degrees. Its four sides are each sqrt(200) = 14.14 px, its two
// diagonals are 20 px, and its axis-aligned bounding box is 20x20. So a bounding-box implementation prints
// 20 and OVERSTATES the symbol by 41%, and an implementation that averaged all six pairwise distances
// prints 16. Only "drop the two largest, take the median of the remaining four" gives 14.
test('the symbol side length is the symbol edge, not its bounding box or its diagonal', async () => {
  const side = await symbolSideFor([
    [10, 0],
    [20, 10],
    [10, 20],
    [0, 10],
  ]);
  expect(side).toBe(14);
  expect(side).not.toBe(20); // the bounding box and the diagonal both land here
  expect(side).not.toBe(16); // the mean of all six pairwise distances lands here
});

// WHY THE MEDIAN and not the mean of the four sides. One corner of a detected quadrilateral can sit well
// off the symbol — the detector's corners come from a WhiteRectangleDetector scan whose precision is
// integer, so a low-resolution symbol skews them. Here a 100x100 square has one corner pulled out to
// (140, 0): the six distances are 100, 100, 107.70, 140, 141.42, 172.05. Dropping the two largest still
// leaves the four real sides (the displaced side, 140, is genuinely shorter than either diagonal), and the
// median of those four is 103.85 -> 104. Their MEAN is 111.93 -> 112, the smallest alone is 100, and the
// bounding box is 140. All four are distinguishable, so this test cannot pass on the wrong derivation.
test('one displaced corner moves the measurement by a little, not by a lot', async () => {
  const side = await symbolSideFor([
    [0, 0],
    [0, 100],
    [100, 100],
    [140, 0],
  ]);
  expect(side).toBe(104);
  expect(side).not.toBe(112); // the mean of the four sides
  expect(side).not.toBe(100); // the shortest side alone
  expect(side).not.toBe(140); // the bounding box
});

// Guarded rather than trusted: the empty NO_POINTS case belongs to the PURE_BARCODE path, which this
// decoder never takes (it passes no hints at all), but a size derived from three corners would be a
// silent fabrication rather than a crash.
test('fewer than four corner points is not a measurement', async () => {
  expect(
    await symbolSideFor([
      [0, 0],
      [0, 100],
      [100, 100],
    ]),
  ).toBeNull();
});

test('a result carrying no corner points at all is not a measurement', async () => {
  expect(await symbolSideFor(null)).toBeNull();
});

test('a non-finite corner coordinate is not a measurement', async () => {
  expect(
    await symbolSideFor([
      [0, 0],
      [0, Number.NaN],
      [100, 100],
      [100, 0],
    ]),
  ).toBeNull();
  expect(
    await symbolSideFor([
      [0, 0],
      [0, 100],
      [Number.POSITIVE_INFINITY, 100],
      [100, 0],
    ]),
  ).toBeNull();
});

// A result whose shape predates this measurement — no getResultPoints method at all — must degrade to "not
// observed" rather than throw and turn a good decode into a `failed` run.
test('a result with no getResultPoints method still decodes, and reports no size', async () => {
  const decoder = await loadZxingFrameDecoder({
    assemble: () => ({}),
    decode: () => ({ getText: () => '19987' }),
  });
  await expect(decoder?.decodeFrame({} as HTMLCanvasElement)).resolves.toBe('19987');
  decoder?.dispose();
  expect(getSnapshot().scanner.symbolSidePx).toBeNull();
});

// PUBLISHED ON DISPOSE, with assembleMs, and for the same two reasons: one commit per run rather than two,
// and — decisively here — dispose() runs after the last decodeFrame has returned, so this measurement's own
// bus commit cannot land inside decodeBusyMs or assembleMs, the numbers the run exists to compare.
test('the symbol size is published once, on dispose, not during the run', async () => {
  const decoder = await loadZxingFrameDecoder({
    assemble: () => ({}),
    decode: () =>
      resultWith('19987', [
        [10, 0],
        [20, 10],
        [10, 20],
        [0, 10],
      ]),
  });
  await decoder?.decodeFrame({} as HTMLCanvasElement);
  expect(getSnapshot().scanner.symbolSidePx).toBeNull();
  decoder?.dispose();
  expect(getSnapshot().scanner.symbolSidePx).toBe(14);
});

// Same discipline as every other unmeasured segment: a run in which nothing decoded measured no symbol.
// The double hands back four perfectly good corner points ALONGSIDE an empty text, so the guard being
// tested is the one on the text and not an accident of the points being absent — an empty string is a miss
// as far as the loop is concerned (it keeps scanning), so a size measured from it would attach a symbol to
// a run that never read one.
test('a run that decoded nothing publishes no symbol size, not zero', async () => {
  const decoder = await loadZxingFrameDecoder({
    assemble: () => ({}),
    decode: () =>
      resultWith('', [
        [10, 0],
        [20, 10],
        [10, 20],
        [0, 10],
      ]),
  });
  await decoder?.decodeFrame({} as HTMLCanvasElement);
  decoder?.dispose();
  expect(getSnapshot().scanner.symbolSidePx).toBeNull();
});

test('a decoded result yields its text', async () => {
  const decoder = await loadZxingFrameDecoder({
    assemble: () => ({}) as never,
    decode: () => ({ getText: () => '19987' }) as never,
  });
  await expect(decoder?.decodeFrame({} as HTMLCanvasElement)).resolves.toBe('19987');
});
