// src/ui/format.ts — presentation-only formatting. Domain never formats; UI never fabricates values.
import type { StoreLocation } from '../domain/types';
import type { Locale } from '../i18n/locale';

// Prices render per locale, digits identical (comma-grouped everywhere) so the number stays
// matchable against the shelf tag in any language: ko `2,000원`, all others `₩2,000`.
export function formatPrice(price: number, locale: Locale = 'ko'): string {
  return locale === 'ko'
    ? `${price.toLocaleString('ko-KR')}원`
    : `₩${price.toLocaleString('en-US')}`;
}

export function formatLocation(location: StoreLocation, locale: Locale = 'ko'): string {
  if (locale !== 'ko') {
    // Digits stay identical (the matchable part — D069); only the grammar words move:
    // `11층 56번` → `11F · No. 56`, `지하 1층 56번` → `B1 · No. 56`. The Latin floor grammar
    // is shared by every non-ko locale (recorded risk §B46/§B52): if store signage turns out
    // Korean-only, translated grammar misdirects — revert on evidence.
    const floor = location.floor.startsWith('-')
      ? `B${location.floor.slice(1)}`
      : `${location.floor}F`;
    return `${floor} · No. ${location.zone}`;
  }
  const floor = location.floor.startsWith('-')
    ? `지하 ${location.floor.slice(1)}층`
    : `${location.floor}층`;
  return `${floor} ${location.zone}번`;
}

// Flow 3 distance. The Bible fixes the km example ("1.2km") and leaves sub-kilometre display to
// the app (§B50 drafts): km >= 1 → one decimal, below that → integer metres. Digits are the
// matchable part, so the unit wording is identical in both guidance languages.
export function formatDistance(distanceM: number): string {
  if (!Number.isFinite(distanceM) || distanceM < 0) return '';
  if (distanceM >= 1000) return `${(distanceM / 1000).toFixed(1)}km`;
  return `${Math.round(distanceM)}m`;
}

// Upstream lchDay is 'YYYY-MM-DD'; the Bible copy ("{lchDay} 전후에 들어올 예정") wants "M월 D일"
// (daiso formatLchDay). The conversion lives in domain/ so adapters never import ui/ — re-exported
// here because this is where presentation callers (and the original tests) expect it.
export { formatLchDay } from '../domain/lch-day';

// Korean relative-time for the freshness caption (Interface §4 example: "어제 오후 6시").
// App-level formatting decision — Bible gives only the example string, not the algorithm (open-questions.md B12).
// Same calendar day -> "오늘"; previous calendar day -> "어제"; older -> absolute "M월 D일". Minutes are
// truncated (the Bible example never shows minutes).
export function formatRelativeTimeKo(observedAtMs: number, nowMs: number): string {
  const observed = new Date(observedAtMs);
  const now = new Date(nowMs);
  const dayDiff = Math.floor(
    (startOfDay(now).getTime() - startOfDay(observed).getTime()) / 86_400_000,
  );
  const dayLabel =
    dayDiff === 0
      ? '오늘'
      : dayDiff === 1
        ? '어제'
        : `${observed.getMonth() + 1}월 ${observed.getDate()}일`;
  const hour = observed.getHours();
  const period = hour < 12 ? '오전' : '오후';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${dayLabel} ${period} ${hour12}시`;
}

// English relative-time, mirroring formatRelativeTimeKo's rules: same calendar day ->
// "Today", previous -> "Yesterday", older -> absolute "Mon D"; hours as h AM/PM with
// minutes truncated (same truncation the ko rule documents).
const EN_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function formatRelativeTimeEn(observedAtMs: number, nowMs: number): string {
  const observed = new Date(observedAtMs);
  const now = new Date(nowMs);
  const dayDiff = Math.floor(
    (startOfDay(now).getTime() - startOfDay(observed).getTime()) / 86_400_000,
  );
  const dayLabel =
    dayDiff === 0
      ? 'Today'
      : dayDiff === 1
        ? 'Yesterday'
        : `${EN_MONTHS[observed.getMonth()]} ${observed.getDate()}`;
  const hour = observed.getHours();
  const period = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${dayLabel}, ${hour12} ${period}`;
}

// Locale-generic relative time for the ten added languages. ko/en keep their own functions
// above (byte-identical output, so existing contracts and tests do not move). today/yesterday
// come from Intl.RelativeTimeFormat (numeric:'auto' → "today" / "hier" / "今日"); older dates
// use an absolute month/day. Time uses Intl's own hour cycle rather than a hand-written 12h
// rule, because ja/th/ru do not share English AM/PM. If a runtime lacks the locale data,
// degrading to the English line beats throwing inside the answer card.
export function formatRelativeTime(locale: Locale, observedAtMs: number, nowMs: number): string {
  if (locale === 'ko') return formatRelativeTimeKo(observedAtMs, nowMs);
  if (locale === 'en') return formatRelativeTimeEn(observedAtMs, nowMs);
  const observed = new Date(observedAtMs);
  const now = new Date(nowMs);
  const dayDiff = Math.floor(
    (startOfDay(now).getTime() - startOfDay(observed).getTime()) / 86_400_000,
  );
  try {
    const dayLabel =
      dayDiff <= 1
        ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-dayDiff, 'day')
        : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(observed);
    const time = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).format(observed);
    return `${dayLabel} ${time}`;
  } catch {
    return formatRelativeTimeEn(observedAtMs, nowMs);
  }
}

// Closing time for Flow 3 cards ("Open until 6 PM" / "18時" / "18:00"). Only the added
// locales take this path; en keeps its own AM/PM formatter in i18n/en.ts.
export function formatHour(locale: Locale, hour24: number, minute: number): string {
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
      new Date(2000, 0, 1, hour24, minute),
    );
  } catch {
    const period = hour24 < 12 ? 'AM' : 'PM';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
