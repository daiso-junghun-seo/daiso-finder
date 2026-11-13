// src/ui/alternative/alternative-cache-signal.ts
// A tiny eager handle for a lazily-owned singleton. The whole-answer cache lives with the Flow 3 chunk
// (it is only meaningful once that surface has run), but a store switch must drop it synchronously even
// if the surface is not mounted. The cache module registers its clear here when it loads; before that
// the cache does not exist, so the no-op is correct rather than a missed clear.
let clear: (() => void) | null = null;

export function registerAlternativeCacheClear(fn: () => void): void {
  clear = fn;
}

export function clearAlternativeCache(): void {
  clear?.();
}
