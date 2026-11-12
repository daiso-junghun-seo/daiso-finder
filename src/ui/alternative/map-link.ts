// src/ui/alternative/map-link.ts
// Flow 3's outdoor handoff (Interface §4, spec §7): the address is the map app's job — the product's
// positional capability ends at the store door (D066). Platform-aware, and failing closed: an empty
// address yields no href, so the caller leaves plain text instead of inventing a destination.
export type MapPlatform = 'ios' | 'android' | 'web';

// iPadOS 13+ reports a desktop "Macintosh" UA; maxTouchPoints is the honest tell there. Kept as a
// parameter so the function stays pure and testable.
export function detectMapPlatform(userAgent: string, maxTouchPoints = 0): MapPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'web';
}

export function mapHref(address: string, platform: MapPlatform): string | null {
  const query = address.trim();
  if (!query) return null;
  const encoded = encodeURIComponent(query);
  if (platform === 'ios') return `https://maps.apple.com/?q=${encoded}`;
  if (platform === 'android') return `geo:0,0?q=${encoded}`;
  return `https://map.kakao.com/link/search/${encoded}`;
}

// The one place the browser is read, so the surface renders no platform logic of its own.
export function currentMapPlatform(): MapPlatform {
  if (typeof navigator === 'undefined') return 'web';
  return detectMapPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}
