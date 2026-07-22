// src/adapters/daisomall/rawObservation.ts
// The proxy→client network contract (mirror of functions/api/availability.ts's RawStoreObservation) plus a
// lightweight runtime validator. JSON is never trusted: any shape/type mismatch → UnmappableAnswerError.
import { UnmappableAnswerError } from '../../domain/errors';

export interface RawStoreObservation {
  strCd: string;
  pdNo: string;
  productName: string;
  price: number;
  directYn: string;
  stck: string | null;
  sleStsCd: string | null;
  mrkGdsYn: string | null;
  lchDay: string | null;
  locations: { floor: string; zone: string }[];
}

function isStrOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

export function parseRawObservation(value: unknown): RawStoreObservation {
  if (!value || typeof value !== 'object')
    throw new UnmappableAnswerError('observation: not an object');
  const o = value as Record<string, unknown>;
  if (
    typeof o.strCd !== 'string' ||
    typeof o.pdNo !== 'string' ||
    typeof o.productName !== 'string'
  ) {
    throw new UnmappableAnswerError('observation: missing identity');
  }
  if (typeof o.price !== 'number' || typeof o.directYn !== 'string') {
    throw new UnmappableAnswerError('observation: missing price/directYn');
  }
  if (
    !isStrOrNull(o.stck) ||
    !isStrOrNull(o.sleStsCd) ||
    !isStrOrNull(o.mrkGdsYn) ||
    !isStrOrNull(o.lchDay)
  ) {
    throw new UnmappableAnswerError('observation: bad stock fields');
  }
  if (!Array.isArray(o.locations))
    throw new UnmappableAnswerError('observation: locations not array');
  const locations = o.locations.map((l) => {
    const r = l as Record<string, unknown>;
    if (!r || typeof r.floor !== 'string' || typeof r.zone !== 'string') {
      throw new UnmappableAnswerError('observation: bad location');
    }
    return { floor: r.floor, zone: r.zone };
  });
  return {
    strCd: o.strCd,
    pdNo: o.pdNo,
    productName: o.productName,
    price: o.price,
    directYn: o.directYn,
    stck: o.stck,
    sleStsCd: o.sleStsCd,
    mrkGdsYn: o.mrkGdsYn,
    lchDay: o.lchDay,
    locations,
  };
}
