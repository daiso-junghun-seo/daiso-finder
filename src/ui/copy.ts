// src/ui/copy.ts — Bible-verbatim copy (Interface/availability-check.md §4). Transcribe exactly; do not paraphrase.
import type { DataOwnerPolicy } from '../domain/policy';
import type {
  AvailabilityAnswer,
  SimilarAlternative,
  StoreLocation,
  UiState,
} from '../domain/types';
import { announcementForEn, factsFor as factsForEn } from '../i18n/en';
import type { Locale } from '../i18n/locale';
import { formatDistance, formatLocation, formatPrice, formatRelativeTimeKo } from './format';

export const DEFAULT_HEADLINE = '이 매장에 있는지 바로 확인해 보세요';
// App-owned helper (not a Bible table line — draft pending ratification like the scan
// drafts): one orienting sentence under the headline. Mirrored in i18n/en.ts.
export const DEFAULT_SUBHEAD = '바코드를 스캔하거나 상품명을 입력해 보세요';
export const SEARCH_PLACEHOLDER = '상품명 또는 바코드 스캔';
export const SCAN_BUTTON_LABEL = '바코드 스캔';
export const STORE_CHANGE_BUTTON = '매장 변경';
export const SEARCH_INPUT_LABEL = '상품 검색';
// App-owned (not Bible): label for the segmented locale control. Mirrored in i18n/en.ts.
export const LOCALE_GROUP_LABEL = '표시 언어';

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
// locale defaults to ko so every existing caller keeps the verbatim path; 'en' delegates to
// the English twin (same structure, translated pieces — i18n/en.ts).
export function factsFor(answer: AvailabilityAnswer, locale: Locale = 'ko'): AnswerFacts {
  if (locale === 'en') return factsForEn(answer);
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

export function priceLocationLine(
  answer: AvailabilityAnswer,
  locale: Locale = 'ko',
): string | undefined {
  if (answer.kind !== 'inStock') return undefined;
  const primary = answer.locations[0];
  if (!primary) return undefined;
  return `${formatPrice(answer.price, locale)} · ${formatLocation(primary, locale)}`;
}

type NonDefaultUiState = Exclude<UiState, { state: 'default' }>;

// Ordered per Interface §6: status line first, then price·location, then the freshness stamp, then the CTA.
// locale defaults to ko (verbatim path untouched); 'en' delegates to the twin.
export function announcementFor(
  ui: NonDefaultUiState,
  policy: DataOwnerPolicy,
  nowMs: number,
  locale: Locale = 'ko',
): string[] {
  if (locale === 'en') return announcementForEn(ui, policy, nowMs);
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
      // Flow 2 restored 위치 보기 as a wired control, so its CTA is announced again (§B40).
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

// Owner-exception §B47 (explicit): the Bible L-table has no recently-viewed slot —
// app draft pending Bible ratification, same path as the scan drafts below.
export const RECENT_VIEWS_LABEL = '최근 본 상품';

// ── Shopping list (owner-exception §B47, explicit) ───────────────────────────────────────────
// App drafts pending Bible ratification. `담을 수량` is always the shopper's intended count,
// never a stock count — the label carries that distinction, not just the number.
export const ADD_TO_CART_BUTTON = '담기';
export const CART_ADDED_NOTICE = '장바구니에 담았어요';
export const CART_TITLE = '장바구니';
export const CART_EMPTY_NOTE = '아직 담은 상품이 없어요. 답 카드에서 담기를 눌러 보세요.';
export const CART_SNAPSHOT_NOTE = '담을 당시 정보예요. 오늘 재고는 다시 확인해 주세요.';
export const CART_CLOSE = '닫기';
export const CART_QTY_DECREASE = '수량 줄이기';
export const CART_QTY_INCREASE = '수량 늘리기';
export const CART_REMOVE_BUTTON = '삭제';
export function cartLinkLabel(count: number, total: number): string {
  return `장바구니 ${count}개 · ${formatPrice(total)}`;
}
export function cartTotalLabel(total: number): string {
  return `합계 ${formatPrice(total)}`;
}
export function cartQtyText(qty: number): string {
  return `${qty}개`;
}
export function cartCheckLabel(name: string): string {
  return `${name} 합계에 포함`;
}
export function cartOtherStoresLabel(count: number): string {
  return `다른 매장 리스트 ${count}곳`;
}
export const CART_SHARE_BUTTON = '공유하기';
export const CART_EXPORT_BUTTON = '내보내기';
export const CART_IMPORT_BUTTON = '가져오기';
export const CART_IMPORT_LABEL = '가져올 내용 붙여넣기';
export const CART_IMPORT_CONFIRM = '불러오기';
export const CART_COPIED = '복사했어요';
export const CART_COPY_FAILED = '복사하지 못했어요. 아래 텍스트를 직접 선택해 주세요.';
export const CART_SHARE_TEXT_LABEL = '공유할 내용';
export const CART_EXPORT_TEXT_LABEL = '내보낸 내용';
export const CART_IMPORT_FAILED = '가져오지 못했어요. 복사한 내용이 맞는지 확인해 주세요.';
export const CART_UNCHECKED_MARK = '(합계 제외)';
export function cartImportDoneLabel(count: number): string {
  return `${count}개 상품을 불러왔어요`;
}
export function cartImportCrossStoreLabel(count: number): string {
  return `${count}개 상품을 불러왔어요. 다른 매장에서 담은 위치는 표시하지 않아요.`;
}

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
// actually makes it decodable is a hypothesis, not a confirmed fact — `ScannerDiagnostics.decodeMs`
// (docs/notes/open-questions.md §B30-11) exists to test it. The symbology name stays out — a technical
// term the Korean UX rules forbid.
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

// ── Flow 2 In-Store Navigation (Interface/in-store-navigation.md §4) ─────────────────────────
// The copy table is final. The only app-owned additions are the two a11y labels (visible copy
// does not change), the N>2 multi heading fallback, and the minute-to-hour caption boundary —
// drafted in both languages and flagged for Bible ratification like §B30-4/§B47.
export const NAV_BACK_LABEL = '뒤로';
export const NAV_LOCATION_LABEL = '위치';
export const NAV_MISSING_LINK = '못 찾겠어요';
export const NAV_PHOTO_MISSING_NOTE = '상품 사진이 없어요. 이름과 가격으로 확인해 주세요.';
export const NAV_RECOVERY_STILL_BODY =
  '재고는 아직 있다고 나오는데, 선반에 없다면 직원에게 문의해 주세요.';
export const NAV_SOLD_OUT_BODY = '방금 다시 확인해 보니 품절됐어요.';

// The two-position case is Bible-verbatim; N>2 has no defined copy, so the count is the
// mechanical parameter (same class as extraPositionsLabel, §B13).
export function navigationMultiHeading(count: number): string {
  return count === 2 ? '두 곳에 있어요' : `${count}곳에 있어요`;
}

export function navigationRecoveryOther(location: StoreLocation): string {
  return `${formatLocation(location, 'ko')}에도 있어요.`;
}

export function navigationStaleBody(relativeTime: string): string {
  return `오늘 재고는 확인하지 못했어요 — ${relativeTime}에는 있었어요.`;
}

// The Bible fixes "방금 확인한 재고예요" and the example "3분 전에 확인한 재고예요", not the
// boundary algorithm (§B12 precedent). Under an hour reads in minutes; older observations fall
// back to the same calendar clock Flow 1 already uses.
export function navigationFreshnessCaption(observedAtMs: number, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - observedAtMs) / 60_000));
  if (minutes < 1) return '방금 확인한 재고예요';
  if (minutes < 60) return `${minutes}분 전에 확인한 재고예요`;
  return `${formatRelativeTimeKo(observedAtMs, nowMs)}에 확인한 재고예요`;
}

// ── Flow 3 Alternative Discovery (Interface/alternative-discovery.md §4) ────────────────────────
// Bible-verbatim lines are transcribed exactly. APP-OWNED DRAFTS pending Bible ratification, marked
// individually, cover the states the Interface does not define: single-slot loading and Group A
// failure. Recorded in docs/notes/open-questions.md §B50.
export const ALT_BACK_LABEL = '뒤로';
export const ALT_REASON_TEMPORARILY_OUT = '지금은 품절이에요';
export const ALT_REASON_DISCONTINUED = '판매가 끝난 상품이에요';
export const ALT_REASON_NOT_CARRIED = '이 매장에서는 팔지 않는 상품이에요';
export const ALT_REASON_FRANCHISE = '가맹점이라 재고를 확인할 수 없어요';
export const ALT_REASON_FLOW2 = '선반에서 찾지 못했어요';

export const ALT_SIMILAR_HEADING = '이 매장에 있는 비슷한 상품';
export const ALT_NEARBY_HEADING = '이 상품이 있는 근처 매장';

export const ALT_LOADING_BOTH = '비슷한 상품과 근처 매장 재고를 확인하고 있어요…';
// App-owned drafts: the Bible's progress line names both branches, and production withholds Group B.
// Saying "nearby store stock" while not querying it would be the same false promise the CTA gating
// avoids (§B50-2).
export const ALT_LOADING_SIMILAR = '비슷한 상품을 확인하고 있어요…';
export const ALT_LOADING_NEARBY = '근처 매장 재고를 확인하고 있어요…';

export const ALT_SIMILAR_EMPTY = '이 매장에는 비슷한 상품이 없어요.';
export const ALT_NEARBY_EMPTY = '근처 매장에는 재고가 없어요.';
// App-owned draft: the Interface defines Group B's failure sentence but not Group A's (§B50-7).
export const ALT_SIMILAR_FAILED = '비슷한 상품은 확인하지 못했어요. 다시 시도해 주세요.';
export const ALT_NEARBY_FAILED = '근처 매장 재고는 확인하지 못했어요. 다시 시도해 주세요.';
export const ALT_SLOT_RETRY = '다시 시도';

export const ALT_EMPTY_BOTH = '이 매장과 근처 매장 모두에서 찾지 못했어요.';
export const ALT_EMPTY_MALL = '다이소몰에서 주문할 수 있어요.';
export const ALT_EMPTY_RESEARCH = '다른 이름으로 다시 검색해 보세요.';
export const ALT_EMPTY_STAFF = '직원에게 문의해 주세요.';

export const ALT_ERROR_BODY = '대안을 불러오지 못했어요.';
export const ALT_ERROR_RETRY = '다시 시도';
export const ALT_ERROR_STAFF = '직원에게 문의해 주세요.';

export const ALT_STORE_CARD_IN_STOCK = '재고 있어요';
export const ALT_STORE_CARD_CLOSED = '오늘은 휴무예요';

export function altLoadingLine(issued: { similar: boolean; nearby: boolean }): string {
  if (issued.similar && issued.nearby) return ALT_LOADING_BOTH;
  return issued.similar ? ALT_LOADING_SIMILAR : ALT_LOADING_NEARBY;
}

export function altStaleBody(relativeTime: string): string {
  return `오늘 재고는 확인하지 못했어요 — ${relativeTime} 기준이에요.`;
}

export function altSimilarRowLabel(row: SimilarAlternative, policy: DataOwnerPolicy): string {
  const location = row.locations[0];
  const base = `${row.productName} · ${formatPrice(row.price)}${location ? ` · ${formatLocation(location)}` : ''}`;
  return row.qtyUpperBound <= policy.lowQtyCutoff
    ? `${base} · ${lowQtyCaption(row.qtyUpperBound)}`
    : base;
}

export function altNearbyRowLabel(
  strNm: string,
  distanceM: number,
  closingTime: string,
  closedToday: boolean,
): string {
  const hours = closedToday ? ALT_STORE_CARD_CLOSED : altClosingLabel(closingTime);
  return hours
    ? `${strNm} · ${formatDistance(distanceM)} · ${hours} · ${ALT_STORE_CARD_IN_STOCK}`
    : `${strNm} · ${formatDistance(distanceM)} · ${ALT_STORE_CARD_IN_STOCK}`;
}

export function altStoreCardHeading(strNm: string, distanceM: number): string {
  return `${strNm}에 있어요 · ${formatDistance(distanceM)}`;
}

// "22:00" → "오후 10시까지 영업"; an unparseable vendor value yields null rather than an invented hour.
export function altClosingLabel(closingTime: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(closingTime.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  const period = hour < 12 ? '오전' : '오후';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${hour12}시까지 영업`;
}

export function altMapLinkLabel(address: string): string {
  return `${address} — 지도 앱에서 열기`;
}
