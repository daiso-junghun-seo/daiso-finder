// src/ui/availability/CandidatesBody.tsx
import type { ProductCandidate } from '../../domain/types';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import { LiveRegion } from '../a11y/LiveRegion';
import { CandidateList } from '../components/CandidateList';

// Pre-answer literal candidates (search-first). A candidate list is not an AvailabilityAnswer, so
// AnswerCard never mounts here; rows show identity/price only, never availability (Interface AI-low).
export function CandidatesBody({
  candidates,
  locale,
  onSelect,
}: {
  candidates: ProductCandidate[];
  locale: Locale;
  onSelect: (candidate: ProductCandidate) => void;
}) {
  const S = strings(locale);
  return (
    <>
      <LiveRegion message={S.RESULTS_NOTICE} visuallyHidden />
      <CandidateList candidates={candidates} locale={locale} onSelect={onSelect} />
    </>
  );
}
