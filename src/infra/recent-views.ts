// src/infra/recent-views.ts — owner-exception §B47: the Bible L-table has no "recently viewed"
// slot (only 최근 검색, Interface §2). Implemented under explicit owner exception — not the
// B28 precedent (B28 had a Bible mockup + verbatim copy; this has neither).
import type { AvailabilityAnswer, Money } from '../domain/types';

export interface RecentView {
  // pdNo when the lookup resolved one, else the product name. Exact match only — matching
  // tokens are never normalized (D068/D069).
  key: string;
  // Korean product name, verbatim match token (D069).
  name: string;
  // Keyword to re-run when the row is tapped.
  query: string;
  pdNo?: string;
  price?: Money;
  imageUrl?: string;
  // When WE viewed it (epoch ms) — never a backend stamp (D061).
  viewedAt: number;
}

const KEY = 'daiso.recentViews';
// Same cap as 최근 검색 (B28): small enough that the L2 Default slot never needs to scroll.
const MAX_ENTRIES = 5;

export function viewFromResult(
  query: string,
  pdNo: string | undefined,
  answer: AvailabilityAnswer,
  viewedAt: number,
): RecentView {
  // Only some answer kinds carry a price (notCarried/franchiseUndeterminable carry none) —
  // a missing price renders name-only, never a fabricated number.
  const price = 'price' in answer ? answer.price : undefined;
  return {
    key: pdNo ?? answer.productName,
    name: answer.productName,
    query,
    pdNo,
    price,
    imageUrl: answer.imageUrl,
    viewedAt,
  };
}

// Pure: most-recent-first, de-duplicated by key, capped at MAX_ENTRIES.
export function nextRecentViews(existing: RecentView[], view: RecentView): RecentView[] {
  if (!view.name.trim()) return existing;
  return [view, ...existing.filter((v) => v.key !== view.key)].slice(0, MAX_ENTRIES);
}

function isValidView(v: unknown): v is RecentView {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.key === 'string' &&
    typeof o.name === 'string' &&
    typeof o.query === 'string' &&
    typeof o.viewedAt === 'number' &&
    (o.pdNo === undefined || typeof o.pdNo === 'string') &&
    (o.price === undefined || typeof o.price === 'number') &&
    (o.imageUrl === undefined || typeof o.imageUrl === 'string')
  );
}

export function loadRecentViews(): RecentView[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(isValidView) ? parsed : [];
  } catch {
    return []; // corrupt/unavailable storage degrades to empty — never blocks the surface (G3)
  }
}

export function saveRecentViews(views: RecentView[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(views));
  } catch {
    // blocked/unavailable storage → best-effort persistence only; recording never blocks (G3)
  }
}
