// src/ui/navigation/navigation-entry.ts
// The handoff from Flow 1 Success to Flow 2: everything the guidance card renders is already in the
// answer (Engineering §5 — this flow adds no cache unit and awaits no request). Cold entry has no
// navigation state and therefore returns to Flow 1; nothing here reconstructs guidance.
import type { Freshness, StoreContext, UiState } from '../../domain/types';
import type { SubmittedQuery } from '../availability/pipelines';
import type { InStockAnswer, NavigationEntry, NavigationTerm } from './navigation-refresh';

export function navigationTermOf(
  last: SubmittedQuery | null,
  displayQuery: string,
): NavigationTerm {
  if (last?.kind === 'candidate') {
    return { kind: 'pdNo', pdNo: last.candidate.pdNo, keyword: last.candidate.name };
  }
  if (last?.kind === 'scan') return { kind: 'pdNo', pdNo: last.value, keyword: last.value };
  if (last?.kind === 'typed') return { kind: 'keyword', keyword: last.keyword };
  return { kind: 'keyword', keyword: displayQuery };
}

// Dev-only ?navAge=<minutes> harness. Production passes null, so the entry keeps the observation
// stamp Flow 1 already established.
export function parseDevAgeMinutes(search: string): number | null {
  const raw = new URLSearchParams(search).get('navAge');
  if (raw === null) return null;
  const minutes = Number(raw);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function applyDevAge(freshness: Freshness, nowMs: number, minutes: number | null): Freshness {
  if (minutes === null) return freshness;
  return { class: 'cachedWithinThreshold', observedAt: nowMs - minutes * 60_000 };
}

export function navigationEntryOf({
  ui,
  store,
  last,
  nowMs,
  devAgeMinutes = null,
}: {
  ui: UiState;
  store: StoreContext | null;
  last: SubmittedQuery | null;
  nowMs: number;
  devAgeMinutes?: number | null;
}): NavigationEntry | null {
  // Entry condition (Interface §3/§4 Empty): inStock AND at least one position. Location-missing
  // Partial is a different state and never offers 위치 보기.
  if (store === null || ui.state !== 'success') return null;
  if (ui.answer.kind !== 'inStock' || ui.answer.locations.length === 0) return null;
  const answer: InStockAnswer = ui.answer;
  return {
    store,
    answer,
    freshness: applyDevAge(ui.freshness, nowMs, devAgeMinutes),
    // A second RESULT (the ?scenario= harness runs its effect twice under StrictMode) empties the
    // display query. The product name is the honest literal fallback: it is the exact string the
    // stock endpoint already matched, so no refresh is ever sent with a blank keyword.
    term: navigationTermOf(last, ui.query.trim() || answer.productName),
  };
}
