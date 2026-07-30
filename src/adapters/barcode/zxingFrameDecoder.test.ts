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
test('the zxing parts load and are constructible', async () => {
  const parts = await importZxingFrameParts();
  expect(typeof parts.BinaryBitmap).toBe('function');
  expect(typeof parts.HybridBinarizer).toBe('function');
  expect(typeof parts.HTMLCanvasElementLuminanceSource).toBe('function');
  expect(parts.reader.constructor.name).toBe('DataMatrixReader');
});

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

test('a decoded result yields its text', async () => {
  const decoder = await loadZxingFrameDecoder({
    assemble: () => ({}) as never,
    decode: () => ({ getText: () => '19987' }) as never,
  });
  await expect(decoder?.decodeFrame({} as HTMLCanvasElement)).resolves.toBe('19987');
});
