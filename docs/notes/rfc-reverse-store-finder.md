# RFC (Draft) — 반대형 플로우: 상품 우선 → 매장 찾기 (Reverse Store-Finder)

> **문서 상태**: APP-SIDE DRAFT. Product Bible(`../product-bible`)은 **read-only SSOT**이며 이 문서는 Bible의 어떤 파일도 수정하지 않는다. 이 문서는 Bible의 RFC 포맷(`08_Operations/context.md` §3 RFC Process, `08_Operations/examples.md` Good Example 1)을 미러링해 owner가 Bible 세션에 그대로 옮겨 결정을 받을 수 있도록 작성했다.
>
> **출처**: owner 제안(2026-07-23). 최초 기록은 `docs/notes/open-questions.md` §B "② '반대형' 플로우 제안"(2026-07-23, 전체-브랜치 최종 리뷰 중 owner 발견). 본 RFC는 그 항목을 Bible 결정 대상으로 정식화한 것 — B-섹션 항목이 아니라 **A-섹션 성격**(철학이 바뀌는 질문)이므로 앱이 임의로 결정하지 않는다.
>
> **왜 앱이 결정할 수 없나** (`CLAUDE.md` §3, 이 저장소): "기준은 제품 철학이 바뀌는가?" — 이 제안은 데이터 계약·구현·매핑이 아니라 **핵심 플로우의 진입점(entry point)과 안티골의 의미 자체**를 바꾸는 질문이다. 앱은 여기서 결정하지 않고 Bible에 되돌린다.

---

## RFC 템플릿 (Bible 포맷 미러 — `08_Operations/examples.md` Good Example 1 형식)

```
RFC-DRAFT: Reverse Store-Finder Entry (Product-First Availability)

Proposed Change:
Add a product-first entry path — the shopper searches/selects a
product FIRST, then the app returns which (nearby) stores currently
have it in stock — as an alternative or additional entry alongside
the existing store-first Flow 1 (fix store → search product → is it
here?).

Evidence:
- Owner-raised need (2026-07-23). Hypothesis — no field validation
  performed. Not yet run through the 06_Product Human process
  (Human/INDEX.md §5 Validation Plan) that every other claim in this
  product's canon is labeled against.
- Existing Flow 3 Group B already implements "same item @ nearby
  stores, ordered by distance, stock-confirmable only" — but it is
  reachable ONLY after a negative Flow 1/Flow 2 answer
  (Experience/alternative-discovery.md §4).
- Data/infra feasibility (Evidence Level 2, this app's own
  observation): `selStrPkupStck` accepts a BATCH request
  `[{pdNo,strCd}, ...]` in one call (docs/notes/store-api-
  observations.md, "엔드포인트 인벤토리") — multi-store stock lookup
  is mechanically possible without N sequential calls.
- Store search (`selStr` search/근처 mode) exists as a data source
  (open-questions.md A9, resolved-but-unwired), but GPS-nearby wiring
  into the app is explicitly deferred (open-questions.md B16).

Impacted Documents (if approved, exact scope depends on chosen
option — see §4 below):
- 06_Product/daiso-companion/INDEX.md — §4 Core Flows (would gain a
  4th flow, or Flow 1's entry contract would be redefined); §5
  Anti-goal 2 (the placement rule may need re-scoping, or an explicit
  documented exception)
- Experience/availability-check.md — §1 Experience Statement (which
  currently reads "The in-aisle DAISO shopper..."), §4 Default state
  (Store Context precondition, D082)
- Experience/alternative-discovery.md — §4 Group B ("Distance anchors
  to the current store's coordinates, never GPS" no longer holds
  without a current store), §8 Open Items (discontinued/closed-store
  honesty gaps get more exposure at N-store scale)
- Engineering/data-contract.md, Engineering/alternative-discovery.md
  — batch-stock query pattern, if extended beyond Flow 3's 3-row
  bound

Proposed Revision:
None drafted. This RFC frames a DECISION among options (§4), not a
pre-written text change — the options carry materially different
revisions to the documents above, and writing the revision before the
decision would presuppose it.

Review Period / Process: 08_Operations/context.md §3 defines Team
Mode (full RFC, 7–14 day review) vs. Solo Mode (Decision Log entry +
48h cooling-off, for < 3 regular contributors). This app repo cannot
determine which mode currently applies to the Bible project — left to
the Bible session.

Reviewers: owner (junghun.seo) — the sole Bible author of record for
this product's Decision Log entries to date.
```

---

## 1. Summary

Flow 1 today is **store-first**: the shopper fixes a Store Context (last-selected store, GPS recommends but never confirms — D082), then asks "is *this* product here?" The owner proposes a **reverse entry** — product-first: the shopper names a product, and the app answers "which (nearby) stores have it in stock?" without a store being fixed first. This is not a data or wiring question — the data path is largely feasible today (`selStrPkupStck`'s batch shape, existing store-search/nearby data per `store-api-observations.md`). It is a **product-philosophy question**: Flow 3 (Alternative Discovery) already delivers almost exactly this answer shape — "same item, nearby stores, ordered by distance, stock-confirmable only" — but the Bible gates it strictly **behind a negative Flow 1 answer**, and Anti-goal 2 (as Flow 3 itself interprets it) forbids showing alternatives "beside a positive answer." A product-first *primary* entry point would show the same kind of information as a first move, not a fallback — which is the exact shape Anti-goal 2 exists to prevent. Per `CLAUDE.md` §3, changes to what a core flow's entry point *means* and what an anti-goal *covers* are philosophy, not implementation — so this app drafts the RFC and routes the decision to the Bible/owner rather than building either version unilaterally.

## 2. User need / evidence

Two competing mental models, held to different evidence standards:

**Model A — in-aisle "is it here" (existing canon, still labeled Hypothesis, but structured and field-validation-planned):**
The Primary Human is defined as someone "physically inside a DAISO store, standing in an aisle, holding an item or thinking of one, trying to confirm a purchase decision in under 60 seconds" (`INDEX.md` §1). Supporting behavioral hypotheses (`Human/INDEX.md` §2): **B1 — "Confirm, don't browse. In-store use is dominated by confirmation tasks... Discovery happens at the shelf, not in the app"**; **B2 — "Shelf-first, app-second. The shopper tries the shelf and their own eyes first; the app is opened only after a short unsuccessful scan..."**. This model is not field-validated either (`Human/INDEX.md` line 15: *"No in-store observation, interview, or behavioral measurement has been performed for this product yet"*), but it has been run through the Bible's structured Human process — anxiety stack (E1–E4), context variations, and an explicit validation plan (§5: in-store shadowing, exit intercepts, stockout-moment probe).

**Model B — trip-planning "where is it" (owner-proposed, 2026-07-23, no structured evidence yet):**
The felt need is "어느 다이소에 이거 있어?" — asked *before* committing to a specific store, potentially from home or en route, to decide which store is worth the trip. This has **not** been run through `06_Product` — Principle 3 (Human Research Is Product-Specific) at all: no anxiety-stack placement, no context-variation entry, no validation-plan line item. It is currently one sentence of owner intuition, sitting a rung below even Model A's "Hypothesis" status in the Bible's own evidence hierarchy (`07_Research/principles.md` Evidence Levels: Level 1 published literature is the floor to leave hypothesis status; Model B has neither Level 1 literature nor a documented product hypothesis yet).

This is not a claim that Model B is wrong — DAISO's own `SCR_MSG_0015` "매장 상품 찾기" web flow (referenced in `store-api-observations.md` §"Flow 1 조합/오케스트레이션") already combines product search with store selection in one screen, which is at least a signal that the vendor itself treats "which store has X" as a first-class query shape, not only a post-stockout fallback. But that is evidence the *data/vendor UX* supports the query shape — it says nothing about whether it fits *this* product's primary human and anti-goals.

## 3. Relation to existing canon

Flow 3 already answers "which nearby stores have this in stock" — the mechanism the owner is asking for largely exists:

> **Group B — the SAME item at nearby stores**: the same pdNo across other stores, stock-confirmable (direct-operated) only, ordered by distance from the current store's coordinates. At most 3 rows.
> — `Experience/alternative-discovery.md` §4

But three structural facts gate it away from being a primary, product-first entry:

**(a) Entry is negative-answer-only, by design and by promised copy.** Every Flow 1 negative Success-state copy explicitly promises Flow 3 as the *next* step, not a parallel one: `지금은 품절이에요. 근처 매장 재고와 비슷한 상품을 보여드릴게요.` / `판매가 끝난 상품이에요. 비슷한 상품을 보여드릴게요.` / `이 매장에서는 팔지 않는 상품이에요. 근처 매장을 보여드릴게요.` (`Experience/availability-check.md` §4). Flow 3's own opening line: *"The in-aisle DAISO shopper arrives at this flow having just been told no"* (`alternative-discovery.md` §1). There is no documented path into Group B other than through a prior negative answer.

**(b) Anti-goal 2, as Flow 3 itself interprets it, forbids the placement a product-first entry would require.** The literal anti-goal (`INDEX.md` §5.2) is about not lengthening the in-store journey with recommendations before the answer; Flow 3's AI Element section makes the placement consequence explicit: *"alternatives appear only after a negative answer or a failed hunt — never beside a positive answer (product Anti-goal 2)"* (`alternative-discovery.md` §7). A product-first landing that shows "stores with stock" as the *first* thing the shopper sees is, by construction, alternatives-shaped information appearing with no positive/negative answer having been given yet at all — not "beside" a positive answer in the literal sense, but structurally the same class of information Anti-goal 2 was written to keep out of the front of the flow.

**(c) The Group B distance mechanism is store-anchored, not GPS-anchored — and a product-first entry has no store to anchor to.** *"Distance anchors to the current store's coordinates, never GPS. The shopper is standing in the store, so 'nearby' means near this store; the anchor requires no location permission, holds on desktop where no device location exists (D066), and is contextually true."* (`alternative-discovery.md` §6). This is a deliberate, reasoned design choice, not an incidental one. A product-first flow has no "current store" by definition, so it cannot reuse this anchor — it needs actual device GPS, which is a different mechanism than what D082 currently authorizes: *"GPS may recommend nearby stores, but never sets the store"* — GPS today is scoped to Store Context recommendation only (`availability-check.md` §4; `open-questions.md` A1/D082), not to powering an availability query directly. Reusing GPS for a new purpose is itself a scope question the Bible has not decided.

There is also a Primary Human / role-boundary angle: `INDEX.md` §7 states the product "serves a **single role: the in-store shopper**" and Group A in Flow 3 is prioritized over Group B because *"solving in place beats traveling (H4)"* — 01_Human Principle 4, Context Determines Design (`alternative-discovery.md` §4, §9 Decision Log). A shopper deciding *which store to travel to* is, at minimum, a different moment in the context stack than the in-aisle Primary Human — possibly a different human entirely (a "trip planner," not present anywhere in the current role definition).

## 4. Options

**O1 — Don't build. Keep the in-aisle core; Flow 3 already covers the fallback case.**
- Changes: none.
- Anti-goal impact: zero — preserves the current reading of Anti-goal 2 and the Primary Human definition exactly as ratified.
- Data/impl cost: zero (Flow 3's Group B is already Bible-approved and Flow 1 live-data wiring is in progress independently, per `open-questions.md` B21–B27).
- Cost of *not* building: if Model B's need is real (unvalidated), shoppers who want to check availability *before* traveling to a specific store remain unserved — they would have to pick a store first (possibly the wrong one) to get any answer at all.

**O2 — Build as a gated extension, kept consistent with the anti-goals as currently read.**
- Shape: a structurally separate entry — not the Default-state landing search, not shown beside or before a positive Flow 1 answer — reachable only through an explicit, secondary action the shopper opts into (e.g., a distinct "매장 찾기" mode, or Flow 3's Group B logic entered directly but still framed and copy-labeled as a distance/travel decision, never as the primary "is it here" answer).
- Changes needed: its own Experience document/amendment (defines entry point, emotional arc, states — cannot simply annex Flow 3, which is scoped to post-negative-answer only, per §3(a) above); resolution of the GPS-anchor question in §3(c) — this needs real device GPS, a new consent/purpose distinct from D082's store-recommendation-only GPS use, or the Bible may decide the existing GPS grant already covers it; Anti-goal 2 either gets an explicit documented exception for this entry, or the Bible confirms it doesn't apply outside the primary in-aisle surface.
- Anti-goal impact: moderate — the "never beside a positive answer" reading survives if this stays structurally separate from Flow 1's landing/Success state; the "no recommendations before the answer" reading is arguably satisfied differently, since this mode's entire purpose *is* the availability answer (just multi-store scoped) rather than a recommendation *before* one — but that argument itself needs Bible judgment, since Anti-goal 2 was evidently written with a single fixed store in view.
- Data/impl cost: moderate — `selStrPkupStck`'s batch shape already covers the mechanics (§5 below covers scope/cost bounds); needs GPS-nearby wiring (currently deferred, `open-questions.md` B16) and new UI states.

**O3 — Build as a primary entry (product-first becomes a landing path alongside or ahead of store-first).**
- Changes: likely a 4th Core Flow, or a rewrite of Flow 1's entry contract and possibly the Primary Human/Primary Context sections of `INDEX.md` — this reframes what kind of human the product serves at the front door, not just what it offers after a "no."
- Anti-goal impact: highest — this is the reading Anti-goal 2 (as Flow 3 interprets it) was written to prevent: alternative/nearby-store information appearing as a first move rather than after a negative answer. It also stretches the Primary Human definition (`INDEX.md` §1, §7 single-role boundary) to cover a trip-planning persona that is not currently documented anywhere in Human/INDEX.md.
- Data/impl cost: highest — full GPS-nearby wiring, batch stock queries at a scope the app has not previously had to bound (§5), a full Human → Experience → Interface → Engineering design chain for the new/changed flow (per the product's own document-lifecycle gate, `06_Product` Principle 4, already enforced elsewhere in this product's chain), and reconciling with D082's current GPS scope.

## 5. Open sub-questions

- **Query scope: GPS-nearby only vs. all stores.** Flow 3 bounds Group B to 3 rows specifically because "the set is a confirmation, not an evaluation" (`alternative-discovery.md` §3 Friction Map, H5). A product-first query has no natural anchor to bound the candidate set by distance unless GPS-nearby is wired first. Querying "all 1,500+ stores" is mechanically possible via `selStrPkupStck`'s batch shape (`store-api-observations.md`) but turns a confirmation task into an evaluation task (contradicts B1 "Confirm, don't browse") and raises real batch-size/latency cost that Flow 3 never had to absorb at 3-row scale.
- **Interaction with deferred GPS-nearby wiring.** `open-questions.md` B16 defers real store-search/nearby data wiring; A9 resolved the *data source* (`selStr` search/근처 modes) but not the client wiring. Any option above except O1 depends on this being wired first, and on deciding whether it reuses D082's existing GPS grant (store-recommendation only today) or requires a new one.
- **Discontinued/closed-store honesty at N-store scale.** Flow 3 §8 already flags two unresolved data questions that a multi-store answer would multiply: whether `판매종료` (discontinued) is store-scoped or chain-scoped (`open-questions.md` A7), and that `hldyDt` (closed-today) semantics rest on a single sample (`alternative-discovery.md` §8). Showing more store rows than Flow 3's 3-row bound means more chances to surface a wrong or stale discontinuation/hours claim before these are confirmed.
- **Franchise-store exclusion.** Flow 3 excludes franchise stores from nearby results because their stock is unconfirmable — "recommending travel to a store whose stock we cannot confirm is Confidence Theater" (`alternative-discovery.md` §3, residual friction 3; also the `franchiseUndeterminable` nuance this app already flagged in `store-api-observations.md` — franchise stock *is* sometimes confirmable when `zoneNo` is populated). A store-finder answer set inherits this same exclusion/ambiguity, further narrowing what "nearby stores that have it" can honestly claim.
- **Freshness stamping across N stores in one answer.** Flow 3 stamps the whole answer once (`D061`). A product-first answer spanning more stores, potentially fetched or cached at different times, raises the same question at larger scale — one stamp for the set, or one per row, and what the staleness threshold is when rows disagree in age.

## 6. Recommendation

**This is a question for the owner/Bible, not a conclusion this app draws.** Per `CLAUDE.md` §2–§3, the app does not decide product philosophy, and this proposal changes what a core-flow entry point means and what Anti-goal 2 covers — squarely a Bible decision.

With that framing, my reasoned lean is **O2 (gated extension)** over O1 or O3, for these tradeoffs:

- It does not require touching the Primary Human, Primary Context, or the single-role boundary (`INDEX.md` §1, §7) — O3's cost is structural and touches the product's identity, not just a feature.
- It reuses a mechanism the Bible has already ratified in principle — Flow 3's Group B answer shape (nearby stores × stock × distance, franchise-excluded, bounded rows) — rather than inventing a new one, if it is entered directly instead of only post-negative-answer.
- It keeps Anti-goal 2's core protection intact — nothing appears beside a positive in-aisle answer — while conceding that the anti-goal's *placement* wording may need an explicit, Bible-authored carve-out for a structurally separate entry, rather than the app inferring one.
- O1 is the safest and cheapest option, and is legitimate if Model B's need turns out to be thin (it has zero structured evidence today, per §2) — but it leaves an owner-observed need (and a vendor UX precedent, `SCR_MSG_0015`) unaddressed without ever testing it.

I would not recommend O3 without the Bible first deciding whether this product now serves two primary humans (in-aisle confirmer and trip planner) — that is a bigger decision than this RFC's data facts justify on their own, and it is the one place where getting it wrong is expensive to reverse (it reshapes `INDEX.md` §1 and §7, which everything else in this product's canon currently assumes as fixed).
