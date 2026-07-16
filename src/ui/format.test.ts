import { formatLocation, formatPrice, formatRelativeTimeKo } from './format';

test('formatPrice adds the Korean won suffix with thousands separators', () => {
  expect(formatPrice(2000)).toBe('2,000원');
  expect(formatPrice(1234567)).toBe('1,234,567원');
});

test('formatLocation renders floor and zone as "N층 M번"', () => {
  expect(formatLocation({ floor: '11', zone: '56' })).toBe('11층 56번');
});

test('formatRelativeTimeKo: same calendar day renders "오늘 오전/오후 H시"', () => {
  const now = new Date(2026, 6, 15, 9, 30).getTime();
  const observed = new Date(2026, 6, 15, 7, 5).getTime();
  expect(formatRelativeTimeKo(observed, now)).toBe('오늘 오전 7시');
});

test('formatRelativeTimeKo: previous calendar day renders "어제 오후 H시" (Bible example)', () => {
  const now = new Date(2026, 6, 15, 9, 0).getTime();
  const observed = new Date(2026, 6, 14, 18, 20).getTime();
  expect(formatRelativeTimeKo(observed, now)).toBe('어제 오후 6시');
});

test('formatRelativeTimeKo: two or more calendar days renders an absolute "M월 D일" date', () => {
  const now = new Date(2026, 6, 15, 9, 0).getTime();
  const observed = new Date(2026, 5, 12, 10, 0).getTime();
  expect(formatRelativeTimeKo(observed, now)).toBe('6월 12일 오전 10시');
});

test('formatRelativeTimeKo: midnight (0시) renders as "오전 12시"', () => {
  const now = new Date(2026, 6, 15, 9, 0).getTime();
  const observed = new Date(2026, 6, 15, 0, 10).getTime();
  expect(formatRelativeTimeKo(observed, now)).toBe('오늘 오전 12시');
});

test('formatRelativeTimeKo: noon (12시) renders as "오후 12시"', () => {
  const now = new Date(2026, 6, 15, 13, 0).getTime();
  const observed = new Date(2026, 6, 15, 12, 5).getTime();
  expect(formatRelativeTimeKo(observed, now)).toBe('오늘 오후 12시');
});
