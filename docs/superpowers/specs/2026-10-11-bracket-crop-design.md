# Bracket Crop — design (2026-10-11)

Owner sequence §§B30-15/17/19/20/25: crop was ranked but never shipped. The zoom
sweep (B30-25) kept the mechanism unverified yet left the main-thread fact
standing (~95% occupancy, this device): crop is the only lever that moves the
pixel-proportional costs (assemble + copy), and it stacks with — not against —
zoom (sensor crop raises PPM; bracket crop cuts pixels at the same scale).

## 0. Non-goals (hard)

- Not a decode lever: pixels-per-module do not rise (B30-17⑨). No speed claim —
  the next device run measures it (assemble/copy per attempt vs 11.8~12.9/1.9~2.4ms).
- No zoom change (`MAX_SCAN_ZOOM = 2` untouched), no native-path change
  (`detect(video)` still reads the whole frame — Android was never saturated).
- No new instrumentation (B31-2: diagnostics observe, never steer).
- No copy change: the aim guide already says 네모에 꽉 채워 — crop makes the
  decoder read what the guide promises.
- Free-local rule: no deps, no services.

## 1. Geometry (pure, tested)

`bracketCropBox(videoWidth, videoHeight, ratio = BRACKET_CROP_RATIO)` → centered
`{ sx, sy, sw, sh }`, floored ints, clamped ≥1. `BRACKET_CROP_RATIO = 0.6`
mirrors the aim square (§B30-10: short side 60%). 1920×1080 → 648² px = 20.25%
of the frame. 1:1 scale — `symbolSidePx` stays comparable across zoom and
against pre-crop runs (same pixels, fewer of them).

Aspect-mismatch caveat (recorded, not solved): the visible brackets sit on the
preview element (`object-fit: cover`) while the crop sits on the video frame.
Where aspects match (all measured devices: 16:9 stream) they coincide; where
they do not, the crop is approximately the guided region. The guide copy is
unchanged, so no new promise is made.

## 2. Wiring (loop owns it — decoder-agnosticism kept)

- `FrameLoopDeps.copyFrame` gains a third arg: `(video, canvas, crop: CropBox)`.
  Existing 2-arg doubles still typecheck (fewer params) and keep working.
- `defaultCopyFrame` draws the source rect:
  `drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)`; canvas is sized to `(sw, sh)`.
- The fallback path only. `runFrameLoop` computes the box per attempt (dims are
  stable; per-attempt keeps a mid-run change honest) and resizes like today.

## 3. Product decision (app-owned, reversible, recorded in §B33)

Codes outside the brackets stop decoding on the fallback path. Accepted because:
(a) the guide already instructs filling the square; (b) all 8 measured symbols
were 11~16% of the bracket side — never near an edge; (c) one constant reverts
it. If a run shows edge-clipped misses, the revert is `BRACKET_CROP_RATIO`
deletion, not a redesign.

## 4. Tests (TDD, RED first)

- Geometry table: 1920×1080 → `{636,216,648,648}`; portrait 1080×1920 mirrored;
  640×480 default target → 288² at (176,96); odd dims floored; degenerate dims
  clamp to ≥1; shipped ratio pins 0.6 (a silent revert must fail — §B30-16 lesson).
- Loop: canvas sized to the box (not the video) and reused; `copyFrame` receives
  the exact box; decoder gets the cropped canvas. The old
  "canvas is sized to the video" test is UPDATED (behavior change, not coverage
  loss — its reuse + capture discipline stays).
- Existing abort/warmup/pacing tests untouched (seam extension is backward
  compatible). `browserScanner.test.ts` stub unaffected (replaces the loop whole).

## 5. Verification (device, next run)

Panel per-attempt `비트맵 조립` + `프레임 복사` fall ~5× (pixel-proportional);
decoder-own stays ~5~6ms (not pixel-bound — the split that ranked this).
`symbolSidePx` continuity check: same code, same distance ≈ same px as B30-25.

## 6. Gate

vitest full · `tsc -b` · `biome check .` · `vite build` · Playwright full.
Then branch review (subagent, fresh context) → local merge. Docs: §B33 + HANDOFF.
