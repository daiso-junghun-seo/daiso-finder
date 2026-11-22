import { LOCALES } from '../i18n/locale';
import {
  formatDistance,
  formatHour,
  formatLchDay,
  formatLocation,
  formatPrice,
  formatRelativeTime,
  formatRelativeTimeEn,
  formatRelativeTimeKo,
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

test('formatPrice keeps the same digits in all 12 locales (D069 match token)', () => {
  for (const locale of LOCALES) {
    const rendered = formatPrice(2000, locale);
    expect(rendered).toContain('2,000');
    expect(rendered).not.toContain('{');
    if (locale === 'ko') expect(rendered).toBe('2,000원');
    else expect(rendered).toBe('₩2,000');
  }
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

test('formatLocation keeps signage digits identical in every non-ko locale', () => {
  for (const locale of LOCALES) {
    const above = formatLocation({ floor: '11', zone: '56' }, locale);
    const below = formatLocation({ floor: '-1', zone: '56' }, locale);
    expect(above).toContain('11');
    expect(above).toContain('56');
    expect(below).toContain('1');
    expect(below).toContain('56');
    if (locale === 'ko') {
      expect(above).toBe('11층 56번');
      expect(below).toBe('지하 1층 56번');
    } else {
      expect(above).toBe('11F · No. 56');
      expect(below).toBe('B1 · No. 56');
    }
  }
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

test('formatRelativeTimeEn mirrors the ko rules in English (day bands + truncated hours)', () => {
  const day = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h, 30).getTime();
  // Same day AM/PM, midnight, noon — same edges the ko tests pin.
  expect(formatRelativeTimeEn(day(2026, 6, 15, 7), day(2026, 6, 15, 9))).toBe('Today, 7 AM');
  expect(formatRelativeTimeEn(day(2026, 6, 15, 18), day(2026, 6, 16, 9))).toBe('Yesterday, 6 PM');
  expect(formatRelativeTimeEn(day(2026, 5, 12, 10), day(2026, 6, 15, 9))).toBe('Jun 12, 10 AM');
  expect(formatRelativeTimeEn(day(2026, 6, 15, 0), day(2026, 6, 15, 9))).toBe('Today, 12 AM');
  expect(formatRelativeTimeEn(day(2026, 6, 15, 12), day(2026, 6, 15, 13))).toBe('Today, 12 PM');
});

test('formatRelativeTime delegates ko/en byte-identically to the legacy formatters', () => {
  const observed = new Date(2026, 6, 14, 18, 20).getTime();
  const now = new Date(2026, 6, 15, 9, 0).getTime();
  expect(formatRelativeTime('ko', observed, now)).toBe(formatRelativeTimeKo(observed, now));
  expect(formatRelativeTime('en', observed, now)).toBe(formatRelativeTimeEn(observed, now));
});

test('formatRelativeTime renders a non-empty, token-free line in every added locale', () => {
  const observed = new Date(2026, 6, 14, 18, 20).getTime();
  const now = new Date(2026, 6, 15, 9, 0).getTime();
  for (const locale of LOCALES) {
    const rendered = formatRelativeTime(locale, observed, now);
    expect(rendered.trim()).not.toBe('');
    expect(rendered).not.toContain('{');
    expect(rendered).not.toContain('undefined');
    expect(rendered).not.toContain('NaN');
  }
});

test('formatRelativeTime distinguishes today from an older date for added locales', () => {
  const now = new Date(2026, 6, 15, 9, 0).getTime();
  const today = new Date(2026, 6, 15, 7, 0).getTime();
  const older = new Date(2026, 5, 12, 10, 0).getTime();
  for (const locale of LOCALES) {
    if (locale === 'ko' || locale === 'en') continue;
    expect(formatRelativeTime(locale, today, now)).not.toBe(formatRelativeTime(locale, older, now));
  }
});

test('formatHour returns a usable closing time for every locale', () => {
  for (const locale of LOCALES) {
    const rendered = formatHour(locale, 18, 0);
    expect(rendered.trim()).not.toBe('');
    expect(rendered).not.toContain('NaN');
    // 24h or 12h, the hour (18 or 6) must be readable.
    expect(/18|6/.test(rendered)).toBe(true);
  }
});

test('formatDistance rejects non-finite and negative inputs instead of printing a unit', () => {
  expect(formatDistance(Number.NaN)).toBe('');
  expect(formatDistance(Number.POSITIVE_INFINITY)).toBe('');
  expect(formatDistance(-1)).toBe('');
  expect(formatDistance(999)).toBe('999m');
  expect(formatDistance(1200)).toBe('1.2km');
});

test('formatRelativeTime degrades to the English line when the runtime lacks locale data', () => {
  const observed = new Date(2026, 6, 14, 18, 20).getTime();
  const now = new Date(2026, 6, 15, 9, 0).getTime();
  const spy = vi.spyOn(Intl, 'RelativeTimeFormat').mockImplementation(() => {
    throw new Error('missing locale data');
  });
  try {
    expect(formatRelativeTime('ja', observed, now)).toBe(formatRelativeTimeEn(observed, now));
  } finally {
    spy.mockRestore();
  }
});

test('formatHour falls back to a hand-written 12-hour clock when Intl throws', () => {
  const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
    throw new Error('missing locale data');
  });
  try {
    expect(formatHour('ja', 18, 5)).toBe('6:05 PM');
    expect(formatHour('ja', 0, 30)).toBe('12:30 AM');
    expect(formatHour('ja', 12, 0)).toBe('12:00 PM');
  } finally {
    spy.mockRestore();
  }
});
