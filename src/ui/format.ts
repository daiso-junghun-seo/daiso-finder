// src/ui/format.ts — presentation-only formatting. Domain never formats; UI never fabricates values.
import type { StoreLocation } from '../domain/types';

export function formatPrice(price: number): string {
  return `${price.toLocaleString('ko-KR')}원`;
}

export function formatLocation(location: StoreLocation): string {
  const floor = location.floor.startsWith('-')
    ? `지하 ${location.floor.slice(1)}층`
    : `${location.floor}층`;
  return `${floor} ${location.zone}번`;
}

// Upstream lchDay is 'YYYY-MM-DD'; the Bible copy ("{lchDay} 전후에 들어올 예정") wants "M월 D일"
// (daiso formatLchDay). App-owned presentation decision (open-questions §B).
export function formatLchDay(iso: string): string {
  const parts = iso.split('-');
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (parts.length !== 3 || Number.isNaN(month) || Number.isNaN(day)) return '';
  return `${month}월 ${day}일`;
}

// km→m for the D082 distance label (selStr km is a float). App-owned; surfaced only in the GPS-nearby
// pass (out of scope here) — util + test only.
export function kmToMeters(km: number): number {
  return Math.round(km * 1000);
}

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

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
