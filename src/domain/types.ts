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
  | {
      kind: 'inStock';
      productName: string;
      price: Money;
      locations: StoreLocation[];
      qtyUpperBound: number;
    }
  | { kind: 'temporarilyOut'; productName: string; price: Money; restockOfferable: boolean }
  | { kind: 'discontinued'; productName: string; price: Money }
  | { kind: 'notCarried'; productName: string }
  | { kind: 'restockArriving'; productName: string; price: Money; lchDay: string }
  | { kind: 'franchiseUndeterminable'; productName: string };

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

export type StoreEvent =
  | { type: 'SUBMIT'; query: string }
  | { type: 'RESULT'; answer: AvailabilityAnswer; freshness: Freshness }
  | { type: 'NO_MATCH'; query: string; suggestions: string[] }
  | { type: 'FAILURE'; cache: CacheOutcome }
  | { type: 'SLOW' }
  | { type: 'SELECT_CANDIDATE'; query: string }
  | { type: 'DISMISS_AI' }
  | { type: 'CHANGE_STORE'; store: StoreContext };

// Every non-default state retains the submitted query (B15): retry/re-search re-dispatches SUBMIT with it.
export type UiState =
  | { state: 'default' }
  | { state: 'loading'; query: string; slow: boolean }
  | { state: 'empty'; query: string; suggestions: string[] }
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
