# UI Polish — design (2026-10-12)

Owner directive 2026-10-12: usability first, modern UI/UX actively. This pass
covers Flow 1's shopper surfaces. Still out (unchanged gates): AI tiering,
reverse-RFC, Flow 2/3, copy strings, state machine, scanner geometry/copy.

## 0. Non-goals (hard)

- Copy: zero string changes. States/transitions/ports/judgement: untouched.
- Scanner overlay geometry + aim guide: E2E-locked, not restyled.
- No framework swap (Tailwind/shadcn scaffold branch exists and is DELIBERATELY
  unused): the token + contrast-verified CSS system plus the CSS-text test idiom
  would be rewritten for no shopper-visible gain. Free-local rule: no new deps.
- Color roles (Interface §5/§9): success/error hues stay where they are. Any new
  colored pair is mechanically contrast-checked in contrast.test.ts.

## 1. Defects (phone screenshots 390×844, 2026-10-12 — `01..05-default/candidates/
success/sheet/empty`)

1. No font stack — UA serif fallback. System sans stack is the largest single win.
2. Announcement duplication — surface `<LiveRegion>` renders visibly next to the
   card/list carrying the same sentences (verified field-by-field against
   `announcementFor` in copy.ts: every state duplicates EXCEPT success/non-inStock,
   whose freshness line the card lacked — the review caught it, so that branch now
   renders the caption visibly too). Fix: `visuallyHidden` at the two surface call
   sites (candidates + answer branches). SR announcements preserved; E2E `.first()`
   locators keep passing with a single match. The stale "sole visible source"
   comment in interactive.spec.ts is corrected, not deleted.
3. Raw UA controls — grey bevel buttons, square inputs. Flat button system +
   input system on existing tokens.
4. No rhythm — headline/surface/card/rows have UA margins only. Spacing scale +
   surface padding + card/row internal rhythm.
5. Store line + sheet chrome bare — row layout, sheet radius/header rhythm,
   list-row buttons consistent with candidate rows.

## 2. Tokens (tokens.css only, values)

- `--font-sans: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo',
  'Noto Sans KR', 'Segoe UI', Roboto, sans-serif` on body (Korean-first: Apple SD
  Gothic Neo / Noto Sans KR ahead of Segoe UI).
- `--radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-pill: 999px`.
- `--space-xs: 4px; --space-sm: 8px; --space-md: 12px; --space-lg: 16px; --space-xl: 24px`.
- Primary action: light `--action-bg: var(--color-accent)` + `--action-fg: #fff`
  (white on #e60012 ≈ 4.8:1); dark `--action-bg: var(--color-accent)`(#ff4d5e) +
  `--action-fg: #121212` (≈ 5.8:1). Both pinned in contrast.test.ts.
- `--focus-ring: 2px solid var(--color-accent)` with `outline-offset: 2px` for
  `:focus-visible` (accent-on-white ≈ 4.8:1, non-text indicator).

## 3. Rules (layout.css; flat selectors — ruleFor idiom)

- Base: `button { font: inherit; border-radius: var(--radius-md); border: 1px solid
  var(--color-neutral-border); background: var(--surface-solid); color:
  var(--text-primary); padding: 10px 16px; }` + `:focus-visible` ring. No UA grey.
- `.scan-button--primary` (scan CTA only): accent fill + action fg. The ONLY
  filled button — everything else stays outline so the scan entry reads primary.
- `input`: same radius/border/padding, `background: var(--surface-solid)`,
  `width: 100%` inside flex rows (with existing `min-width: 0`).
- `main`: `padding: 0 var(--space-lg)`, `gap` rhythm on `.surface-content`
  (`gap: var(--space-md)`); `h1` size clamp (`1.375rem`, balance) — headline
  stops shouting.
- `.store-context-line`: flex row, `justify-content: space-between`,
  `align-items: center`, caption secondary + change button quiet (borderless,
  accent text, underline offset — still ≥44px).
- `.answer-card > div`: vertical rhythm (`> * + *` margin-top 8px); CTA buttons
  wrap with `gap` (keep existing margin rule? replace with flex-wrap container —
  NO container exists; keep `button+button` margin AND add `overflow-wrap`…
  already there. Minimal: card padding 16→20px? Keep 16 (floor), add internal
  rhythm only.)
- `.candidate-list button`: radius-md, border, padding 12, photo well (tint
  background behind contain-fit thumb? tint = surface-solid darker? — NO new
  color: use `background: var(--surface-solid)` + border. Photo well skipped to
  avoid unverified pairs. Name `font-weight 600`, price tabular? (no font-feature
  dep — skip).
- `.store-selection-sheet`: `border-radius: var(--radius-lg) var(--radius-lg) 0 0`,
  header flex already, input full row, list buttons full-width left radius-sm.
- `.sheet-scrim`, overlay, aim, diagnostics: untouched.
- Reduced-motion/transparency: inherit global rules, no local exceptions.

## 4. Tests

- contrast.test.ts: primary pairs (light + dark) + focus-ring pair, same
  worst-case-composite method as B14 rows (ring: opaque on own surfaces, so the
  per-theme solid pair is the honest check — recorded in the test).
- layout.test.ts: positive assertions for button system, rhythm rules, sheet chrome
  (flat selectors only). Font stack asserted in tokens.test.ts (it lives there).
- AvailabilitySurface.test.tsx: dedup assertions for BOTH live regions (candidates +
  answer branches — announcements still fire).
- ProductPhoto onError unmount + 3 unit tests; E2E CDN stub (1px PNG) so geometry
  tests measure the CSS box, not the sandbox's unreachable CDN (disclosed in situ).
- E2E: no locator changes (`.first()` survives); stale comment corrected.
- Verification: re-shoot 01–05 at 390×844 and eyeball before/after.

## 5. Gate

vitest full · `tsc -b` · `biome check .` · `vite build` · Playwright full.
Branch `feat/ui-polish` → fresh-context review → local `--no-ff` merge.
Docs: §B36 + HANDOFF polish item. No push, no deploy.
