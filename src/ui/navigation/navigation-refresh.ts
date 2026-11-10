// src/ui/navigation/navigation-refresh.ts
// Flow 2's single background-refresh pipeline (Engineering/in-store-navigation.md §4):
// 2 s timeout, non-blocking, no polling. The card is rendered from data in hand before this runs.
//
// Outcomes are deliberately narrow. "changed" (an inStock answer whose guidance no longer matches the
// card) and "unapplied" (a negative state other than temporarilyOut) are the two mid-walk changes the
// Bible leaves open (§11 / D4): the caller renders nothing for them and lets the stamp age. Flow 2 does
// not invent copy for an experience-level decision that has not been made.
import { createStoreStockRepository } from '../../adapters/composition';
import type { StoreStockRepository } from '../../domain/ports';
import type {
  AvailabilityAnswer,
  Freshness,
  StoreContext,
  StoreLocation,
} from '../../domain/types';

export const NAV_REFRESH_TIMEOUT_MS = 2000;

export type InStockAnswer = Extract<AvailabilityAnswer, { kind: 'inStock' }>;

// The retained Flow 1 lookup. Candidate taps and scans keep exact pdNo identity; a typed keyword
// re-queries literally (the stock endpoint needs a keyword either way).
export type NavigationTerm =
  | { kind: 'keyword'; keyword: string }
  | { kind: 'pdNo'; pdNo: string; keyword: string };

export interface NavigationEntry {
  store: StoreContext;
  answer: InStockAnswer;
  freshness: Freshness;
  term: NavigationTerm;
}

export type NavigationRefreshOutcome =
  | { kind: 'unchanged'; answer: InStockAnswer; freshness: Freshness }
  | { kind: 'changed'; answer: InStockAnswer; freshness: Freshness }
  | { kind: 'soldOut'; answer: AvailabilityAnswer; freshness: Freshness }
  | { kind: 'unapplied'; answer: AvailabilityAnswer; freshness: Freshness }
  | { kind: 'failed' };

export interface NavigationRefreshDeps {
  repo?: StoreStockRepository;
  now?: () => number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const defaultRepository = createStoreStockRepository();

export function sameLocation(a: StoreLocation, b: StoreLocation): boolean {
  return a.floor === b.floor && a.zone === b.zone;
}

// Guidance identity for the refresh contract: name, price, and the ORDERED floor/zone list.
// Quantity and image may change alongside an unchanged answer (low-stock caption, photo arrival).
export function sameGuidance(a: InStockAnswer, b: InStockAnswer): boolean {
  return (
    a.productName === b.productName &&
    a.price === b.price &&
    a.locations.length === b.locations.length &&
    a.locations.every((location, index) => {
      const other = b.locations[index];
      return other !== undefined && sameLocation(location, other);
    })
  );
}

// "Another position" only exists when the position the shopper is walking to is still listed.
// A refreshed answer that moved the product is the D4 location-move case, not "also here".
export function otherLocationOf(
  answer: InStockAnswer,
  current: StoreLocation,
): StoreLocation | null {
  if (!answer.locations.some((location) => sameLocation(location, current))) return null;
  return answer.locations.find((location) => !sameLocation(location, current)) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isWellFormedLocation(value: unknown): value is StoreLocation {
  return (
    isRecord(value) &&
    typeof value.floor === 'string' &&
    value.floor.trim() !== '' &&
    typeof value.zone === 'string' &&
    value.zone.trim() !== ''
  );
}

// A malformed 200 is a failed refresh: a response whose required fields cannot back the current
// guidance updates nothing (Engineering §4, A3). Only inStock carries guidance; the negative
// kinds are routed by `kind` and the exit renders fixed copy.
export function isWellFormedAnswer(value: unknown): value is AvailabilityAnswer {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  switch (value.kind) {
    case 'inStock':
      return (
        typeof value.productName === 'string' &&
        value.productName.trim() !== '' &&
        typeof value.price === 'number' &&
        Number.isFinite(value.price) &&
        Array.isArray(value.locations) &&
        value.locations.length > 0 &&
        value.locations.every(isWellFormedLocation) &&
        typeof value.qtyUpperBound === 'number' &&
        Number.isFinite(value.qtyUpperBound)
      );
    case 'temporarilyOut':
    case 'discontinued':
    case 'notCarried':
    case 'restockArriving':
    case 'franchiseUndeterminable':
      return true;
    default:
      return false;
  }
}

function queryTerm(term: NavigationTerm): { keyword: string; pdNo?: string } {
  return term.kind === 'pdNo'
    ? { keyword: term.keyword, pdNo: term.pdNo }
    : { keyword: term.keyword };
}

export async function refreshNavigation(
  entry: NavigationEntry,
  deps: NavigationRefreshDeps = {},
): Promise<NavigationRefreshOutcome> {
  if (!entry.term.keyword.trim()) return { kind: 'failed' };
  const repo = deps.repo ?? defaultRepository;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? NAV_REFRESH_TIMEOUT_MS;
  const controller = new AbortController();

  let abortRace!: (error: unknown) => void;
  const guard = new Promise<never>((_, reject) => {
    abortRace = reject;
  });
  const abort = () => {
    controller.abort();
    abortRace(new Error('navigation refresh aborted'));
  };
  const timer = setTimeout(() => {
    controller.abort();
    abortRace(new Error('navigation refresh timeout'));
  }, timeoutMs);
  deps.signal?.addEventListener('abort', abort, { once: true });
  if (deps.signal?.aborted) abort();

  try {
    const answer = await Promise.race([
      repo.query(entry.store, queryTerm(entry.term), controller.signal),
      guard,
    ]);
    if (!isWellFormedAnswer(answer)) return { kind: 'failed' };
    const freshness: Freshness = { class: 'live', observedAt: now() };
    if (answer.kind === 'temporarilyOut') return { kind: 'soldOut', answer, freshness };
    if (answer.kind !== 'inStock') return { kind: 'unapplied', answer, freshness };
    return sameGuidance(entry.answer, answer)
      ? { kind: 'unchanged', answer, freshness }
      : { kind: 'changed', answer, freshness };
  } catch {
    return { kind: 'failed' };
  } finally {
    clearTimeout(timer);
    deps.signal?.removeEventListener('abort', abort);
  }
}
