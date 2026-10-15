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

// 'shared' = the OS took it (it confirms). 'dismissed' = the user waved it off or it errored —
// the caller falls back to copy, so dismissal is never a dead end. 'unavailable' = no API.
export async function nativeShare(text: string): Promise<'shared' | 'dismissed' | 'unavailable'> {
  const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
  if (typeof nav.share !== 'function') return 'unavailable';
  try {
    await nav.share({ text });
    return 'shared';
  } catch {
    return 'dismissed';
  }
}
