import { mockAnswers } from '../adapters/mock/fixtures';
import { defaultPolicy } from '../domain/policy';
import { announcementFor as announcementForKo } from '../ui/copy';
import { formatRelativeTime } from '../ui/format';
import { announcementForEn } from './en';
import { LOCALES } from './locale';
import { announcementForLocale, loadLocaleTable, strings } from './strings';

// The ten non-ko/en tables are lazy chunks (§B52): this contract test needs all of them resident.
beforeAll(async () => {
  await Promise.all(LOCALES.map((locale) => loadLocaleTable(locale)));
});

// CopyTable is derived from en and enforced by `Record<Locale, CopyTable>` at compile time.
// This runtime test guards the same contract from the other side: key parity, no empty
// translations, no unfilled `{token}` leaking to a shopper's screen, and match tokens
// (D069) still readable inside every language.
//
// ko/en are module namespaces with shared, locale-free helpers on them (announcementFor*,
// priceLocationLine, splitAimGuide). Those are machinery, never mirrored text — excluded by
// name here, exactly as the code comment in strings.ts says.
const NON_TEXT_KEYS = new Set([
  'announcementFor',
  'announcementForEn',
  'priceLocationLine',
  'splitAimGuide',
]);

const textEntries = (locale: (typeof LOCALES)[number]) =>
  Object.entries(strings(locale)).filter((entry): entry is [string, string] => {
    return typeof entry[1] === 'string';
  });

test('every locale table exposes the full CopyTable key set', () => {
  const copyKeys = Object.keys(strings('en'))
    .filter((key) => !NON_TEXT_KEYS.has(key))
    .sort();
  for (const locale of LOCALES) {
    const keys = Object.keys(strings(locale))
      .filter((key) => !NON_TEXT_KEYS.has(key))
      .sort();
    expect({ locale, keys }).toEqual({ locale, keys: copyKeys });
  }
});

test('every translated constant is non-empty and carries no unfilled template token', () => {
  for (const locale of LOCALES) {
    for (const [key, value] of textEntries(locale)) {
      expect({ locale, key, empty: value.trim() === '' }).toEqual({
        locale,
        key,
        empty: false,
      });
      expect({ locale, key, hasToken: value.includes('{') }).toEqual({
        locale,
        key,
        hasToken: false,
      });
    }
  }
});

test('the scanner guide keeps the exact Korean print token in all 12 locales', () => {
  for (const locale of LOCALES) {
    expect(strings(locale).SCAN_AIM_GUIDE_TOKEN).toBe("'계산바코드'");
    expect(strings(locale).SCAN_AIM_GUIDE).toContain("'계산바코드'");
  }
});

test('match tokens (names, barcodes, digits) survive every language', () => {
  for (const locale of LOCALES) {
    const S = strings(locale);
    const won = locale === 'ko' ? '2,000원' : '₩2,000';
    expect(S.storeLine('명동역점')).toContain('명동역점');
    expect(S.emptyBody('밀폐용기')).toContain('밀폐용기');
    expect(S.scanEmptyBody('8801234567890')).toContain('8801234567890');
    expect(S.cartLinkLabel(2, 4000)).toContain('4,000');
    expect(S.cartTotalLabel(2000)).toContain(won);
    expect(S.cartCheckLabel('밀폐용기')).toContain('밀폐용기');
    expect(S.lowQtyCaption(3)).toContain('3');
    expect(S.cachedFreshnessCaption('10분 전')).toContain('10분 전');
    expect(S.restockBody('7월 15일')).toContain('7월 15일');
    expect(S.partialLocationMissingConfirmed(2000)).toContain(won);
    expect(S.partialStaleCacheBody('10분 전')).toContain('10분 전');
    expect(S.navigationRecoveryOther({ floor: '11', zone: '56' })).toContain('11');
    expect(S.navigationRecoveryOther({ floor: '-1', zone: '56' })).toContain('56');
    expect(S.navigationStaleBody('10분 전')).toContain('10분 전');
    expect(S.altStaleBody('10분 전')).toContain('10분 전');
    expect(S.altStoreCardHeading('명동역점', 1200)).toContain('명동역점');
    expect(S.altStoreCardHeading('명동역점', 1200)).toContain('1.2km');
    expect(S.altNearbyRowLabel('명동역점', 1200, '18:00', false)).toContain('명동역점');
    expect(S.altNearbyRowLabel('명동역점', 1200, '18:00', false)).toContain('1.2km');
    expect(S.altMapLinkLabel('서울 중구 명동길 1')).toContain('서울 중구 명동길 1');
  }
});

test('count-sensitive labels distinguish singular/plural shapes without empty strings', () => {
  for (const locale of LOCALES) {
    const S = strings(locale);
    const two = S.navigationMultiHeading(2);
    const four = S.navigationMultiHeading(4);
    expect(two.trim()).not.toBe('');
    expect(four.trim()).not.toBe('');
    expect(two).not.toBe(four);
    expect(S.extraPositionsLabel(1)).not.toBe('');
    expect(S.extraPositionsLabel(3)).not.toBe('');
    expect(S.cartOtherStoresLabel(2)).toContain('2');
    expect(S.cartImportDoneLabel(3)).toContain('3');
    expect(S.cartImportCrossStoreLabel(3)).toContain('3');
  }
});

test('Flow 3 row labels compose price, location and low-qty warnings per locale', () => {
  const row = {
    pdNo: '1',
    productName: '리빙 밀폐용기 1.2L',
    price: 2000,
    qtyUpperBound: 3,
    locations: [{ floor: '11', zone: '56' }],
  };
  for (const locale of LOCALES) {
    const label = strings(locale).altSimilarRowLabel(row, defaultPolicy);
    expect(label).toContain('리빙 밀폐용기 1.2L');
    expect(label).toContain('2,000');
    expect(label).toContain('11');
    expect(label).toContain('56');
    expect(label).toContain('3');
  }
});

test('closing-time labels accept vendor times, reject junk, and never leak to the row', () => {
  for (const locale of LOCALES) {
    const S = strings(locale);
    expect(S.altClosingLabel('18:00')).not.toBeNull();
    expect(S.altClosingLabel('09:05')).not.toBeNull();
    expect(S.altClosingLabel('noon')).toBeNull();
    expect(S.altClosingLabel('24:00')).toBeNull();
    // Closed-today must be visible and localised, not dropped.
    const closedRow = S.altNearbyRowLabel('명동역점', 1200, '18:00', true);
    expect(closedRow).toContain(S.ALT_STORE_CARD_CLOSED);
  }
});

test('altLoadingLine picks the issued slots in every locale', () => {
  for (const locale of LOCALES) {
    const S = strings(locale);
    expect(S.altLoadingLine({ similar: true, nearby: true })).toBe(S.ALT_LOADING_BOTH);
    expect(S.altLoadingLine({ similar: true, nearby: false })).toBe(S.ALT_LOADING_SIMILAR);
    expect(S.altLoadingLine({ similar: false, nearby: true })).toBe(S.ALT_LOADING_NEARBY);
  }
});

test('factsFor covers every answer kind in every locale', () => {
  for (const locale of LOCALES) {
    const S = strings(locale);
    const stocked = S.factsFor(mockAnswers.inStock);
    expect(stocked.status).toBe(S.SUCCESS_IN_STOCK_STATUS);
    expect(stocked.cta).toBe(S.SUCCESS_IN_STOCK_CTA);
    const out = S.factsFor(mockAnswers.temporarilyOut);
    expect(out.status).toBe(S.SUCCESS_OUT_BODY);
    expect(out.secondaryCta).toBe(S.SUCCESS_OUT_SECONDARY_CTA);
    expect(S.factsFor(mockAnswers.discontinued).cta).toBe(S.SUCCESS_ENDED_CTA);
    expect(S.factsFor(mockAnswers.notCarried).cta).toBe(S.SUCCESS_NOT_CARRIED_CTA);
    expect(S.factsFor(mockAnswers.restockArriving).status).toContain('7월 15일');
    expect(S.factsFor(mockAnswers.franchise).cta).toBe(S.PARTIAL_FRANCHISE_CTA);
    for (const answer of Object.values(mockAnswers)) {
      const facts = S.factsFor(answer);
      expect(facts.status.trim()).not.toBe('');
      expect(facts.cta.trim()).not.toBe('');
    }
  }
});

test('announcementForLocale keeps ko byte-identical to the Bible-verbatim path', () => {
  const now = new Date(2026, 6, 15, 9, 0).getTime();
  const observed = new Date(2026, 6, 14, 18, 0).getTime();
  const states = [
    {
      state: 'success' as const,
      query: 'q',
      answer: mockAnswers.inStock,
      freshness: { class: 'live' as const, observedAt: now },
    },
    {
      state: 'success' as const,
      query: 'q',
      answer: mockAnswers.inStockLowQty,
      freshness: { class: 'live' as const, observedAt: now },
    },
    { state: 'loading' as const, query: 'q', slow: true },
    { state: 'empty' as const, query: '밀폐용기', suggestions: [] },
    { state: 'error' as const, query: 'q', variant: 'noCache' as const },
    {
      state: 'error' as const,
      query: 'q',
      variant: 'cached' as const,
      answer: mockAnswers.inStock,
      freshness: { class: 'cachedBeyondThreshold' as const, observedAt: observed },
    },
    {
      state: 'partial' as const,
      query: 'q',
      trigger: 'franchise' as const,
      answer: mockAnswers.franchise,
      freshness: null,
    },
    {
      state: 'partial' as const,
      query: 'q',
      trigger: 'locationMissing' as const,
      answer: mockAnswers.noLocation,
      freshness: null,
    },
    {
      state: 'partial' as const,
      query: 'q',
      trigger: 'staleCache' as const,
      answer: mockAnswers.inStock,
      freshness: { class: 'cachedBeyondThreshold' as const, observedAt: observed },
    },
  ];
  for (const ui of states) {
    expect(announcementForLocale('ko', ui, defaultPolicy, now)).toEqual(
      announcementForKo(ui, defaultPolicy, now),
    );
  }
});

test('announcementForLocale keeps en byte-identical to announcementForEn', () => {
  const now = new Date(2026, 6, 15, 9, 0).getTime();
  const ui = {
    state: 'success' as const,
    query: 'container',
    answer: mockAnswers.inStock,
    freshness: { class: 'live' as const, observedAt: now },
  };
  expect(announcementForLocale('en', ui, defaultPolicy, now)).toEqual(
    announcementForEn(ui, defaultPolicy, now),
  );
});

test('every locale announces status, price/location, freshness and CTA in the same order', () => {
  const now = new Date(2026, 6, 15, 9, 0).getTime();
  for (const locale of LOCALES) {
    const S = strings(locale);
    const lines = announcementForLocale(
      locale,
      {
        state: 'success',
        query: 'q',
        answer: mockAnswers.inStock,
        freshness: { class: 'live', observedAt: now },
      },
      defaultPolicy,
      now,
    );
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(S.SUCCESS_IN_STOCK_STATUS);
    expect(lines[1]).toContain(locale === 'ko' ? '2,000원' : '₩2,000');
    expect(lines[1]).toContain('56');
    expect(lines[2]).toBe(S.LIVE_FRESHNESS_CAPTION);
    expect(lines[3]).toBe(S.SUCCESS_IN_STOCK_CTA);
  }
});

test('low-stock success announces the low-quantity caption instead of "just checked"', () => {
  const now = 0;
  for (const locale of LOCALES) {
    const lines = announcementForLocale(
      locale,
      {
        state: 'success',
        query: 'q',
        answer: mockAnswers.inStockLowQty,
        freshness: { class: 'live', observedAt: now },
      },
      defaultPolicy,
      now,
    );
    expect(lines[2]).toContain('3');
    expect(lines[2]).not.toBe(strings(locale).LIVE_FRESHNESS_CAPTION);
  }
});

test('loading, empty and error announcements are non-empty in every locale', () => {
  const now = new Date(2026, 6, 15, 9, 0).getTime();
  const observed = new Date(2026, 6, 14, 18, 0).getTime();
  for (const locale of LOCALES) {
    const loaded = announcementForLocale(
      locale,
      { state: 'loading', query: 'q', slow: true },
      defaultPolicy,
      now,
    );
    expect(loaded).toEqual([strings(locale).LOADING_CARD_COPY, strings(locale).LOADING_DELAY_LINE]);
    const searchEmpty = announcementForLocale(
      locale,
      { state: 'empty', query: '밀폐용기', suggestions: [] },
      defaultPolicy,
      now,
    );
    expect(searchEmpty[0]).toContain('밀폐용기');
    const scanEmpty = announcementForLocale(
      locale,
      { state: 'empty', query: '8801', suggestions: [], origin: 'scan' },
      defaultPolicy,
      now,
    );
    expect(scanEmpty[0]).toContain('8801');
    const noCache = announcementForLocale(
      locale,
      { state: 'error', query: 'q', variant: 'noCache' },
      defaultPolicy,
      now,
    );
    expect(noCache).toEqual([strings(locale).ERROR_NO_CACHE_BODY, strings(locale).RETRY_BUTTON]);
    const cached = announcementForLocale(
      locale,
      {
        state: 'error',
        query: 'q',
        variant: 'cached',
        answer: mockAnswers.inStock,
        freshness: { class: 'cachedBeyondThreshold', observedAt: observed },
      },
      defaultPolicy,
      now,
    );
    expect(cached[0]).toBe(strings(locale).ERROR_CACHED_BANNER);
    expect(cached).toContain(strings(locale).RETRY_BUTTON);
    expect(cached.some((line) => line.includes(locale === 'ko' ? '2,000원' : '₩2,000'))).toBe(true);
  }
});

test('partial announcements cover franchise, location-missing and stale cache', () => {
  const now = new Date(2026, 6, 15, 9, 0).getTime();
  const observed = new Date(2026, 6, 14, 18, 0).getTime();
  for (const locale of LOCALES) {
    const S = strings(locale);
    expect(
      announcementForLocale(
        locale,
        {
          state: 'partial',
          query: 'q',
          trigger: 'franchise',
          answer: mockAnswers.franchise,
          freshness: null,
        },
        defaultPolicy,
        now,
      ),
    ).toEqual([S.PARTIAL_FRANCHISE_BODY, S.PARTIAL_FRANCHISE_CTA]);
    const noLocation = announcementForLocale(
      locale,
      {
        state: 'partial',
        query: 'q',
        trigger: 'locationMissing',
        answer: mockAnswers.noLocation,
        freshness: null,
      },
      defaultPolicy,
      now,
    );
    expect(noLocation).toHaveLength(3);
    expect(noLocation[0]).toContain(locale === 'ko' ? '2,000원' : '₩2,000');
    const stale = announcementForLocale(
      locale,
      {
        state: 'partial',
        query: 'q',
        trigger: 'staleCache',
        answer: mockAnswers.inStock,
        freshness: { class: 'cachedBeyondThreshold', observedAt: observed },
      },
      defaultPolicy,
      now,
    );
    expect(stale).toHaveLength(2);
    expect(stale[0]).toContain(formatRelativeTime(locale, observed, now));
    expect(stale[1]).toBe(S.PARTIAL_STALE_CACHE_CTA);
  }
});

test('candidates announce nothing (AnswerCard never renders them)', () => {
  for (const locale of LOCALES) {
    expect(
      announcementForLocale(
        locale,
        { state: 'candidates', query: 'q', candidates: [] },
        defaultPolicy,
        0,
      ),
    ).toEqual([]);
  }
});
