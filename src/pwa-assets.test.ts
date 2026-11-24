// PWA install assets (§B19): manifest wiring in vite.config.ts + apple-touch-icon link in
// index.html. Text guards in the layout.test.ts idiom — they pin what CI can see (the wiring),
// not the pixels: file generation is reproducible via scripts/make-icons.py and its dimensions
// (192/512/512-maskable/180/48-favicon) were verified at generation time and recorded in §B19.
import html from '../index.html?raw';
import config from '../vite.config.ts?raw';

test('the manifest declares install icons: 192 + 512 + maskable 512', () => {
  for (const entry of [
    "src: 'icons/icon-192.png?v=2', sizes: '192x192'",
    "src: 'icons/icon-512.png?v=2', sizes: '512x512'",
    "src: 'icons/icon-maskable-512.png?v=2'",
    "purpose: 'maskable'",
  ]) {
    expect(config).toContain(entry);
  }
});

test('the manifest filename is versioned so a returning browser fetches the new icons', () => {
  expect(config).toContain("manifestFilename: 'manifest-2026-11-17.webmanifest'");
});

test('index.html links the iOS home-screen icon (Safari ignores the manifest)', () => {
  expect(html).toContain('rel="apple-touch-icon"');
  expect(html).toContain('/icons/apple-touch-icon-180.png?v=2');
});

test('index.html links the browser-tab icon', () => {
  expect(html).toContain('rel="icon"');
  expect(html).toContain('/icons/favicon-48.png?v=2');
});

test('theme-color matches the app surface in each system theme', () => {
  const light = html.indexOf('<meta name="theme-color" content="#ffffff" />');
  const dark = html.indexOf(
    '<meta name="theme-color" content="#1c1c1e" media="(prefers-color-scheme: dark)" />',
  );
  expect(light).toBeGreaterThan(-1);
  expect(dark).toBeGreaterThan(light);
});
