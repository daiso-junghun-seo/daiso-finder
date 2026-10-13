# Keep Query on Store Switch — design (2026-10-13)

Owner: switching stores after a scan/answer wipes the query — keep the product,
re-run under the new store. Reducer untouched (CHANGE_STORE still lands Default);
the surface re-submits after the switch. No philosophy change (same query, new
store) — app-owned wiring, §B44.

## Behavior

- Surface retains the last submitted lookup: `{ keyword, scan }` — typed submit
  and candidate taps store `{keyword, scan:false}` (candidate taps keep the NAME;
  a re-search may legitimately land on the candidate list again); scan decodes
  store `{value, scan:true}` (pdNo identity preserved via the scan path).
- On store select: `selectStore(next)` as today, then if a retained lookup exists
  with a non-blank keyword, re-run it — `runByScan` for scans (verbatim pdNo,
  no candidate detour), `runQuery` otherwise. No `recordSearch` bump (no dup).
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
