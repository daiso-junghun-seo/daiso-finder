// scripts/client-key.test.mjs — the proxy's rate-limit bucket key. The interesting cases are the
// spoofing ones: a client-supplied X-Forwarded-For must not buy a private bucket.
import { expect, test } from 'vitest';
import { clientKey } from './client-key.mjs';

test('Cloudflare header wins when present', () => {
  expect(
    clientKey(
      { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' },
      '127.0.0.1',
    ),
  ).toBe('203.0.113.7');
});

test('the last forwarded hop is used, not a client-supplied first entry', () => {
  expect(clientKey({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }, '127.0.0.1')).toBe('203.0.113.9');
});

test('a single forwarded hop is used', () => {
  expect(clientKey({ 'x-forwarded-for': '203.0.113.9' }, '127.0.0.1')).toBe('203.0.113.9');
});

test('empty forwarded hops fall back to the socket address', () => {
  expect(clientKey({ 'x-forwarded-for': ' , ' }, '127.0.0.1')).toBe('127.0.0.1');
  expect(clientKey({}, undefined)).toBe('unknown');
});

test('the key is capped so a huge header cannot grow the bucket map per request', () => {
  const key = clientKey({ 'x-forwarded-for': 'x'.repeat(500) }, '127.0.0.1');
  expect(key).toHaveLength(64);
});
