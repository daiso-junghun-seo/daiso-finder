# UI Refinement — design (2026-10-12, second pass)

Owner verdict on the polish pass: correct but plain — reads dev, not consumer.
This pass spends the remaining headroom INSIDE the same Bible contract (copy,
six states, L1–L4, bottom dock, typography mapping, color roles, 44/8, focus
order, live regions, 200% scaling, D083, AA). Reference direction: Korean
consumer clarity (Toss-style: one hero number, generous air, quiet borders,
single thumb CTA) on DAISO red — not a new language, the contract fully dressed.

## 0. Non-goals

- No copy/transition/flow/state/scanner-geometry change. No new deps (inline SVG
  icons only — aria-hidden, labels stay text per I6/no-unlabeled-icons).
- No framework swap (same rationale as §B36, stands).

## 1. Moves

1. **App frame**: phone-full-bleed, desktop-centred 480px column on an ambient
   ground (`--ground` light #f1f1f3 / dark #0a0a0b; `main` solid, side hairlines
   desktop-only). Instant "real app" read. Sticky bars stay inside the column;
   diagnostics bar (a `main` sibling) untouched.
2. **Elevated cards**: answer + candidates + sheet rows get `--radius-lg`,
   `--shadow-card` (light soft drop; dark: none, border carries it — blur budget
   untouched, D083 glass stays where it is).
3. **Status pill**: status line becomes a tinted pill (icon + text unchanged).
   New tint pairs mechanically verified: success-on-tint, error-on-tint (banner),
   neutral-on-tint (secondary rows), both themes. If a pair misses 4.5 the tint
   is dropped, not the text — recorded per pair.
4. **Price hero**: 1.75rem/800 + `font-variant-numeric: tabular-nums` (no dep).
   Still the Heading role, one notch above product name.
5. **Search dock**: floating bar (radius 20, shadow, padding), scan button pill.
6. **Empty medallion**: 56px tinted circle + inline SVG magnifier (aria-hidden,
   decorative — product-photo honesty rule is about product imagery, not chrome).
   Alignment stays left per Interface mockups.
7. **Sheet rows**: chevron `›` (aria-hidden) + distance weight; grabber kept.
8. **Press feedback**: `:active { transform: scale(.98) }` on buttons (transform
   only; reduced-motion cut covers it via the global rule).
9. Icons: scan corners, retry arrow, chevron — inline SVG, text labels unchanged.

## 2. Tokens/rules

- `--ground`, `--shadow-card`, `--tint-success`, `--tint-error`, `--tint-neutral`
  (light + dark values), all consumed only through verified pairs.
- Flat selectors; first-match merges as before (floor lesson, twice learned).
- Shadows: `box-shadow` on cards/dock only (never on scrolling lists — G3).

## 3. Tests

- contrast.test.ts: every NEW text-bearing tint pair light+dark (success/error/neutral pills,
  error banner if tinted, chip ground?). Decorative-only color (medallion icon on tint,
  bare ground gutter — never behind text) is exempt by construction, not by oversight.
  Fail = drop tint, keep text.
- layout.test.ts: positive assertions per new rule; keyframes untouched (no new
  motion except :active press — no test needed beyond presence? assert the
  transform-only declaration textually).
- AnswerCard/CandidateList/surface tests: order/copy unchanged — expect green
  unmodified; add pill-class presence + medallion aria-hidden assertions.
- E2E: geometry suite must stay green (photo ≤64.5, bar overlap, aim). No locator
  changes expected; verify.
- Verification: re-shoot 01–05 + dark-mode shot (prefers-color-scheme emulation)
  and eyeball.

## 4. Gate

vitest full · `tsc -b` · `biome check .` · `vite build` · Playwright full.
Branch `feat/ui-refine` → fresh-context review → local `--no-ff` merge.
Docs: §B38. No push, no deploy.
