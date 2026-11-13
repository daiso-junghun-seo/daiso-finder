import type { AlternativeReason } from '../../domain/types';
import { STR } from '../../i18n/strings';
import { altReasonLabel } from './alternative-labels';

const REASONS: AlternativeReason[] = [
  'temporarilyOut',
  'discontinued',
  'notCarried',
  'franchise',
  'flow2',
];

// The label is shared by the lazy surface and its Suspense stand-in, so this pins the mapping the
// two render paths must never disagree on.
test('every entry reason has its own "why we are here" line in both locales', () => {
  for (const locale of ['ko', 'en'] as const) {
    const labels = REASONS.map((reason) => altReasonLabel(reason, STR[locale]));
    expect(new Set(labels).size).toBe(REASONS.length);
    expect(labels.every((label) => label.length > 0)).toBe(true);
  }
  expect(altReasonLabel('flow2', STR.ko)).toBe(STR.ko.ALT_REASON_FLOW2);
});
