import { mockAnswers } from '../adapters/mock/fixtures';
import { defaultPolicy } from '../domain/policy';
import { announcementFor as announcementForKo } from '../ui/copy';
import { announcementForEn } from './en';
import { STR } from './strings';

// The table contract: every text-bearing ko export has an English twin and vice versa.
// A new copy string added to one side without the other fails here, not on a phone.
// Locale-free logic (priceLocationLine, splitAimGuide) and the two announcement entry
// points (ko announcementFor, en announcementForEn) are shared machinery, never mirrored
// text — excluded by name, explicitly.
const NON_TEXT_KEYS = new Set([
  'priceLocationLine',
  'splitAimGuide',
  'announcementFor',
  'announcementForEn',
]);
test('ko and en tables expose identical key sets', () => {
  const keys = (t: object) =>
    Object.keys(t)
      .filter((k) => !NON_TEXT_KEYS.has(k))
      .sort();
  expect(keys(STR.en)).toEqual(keys(STR.ko));
});

test('English facts mirror the ko structure per answer kind', () => {
  expect(STR.en.factsFor(mockAnswers.inStock)).toEqual({
    status: STR.en.SUCCESS_IN_STOCK_STATUS,
    cta: STR.en.SUCCESS_IN_STOCK_CTA,
  });
  expect(STR.en.factsFor(mockAnswers.temporarilyOut).status).toBe(STR.en.SUCCESS_OUT_BODY);
  // Match tokens stay Korean inside English guidance (D069).
  expect(STR.en.storeLine('명동역점')).toBe('DAISO 명동역점');
  expect(STR.en.emptyBody('밀폐용기')).toContain('밀폐용기');
  expect(STR.en.SCAN_AIM_GUIDE_TOKEN).toBe(STR.ko.SCAN_AIM_GUIDE_TOKEN);
});

test('English announcements order like ko and include the restored inStock CTA', () => {
  const ui = {
    state: 'success' as const,
    query: 'container',
    answer: mockAnswers.inStock,
    freshness: { class: 'live' as const, observedAt: 0 },
  };
  const en = announcementForEn(ui, defaultPolicy, 0);
  const ko = announcementForKo(ui, defaultPolicy, 0);
  expect(en).toHaveLength(ko.length);
  expect(en).toContain(STR.en.SUCCESS_IN_STOCK_CTA);
  expect(STR.en.RETRY_BUTTON).toBe('Retry');
  // EN price line: translated unit, identical digits, English floor/zone grammar (D069:
  // digits match, signage risk recorded in §B46).
  expect(en).toContain('₩2,000 · 11F · No. 56');
});

test('English Flow 2 copy mirrors ko guidance and translates grammar only', () => {
  expect(STR.en.NAV_BACK_LABEL).toBe('Back');
  expect(STR.en.navigationMultiHeading(2)).toBe('It is in two places');
  expect(STR.en.navigationRecoveryOther({ floor: '11', zone: '56' })).toBe(
    'It is also at 11F · No. 56.',
  );
  const now = new Date(2026, 6, 15, 9, 0).getTime();
  expect(STR.en.navigationFreshnessCaption(now - 3 * 60_000, now)).toBe('Checked 3 min ago');
  // Match tokens stay Korean (D069).
  expect(STR.en.navigationRecoveryOther({ floor: '-1', zone: '3' })).toBe(
    'It is also at B1 · No. 3.',
  );
});
