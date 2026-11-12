// src/ui/alternative/alternative-entry.ts
// D076's entry matrix, copied from Interface/alternative-discovery.md §3 and gated for what production
// can actually answer: Group B (nearby) is withheld until the data questions close (§B50-2). Entry is
// built from data in hand — it never fetches and never guesses a product the shopper did not ask about.
import type {
  AlternativeReason,
  AvailabilityAnswer,
  StoreContext,
  UiState,
} from '../../domain/types';
import type { SubmittedQuery } from '../availability/pipelines';
import type { NavigationEntry } from '../navigation/navigation-refresh';
import type { AlternativeEntry, IssuedSlots } from './alternative-types';

export const NEARBY_LIVE = false;

// Interface §3: "similar-in-store leads by default; nearby leads only when this store cannot serve the
// need at all (not carried; franchise)". 판매종료 withholds nearby entirely.
const ENTRY_MATRIX: Record<AlternativeReason, { issued: IssuedSlots; lead: 'similar' | 'nearby' }> =
  {
    temporarilyOut: { issued: { similar: true, nearby: true }, lead: 'similar' },
    discontinued: { issued: { similar: true, nearby: false }, lead: 'similar' },
    notCarried: { issued: { similar: true, nearby: true }, lead: 'nearby' },
    franchise: { issued: { similar: false, nearby: true }, lead: 'nearby' },
    flow2: { issued: { similar: true, nearby: true }, lead: 'similar' },
  };

function negativeReasonOf(answer: AvailabilityAnswer): AlternativeReason | null {
  switch (answer.kind) {
    case 'temporarilyOut':
      return 'temporarilyOut';
    case 'discontinued':
      return 'discontinued';
    case 'notCarried':
      return 'notCarried';
    case 'franchiseUndeterminable':
      return 'franchise';
    // inStock / restockArriving are not negative answers — they have no Flow 3 entry.
    case 'inStock':
    case 'restockArriving':
      return null;
  }
}

// A nearby query without a pdNo cannot ask "the same item"; Group B is withheld rather than widened to
// a keyword search. If that leaves no issued slot at all, the entry does not open.
function gate(
  issued: IssuedSlots,
  pdNo: string | undefined,
  nearbyLive: boolean,
): IssuedSlots | null {
  const gated: IssuedSlots = {
    similar: issued.similar,
    nearby: issued.nearby && nearbyLive && pdNo !== undefined && pdNo !== '',
  };
  return gated.similar || gated.nearby ? gated : null;
}

export function alternativeEntryOf({
  ui,
  store,
  last,
  nearbyLive = NEARBY_LIVE,
}: {
  ui: UiState;
  store: StoreContext | null;
  last: SubmittedQuery | null;
  nearbyLive?: boolean;
}): AlternativeEntry | null {
  if (store === null) return null;
  if (ui.state !== 'success' && ui.state !== 'partial') return null;
  const answer = ui.answer;
  const reason = negativeReasonOf(answer);
  if (reason === null) return null;
  const matrix = ENTRY_MATRIX[reason];

  const lastPdNo =
    last?.kind === 'candidate'
      ? last.candidate.pdNo
      : last?.kind === 'scan'
        ? last.value
        : undefined;
  const pdNo = answer.pdNo ?? lastPdNo;
  const issued = gate(matrix.issued, pdNo, nearbyLive);
  if (issued === null) return null;

  // Group A re-searches literally. A typed submit keeps its keyword; every exact identity (candidate,
  // scan, Flow 2) uses the product name — a pdNo query returns the exact item, not similar ones.
  const keyword =
    last?.kind === 'typed' && last.keyword.trim() !== '' ? last.keyword : answer.productName;
  return {
    store,
    reason,
    productName: answer.productName,
    pdNo,
    imageUrl: answer.imageUrl,
    price: 'price' in answer ? answer.price : undefined,
    keyword,
    issued,
    lead: matrix.lead === 'nearby' && issued.nearby ? 'nearby' : 'similar',
    origin: 'flow1',
  };
}

export function alternativeEntryFromNavigation({
  navigation,
  nearbyLive = NEARBY_LIVE,
}: {
  navigation: NavigationEntry;
  nearbyLive?: boolean;
}): AlternativeEntry | null {
  const { answer, term, store } = navigation;
  const pdNo = answer.pdNo ?? (term.kind === 'pdNo' ? term.pdNo : undefined);
  const issued = gate(ENTRY_MATRIX.flow2.issued, pdNo, nearbyLive);
  if (issued === null) return null;
  return {
    store,
    reason: 'flow2',
    productName: answer.productName,
    pdNo,
    imageUrl: answer.imageUrl,
    price: answer.price,
    // Flow 2 always re-searches by name for Group A (the exact pdNo would only return itself).
    keyword: answer.productName,
    issued,
    lead: 'similar',
    origin: 'flow2',
  };
}

// DEV/E2E only: `?alt=nearby|bothEmpty|bothFailed|bSlow` exercises the nearby branch the production
// gate withholds. Production never reaches this (AvailabilitySurface checks import.meta.env.DEV).
const DEV_NEARBY_SCENARIOS = new Set(['nearby', 'bothEmpty', 'bothFailed', 'bSlow']);

export function devForceNearby(entry: AlternativeEntry, scenario: string | null): AlternativeEntry {
  if (scenario === null || !DEV_NEARBY_SCENARIOS.has(scenario)) return entry;
  if (entry.issued.nearby || entry.pdNo === undefined) return entry;
  return { ...entry, issued: { ...entry.issued, nearby: true } };
}
