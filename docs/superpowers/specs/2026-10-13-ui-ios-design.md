# iOS Pass — design (2026-10-13)

Owner: iOS-style is the trend — compose freely, adjust frames, rethink order.
Binding constraints (unchanged): copy, six states, L1–L4 levels, bottom dock,
typography mapping, color roles, 44/8, focus order, live regions, 200% scaling,
D083, AA. Order verdict after review: LEVELS are Bible-fixed and mockups fix
arrangement — rethink lands on air/weight/grouping, not block order (recorded,
not smuggled). Two iOS idioms considered and REJECTED on Bible conflict:
inset-grouped zero-gap lists (Interface §6 ≥8pt between targets wins) and the
segmented KO|EN control (32pt segments break the 44px rule — single toggle stays).

## 1. Moves

1. **Rounded display type**: `--font-display: ui-rounded, var(--font-sans)` on
   status Display + price hero + scan label. Apple renders SF Rounded, others
   fall through gracefully. No dep, no layout shift risk (same metrics family).
2. **iOS search field**: magnifier SVG inside the input (wrapper div, aria-hidden
   icon, label/placeholder unchanged). Bible: input stays labeled, placeholder a hint.
3. **Specular glass**: `inset 0 1px 0` top highlight on dock + card (D083's own
   Liquid Glass permission — translucency already there). Decorative: no pair.
4. **Large-title entry**: h1 1.375→1.75rem/700 (purpose statement earns the
   iOS large-title read; weight count unchanged — 700 already in use).
5. Everything else (order, IA, flows): untouched — §B42 records the boundary.

## 2. Tests

- layout.test.ts: display stack, search wrapper, specular rule presence,
  h1 scale. First-match discipline.
- Surface/overlay tests: label queries unchanged (icon aria-hidden) — expect
  green unmodified; add search-icon aria-hidden assertion.
- E2E: unchanged (verify green).
- Verification: light + dark screenshots.

## 3. Gate

vitest full · `tsc -b` · `biome check .` · `vite build` · Playwright full.
Branch `feat/ui-ios` → fresh-context review → local `--no-ff` merge.
Docs: §B42. No push, no deploy.
