// PWA install assets (§B19): manifest wiring in vite.config.ts + apple-touch-icon link in
// index.html. Text guards in the layout.test.ts idiom — they pin what CI can see (the wiring),
// not the pixels: file generation is reproducible via scripts/make-icons.py and its dimensions
// (192/512/512-maskable/180) were verified at generation time and recorded in §B19.
import html from '../index.html?raw';
import config from '../vite.config.ts?raw';

test('the manifest declares install icons: 192 + 512 + maskable 512', () => {
  for (const entry of [
    "src: 'icons/icon-192.png', sizes: '192x192'",
    "src: 'icons/icon-512.png', sizes: '512x512'",
    "src: 'icons/icon-maskable-512.png'",
    "purpose: 'maskable'",
  ]) {
    expect(config).toContain(entry);
  }
});

test('index.html links the iOS home-screen icon (Safari ignores the manifest)', () => {
  expect(html).toContain('rel="apple-touch-icon"');
  expect(html).toContain('/icons/apple-touch-icon-180.png');
});
