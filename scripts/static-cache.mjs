// scripts/static-cache.mjs — Cache-Control policy for the built tree.
//
// Only content-hashed build output may be immutable. The manifest and the icon set keep the same
// filenames across deploys, so `immutable` pinned the previous artwork in browsers for a year
// (observed 2026-11-17: the owner-supplied launcher icon looked unchanged after it shipped).
// The entry HTML and the service worker stay no-store: both are unhashed names that point at
// hashed chunks, so a cached copy pins the whole app to the previous deploy.

const IMMUTABLE = 'public, max-age=31536000, immutable';

export function cacheControlFor(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  if (normalized.endsWith('.html') || normalized.endsWith('/sw.js')) return 'no-store';
  if (normalized.includes('/assets/') || /\/workbox-[^/]+\.js$/.test(normalized)) return IMMUTABLE;
  // The manifest is tiny and points at the icons; revalidate it so a deploy is picked up.
  if (normalized.endsWith('.webmanifest')) return 'no-cache';
  // Stable-name assets (the icon set, ~660 KiB): five minutes keeps a normal visit cached while
  // a replacement becomes visible without a hard refresh.
  return 'public, max-age=300';
}
