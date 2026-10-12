import { mockAnswers } from '../adapters/mock/fixtures';
import { defaultPolicy } from '../domain/policy';
import {
  DEFAULT_HEADLINE,
  ERROR_CACHED_BANNER,
  ERROR_NO_CACHE_BODY,
  LIVE_FRESHNESS_CAPTION,
  LOADING_CARD_COPY,
  LOADING_DELAY_LINE,
  PARTIAL_FRANCHISE_BODY,
  PARTIAL_FRANCHISE_CTA,
  PARTIAL_NO_LOCATION_CTA,
  PARTIAL_NO_LOCATION_NOTE,
  PARTIAL_STALE_CACHE_CTA,
  RETRY_BUTTON,
  SCAN_AIM_GUIDE,
  SCAN_AIM_GUIDE_TOKEN,
  SCAN_BUTTON_LABEL,
  SCAN_FAILED,
  SCAN_HINT,
  SCAN_PERMISSION_DENIED,
  SCAN_UNSUPPORTED,
  SEARCH_PLACEHOLDER,
  STORE_CHANGE_BUTTON,
  STORE_SELECT_CLOSE,
  STORE_SELECT_NEARBY_HEADER,
  STORE_SELECT_NO_LOCATION_NOTE,
  STORE_SELECT_SEARCH_PLACEHOLDER,
  STORE_SELECT_TITLE,
  SUCCESS_ENDED_BODY,
  SUCCESS_ENDED_CTA,
  SUCCESS_IN_STOCK_CTA,
  SUCCESS_IN_STOCK_STATUS,
  SUCCESS_NOT_CARRIED_BODY,
  SUCCESS_NOT_CARRIED_CTA,
  SUCCESS_OUT_BODY,
  SUCCESS_OUT_CTA,
  SUCCESS_OUT_SECONDARY_CTA,
  SUCCESS_RESTOCKING_CTA,
  announcementFor,
  cachedFreshnessCaption,
  emptyBody,
  extraPositionsLabel,
  factsFor,
  lowQtyCaption,
  nearbyStoreRowLabel,
  partialLocationMissingConfirmed,
  partialStaleCacheBody,
  priceLocationLine,
  restockBody,
  scanEmptyBody,
  splitAimGuide,
  storeLine,
} from './copy';

test('static copy constants reproduce the Bible final-copy table verbatim (Interface §4)', () => {
  expect(DEFAULT_HEADLINE).toBe('이 매장에 있는지 바로 확인해 보세요');
  expect(SEARCH_PLACEHOLDER).toBe('상품명 또는 바코드 스캔');
  expect(SCAN_BUTTON_LABEL).toBe('바코드 스캔');
  expect(STORE_CHANGE_BUTTON).toBe('매장 변경');
  expect(LOADING_CARD_COPY).toBe('이 매장 재고를 확인하고 있어요…');
  expect(LOADING_DELAY_LINE).toBe('연결이 느려서 확인이 조금 걸리고 있어요.');
  expect(ERROR_CACHED_BANNER).toBe(
    '지금 연결이 원활하지 않아요. 마지막으로 확인된 정보를 보여드릴게요.',
  );
  expect(ERROR_NO_CACHE_BODY).toBe(
    '지금 연결이 원활하지 않아요. 다시 시도하거나 매장 직원에게 문의해 주세요.',
  );
  expect(RETRY_BUTTON).toBe('다시 확인');
  expect(SUCCESS_IN_STOCK_STATUS).toBe('이 매장에 있어요');
  expect(SUCCESS_IN_STOCK_CTA).toBe('위치 보기');
  expect(LIVE_FRESHNESS_CAPTION).toBe('방금 확인한 재고예요');
  expect(SUCCESS_OUT_BODY).toBe('지금은 품절이에요. 근처 매장 재고와 비슷한 상품을 보여드릴게요.');
  expect(SUCCESS_OUT_CTA).toBe('대안 보기');
  expect(SUCCESS_OUT_SECONDARY_CTA).toBe('재입고 알림');
  expect(SUCCESS_ENDED_BODY).toBe('판매가 끝난 상품이에요. 비슷한 상품을 보여드릴게요.');
  expect(SUCCESS_ENDED_CTA).toBe('대안 보기');
  expect(SUCCESS_NOT_CARRIED_BODY).toBe(
    '이 매장에서는 팔지 않는 상품이에요. 근처 매장을 보여드릴게요.',
  );
  expect(SUCCESS_NOT_CARRIED_CTA).toBe('근처 매장 보기');
  expect(SUCCESS_RESTOCKING_CTA).toBe('재입고 알림');
  expect(PARTIAL_FRANCHISE_BODY).toBe(
    '상품은 취급하지만, 가맹점이라 재고를 확인할 수 없어요. 직원에게 문의해 주세요.',
  );
  expect(PARTIAL_FRANCHISE_CTA).toBe('근처 매장 보기');
  expect(PARTIAL_NO_LOCATION_CTA).toBe('다시 확인');
  expect(PARTIAL_NO_LOCATION_NOTE).toBe('위치 정보가 없어요. 직원에게 위치를 문의해 주세요.');
  expect(PARTIAL_STALE_CACHE_CTA).toBe('다시 확인');
});

test('storeLine prefixes the store name with 다이소 (Interface §4 example)', () => {
  expect(storeLine('명동역점')).toBe('다이소 명동역점');
});

test('emptyBody quotes the query verbatim inside the Bible sentence', () => {
  expect(emptyBody('락앤락같은통')).toBe(
    "'락앤락같은통'(으)로 등록된 상품을 찾지 못했어요. 바코드를 스캔하거나 다른 이름으로 검색해 보세요.",
  );
});

test('lowQtyCaption composes the upper-bound sentence (Interface §4 example: 3)', () => {
  expect(lowQtyCaption(3)).toBe('재고 3개 이하 · 방금 확인');
});

test('cachedFreshnessCaption appends the cache-age sentence', () => {
  expect(cachedFreshnessCaption('어제 오후 6시')).toBe('어제 오후 6시에 확인한 정보예요');
});

test('extraPositionsLabel parameterizes the count (B13; Bible example: 1)', () => {
  expect(extraPositionsLabel(1)).toBe('다른 위치 1곳 더 ▾');
  expect(extraPositionsLabel(2)).toBe('다른 위치 2곳 더 ▾');
});

test('restockBody composes the arriving-date sentence (Interface §4 example: 7월 15일)', () => {
  expect(restockBody('7월 15일')).toBe('7월 15일 전후에 들어올 예정이에요.');
});

test('restockBody states the date is undetermined instead of fabricating an empty-date sentence when lchDay is unknown', () => {
  expect(restockBody('')).toBe('재입고 예정이지만 입고일은 아직 미정이에요.');
});

test('partialLocationMissingConfirmed is the confirmed block only; the note is a separate Text-Secondary sentence, never joined by " / " (Interface §333, F5)', () => {
  expect(partialLocationMissingConfirmed(2000)).toBe('이 매장에 있어요 · 2,000원');
  // The literal slash from the Bible copy TABLE must never appear in rendered copy.
  expect(partialLocationMissingConfirmed(2000)).not.toContain('/');
  expect(PARTIAL_NO_LOCATION_NOTE).toBe('위치 정보가 없어요. 직원에게 위치를 문의해 주세요.');
});

test('partialStaleCacheBody composes the last-seen sentence (Interface §4 example: 어제 오후 6시)', () => {
  expect(partialStaleCacheBody('어제 오후 6시')).toBe(
    '이 매장에서 판매하는 상품이에요. 오늘 재고는 확인하지 못했어요 — 어제 오후 6시에는 있었어요.',
  );
});

test('factsFor maps each answer kind to its Bible status/CTA pair', () => {
  expect(factsFor(mockAnswers.inStock)).toEqual({
    status: SUCCESS_IN_STOCK_STATUS,
    cta: SUCCESS_IN_STOCK_CTA,
  });
  expect(factsFor(mockAnswers.temporarilyOut)).toEqual({
    status: SUCCESS_OUT_BODY,
    cta: SUCCESS_OUT_CTA,
    secondaryCta: SUCCESS_OUT_SECONDARY_CTA,
  });
  expect(factsFor(mockAnswers.discontinued)).toEqual({
    status: SUCCESS_ENDED_BODY,
    cta: SUCCESS_ENDED_CTA,
  });
  expect(factsFor(mockAnswers.notCarried)).toEqual({
    status: SUCCESS_NOT_CARRIED_BODY,
    cta: SUCCESS_NOT_CARRIED_CTA,
  });
  expect(factsFor(mockAnswers.restockArriving)).toEqual({
    status: restockBody('7월 15일'),
    cta: SUCCESS_RESTOCKING_CTA,
  });
});

test('priceLocationLine renders only for inStock answers that carry a location', () => {
  expect(priceLocationLine(mockAnswers.inStock)).toBe('2,000원 · 11층 56번');
  expect(priceLocationLine(mockAnswers.noLocation)).toBeUndefined();
  expect(priceLocationLine(mockAnswers.temporarilyOut)).toBeUndefined();
});

test('announcementFor orders a success announcement as status -> price/location -> freshness (no CTA: 위치 보기 removed as a dead stub, §B40)', () => {
  const ui = {
    state: 'success' as const,
    query: '밀폐용기',
    answer: mockAnswers.inStock,
    freshness: { class: 'live' as const, observedAt: 0 },
  };
  expect(announcementFor(ui, defaultPolicy, 0)).toEqual([
    SUCCESS_IN_STOCK_STATUS,
    '2,000원 · 11층 56번',
    LIVE_FRESHNESS_CAPTION,
  ]);
});

test('announcementFor swaps in the low-quantity caption when qtyUpperBound is at or under the policy cutoff', () => {
  const ui = {
    state: 'success' as const,
    query: '밀폐용기',
    answer: mockAnswers.inStockLowQty,
    freshness: { class: 'live' as const, observedAt: 0 },
  };
  expect(announcementFor(ui, defaultPolicy, 0)).toContain(lowQtyCaption(3));
});

test('announcementFor leads an error/cached announcement with the banner, then the cached facts, then retry', () => {
  const ui = {
    state: 'error' as const,
    variant: 'cached' as const,
    query: '밀폐용기',
    answer: mockAnswers.inStock,
    freshness: {
      class: 'cachedWithinThreshold' as const,
      observedAt: new Date(2026, 6, 14, 18, 0).getTime(),
    },
  };
  const nowMs = new Date(2026, 6, 15, 9, 0).getTime();
  expect(announcementFor(ui, defaultPolicy, nowMs)).toEqual([
    ERROR_CACHED_BANNER,
    SUCCESS_IN_STOCK_STATUS,
    '2,000원 · 11층 56번',
    cachedFreshnessCaption('어제 오후 6시'),
    RETRY_BUTTON,
  ]);
});

test('announcementFor emits the locationMissing partial as three entries — confirmed block, Text-Secondary note, CTA — never one joined string (a11y split, F5)', () => {
  const ui = {
    state: 'partial' as const,
    trigger: 'locationMissing' as const,
    query: '밀폐용기',
    answer: mockAnswers.noLocation,
    freshness: null,
  };
  expect(announcementFor(ui, defaultPolicy, 0)).toEqual([
    partialLocationMissingConfirmed(2000),
    PARTIAL_NO_LOCATION_NOTE,
    PARTIAL_NO_LOCATION_CTA,
  ]);
});

test('announcementFor renders the franchise-partial announcement as body then CTA', () => {
  const ui = {
    state: 'partial' as const,
    trigger: 'franchise' as const,
    query: '밀폐용기',
    answer: mockAnswers.franchise,
    freshness: null,
  };
  expect(announcementFor(ui, defaultPolicy, 0)).toEqual([
    PARTIAL_FRANCHISE_BODY,
    PARTIAL_FRANCHISE_CTA,
  ]);
});

test('store-selection copy reproduces the Bible Store select rows verbatim (Interface §4)', () => {
  expect(STORE_SELECT_TITLE).toBe('매장 선택');
  expect(STORE_SELECT_CLOSE).toBe('닫기');
  expect(STORE_SELECT_NEARBY_HEADER).toBe('가까운 매장');
  expect(STORE_SELECT_SEARCH_PLACEHOLDER).toBe('매장명 또는 지역명으로 검색');
  expect(STORE_SELECT_NO_LOCATION_NOTE).toBe(
    '위치를 사용할 수 없어요. 매장명이나 지역명으로 검색해 주세요.',
  );
});

test('nearbyStoreRowLabel parameterizes the Bible example row (명동역점 · 120m)', () => {
  expect(nearbyStoreRowLabel('명동역점', 120)).toBe('명동역점 · 120m');
});

test('scan copy drafts are transcribed exactly (app-owned, pending Bible ratification)', () => {
  expect(SCAN_AIM_GUIDE).toBe("'계산바코드' 표시 옆 사각형 코드를 네모에 꽉 채워 주세요.");
  expect(SCAN_PERMISSION_DENIED).toBe('카메라를 사용할 수 없어요. 상품명으로 검색해 보세요.');
  expect(SCAN_UNSUPPORTED).toBe(
    '이 브라우저에서는 바코드 스캔을 쓸 수 없어요. 상품명으로 검색해 보세요.',
  );
  expect(SCAN_FAILED).toBe('지금은 스캔할 수 없어요. 상품명으로 검색해 보세요.');
  expect(SCAN_HINT).toBe('바코드가 잘 안 읽히면 상품명으로 검색해 보세요.');
  expect(scanEmptyBody('19987')).toBe(
    "'19987' 바코드로 등록된 상품을 찾지 못했어요. 상품명으로 검색해 보세요.",
  );
});

// The panel emphasises the token in place, so the token must actually occur in the sentence.
test('the emphasised token is part of the aim guide sentence', () => {
  expect(SCAN_AIM_GUIDE).toContain(SCAN_AIM_GUIDE_TOKEN);
});

test('splitAimGuide returns the text before, the token, and the text after', () => {
  expect(splitAimGuide('ab TOKEN cd', 'TOKEN')).toEqual(['ab ', 'TOKEN', ' cd']);
});

// A split that cannot find its token must not swallow the instruction.
test('splitAimGuide returns null when the token is absent', () => {
  expect(splitAimGuide('no token here', 'TOKEN')).toBeNull();
});

test('every scan copy line ends with a concrete next step and blames nobody', () => {
  for (const line of [
    SCAN_PERMISSION_DENIED,
    SCAN_UNSUPPORTED,
    SCAN_FAILED,
    SCAN_HINT,
    scanEmptyBody('1'),
  ]) {
    expect(line).toContain('상품명으로 검색');
    expect(line).not.toContain('권한');
    expect(line).not.toContain('실패');
  }
});

test('a scan-origin empty announces the scan copy, not the typed copy', () => {
  const announced = announcementFor(
    { state: 'empty', query: '19987', suggestions: [], origin: 'scan' },
    defaultPolicy,
    0,
  );
  expect(announced).toEqual([scanEmptyBody('19987')]);
});
