// src/ui/alternative/alternative-cache.ts
// Engineering/alternative-discovery.md §5–§6: ONE cache unit for the whole answer, keyed by the store
// and the exact identity, and only ever served when every issued slot failed. A mixed live/cache answer
// is forbidden, and a half-failed answer is never stored — the cache may not remember a success it did
// not have. TTL: none; the shared freshness threshold decides what the stamp means.
import type {
  AlternativeEntry,
  AlternativeSnapshot,
  IssuedSlots,
  SlotKind,
} from './alternative-types';
import { issuedKinds } from './alternative-types';

export interface AlternativeCache {
  save(entry: AlternativeEntry, snapshot: AlternativeSnapshot): void;
  load(entry: AlternativeEntry): AlternativeSnapshot | null;
  clear(): void;
}

export function alternativeCacheKey(entry: AlternativeEntry): string {
  return `${entry.store.strCd}:${entry.pdNo ?? entry.keyword}`;
}

function sameIssued(a: IssuedSlots, b: IssuedSlots): boolean {
  return a.similar === b.similar && a.nearby === b.nearby;
}

function isSuccess(snapshot: AlternativeSnapshot, kinds: SlotKind[]): boolean {
  return kinds.every((kind) => {
    const slot = snapshot.slots[kind];
    return slot.status === 'ready' || slot.status === 'empty';
  });
}

export function createAlternativeCache(now: () => number = Date.now): AlternativeCache {
  const entries = new Map<string, AlternativeSnapshot>();
  return {
    save(entry, snapshot) {
      if (!snapshot.settled || snapshot.source !== 'live') return;
      const kinds = issuedKinds(entry.issued);
      if (kinds.length === 0 || !isSuccess(snapshot, kinds)) return;
      entries.set(alternativeCacheKey(entry), {
        ...snapshot,
        source: 'cache',
        // The stamp is when the cache was written, never "just now" for data that is not new.
        observedAt: now(),
      });
    },
    load(entry) {
      const hit = entries.get(alternativeCacheKey(entry));
      if (!hit || !sameIssued(hit.issued, entry.issued)) return null;
      return hit;
    },
    clear() {
      entries.clear();
    },
  };
}

export const alternativeCache = createAlternativeCache();
