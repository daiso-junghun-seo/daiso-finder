# UI Feed — design (2026-10-12, third pass)

Owner verdict on refine: still not consumer-grade. Direction: Instagram feel —
photo-first, horizontal snap rows, feed cards — rethought including layout, still
inside the Bible Interface contract (copy, six states, L1–L4, bottom dock,
typography mapping, color roles, 44/8, focus order, live regions, 200% scaling,
D083, AA). Deliberately NOT taken: text-over-image overlays (unverifiable
contrast on unknown vendor pixels + mockup-order departure — needs Bible, not
app, to bless), new deps, new hues.

## 0. Non-goals

- No copy/transition/flow/state/scanner change. Overlay text: no. Framework: no.

## 1. Moves

1. **Photo-first cards**: candidate thumbs 64→80px (bounded still — intrinsic
   blowout prevention stands, bound moves with reason); answer photo max-height
   240→260 + radius-md. E2E bound 64.5→80.5 + unit updates ride along.
2. **Stories-style recents**: horizontal snap-scroll row (`scroll-snap-type: x`,
   `scrollbar-width: thin` — hidden scrollbars cost keyboard discoverability).
   Same data, tap = resubmit. Chips keep pill + 44px.
3. **Price discipline**: 800→700 (03 "max two weights per state" is soft, but a
   fourth weight buys nothing size already gives). 1.75rem + tabular kept.
4. **Tabular candidate prices**: second span gets `tabular-nums` (no dep).
5. **Feed rhythm**: candidate rows radius-lg + shadow already; row gap 8→12px
   (list breathes like a feed; 44px targets + 12px gaps exceed §6 minimums).
   `li+li` 8px rule updated with reason (Interface minimum is 8, not exactly 8).
6. Sheet/scanner/dock/diagnostics: untouched this pass.

## 2. Tests

- layout.test.ts: thumb 80, photo 260 + radius, snap row props, tabular price,
  weight-700 price, row gap 12. First-match discipline as before.
- E2E floor: photo bound 80.5 (reason comment updated); numbers unchanged.
- contrast.test.ts: nothing (zero new colored pairs).
- AnswerCard/surface tests: untouched (no markup change except none — pure CSS
  pass; verify green unmodified).
- Verification: re-shoot 01–03 + dark; eyeball feed read.

## 3. Gate

vitest full · `tsc -b` · `biome check .` · `vite build` · Playwright full.
Branch `feat/ui-feed` → fresh-context review → local `--no-ff` merge.
Docs: §B39. No push, no deploy.
