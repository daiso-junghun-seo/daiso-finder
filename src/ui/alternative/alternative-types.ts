// src/ui/alternative/alternative-types.ts
// Flow 3 UI-shell vocabulary. Shared by the entry builder, the cache and the query pipeline so none of
// them has to import another (and the surface imports one module for all of it).
import type {
  AlternativeReason,
  Money,
  NearbyAlternative,
  SimilarAlternative,
  StoreContext,
} from '../../domain/types';
import type { CopyTable } from '../../i18n/strings';

export interface IssuedSlots {
  similar: boolean;
  nearby: boolean;
}

export interface AlternativeEntry {
  store: StoreContext;
  reason: AlternativeReason;
  productName: string;
  pdNo?: string;
  imageUrl?: string;
  price?: Money; // context only; rows carry their own
  keyword: string; // Group A literal re-search term
  issued: IssuedSlots;
  lead: 'similar' | 'nearby';
  origin: 'flow1' | 'flow2';
}

// withheld = this entry never asked the question. It renders nothing: not empty, not failed.
export type SlotResult<T> =
  | { status: 'pending' }
  | { status: 'ready'; rows: T[] }
  | { status: 'empty' }
  | { status: 'failed' }
  | { status: 'withheld' };

export interface AlternativeSlots {
  similar: SlotResult<SimilarAlternative>;
  nearby: SlotResult<NearbyAlternative>;
}

export interface AlternativeSnapshot {
  slots: AlternativeSlots;
  issued: IssuedSlots;
  // Oldest observation on screen (Engineering §7). null until EVERY issued slot has settled — a stamp
  // before that would cover a claim the screen does not yet have.
  observedAt: number | null;
  source: 'live' | 'cache';
  settled: boolean;
}

export type SlotKind = 'similar' | 'nearby';

export function issuedKinds(issued: IssuedSlots): SlotKind[] {
  const kinds: SlotKind[] = [];
  if (issued.similar) kinds.push('similar');
  if (issued.nearby) kinds.push('nearby');
  return kinds;
}

export function initialSlots(issued: IssuedSlots): AlternativeSlots {
  return {
    similar: issued.similar ? { status: 'pending' } : { status: 'withheld' },
    nearby: issued.nearby ? { status: 'pending' } : { status: 'withheld' },
  };
}

// The answer card's negative status, restated as Flow 3's "why we are here" line. Shared so the
// lazy surface and its Suspense fallback can never drift apart on wording.
export function altReasonLabel(reason: AlternativeReason, S: CopyTable): string {
  switch (reason) {
    case 'temporarilyOut':
      return S.ALT_REASON_TEMPORARILY_OUT;
    case 'discontinued':
      return S.ALT_REASON_DISCONTINUED;
    case 'notCarried':
      return S.ALT_REASON_NOT_CARRIED;
    case 'franchise':
      return S.ALT_REASON_FRANCHISE;
    case 'flow2':
      return S.ALT_REASON_FLOW2;
  }
}
