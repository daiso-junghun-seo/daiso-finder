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

test('nativeShare reports shared/dismissed/unavailable without throwing', async () => {
  const nav = navigator as Navigator & { share?: unknown };
  const original = nav.share;
  nav.share = async () => {};
  expect(await nativeShare('x')).toBe('shared');
  expect(canNativeShare()).toBe(true);
  nav.share = async () => {
    throw new Error('cancelled');
  };
  expect(await nativeShare('x')).toBe('dismissed');
  Reflect.deleteProperty(navigator, 'share');
  expect(await nativeShare('x')).toBe('unavailable');
  expect(canNativeShare()).toBe(false);
  if (original) nav.share = original;
});
