// src/domain/lch-day.ts — canonical upstream→domain conversion for lchDay.
// The domain type stores a RENDER string ("M월 D일"), so the conversion belongs on the adapter's
// side of the boundary, not in ui/. Keeping it here lets adapters stay independent of ui/ (the
// layering rule storeDirectory.ts states) while ui/format re-exports it for presentation callers.
// Upstream lchDay is 'YYYY-MM-DD'; empty/malformed input becomes '' so no NaN reaches the copy
// (open-questions §B: restock-with-no-date has its own honest sentence).
export function formatLchDay(iso: string): string {
  const parts = iso.split('-');
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (parts.length !== 3 || Number.isNaN(month) || Number.isNaN(day)) return '';
  return `${month}월 ${day}일`;
}
