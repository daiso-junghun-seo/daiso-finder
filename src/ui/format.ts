// src/ui/format.ts — presentation-only formatting. Domain never formats; UI never fabricates values.
import type { StoreLocation } from '../domain/types';

export function formatPrice(price: number): string {
  return `${price.toLocaleString('ko-KR')}원`;
}

export function formatLocation(location: StoreLocation): string {
  return `${location.floor}층 ${location.zone}번`;
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

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
