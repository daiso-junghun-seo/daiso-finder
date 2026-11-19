// src/ui/components/HowItWorks.tsx — owner decision §B52: a passive three-step walkthrough
// (scan/search → check this and nearby stores → follow floor/zone). It is not a gate: no dialog,
// no dismissal step, no focus capture, and it sits BELOW the search field on entry so Anti-goal 4
// (no onboarding before the first answer) still holds. Fixed row heights keep a language switch
// from shifting the page (CLS).
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';

export function HowItWorks({ locale }: { locale: Locale }) {
  const S = strings(locale);
  const steps = [S.HOW_IT_WORKS_SCAN, S.HOW_IT_WORKS_STOCK, S.HOW_IT_WORKS_LOCATE];
  return (
    <section className="how-it-works">
      <p className="text-caption how-it-works__title">{S.HOW_IT_WORKS_LABEL}</p>
      <ol className="how-it-works__steps">
        {steps.map((step, index) => (
          <li key={step} className="how-it-works__step">
            <span className="how-it-works__index" aria-hidden="true">
              {index + 1}
            </span>
            <span className="text-caption">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
