// src/adapters/daisomall/rawAlternative.ts
// The proxy→client network contract for Flow 3 Group A (mirror of functions/api/alternatives.ts's
// RawSimilarRow) plus a runtime validator. JSON is never trusted. A malformed ROW is dropped; a malformed
// PAYLOAD — or one whose rows were all unreadable — throws, so the slot fails instead of claiming empty.
import { UnmappableAnswerError } from '../../domain/errors';
import type { SimilarAlternative } from '../../domain/types';

export interface RawSimilarRow {
  pdNo: string;
  productName: string;
  price: number;
  imageUrl: string | null;
  qtyUpperBound: number;
  locations: { floor: string; zone: string }[];
}

export interface ParsedAlternatives {
  rows: SimilarAlternative[];
  omitted: number;
}

function isLocation(v: unknown): v is { floor: string; zone: string } {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.floor === 'string' && typeof r.zone === 'string' && r.zone.trim() !== '';
}

function parseRow(v: unknown): SimilarAlternative | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const pdNo = typeof r.pdNo === 'string' ? r.pdNo.trim() : '';
  const productName = typeof r.productName === 'string' ? r.productName.trim() : '';
  if (
    !pdNo ||
    !productName ||
    typeof r.price !== 'number' ||
    !Number.isFinite(r.price) ||
    typeof r.qtyUpperBound !== 'number' ||
    !Number.isFinite(r.qtyUpperBound) ||
    r.qtyUpperBound <= 0 ||
    (r.imageUrl !== null && typeof r.imageUrl !== 'string') ||
    !Array.isArray(r.locations) ||
    // A row without a display location is not a row: the server omits it, and a client-side
    // zero-location row would render a heading with nowhere to stand.
    r.locations.length === 0 ||
    !r.locations.every(isLocation)
  ) {
    return null;
  }
  return {
    pdNo,
    productName,
    price: r.price,
    qtyUpperBound: r.qtyUpperBound,
    locations: r.locations.map((l) => ({ floor: l.floor, zone: l.zone })),
    ...(typeof r.imageUrl === 'string' && r.imageUrl !== '' ? { imageUrl: r.imageUrl } : {}),
  };
}

export function parseRawAlternatives(value: unknown): ParsedAlternatives {
  if (!value || typeof value !== 'object') {
    throw new UnmappableAnswerError('alternatives: not an object');
  }
  const o = value as Record<string, unknown>;
  if (!Array.isArray(o.rows)) throw new UnmappableAnswerError('alternatives: rows not array');
  if (typeof o.omitted !== 'number' || !Number.isFinite(o.omitted) || o.omitted < 0) {
    throw new UnmappableAnswerError('alternatives: bad omitted');
  }
  const rows: SimilarAlternative[] = [];
  let dropped = 0;
  for (const raw of o.rows) {
    const row = parseRow(raw);
    if (row) rows.push(row);
    else dropped += 1;
  }
  // Every supplied row unreadable is payload corruption, not "there is nothing here".
  if (o.rows.length > 0 && rows.length === 0) {
    throw new UnmappableAnswerError('alternatives: no readable rows');
  }
  return { rows, omitted: o.omitted + dropped };
}
