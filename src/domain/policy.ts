// src/domain/policy.ts — data-owner-unresolved values live here behind the shim (design spec §7). NOT app-decided.
import type { SearchAliasResolverPort } from './ports';

export type DiscontinuedScope = 'store' | 'chain'; // A7 — switchable without rewriting the Flow 3 matrix

export interface DataOwnerPolicy {
  stalenessThresholdMs: number; // A2 — provisional placeholder; confirm with data owner, then Bible records it
  lowQtyCutoff: number; // A3 — provisional placeholder
  discontinuedScope: DiscontinuedScope; // A7 — provisional
  provisional: true; // marks every value above as un-ratified
}

export const defaultPolicy: DataOwnerPolicy = {
  stalenessThresholdMs: 6 * 3_600_000, // provisional 6h — placeholder only
  lowQtyCutoff: 5, // provisional — placeholder only
  discontinuedScope: 'store', // provisional — placeholder only
  provisional: true,
};

export const nullAliasResolver: SearchAliasResolverPort = { resolve: () => null }; // A4
