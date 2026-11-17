// scripts/static-cache.test.mjs — the static header policy. Stable-name files (manifest, icons)
// must never be immutable: that is what pinned the old launcher artwork for a year.
import { cacheControlFor } from './static-cache.mjs';

const IMMUTABLE = 'public, max-age=31536000, immutable';

test('content-hashed build output is immutable', () => {
  expect(cacheControlFor('/srv/dist/assets/index-EDOdxAXX.js')).toBe(IMMUTABLE);
  expect(cacheControlFor('C:\\app\\dist\\assets\\index-EDOdxAXX.css')).toBe(IMMUTABLE);
  expect(cacheControlFor('/srv/dist/workbox-9c191d2f.js')).toBe(IMMUTABLE);
});

test('entry HTML and the service worker are never cached', () => {
  expect(cacheControlFor('/srv/dist/index.html')).toBe('no-store');
  expect(cacheControlFor('/srv/dist/sw.js')).toBe('no-store');
});

test('stable-name manifest and icons revalidate instead of pinning a deploy', () => {
  expect(cacheControlFor('/srv/dist/manifest.webmanifest')).toBe('no-cache');
  expect(cacheControlFor('/srv/dist/icons/icon-192.png')).toBe('public, max-age=300');
  expect(cacheControlFor('C:\\app\\dist\\icons\\icon-512.png')).toBe('public, max-age=300');
  expect(cacheControlFor('/srv/dist/icons/apple-touch-icon-180.png')).toBe('public, max-age=300');
});
