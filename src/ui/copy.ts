// src/ui/copy.ts — Bible-verbatim copy (Interface/availability-check.md §4). Transcribe exactly; do not paraphrase.
import type { DataOwnerPolicy } from '../domain/policy';
import type { AvailabilityAnswer, UiState } from '../domain/types';
import { formatLocation, formatPrice, formatRelativeTimeKo } from './format';

export const DEFAULT_HEADLINE = '이 매장에 있는지 바로 확인해 보세요';
export const SEARCH_PLACEHOLDER = '상품명 또는 바코드 스캔';
export const SCAN_BUTTON_LABEL = '바코드 스캔';
export const STORE_CHANGE_BUTTON = '매장 변경';

export const LOADING_CARD_COPY = '이 매장 재고를 확인하고 있어요…';
export const LOADING_DELAY_LINE = '연결이 느려서 확인이 조금 걸리고 있어요.';

export const ERROR_CACHED_BANNER =
  '지금 연결이 원활하지 않아요. 마지막으로 확인된 정보를 보여드릴게요.';
export const ERROR_NO_CACHE_BODY =
  '지금 연결이 원활하지 않아요. 다시 시도하거나 매장 직원에게 문의해 주세요.';
export const RETRY_BUTTON = '다시 확인';

export const SUCCESS_IN_STOCK_STATUS = '이 매장에 있어요';
export const SUCCESS_IN_STOCK_CTA = '위치 보기';
export const LIVE_FRESHNESS_CAPTION = '방금 확인한 재고예요';

export const SUCCESS_OUT_BODY = '지금은 품절이에요. 근처 매장 재고와 비슷한 상품을 보여드릴게요.';
export const SUCCESS_OUT_CTA = '대안 보기';
export const SUCCESS_OUT_SECONDARY_CTA = '재입고 알림';

export const SUCCESS_ENDED_BODY = '판매가 끝난 상품이에요. 비슷한 상품을 보여드릴게요.';
export const SUCCESS_ENDED_CTA = '대안 보기';

export const SUCCESS_NOT_CARRIED_BODY =
  '이 매장에서는 팔지 않는 상품이에요. 근처 매장을 보여드릴게요.';
export const SUCCESS_NOT_CARRIED_CTA = '근처 매장 보기';

export const SUCCESS_RESTOCKING_CTA = '재입고 알림';

export const PARTIAL_FRANCHISE_BODY =
  '상품은 취급하지만, 가맹점이라 재고를 확인할 수 없어요. 직원에게 문의해 주세요.';
export const PARTIAL_FRANCHISE_CTA = '근처 매장 보기';
export const PARTIAL_NO_LOCATION_CTA = '다시 확인';
export const PARTIAL_STALE_CACHE_CTA = '다시 확인';

export const STORE_SELECT_TITLE = '매장 선택';
export const STORE_SELECT_CLOSE = '닫기';
export const STORE_SELECT_NEARBY_HEADER = '가까운 매장';
export const STORE_SELECT_SEARCH_PLACEHOLDER = '매장명 또는 지역명으로 검색';
export const STORE_SELECT_NO_LOCATION_NOTE =
  '위치를 사용할 수 없어요. 매장명이나 지역명으로 검색해 주세요.';

// Bible's literal example row is "명동역점 · 120m"; store name and distance are the mechanical
// parameters (same precedent as B13).
export function nearbyStoreRowLabel(strNm: string, distanceM: number): string {
  return `${strNm} · ${distanceM}m`;
}

export function storeLine(storeName: string): string {
  return `다이소 ${storeName}`;
}

export function emptyBody(query: string): string {
  return `'${query}'(으)로 등록된 상품을 찾지 못했어요. 바코드를 스캔하거나 다른 이름으로 검색해 보세요.`;
}

// The bound is presentation-gated on policy.lowQtyCutoff (types.ts comment) — never presented as an exact count.
export function lowQtyCaption(qtyUpperBound: number): string {
  return `재고 ${qtyUpperBound}개 이하 · 방금 확인`;
}

export function cachedFreshnessCaption(relativeTime: string): string {
  return `${relativeTime}에 확인한 정보예요`;
}

// Bible's literal example is "다른 위치 1곳 더 ▾"; count is the mechanical parameter (open-questions.md B13).
export function extraPositionsLabel(count: number): string {
  return `다른 위치 ${count}곳 더 ▾`;
}

export function restockBody(lchDay: string): string {
  return lchDay
    ? `${lchDay} 전후에 들어올 예정이에요.`
    : '재입고 예정이지만 입고일은 아직 미정이에요.';
}

// Interface §333 / Experience §160: the location-missing Partial is TWO honestly-separated blocks,
// not one sentence. The confirmed line (Text Primary) states what we know; the note (Text Secondary,
// PARTIAL_NO_LOCATION_NOTE) states what we do not. The Bible copy TABLE compacts them with a " / "
// cell separator — that slash is a table artifact, never rendered UX copy (F5). Separation is carried
// by text + layout (two blocks) and reinforced, never replaced, by the Primary/Secondary color roles (I6).
export function partialLocationMissingConfirmed(price: number): string {
  return `이 매장에 있어요 · ${formatPrice(price)}`;
}
export const PARTIAL_NO_LOCATION_NOTE = '위치 정보가 없어요. 직원에게 위치를 문의해 주세요.';

export function partialStaleCacheBody(relativeTime: string): string {
  return `이 매장에서 판매하는 상품이에요. 오늘 재고는 확인하지 못했어요 — ${relativeTime}에는 있었어요.`;
}

export interface AnswerFacts {
  status: string;
  cta: string;
  secondaryCta?: string;
}

// Shared between Success and Error(cached): both show the same declarative facts about the answer,
// differing only in the surrounding frame (celebratory vs "here is what we still know").
export function factsFor(answer: AvailabilityAnswer): AnswerFacts {
  switch (answer.kind) {
    case 'inStock':
      return { status: SUCCESS_IN_STOCK_STATUS, cta: SUCCESS_IN_STOCK_CTA };
    case 'temporarilyOut':
      return {
        status: SUCCESS_OUT_BODY,
        cta: SUCCESS_OUT_CTA,
        secondaryCta: answer.restockOfferable ? SUCCESS_OUT_SECONDARY_CTA : undefined,
      };
    case 'discontinued':
      return { status: SUCCESS_ENDED_BODY, cta: SUCCESS_ENDED_CTA };
    case 'notCarried':
      return { status: SUCCESS_NOT_CARRIED_BODY, cta: SUCCESS_NOT_CARRIED_CTA };
    case 'restockArriving':
      return { status: restockBody(answer.lchDay), cta: SUCCESS_RESTOCKING_CTA };
    case 'franchiseUndeterminable':
      // Unreachable via Success/Error-cached: the state machine routes this kind to Partial/franchise only.
      return { status: PARTIAL_FRANCHISE_BODY, cta: PARTIAL_FRANCHISE_CTA };
  }
}

export function priceLocationLine(answer: AvailabilityAnswer): string | undefined {
  if (answer.kind !== 'inStock') return undefined;
  const primary = answer.locations[0];
  if (!primary) return undefined;
  return `${formatPrice(answer.price)} · ${formatLocation(primary)}`;
}

type NonDefaultUiState = Exclude<UiState, { state: 'default' }>;

// Ordered per Interface §6: status line first, then price·location, then the freshness stamp, then the CTA.
export function announcementFor(
  ui: NonDefaultUiState,
  policy: DataOwnerPolicy,
  nowMs: number,
): string[] {
  switch (ui.state) {
    case 'loading':
      return ui.slow ? [LOADING_CARD_COPY, LOADING_DELAY_LINE] : [LOADING_CARD_COPY];
    case 'empty':
      return [ui.origin === 'scan' ? scanEmptyBody(ui.query) : emptyBody(ui.query)];
    case 'candidates':
      // Unreachable: AnswerCard never renders candidates (pre-answer, surfaced elsewhere by a later
      // task), so no announcement copy is needed here. Present only to keep this switch exhaustive.
      return [];
    case 'error': {
      if (ui.variant === 'noCache') return [ERROR_NO_CACHE_BODY, RETRY_BUTTON];
      const facts = factsFor(ui.answer);
      const line = priceLocationLine(ui.answer);
      const relative = cachedFreshnessCaption(formatRelativeTimeKo(ui.freshness.observedAt, nowMs));
      return [ERROR_CACHED_BANNER, facts.status, ...(line ? [line] : []), relative, RETRY_BUTTON];
    }
    case 'success': {
      const { answer } = ui;
      const facts = factsFor(answer);
      const line = priceLocationLine(answer);
      const freshnessCap =
        answer.kind === 'inStock' && answer.qtyUpperBound <= policy.lowQtyCutoff
          ? lowQtyCaption(answer.qtyUpperBound)
          : LIVE_FRESHNESS_CAPTION;
      return [facts.status, ...(line ? [line] : []), freshnessCap, facts.cta];
    }
    case 'partial': {
      if (ui.trigger === 'franchise') return [PARTIAL_FRANCHISE_BODY, PARTIAL_FRANCHISE_CTA];
      if (ui.trigger === 'locationMissing') {
        if (ui.answer.kind !== 'inStock') return []; // unreachable: state machine only routes inStock here
        return [
          partialLocationMissingConfirmed(ui.answer.price),
          PARTIAL_NO_LOCATION_NOTE,
          PARTIAL_NO_LOCATION_CTA,
        ];
      }
      const relative = ui.freshness ? formatRelativeTimeKo(ui.freshness.observedAt, nowMs) : '';
      return [partialStaleCacheBody(relative), PARTIAL_STALE_CACHE_CTA];
    }
  }
}

// Interface §2 mockup + Typography mapping: the Caption label above the Default-state L2
// recent-searches list.
export const RECENT_SEARCHES_LABEL = '최근 검색';

// Interface §copy-table (AI low / literal results notice). This fallback-first feature has no AI
// confidence model, so the literal-results framing (not the "이걸 찾으시나요?" AI-suggestion tier) applies.
export const RESULTS_NOTICE = '검색 결과예요. 바코드를 스캔하면 더 정확해요.';

// ── Barcode scan (spec 2026-07-25-barcode-scan-design §6) ────────────────────────────────────────
// APP-OWNED DRAFTS, PENDING BIBLE RATIFICATION. The Bible defines the scan BUTTON and the typed Empty
// but is silent on every scan failure state (permission, decode, unsupported) and on the Empty a
// scan produces — its typed Empty tells the shopper to scan, which contradicts itself after a scan.
// Drafted to the Korean UX rules: result language only (no 권한이 없습니다-style blame, no technical
// terms), and every line ends with a concrete next step (Anti-goal 5). Replace verbatim on ratification.
// Shown from the moment the viewfinder opens. The previous wording ("상품의 정사각형 코드를 화면 안에
// 맞춰 주세요.") had no frame on screen to fit anything into until Task 2 added one, and named only the
// SHAPE — the expectation, not an observed fact, is that this left the shopper guessing which part of
// the printed strip to aim at. '계산바코드' is the label printed on the package (owner statement,
// 2026-07-28) — a token the shopper matches against the physical world, so D069 keeps it exactly as the
// world renders it. "꽉 채워" is meant to draw the phone closer to the code; whether that is what
// actually makes it decodable is the hypothesis Task 1's decodeMs measurement exists to test, not a
// confirmed fact. The symbology name stays out — a technical term the Korean UX rules forbid.
export const SCAN_AIM_GUIDE = "'계산바코드' 표시 옆 사각형 코드를 네모에 꽉 채워 주세요.";
// Emphasised in place by the viewfinder so the shopper can find the label at a glance.
export const SCAN_AIM_GUIDE_TOKEN = "'계산바코드'";

/** Split a sentence around a token so the token can be emphasised without duplicating the sentence. */
export function splitAimGuide(sentence: string, token: string): [string, string, string] | null {
  const at = sentence.indexOf(token);
  if (at === -1) return null;
  return [sentence.slice(0, at), token, sentence.slice(at + token.length)];
}
export const SCAN_PERMISSION_DENIED = '카메라를 사용할 수 없어요. 상품명으로 검색해 보세요.';
export const SCAN_UNSUPPORTED =
  '이 브라우저에서는 바코드 스캔을 쓸 수 없어요. 상품명으로 검색해 보세요.';
// `failed` covers BOTH a decoder error and a camera we could not acquire (busy device, no camera,
// unknown getUserMedia rejection), so this line must not claim the barcode was read and rejected —
// that would be a fabricated diagnosis in the acquisition case. '지금은' also keeps it transient:
// every one of those causes may well work on the next try.
export const SCAN_FAILED = '지금은 스캔할 수 없어요. 상품명으로 검색해 보세요.';
// Shown while the camera STAYS OPEN after a slow decode (Bible Engineering §5: decode failure keeps
// the camera open and hints) — never a dead end, never an error frame.
export const SCAN_HINT = '바코드가 잘 안 읽히면 상품명으로 검색해 보세요.';

export function scanEmptyBody(value: string): string {
  return `'${value}' 바코드로 등록된 상품을 찾지 못했어요. 상품명으로 검색해 보세요.`;
}
