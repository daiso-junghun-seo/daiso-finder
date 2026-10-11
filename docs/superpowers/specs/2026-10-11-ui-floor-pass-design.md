# UI Floor Pass — design (2026-10-11)

Bounded usability-floor pass, not the UI-last visual polish (HANDOFF 🟢 slice 3).
Owner verdict 2026-10-11: the app is too unreadable to field-test features against —
fix the floor first, keep the pretty UI last.

## 0. Non-goals (hard)

- UX copy: zero changes (Bible-verbatim, `src/ui/copy.ts` untouched).
- 6 states / transitions / Zustand / ports / judgement: untouched.
- No new dependencies, no paid services (free-local rule).
- No `z-index` anywhere (`src/styles/layout.test.ts` pins DOM-order stacking).
- No visual redesign: structure + bounds only. Glass finish, candidate presentation
  design, loading UX stay in the last-mile pass.

## 1. Defects (all observed in source, 2026-10-11)

1. `.product-photo` has zero CSS — unbounded `<img>` blows out candidate rows /
   the answer card (remote image intrinsic size rules the layout).
2. `.candidate-list ul` unstyled — UA bullets + no row gap + button is inline
   (`text-body` only): name/price wrap under the photo, tap rows touch each other.
3. `.search-bar` (the `<form>`) has no rule — input UA width + scan button share a
   row by accident, not by contract; narrow phones risk wrap/overflow.
4. `.recent-searches ul` unstyled — same UA-bullet + no-gap problem as (2).
5. `.answer-card` has no padding — long location/price lines touch the glass edge;
   long product names have no wrap guarantee.
6. Stacking — VERIFIED, no change: `AvailabilitySurface.tsx` renders the scanner
   modal LAST in all three branches (default/candidates/answer), sheet before it,
   scrims immediately before their modal. DOM-order convention already correct.

## 2. Rules (all in `src/styles/layout.css`, flat selectors so `ruleFor` keeps working)

```css
.search-bar { display: flex; gap: 8px; align-items: center; }
.search-bar input { flex: 1 1 auto; min-width: 0; }  /* min-width:0 lets flex shrink past the UA default width */
.recent-searches ul { list-style: none; margin: 0; padding: 0; }
.recent-searches li + li { margin-top: 8px; }
.candidate-list ul { list-style: none; margin: 0; padding: 0; }
.candidate-list li + li { margin-top: 8px; }
.candidate-list button { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; }
.candidate-list button > span:first-of-type { flex: 1 1 auto; }  /* name takes the row; price hugs right */
.candidate-list .product-photo { width: 64px; height: 64px; object-fit: contain; flex: none; }
.answer-card { padding: 16px; overflow-wrap: break-word; }
.answer-card .product-photo { display: block; max-width: 100%; max-height: 240px; object-fit: contain; }
```

- `object-fit: contain`, never `cover`: a cropped photo would hide shelf-matchable
  detail — honesty over neatness. Fixed 64px box keeps rows uniform.
- Existing `.answer-card button + button` margin rule stays (inline-block buttons
  wrap on their own; the gap rule only spaces the un-wrapped pair).
- Touch targets already global (`button,input{min:44px}`, sheet `li+li 8px);
  candidate rows inherit both via the new `li+li` rule.

## 3. Tests

- `src/styles/layout.test.ts`: positive assertions per new rule (prohibitions-only
  guards pass on deletion — repo lesson, §B30-15/§B31 wave). Flat selectors only.
- `test/e2e/interactive.spec.ts` (phone 390×844, existing `boxOf` helpers):
  1. search input + 스캔 button share one row, neither overflows the viewport;
  2. candidate photo boxes are ≤64px and inside their row;
  3. answer photo (after candidate tap → Success) fits inside the card.
- Existing suites untouched: copy verbatim, state machine, scanner geometry,
  diagnostics overlap, contrast.

## 4. Gate

vitest full · `tsc -b` · `biome check .` · `vite build` · Playwright full
(dev + preview). Docs: `open-questions.md` §B32 (one row) + HANDOFF floor item.
Local commit only, no push.
