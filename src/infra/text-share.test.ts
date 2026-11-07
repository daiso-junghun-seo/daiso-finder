// src/infra/text-share.test.ts — owner-exception §B47 slice 3.
import { canNativeShare, copyText, nativeShare } from './text-share';

test('copyText resolves true/false, never throws', async () => {
  const withClipboard = (writeText: () => Promise<void>) => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  };
  withClipboard(async () => {});
  expect(await copyText('x')).toBe(true);
  withClipboard(async () => {
    throw new Error('blocked');
  });
  expect(await copyText('x')).toBe(false);
  Reflect.deleteProperty(navigator, 'clipboard');
  expect(await copyText('x')).toBe(false);
});

test('nativeShare separates cancel from failure, and never throws', async () => {
  const nav = navigator as Navigator & { share?: unknown };
  const original = nav.share;
  nav.share = async () => {};
  expect(await nativeShare('x')).toBe('shared');
  expect(canNativeShare()).toBe(true);

  // The user closed the OS sheet: a decision, not an error — the caller must not copy instead.
  const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
  nav.share = async () => {
    throw abort;
  };
  expect(await nativeShare('x')).toBe('cancelled');

  // A real failure still gets a copy fallback.
  nav.share = async () => {
    throw new Error('boom');
  };
  expect(await nativeShare('x')).toBe('failed');

  Reflect.deleteProperty(navigator, 'share');
  expect(await nativeShare('x')).toBe('unavailable');
  expect(canNativeShare()).toBe(false);
  if (original) nav.share = original;
});
