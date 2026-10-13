# Keep Query on Store Switch — design (2026-10-13)

Owner: switching stores after a scan/answer wipes the query — keep the product,
re-run under the new store. Reducer untouched (CHANGE_STORE still lands Default);
the surface re-submits after the switch. No philosophy change (same query, new
store) — app-owned wiring, §B44.

## Behavior

- Surface retains the last submitted lookup: typed submits keep the keyword
  (re-searched); candidate taps keep the WHOLE candidate (exact pdNo identity via
  runByPdNo, no re-search); scan decodes keep the value (verbatim pdNo via runByScan).
- On store select: `selectStore(next)` as today, then if a retained lookup exists
  (blank keywords retain nothing), re-run it under the new store. No `recordSearch`
  bump (not a new submit).
- Default state (no retained lookup, or blank) behaves exactly as today.
- Stale-run safety comes free: both pipelines claim fresh run tokens and guard
  on `isCurrentRun` against the NEW store.

## Tests

- Pure planner unit tests (default/blank → stay; typed/scan → rerun plan).
- Surface integration (typed path, mock adapters): candidates → switch store →
  candidates re-shown + store line updated + no extra recent entry.
- E2E: same arc on device harness (밀폐용기 → 매장 변경 → 을지로점 → list persists).
- Scan-path wiring reuses tested runByScan; covered by planner unit + structure.

## Gate

Standard branch gate + fresh review. Docs: §B44. No push, no deploy.
