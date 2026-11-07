// src/infra/text-share.ts — owner-exception §B47 slice 3: device share primitives.
// Both are best-effort booleans, never throws — the sheet always has a hand-select fallback.
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function canNativeShare(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof (navigator as Navigator & { share?: unknown }).share === 'function'
  );
}

// 'shared' = the OS took it. 'cancelled' = the user closed the sheet on purpose (no fallback —
// copying after a cancel would be an unrequested side effect). 'failed' = the sheet errored, so
// the caller falls back to copy. 'unavailable' = no Web Share API at all.
export async function nativeShare(
  text: string,
): Promise<'shared' | 'cancelled' | 'failed' | 'unavailable'> {
  const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
  if (typeof nav.share !== 'function') return 'unavailable';
  try {
    await nav.share({ text });
    return 'shared';
  } catch (err) {
    const name = (err as { name?: unknown } | null)?.name;
    return name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
