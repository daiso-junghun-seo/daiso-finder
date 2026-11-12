// src/ui/alternative/alternative-query.ts
// Flow 3's two independent queries (Engineering/alternative-discovery.md §4): parallel, no barrier,
// 2 s client-owned deadline, no periodic timer. One slot's failure or delay never blocks the other.
import { createAlternativeRepository } from '../../adapters/composition';
import type { AlternativeRepository } from '../../domain/ports';
import type { NearbyAlternative, SimilarAlternative } from '../../domain/types';
import { type AlternativeCache, alternativeCache } from './alternative-cache';
import {
  type AlternativeEntry,
  type AlternativeSlots,
  type AlternativeSnapshot,
  type SlotKind,
  type SlotResult,
  initialSlots,
  issuedKinds,
} from './alternative-types';

export const ALT_TIMEOUT_MS = 2000;

export interface AlternativeQueryDeps {
  repo?: AlternativeRepository;
  now?: () => number;
  timeoutMs?: number;
  signal?: AbortSignal;
  cache?: AlternativeCache;
}

export interface SlotOutcome<T> {
  result: SlotResult<T>;
  observedAt: number | null; // when this slot's observation completed; null unless ready/empty
}

export type AnySlotOutcome = SlotOutcome<SimilarAlternative> | SlotOutcome<NearbyAlternative>;

const defaultRepository = createAlternativeRepository();

// One slot, one deadline. The run callback receives its own signal so the timeout and any external
// cancellation reach the adapter. `interrupted` rejects on abort even if the adapter ignores the
// signal, so a hung request can never hold the slot past 2 s.
async function querySlot<T>({
  issued,
  run,
  now,
  timeoutMs,
  signal,
}: {
  issued: boolean;
  run: (signal: AbortSignal) => Promise<T[]>;
  now: () => number;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<SlotOutcome<T>> {
  if (!issued) return { result: { status: 'withheld' }, observedAt: null };
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  let settled = false;
  const interrupted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      'abort',
      () => {
        if (!settled) reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const rows = await Promise.race([run(controller.signal), interrupted]);
    return {
      result: rows.length === 0 ? { status: 'empty' } : { status: 'ready', rows },
      observedAt: now(),
    };
  } catch {
    return { result: { status: 'failed' }, observedAt: null };
  } finally {
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

function querySimilarSlot(
  entry: AlternativeEntry,
  run: (signal: AbortSignal) => Promise<SimilarAlternative[]>,
  deps: { now: () => number; timeoutMs: number; signal?: AbortSignal },
): Promise<SlotOutcome<SimilarAlternative>> {
  return querySlot({ issued: entry.issued.similar, run, ...deps });
}

function queryNearbySlot(
  entry: AlternativeEntry,
  run: (signal: AbortSignal) => Promise<NearbyAlternative[]>,
  deps: { now: () => number; timeoutMs: number; signal?: AbortSignal },
): Promise<SlotOutcome<NearbyAlternative>> {
  return querySlot({ issued: entry.issued.nearby, run, ...deps });
}

function setSlot<T>(slots: AlternativeSlots, kind: SlotKind, result: SlotResult<T>): void {
  // The caller passes the T that belongs to `kind` by construction; the two slots hold different row
  // types, so the heterogeneous record needs one truthful narrowing here.
  if (kind === 'similar') slots.similar = result as SlotResult<SimilarAlternative>;
  else slots.nearby = result as SlotResult<NearbyAlternative>;
}

export function initialSnapshot(entry: AlternativeEntry): AlternativeSnapshot {
  return {
    slots: initialSlots(entry.issued),
    issued: entry.issued,
    observedAt: null,
    source: 'live',
    settled: false,
  };
}

export interface AlternativeQueryHandle {
  promise: Promise<AlternativeSnapshot>;
  cancel: () => void;
}

// Emits a snapshot as each slot lands, so the surface can render the first answer without waiting for
// the second. The final snapshot is the one cache rules judge: all-failed may serve the whole-answer
// cache, a complete success is stored, and a mixed answer is neither saved nor mixed with cache.
export function startAlternativeQuery(
  entry: AlternativeEntry,
  deps: AlternativeQueryDeps & { onUpdate?: (snapshot: AlternativeSnapshot) => void } = {},
): AlternativeQueryHandle {
  const repo = deps.repo ?? defaultRepository;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? ALT_TIMEOUT_MS;
  const cache = deps.cache ?? alternativeCache;
  const controller = new AbortController();
  const kinds = issuedKinds(entry.issued);
  const slots = initialSlots(entry.issued);
  const times = new Map<SlotKind, number>();
  let settledCount = 0;
  let cancelled = false;
  let snapshot = initialSnapshot(entry);

  const emit = () => deps.onUpdate?.(snapshot);
  const onExternalAbort = () => controller.abort();
  deps.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const slotDeps = { now, timeoutMs, signal: controller.signal };

  const land = <T>(kind: SlotKind, outcome: SlotOutcome<T>) => {
    if (cancelled) return;
    setSlot(slots, kind, outcome.result);
    if (outcome.observedAt !== null) times.set(kind, outcome.observedAt);
    settledCount += 1;
    const settled = settledCount === kinds.length;
    const allFailed = settled && kinds.every((k) => slots[k].status === 'failed');
    if (settled && allFailed) {
      const cached = cache.load(entry);
      if (cached) {
        snapshot = cached;
        emit();
        return;
      }
    }
    snapshot = {
      slots,
      issued: entry.issued,
      // No stamp until every issued slot has settled (Engineering §7).
      observedAt: settled && times.size > 0 ? Math.min(...times.values()) : null,
      source: 'live',
      settled,
    };
    if (settled && !allFailed) cache.save(entry, snapshot);
    emit();
  };

  const similarP = entry.issued.similar
    ? querySimilarSlot(
        entry,
        (signal) =>
          repo.querySimilar(
            entry.store,
            { keyword: entry.keyword, ...(entry.pdNo ? { excludePdNo: entry.pdNo } : {}) },
            signal,
          ),
        slotDeps,
      ).then((outcome) => land('similar', outcome))
    : Promise.resolve();
  const nearbyP = entry.issued.nearby
    ? queryNearbySlot(
        entry,
        (signal) => repo.queryNearby(entry.store, entry.pdNo ?? '', signal),
        slotDeps,
      ).then((outcome) => land('nearby', outcome))
    : Promise.resolve();

  const promise = Promise.all([similarP, nearbyP])
    .then(() => snapshot)
    .finally(() => deps.signal?.removeEventListener('abort', onExternalAbort));

  emit();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      controller.abort();
    },
  };
}

// Pull / resume / stale retry: existing rows are NEVER cleared. A fresh answer replaces a slot; a
// failed read keeps what is on screen and lets the shared stamp age. A half-failed refresh is not
// stored, even though the kept rows may look complete.
export async function refreshAlternative(
  entry: AlternativeEntry,
  current: AlternativeSnapshot,
  deps: AlternativeQueryDeps = {},
): Promise<AlternativeSnapshot> {
  const repo = deps.repo ?? defaultRepository;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? ALT_TIMEOUT_MS;
  const cache = deps.cache ?? alternativeCache;
  const kinds = issuedKinds(entry.issued);
  const slots: AlternativeSlots = { ...current.slots };
  const times: number[] = [];
  let freshSuccess = false;
  let freshFailure = false;

  const slotDeps = { now, timeoutMs, signal: deps.signal };
  const keepPrevious = (slot: SlotResult<SimilarAlternative> | SlotResult<NearbyAlternative>) => {
    // A failed read never erases what is on screen; its old observation age still counts to the stamp.
    if (slot.status === 'ready' || slot.status === 'empty') {
      if (current.observedAt !== null) times.push(current.observedAt);
      return true;
    }
    return false;
  };

  await Promise.all(
    kinds.map(async (kind) => {
      if (kind === 'similar') {
        const outcome = await querySimilarSlot(
          entry,
          (signal) =>
            repo.querySimilar(
              entry.store,
              { keyword: entry.keyword, ...(entry.pdNo ? { excludePdNo: entry.pdNo } : {}) },
              signal,
            ),
          slotDeps,
        );
        if (outcome.result.status === 'failed') {
          freshFailure = true;
          if (!keepPrevious(current.slots.similar)) slots.similar = { status: 'failed' };
          return;
        }
        freshSuccess = true;
        slots.similar = outcome.result;
        if (outcome.observedAt !== null) times.push(outcome.observedAt);
        return;
      }
      const outcome = await queryNearbySlot(
        entry,
        (signal) => repo.queryNearby(entry.store, entry.pdNo ?? '', signal),
        slotDeps,
      );
      if (outcome.result.status === 'failed') {
        freshFailure = true;
        if (!keepPrevious(current.slots.nearby)) slots.nearby = { status: 'failed' };
        return;
      }
      freshSuccess = true;
      slots.nearby = outcome.result;
      if (outcome.observedAt !== null) times.push(outcome.observedAt);
    }),
  );

  const observedAt = times.length > 0 ? Math.min(...times) : current.observedAt;
  const snapshot: AlternativeSnapshot = {
    slots,
    issued: entry.issued,
    observedAt,
    source: 'live',
    settled: true,
  };
  if (freshSuccess && !freshFailure) cache.save(entry, snapshot);
  return snapshot;
}

// Slot-scoped retry: only the failed slot is asked again; a ready sibling is never re-queried.
export function retryAlternativeSlot(
  entry: AlternativeEntry,
  kind: SlotKind,
  deps: AlternativeQueryDeps = {},
): Promise<AnySlotOutcome> {
  const repo = deps.repo ?? defaultRepository;
  const slotDeps = {
    now: deps.now ?? Date.now,
    timeoutMs: deps.timeoutMs ?? ALT_TIMEOUT_MS,
    signal: deps.signal,
  };
  if (kind === 'similar') {
    return querySimilarSlot(
      entry,
      (signal) =>
        repo.querySimilar(
          entry.store,
          { keyword: entry.keyword, ...(entry.pdNo ? { excludePdNo: entry.pdNo } : {}) },
          signal,
        ),
      slotDeps,
    );
  }
  return queryNearbySlot(
    entry,
    (signal) => repo.queryNearby(entry.store, entry.pdNo ?? '', signal),
    slotDeps,
  );
}
