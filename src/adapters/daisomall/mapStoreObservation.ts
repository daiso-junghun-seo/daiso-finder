// src/adapters/daisomall/mapStoreObservation.ts
// Normalized RawStoreObservation → domain AvailabilityAnswer. Ported from newIntSelStr/mapResponse with the
// franchise refinement ("franchise AND no location") and the §4.1 invariant guard. Unmatched → UnmappableAnswerError
// (safe fallback; NEVER a fabricated Success — Engineering §7 read-only, no optimistic availability).
import { UnmappableAnswerError } from '../../domain/errors';
import { formatLchDay } from '../../domain/lch-day';
import type { AvailabilityAnswer } from '../../domain/types';
import type { RawStoreObservation } from './rawObservation';

export function mapStoreObservation(o: RawStoreObservation): AvailabilityAnswer {
  const { productName, price, directYn, sleStsCd, mrkGdsYn, locations, imageUrl } = o;

  // 0. Invariant guard (§4.1): a direct store always fetches stock. stck:null for a direct store would be a
  //    leaked fetch failure — refuse it rather than misread rule 5 as notCarried.
  if (directYn === 'Y' && o.stck === null) {
    throw new UnmappableAnswerError('direct store with unfetched stock');
  }
  const stck = Number(o.stck);

  // 1. Franchise AND no location → stock undeterminable BY DESIGN (orchestrator did not fetch it).
  if (directYn !== 'Y' && locations.length === 0) {
    return { kind: 'franchiseUndeterminable', productName, imageUrl: imageUrl ?? undefined };
  }
  // 2. In stock — qty is an UPPER BOUND (data-contract §4); carry it, never present as an exact count.
  if (stck > 0) {
    return {
      kind: 'inStock',
      productName,
      price,
      locations,
      qtyUpperBound: stck,
      imageUrl: imageUrl ?? undefined,
    };
  }
  // 3. Discontinued — store sleStsCd '9' outranks temporarily-out.
  if (sleStsCd === '9') {
    return { kind: 'discontinued', productName, price, imageUrl: imageUrl ?? undefined };
  }
  // 4. Restock arriving — incoming-goods flag; lchDay 'YYYY-MM-DD' → 'M월 D일'.
  if (mrkGdsYn === 'Y') {
    return {
      kind: 'restockArriving',
      productName,
      price,
      lchDay: formatLchDay(o.lchDay ?? ''),
      imageUrl: imageUrl ?? undefined,
    };
  }
  // 5. Not carried — a direct store with a null store status does not carry it.
  if (sleStsCd === null && directYn === 'Y') {
    return { kind: 'notCarried', productName, imageUrl: imageUrl ?? undefined };
  }
  // 6. Temporarily out — carried (status present) but zero on hand; a restock offer stands.
  if (stck === 0 && sleStsCd !== null) {
    return {
      kind: 'temporarilyOut',
      productName,
      price,
      restockOfferable: true,
      imageUrl: imageUrl ?? undefined,
    };
  }
  // 7. Unknown combination → safe fallback, NEVER a fabricated Success.
  throw new UnmappableAnswerError(
    `unmapped observation: directYn=${directYn} sleStsCd=${sleStsCd} stck=${o.stck}`,
  );
}
