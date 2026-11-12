// src/adapters/daisomall/alternativeRepository.ts
// AlternativeRepository over the internal /api/alternatives proxy. Validates + maps; never talks to
// daisomall. Group B (nearby) has no live route yet — the port exists so the surface is wired the day
// the data questions close, and the entry matrix withholds it in production until then (§B50-2).
import type { AlternativeRepository } from '../../domain/ports';
import type { SimilarAlternative } from '../../domain/types';
import { parseRawAlternatives } from './rawAlternative';

// Structurally identical to composition.ts's DiagnosticFetch (and the other adapters' FetchLike):
// { ok, status, json } is all this adapter reads.
export type AlternativeFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface DaisoAlternativeDeps {
  fetchImpl?: AlternativeFetch;
}

export function createDaisoAlternativeRepository(
  deps: DaisoAlternativeDeps = {},
): AlternativeRepository {
  const fetchImpl: AlternativeFetch =
    deps.fetchImpl ?? ((url, init) => fetch(url, init) as Promise<Response>);
  return {
    async querySimilar(store, term, signal): Promise<SimilarAlternative[]> {
      const res = await fetchImpl('/api/alternatives', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          strCd: store.strCd,
          keyword: term.keyword,
          ...(term.excludePdNo ? { excludePdNo: term.excludePdNo } : {}),
        }),
        signal,
      });
      if (!res.ok) throw new Error(`alternatives ${res.status}`);
      const parsed = parseRawAlternatives(await res.json());
      // Found-but-unpublishable is a failed slot, never the empty sentence: "이 매장에는 비슷한
      // 상품이 없어요" would be false (spec §2.1).
      if (parsed.rows.length === 0 && parsed.omitted > 0) {
        throw new Error('alternatives: candidates found but none publishable');
      }
      return parsed.rows;
    },

    async queryNearby(): Promise<never> {
      // Deliberately unreachable: NEARBY_LIVE is false and the entry matrix withholds the slot.
      throw new Error('nearby live is withheld until the data questions close (§B50-2)');
    },
  };
}
