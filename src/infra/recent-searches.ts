// src/infra/recent-searches.ts
const KEY = 'daiso.recentSearches';
// Bible (Interface §2 mockup) shows the "최근 검색" list but does not specify a count — app-owned cap,
// small enough that the L2 Default slot never needs to scroll.
const MAX_ENTRIES = 5;

export function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string') ? parsed : [];
  } catch {
    return []; // corrupt/unavailable storage degrades to empty — never blocks the surface (G3)
  }
}

export function saveRecentSearches(keywords: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(keywords));
  } catch {
    // blocked/unavailable storage → best-effort persistence only; recording never blocks search (D082
    // operability precedent)
  }
}

// Pure: most-recent-first, de-duplicated (exact match — matching tokens are never normalized, D068/D069),
// capped at MAX_ENTRIES. Exported so callers (the Zustand store) don't re-derive the rule.
export function nextRecentSearches(existing: string[], keyword: string): string[] {
  const trimmed = keyword.trim();
  if (!trimmed) return existing;
  return [trimmed, ...existing.filter((k) => k !== trimmed)].slice(0, MAX_ENTRIES);
}
