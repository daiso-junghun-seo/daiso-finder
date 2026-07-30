// src/adapters/barcode/zxingFrameDecoder.ts
// A FrameDecoder over @zxing/library. It exists because BrowserCodeReader.createBinaryBitmap CANNOT
// take a canvas — its parameter is HTMLVideoElement | HTMLImageElement and it reads naturalWidth, so a
// canvas produces an empty 0x0 capture and an exception that is not a retryable miss. The bitmap is
// therefore assembled here from the three parts directly.
//
// This file's ONLY job is translating between the frame seam and zxing: bitmap assembly plus exception
// translation. It owns no loop, no stream and no timer — runFrameLoop owns all three, and stays
// decoder-agnostic so stage 2 can swap what sits behind FrameDecoder without touching it.
//
// Deep esm paths only: the package declares no sideEffects, so one barrel import stops tree-shaking.
// Measured on this tree (2026-07-30, `npm run build`): the four deep specifiers below emit 76.31 kB of
// lazy chunks in total; replacing just ONE of them with the bare '@zxing/library' barrel takes that to
// 417.38 kB, because the barrel drags in every 1D and 2D reader. browserScanner.test.ts guards this on
// this file's source text, since both spellings resolve to working classes at runtime and only the
// emitted chunk tells them apart.
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
        // TRUE, restoring the stream path's parity (owner decision, 2026-07-30): that path passed true
        // for every HTMLVideoElement, so a light-on-dark print still had a chance. Passing false made
        // this — the only decode path iOS ever takes — unable to read one at all.
        //
        // The alternation is the LIBRARY's, not ours: HTMLCanvasElementLuminanceSource flips a static
        // FRAME_INDEX on every buffer it builds and inverts only when that flag is false AND
        // doAutoInvert is true, so a constant true yields normal, inverted, normal, … across attempts.
        // Do NOT alternate this argument as well — the two toggles then cancel and nothing is ever
        // inverted. Verified against HTMLCanvasElementLuminanceSource.js:36-39 in 0.21.3.
        assemble: (canvas) =>
          new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas, true))),
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
      // The reader holds no stream or timer of its own — the loop owns both — so there is nothing to
      // release. Kept to satisfy the seam, which stage 2's decoder will need.
      dispose: () => {},
    };
  } catch {
    return null;
  }
}
