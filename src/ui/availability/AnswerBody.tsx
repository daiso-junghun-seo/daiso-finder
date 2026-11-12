// src/ui/availability/AnswerBody.tsx
import type { Ref } from 'react';
import { defaultPolicy } from '../../domain/policy';
import type { UiState } from '../../domain/types';
import type { Locale } from '../../i18n/locale';
import { AnswerCard } from '../AnswerCard';
import { LiveRegion } from '../a11y/LiveRegion';

// Every state except the two pre-answer surfaces (Default and the candidate list).
type AnswerUiState = Exclude<UiState, { state: 'default' } | { state: 'candidates' }>;

// The answer surface: one live-region announcement for assistive tech plus the single AnswerCard.
export function AnswerBody({
  ui,
  announcement,
  locale,
  nowMs,
  cardRef,
  onScan,
  onAdd,
  onRetry,
  onNavigate,
  navigateButtonRef,
  onSeeAlternatives,
  alternativesButtonRef,
}: {
  ui: AnswerUiState;
  announcement: string;
  locale: Locale;
  nowMs: number;
  cardRef: Ref<HTMLDivElement>;
  onScan: () => void;
  onAdd?: () => void;
  onRetry: () => void;
  onNavigate?: () => void;
  navigateButtonRef?: Ref<HTMLButtonElement>;
  onSeeAlternatives?: () => void;
  alternativesButtonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <>
      <LiveRegion message={announcement} visuallyHidden />
      <AnswerCard
        ui={ui}
        policy={defaultPolicy}
        nowMs={nowMs}
        locale={locale}
        cardRef={cardRef}
        onScan={onScan}
        onAdd={onAdd}
        onRetry={onRetry}
        onNavigate={onNavigate}
        navigateButtonRef={navigateButtonRef}
        onSeeAlternatives={onSeeAlternatives}
        alternativesButtonRef={alternativesButtonRef}
      />
    </>
  );
}
