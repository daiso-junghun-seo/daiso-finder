// src/domain/types.ts — the names below are load-bearing across both increments
export type Money = number; // KRW integer; rendered "2,000원"

export interface StoreLocation {
  floor: string; // raw stairNo; rendered `${floor}층`
  zone: string; // raw zoneNo;  rendered `${zone}번`
}

export type AvailabilityAnswer =
  // qtyUpperBound = Number(qty), always the OBSERVED upper bound (data-contract §4: qty is a bound, not exact).
  // The domain always carries it; whether to surface "재고 N개 이하" is a PRESENTATION gate on policy.lowQtyCutoff
  // (Increment 1) — the provisional A3 cutoff stays out of the domain mapping and fixtures.
  // imageUrl is optional: pure product identity, present on every kind when the vendor supplied one.
  // pdNo is optional exact identity (§B50-10): Flow 3's nearby query is "the same pdNo" and the
  // whole-answer cache keys on it; absent when the vendor doc did not resolve one.
  | {
      kind: 'inStock';
      pdNo?: string;
      productName: string;
      price: Money;
      locations: StoreLocation[];
      qtyUpperBound: number;
      imageUrl?: string;
    }
  | {
      kind: 'temporarilyOut';
      pdNo?: string;
      productName: string;
      price: Money;
      restockOfferable: boolean;
      imageUrl?: string;
    }
  | { kind: 'discontinued'; pdNo?: string; productName: string; price: Money; imageUrl?: string }
  | { kind: 'notCarried'; pdNo?: string; productName: string; imageUrl?: string }
  | {
      kind: 'restockArriving';
      pdNo?: string;
      productName: string;
      price: Money;
      lchDay: string;
      imageUrl?: string;
    }
  | { kind: 'franchiseUndeterminable'; pdNo?: string; productName: string; imageUrl?: string };

// Flow 3 (Alternative Discovery). Group A is a similar in-stock item at the SAME store; Group B is
// the SAME pdNo at a nearby stock-confirmable store. Rows, not answers: every row already carries its
// whole decision (Interface §3).
export type AlternativeReason =
  | 'temporarilyOut'
  | 'discontinued'
  | 'notCarried'
  | 'franchise'
  | 'flow2';

export interface SimilarAlternative {
  pdNo: string;
  productName: string;
  price: Money;
  qtyUpperBound: number; // observed upper bound, same contract as AvailabilityAnswer
  locations: StoreLocation[];
  imageUrl?: string;
}

export interface NearbyAlternative {
  strCd: string;
  strNm: string;
  distanceM: number;
  address: string;
  closingTime: string; // vendor "22:00"
  closedToday: boolean; // hldyDt-derived; mock only until the data owner confirms §11
  qtyUpperBound: number;
}

// A literal multi-candidate match surfaced before an answer exists (search returned several products for
// the query). Not an AvailabilityAnswer kind — candidates are pre-answer; picking one re-queries for the
// actual answer.
export interface ProductCandidate {
  pdNo: string;
  name: string;
  price: Money;
  imageUrl?: string;
}

export interface StoreContext {
  strCd: string;
  strNm: string;
} // strNm e.g. "명동역점"

export type FreshnessClass = 'live' | 'cachedWithinThreshold' | 'cachedBeyondThreshold';
export interface Freshness {
  class: FreshnessClass;
  observedAt: number;
} // observedAt = when WE observed (epoch ms)

export type CacheOutcome =
  | { kind: 'withinThreshold'; answer: AvailabilityAnswer; freshness: Freshness }
  | { kind: 'beyondThreshold'; answer: AvailabilityAnswer; freshness: Freshness }
  | { kind: 'noCache' };

// Query provenance (app-owned, spec §4). Scan entry needs its own honest Empty copy: the Bible's typed
// Empty tells the shopper to scan, which is self-contradictory for someone who just scanned. Provenance
// selects COPY ONLY — it never participates in availability judgement or the meaning of the 6 states.
export type QueryOrigin = 'scan';

export type StoreEvent =
  | { type: 'SUBMIT'; query: string; origin?: QueryOrigin }
  | { type: 'RESULT'; answer: AvailabilityAnswer; freshness: Freshness }
  | { type: 'NO_MATCH'; query: string; suggestions: string[] }
  | { type: 'FAILURE'; cache: CacheOutcome }
  | { type: 'SLOW' }
  | { type: 'CANDIDATES'; query: string; candidates: ProductCandidate[] }
  // query = the display name of the selected candidate (B15: retained query for retry/loading copy).
  // pdNo is not stashed on the loading UiState — the surface click handler consumes it directly (later task).
  | { type: 'SELECT_CANDIDATE'; query: string; pdNo: string }
  | { type: 'DISMISS_AI' }
  | { type: 'CHANGE_STORE'; store: StoreContext };

// Every non-default state retains the submitted query (B15): retry/re-search re-dispatches SUBMIT with it.
export type UiState =
  | { state: 'default' }
  | { state: 'loading'; query: string; slow: boolean; origin?: QueryOrigin }
  | { state: 'empty'; query: string; suggestions: string[]; origin?: QueryOrigin }
  // Pre-answer: search matched several products literally. Not a 7th AvailabilityAnswer kind — picking one
  // dispatches SELECT_CANDIDATE, which re-queries for the real answer.
  | { state: 'candidates'; query: string; candidates: ProductCandidate[] }
  | {
      state: 'error';
      variant: 'cached';
      query: string;
      answer: AvailabilityAnswer;
      freshness: Freshness;
    }
  | { state: 'error'; variant: 'noCache'; query: string }
  | { state: 'success'; query: string; answer: AvailabilityAnswer; freshness: Freshness }
  | {
      state: 'partial';
      trigger: 'franchise' | 'locationMissing' | 'staleCache';
      query: string;
      answer: AvailabilityAnswer;
      freshness: Freshness | null;
    };
