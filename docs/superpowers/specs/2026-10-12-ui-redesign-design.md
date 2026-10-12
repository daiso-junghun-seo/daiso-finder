# UI Redesign — design (2026-10-12)

Owner directive: full rethink from a blank slate, features taken as checked.
Binding constraints (read-only, from `../product-bible/06_Product/daiso-companion/Interface/availability-check.md`):
copy table verbatim · six states + transitions · single surface + L1–L4 table ·
bottom-docked bar (reversible only by escalation — KEPT) · skeleton <100ms +
150–300ms transitions + reduce-motion cuts · typography mapping (≤2 weights) ·
color roles (Primary = scan CTA + 위치 보기; Success/Error/Neutral discipline) ·
44px/8px · focus order · live regions · 200% scaling · D083 glass + AA.
Anything beyond this contract escalates to Bible instead of being improvised.

## 0. Non-goals

- No copy/transition/port/judgement change. No AI tiering, no Flow 2/3 wiring
  (위치 보기·대안계 CTAs stay inert outline stubs until their flows land — a
  prominent dead button is worse than a quiet one; recorded tension, §B37).
- Scanner geometry/copy untouched. No new deps (free-local rule).

## 1. Moves (all inside the contract)

1. **Answer hero**: photo up to 200px presentation (bounds unchanged),
   price·location hero-emphasized, status Display + icon (existing), full-width
   L2 CTA row. Same elements, same order — weight redistributed to the
   two-second glance (§7 Q4).
2. **Primary discipline**: filled primary = WIRED CTAs only (scan entry + Empty
   scan CTA + 다시 확인). Inert stubs stay outline. (Bible names 위치 보기
   Primary — flips when Flow 2 wires it.)
3. **Loading skeleton**: photo slot + two text bars (aria-hidden), opacity pulse
   1.2s (global reduce-motion cut applies). Bible §3 REQUIRES skeleton <100ms —
   currently missing; copy unchanged.
4. **Answer enter motion**: `card-enter` 220ms ease-out (opacity + translateY 8px
   only — same GPU discipline as aim-breathe), reduced-motion cuts globally.
   Bible §3 transition contract, currently missing.
5. **Empty L2 scan CTA**: Bible REQUIRES a scan button inside the Empty card —
   currently absent. Wired to the existing `openScanner` (new `onScan` prop on
   AnswerCard, mirroring `onRetry`; scanEmptyBody case included = scan retry).
   Suggestions L3 (비슷한 이름) DEFERRED + recorded: no similarity data source
   exists; inventing names would fabricate.
6. **Recent chips**: recent searches render as wrap pills (same data, tap =
   resubmit). Recognition over recall, compact on 390px.
7. **Sheet chrome+**: grabber affordance (visual only, no gesture change),
   nearby rows with distance weight, current-store ✓ retained.
8. **Store pill**: pin glyph (aria-hidden, text stays) + quiet change link.

## 2. Tokens/rules (tokens.css + layout.css, flat selectors)

- `--radius`/`--space` scales already exist — reuse, no new scale.
- `.cta-row` full-width primary/outline buttons (`width:100%`, radius-md,
  padding 12px 16px); `.cta--primary` = action tokens (existing, verified).
- `.answer-hero-photo` (200px cap), `.price-line` (1.25rem/700 — Heading role,
  stays inside mapping), `.skeleton-block` + `@keyframes skeleton-pulse`
  (opacity only), `.answer-card` enter animation, `.chip-row`/`.chip` (pill,
  wrap, 8px gap), `.sheet-grabber`, `.store-pill`.
- Keyframes discipline mirrored from aim-breathe: property whitelist test +
  translate-presence test where applicable.

## 3. Tests

- contrast.test.ts: nothing new (zero new colored pairs — reuse verified tokens).
- layout.test.ts: positive assertions per new rule/class.
- AnswerCard.test.tsx: Empty scan CTA renders (both origins) + calls onScan;
  inStock hero order (photo→name→status→price→caption→CTA) pinned by text order;
  skeleton blocks aria-hidden + motion-agnostic (no animation assertions on
  content).
- AvailabilitySurface.test.tsx: Empty scan tap opens the scanner (scannerOpen);
  live-region dedup test intact.
- E2E: unchanged locators (verify green); stale comments corrected if touched.
- Verification: re-shoot 01–05 + loading state (slow mock? `?scenario=` harness
  has loading? states.spec covers loading? — shoot via slow path if available,
  else DEV mock instant; at minimum eyeball static skeleton by freezing? Fallback:
  Storybook-less — assert markup in unit tests + eyeball other five.)

## 4. Gate

vitest full · `tsc -b` · `biome check .` · `vite build` · Playwright full.
Branch `feat/ui-redesign` → fresh-context review → local `--no-ff` merge.
Docs: §B37 + HANDOFF redesign item. No push, no deploy.
