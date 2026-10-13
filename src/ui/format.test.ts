import {
  formatLchDay,
  formatLocation,
  formatPrice,
  formatRelativeTimeEn,
  formatRelativeTimeKo,
  kmToMeters,
} from './format';

test('formatPrice adds the Korean won suffix with thousands separators', () => {
  expect(formatPrice(2000)).toBe('2,000원');
  expect(formatPrice(1234567)).toBe('1,234,567원');
});

test('formatPrice in English uses the ₩ prefix with identical digits (matchable)', () => {
  expect(formatPrice(2000, 'en')).toBe('₩2,000');
  expect(formatPrice(1234567, 'en')).toBe('₩1,234,567');
  expect(formatPrice(2000, 'ko')).toBe(formatPrice(2000));
});

test('formatLocation renders floor and zone as "N층 M번"', () => {
  expect(formatLocation({ floor: '11', zone: '56' })).toBe('11층 56번');
});

test('formatLocation in English renders digits identically with English grammar', () => {
  expect(formatLocation({ floor: '11', zone: '56' }, 'en')).toBe('11F · No. 56');
  expect(formatLocation({ floor: '-1', zone: '56' }, 'en')).toBe('B1 · No. 56');
  expect(formatLocation({ floor: '11', zone: '56' }, 'ko')).toBe(
    formatLocation({ floor: '11', zone: '56' }),
  );
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

test('formatLocation renders a basement floor as "지하 N층 M번"', () => {
  expect(formatLocation({ floor: '-1', zone: '30' })).toBe('지하 1층 30번');
  expect(formatLocation({ floor: '11', zone: '56' })).toBe('11층 56번'); // aboveground unchanged
});

test('formatLchDay renders an ISO date as "M월 D일"', () => {
  expect(formatLchDay('2026-07-15')).toBe('7월 15일');
  expect(formatLchDay('2026-12-03')).toBe('12월 3일');
});

test('formatLchDay returns empty string for empty input (no NaN leak)', () => {
  expect(formatLchDay('')).toBe('');
});

test('formatLchDay returns empty string for a malformed date (no NaN leak)', () => {
  expect(formatLchDay('2026-07')).toBe('');
});

test('kmToMeters rounds kilometers to whole meters', () => {
  expect(kmToMeters(9.9)).toBe(9900);
  expect(kmToMeters(0.12)).toBe(120);
  expect(kmToMeters(0.1204)).toBe(120);
});

test('formatRelativeTimeEn mirrors the ko rules in English (day bands + truncated hours)', () => {
  const day = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h, 30).getTime();
  // Same day AM/PM, midnight, noon — same edges the ko tests pin.
  expect(formatRelativeTimeEn(day(2026, 6, 15, 7), day(2026, 6, 15, 9))).toBe('Today, 7 AM');
  expect(formatRelativeTimeEn(day(2026, 6, 15, 18), day(2026, 6, 16, 9))).toBe('Yesterday, 6 PM');
  expect(formatRelativeTimeEn(day(2026, 5, 12, 10), day(2026, 6, 15, 9))).toBe('Jun 12, 10 AM');
  expect(formatRelativeTimeEn(day(2026, 6, 15, 0), day(2026, 6, 15, 9))).toBe('Today, 12 AM');
  expect(formatRelativeTimeEn(day(2026, 6, 15, 12), day(2026, 6, 15, 13))).toBe('Today, 12 PM');
});
