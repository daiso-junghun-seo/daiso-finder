# User-Centered Slice — design (2026-10-12)

Owner orders (2026-10-12 Q&A): (1) remove 위치 보기 only (siblings stay till flows),
(2) ko+en with auto-detect AND a selector UI, match tokens (product/store names,
prices, floors/zones) stay Korean per D069. Plus: stop holding layout fixed —
rethink user-centered within the contract.

## 0. Non-goals

- No copy/transition/flow/state/scanner change beyond listed. No new deps.
- Empty L3 similar-names: still deferred (no data). Overlay text: still Bible's.

## 1. CTA removal (Bible deviation, owner-ordered, temporary)

- inStock success CTA (위치 보기) unrendered; its announcement line dropped too
  (announcing an absent control strands SR shoppers). factsFor keeps the string
  (untouched domain) — Flow 2 restores the button wired.
- Siblings (대안 보기·근처·재입고·가맹) STAY per owner scope answer.
- E6 tension recorded: card ends with freshness, no next action — mitigated by
  the persistent dock (re-search/scan always live), restored properly by Flow 2.

## 2. Layout rethink (inside L1–L4 + mockup order)

- Answer content vertically centres in the grown card (dead void → peak focus).
  Above-fold/scroll behavior unchanged.
- Store line gains a utility cluster (locale toggle + 매장 변경) — one 44px
  cycling button showing the TARGET language (KO|EN without room: single toggle).
- Rest: order untouched (Bible-bound).

## 3. i18n floor (ko+en)

- `src/i18n/locale.ts`: `Locale`, `resolveLocale({search, stored, navigator})`
  precedence `?lang=` > stored > navigator(en*→en) > ko. Pure + tested.
- `src/i18n/locale-storage.ts`: `daiso.locale`, validated, best-effort (G3 pattern).
- `src/i18n/en.ts`: full English mirror. Guidance translates; names/prices/alts stay
  Korean, floors/zones translate GRAMMAR only since §B46 (`11F · No. 56`, digits
  identical — signage risk recorded there).
  Relative times get `formatRelativeTimeEn` (Today/Yesterday/Mon d, h AM/PM, no
  minutes — mirrors the ko truncation rule). Prices use `₩2,000` (§B45: digits
  identical). Restock DATE stays Korean-rendered
  (answer carries formatted `lchDay`, ISO lost upstream) — flagged follow-up, not
  silent: `Expected around ${lchDay}.`
- `src/i18n/strings.ts`: explicit `CopyTable` interface + `STR` record + runtime
  key-parity test (ko namespace vs EN). ko source stays copy.ts verbatim.
- copy.ts: `factsFor(answer, locale='ko')`, `announcementFor(..., locale='ko')`
  delegate to en on request; ko paths byte-identical (existing tests untouched).
- Components read `locale` from zustand (new `locale` + `setLocale`, persisted)
  and render via `strings(locale)`: Surface, AnswerCard, CandidateList, Sheet,
  ScannerOverlay, StoreContextLine. DiagnosticsBar stays Korean (dev-only, noted).
- Suite locale: test-setup pins `navigator.language` ko-KR (documents suite
  language); Playwright `use.locale: 'ko-KR'` both projects; one EN E2E
  (`?lang=en` → Scan button) proves the switch end to end.
- EN text is first-draft app copy (owner-readable, Bible ratification may reword
  via the same verbatim-replace path as ko drafts).

## 4. Tests

- locale resolve/storage/table-parity/formatter-en unit tests.
- Component: toggle flips + persists; EN render spot-checks (scan button, notice).
- AnswerCard/copy updates for CTA removal (absence asserts + Flow-2-restores note).
- E2E: locale pin + EN proof test. Existing locators unchanged (ko default).
- Screenshots: ko + en default/success.

## 5. Gate

vitest full · `tsc -b` · `biome check .` · `vite build` · Playwright full.
Branch `feat/ui-usercentered` → fresh-context review → local `--no-ff` merge.
Docs: §B40. No push, no deploy.
