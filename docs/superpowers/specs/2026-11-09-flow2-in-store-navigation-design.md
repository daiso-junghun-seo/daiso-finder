# Flow 2 — In-Store Navigation implementation design (2026-11-09)

Authority: `product-bible/06_Product/daiso-companion/{Experience,Interface,Engineering}/in-store-navigation.md`
(D065–D067, D075, D078). This document only records **implementation decisions** the contract leaves to the app.
It invents no product philosophy and no Bible copy.

## 1. Entry and state ownership

- `위치 보기` returns to Flow 1 Success for `inStock` only (§B40 kept the string; the button was removed
  as a dead stub on 2026-10-12 and is restored **wired** here).
- Navigation is **UI-shell state**, like `sheetOpen`/`scannerOpen` — not a 7th `UiState`. The six availability
  states, reducer, transitions and copy are untouched.
- `AvailabilitySurface` owns only `navigation: NavigationEntry | null`. Everything else (position choice,
  recovery, staleness, sold-out exit) lives in `navigation/NavigationSurface`.
- Cold entry (reload) has no navigation state → Flow 1. No cache reconstruction, no guessing (Engineering §5).
- Back clears navigation and returns focus to the answer card (Interface §3).

## 2. Data in hand

`NavigationEntry = { store, answer: inStock, freshness, term }`, built at the `위치 보기` tap from the
already-resolved Flow 1 answer. The first card render awaits nothing. `term` is the retained lookup
(candidate/scan → `pdNo`, typed → `keyword`) used only by the background refresh.

## 3. Refresh — one pipeline, four triggers, no polling

`refreshNavigation()` (pure, injected repo/clock/signal) enforces the Engineering §4 contract:

- Timeout **2000 ms** (AbortController); throw, abort, timeout or malformed answer → `failed`.
- `temporarilyOut` → `soldOut` (the designed exit).
- `inStock` whose **guidance facts** (name, price, ordered floor/zone list) are unchanged → `unchanged`,
  stamp replaced with a live observation. A qty-bound change may ride along; the low-qty caption follows it.
- `inStock` with changed guidance (a position move) or any other negative kind → **`unapplied`**: nothing is
  rendered and the stamp ages. These are the two outcomes the Bible explicitly leaves open (§11); Flow 2
  must not invent copy for them. Release is gated on an experience decision (ROADMAP D4).
- `failed` / `unapplied` surface nothing; the stamp ages; past `policy.stalenessThresholdMs` (the shared
  provisional 6 h) the card becomes Partial (stale) with `다시 확인`.

Triggers: **flow entry**, **app resume** (`visibilitychange` → visible), **pull-to-refresh** (custom touch
gesture on the guidance screen), **once immediately after `못 찾겠어요`**, plus the Partial (stale)
`다시 확인` human refresh. Never on a network timer. A separate display clock (30 s `setTimeout`) only
re-renders the age caption; it issues no request. A unit test advances 10 minutes with a refresh spy and
requires exactly one (entry) call.

Refresh is always non-blocking: the card is rendered before the request starts; no spinner sits between
the tap and the guidance. The pull indicator is a 2 px decorative bar (`aria-hidden`), not copy.

## 4. States rendered (all six, per Interface §4)

- **Default** — location line (L1), identity (photo/name/price), freshness caption, collapsed extra-position
  disclosure when the answer carries more than the shown position, `못 찾겠어요`.
- **Partial (multi)** — heading + equal-weight position rows; a row tap selects that position → Default.
- **Partial (photo missing)** — `ProductPhoto` gains a `fallback` slot; the identity note replaces the image.
- **Partial (stale)** — guidance stands, today's stock is not vouched for; `다시 확인`.
- **Error (system)** — no error UI; only the aging caption.
- **Error (world)** — recovery after one refresh: another position row, or the still-in-stock staff line
  with `대안 보기`; sold-out refresh → exit.
- **Exit (sold out)** — body + `대안 보기`. Flow 3 wires the CTA in P3; until then the handler is a
  recorded placeholder and the pair ships together (ROADMAP P2/P3).
- **Loading** — no blocking state by construction.
- **Empty** — unreachable; the entry condition (location exists) guarantees it.
- **Success** — not a screen; no confirmation is requested.

## 5. Copy

The Interface copy table is verbatim. App-owned additions (drafted in both ko/en, flagged for Bible
ratification like §B30-4/§B47):

- a11y labels `뒤로`, `위치` (visible copy does not change);
- `N분 전에 확인한 재고예요` for the aging caption between 1 minute and 1 hour (the Bible example fixes
  `3분 전`, not the boundary algorithm — same class as §B12);
- multi heading for **N > 2** (`N곳에 있어요`); the Bible fixes the two-position case `두 곳에 있어요`;
- English twins of every line (D068/D069; match tokens stay Korean).

## 6. Accessibility

Location line read first with a programmatic `위치` prefix and `tabIndex={-1}` focus on entry/phase change.
DOM order = location → identity → freshness → disclosure → recovery link. Every interactive target is
≥ 44 px; position rows are real buttons. The photo alt is the product name; the missing-photo note replaces
it. Async sold-out/recovery results are announced through the existing `LiveRegion`. axe serious/critical
0 in light and dark. Back returns focus to the answer card.

## 7. Verification

- Unit: refresh outcomes (unchanged/soldOut/failed/timeout/malformed/unapplied), entry-render-before-fetch,
  trigger distribution, no periodic network refresh, clock aging, stale demotion and recovery, copy.
- RTL: Default/multi/photo/stale/recovery/exit, back focus, pull, resume.
- E2E (dev, dev-only harness `?navRefresh=`/`?navAge=`): entry, back, multi selection, photo note,
  recovery-other, recovery-still, sold-out exit, stale; axe for Flow 2 default/multi/exit in both schemes.
- Gates: tsc, biome, coverage floors (unchanged), build, Playwright.
