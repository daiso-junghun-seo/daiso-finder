import { UnmappableAnswerError } from '../../domain/errors';
// src/adapters/newIntSelStr/mapResponse.ts
// Maps ONE observed newIntSelStr per-store entry to the domain AvailabilityAnswer.
// Reads ONLY data-contract §3 documented store-stock/location fields — never mall-only fields (§7 read-only).
import type { AvailabilityAnswer, Money, StoreLocation } from '../../domain/types';

// The observed vendor per-store entry (data-contract §3), Flow-1 subset only.
export interface RawStoreEntry {
  strCd: string;
  pdNo: string;
  directYn: string; // 'Y' direct-operated, 'N' franchise/distributor
  sleStsCd: string | null; // sale status; '9' = discontinued; null = a not-carried signal
  qty: string; // stock as a STRING; an UPPER BOUND, never an exact count (data-contract §4)
  stairNoList: string[]; // floor numbers (raw display values, no lookup — §5)
  zoneNoList: string[]; // zone numbers (raw display values, no lookup — §5)
  mrkGdsYn: string; // 'Y' = incoming goods → arriving ~lchDay
  lchDay: string; // restock day, e.g. '7월 15일'
}

// SHIM: product name & price are NOT in the documented §3 field inventory. They are supplied here from an
// as-yet-undocumented source (modeled as the Engineering §4 catalog subset), ESCALATED to the Bible/data-owner.
// mapResponse maps only documented fields and injects identity — the seam so the exact source is a one-place fix.
export interface ProductIdentity {
  productName: string;
  price: Money;
}

// Positional zip (design spec §6.3 corrected: pairing, NOT cartesian). stairNoList[i] with zoneNoList[i].
function zipLocations(stairNoList: string[], zoneNoList: string[]): StoreLocation[] {
  const n = Math.min(stairNoList.length, zoneNoList.length);
  const out: StoreLocation[] = [];
  for (let i = 0; i < n; i++) {
    // Narrowing (not a logic change): i < n <= both lengths, so these are always defined here.
    // Required because this repo's tsconfig sets noUncheckedIndexedAccess.
    const floor = stairNoList[i];
    const zone = zoneNoList[i];
    if (floor === undefined || zone === undefined) continue;
    out.push({ floor, zone });
  }
  return out;
}

export function mapResponse(entry: RawStoreEntry, identity: ProductIdentity): AvailabilityAnswer {
  const { productName, price } = identity;
  const qty = Number(entry.qty);
  const stair = entry.stairNoList ?? [];
  const zone = entry.zoneNoList ?? [];

  // Precedence — classifies every mock fixture; unmatched combos fall through to the safe fallback (§6.3).
  // 1. Franchise/distributor with no location → stock undeterminable BY DESIGN, not by failure (Engineering §5).
  if (entry.directYn === 'N' && stair.length === 0 && zone.length === 0) {
    return { kind: 'franchiseUndeterminable', productName };
  }
  // 2. In stock — qty is an UPPER BOUND; carry it, never present it as an exact count (§4, §7).
  if (qty > 0) {
    return {
      kind: 'inStock',
      productName,
      price,
      locations: zipLocations(stair, zone),
      qtyUpperBound: qty,
    };
  }
  // 3. Discontinued — sleStsCd '9' is the definitive end-of-sale signal; it outranks temporarily-out (§4).
  if (entry.sleStsCd === '9') {
    return { kind: 'discontinued', productName, price };
  }
  // 4. Restock arriving — incoming-goods flag; surfaced ahead of not-carried / temporarily-out.
  if (entry.mrkGdsYn === 'Y') {
    return { kind: 'restockArriving', productName, price, lchDay: entry.lchDay };
  }
  // 5. Not carried — a direct-operated store with a null sale status does not carry it.
  if (entry.sleStsCd === null && entry.directYn === 'Y') {
    return { kind: 'notCarried', productName };
  }
  // 6. Temporarily out — carried (sleStsCd present) but zero on hand; a restock notification is offered (§4).
  if (qty === 0 && entry.sleStsCd !== null) {
    return { kind: 'temporarilyOut', productName, price, restockOfferable: true };
  }
  // 7. Unknown / unexpected combination → safe fallback. NEVER a fabricated Success (§6.3; §7 read-only).
  throw new UnmappableAnswerError(
    `unmapped entry: directYn=${entry.directYn} sleStsCd=${entry.sleStsCd} qty=${entry.qty}`,
  );
}
