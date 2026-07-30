import {
  RETRYABLE_ZXING_KINDS,
  importZxingFrameParts,
  loadZxingFrameDecoder,
} from './zxingFrameDecoder';

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
