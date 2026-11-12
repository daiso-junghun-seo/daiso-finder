import { currentMapPlatform, detectMapPlatform, mapHref } from './map-link';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

test('iPhone and iPad are iOS', () => {
  expect(detectMapPlatform(IPHONE_UA)).toBe('ios');
  expect(detectMapPlatform(IPAD_UA)).toBe('ios');
});

test('iPadOS desktop-mode UA is iOS only when the screen is touch-capable', () => {
  expect(detectMapPlatform(MAC_UA, 5)).toBe('ios');
  expect(detectMapPlatform(MAC_UA, 0)).toBe('web');
});

test('Android is Android; everything else is the web fallback', () => {
  expect(detectMapPlatform(ANDROID_UA)).toBe('android');
  expect(detectMapPlatform(WINDOWS_UA)).toBe('web');
  expect(detectMapPlatform('')).toBe('web');
});

test('each platform gets its own scheme, with the address encoded', () => {
  const address = '서울 중구 명동길 1';
  const encoded = encodeURIComponent(address);
  expect(mapHref(address, 'ios')).toBe(`https://maps.apple.com/?q=${encoded}`);
  expect(mapHref(address, 'android')).toBe(`geo:0,0?q=${encoded}`);
  expect(mapHref(address, 'web')).toBe(`https://map.kakao.com/link/search/${encoded}`);
});

test('surrounding whitespace is trimmed before encoding; a blank address has no href', () => {
  expect(mapHref('  서울 중구 명동길 1  ', 'web')).toBe(
    `https://map.kakao.com/link/search/${encodeURIComponent('서울 중구 명동길 1')}`,
  );
  expect(mapHref('   ', 'ios')).toBeNull();
  expect(mapHref('', 'android')).toBeNull();
});

test('a vendor address with map-special characters still encodes', () => {
  expect(mapHref('A&B #1', 'web')).toBe(
    `https://map.kakao.com/link/search/${encodeURIComponent('A&B #1')}`,
  );
});

test('currentMapPlatform reads the live navigator', () => {
  const platform = currentMapPlatform();
  expect(['ios', 'android', 'web']).toContain(platform);
});
