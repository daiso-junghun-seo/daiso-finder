// src/ui/components/CandidateList.tsx
// Pre-answer literal search results (Interface §copy-table AI-low notice). A candidate row is honestly
// identity-only — photo/name/price — never availability: stock is checked only after a tap (search-first
// flow, no AI confidence model — see RESULTS_NOTICE in ../copy.ts).
import type { ProductCandidate } from '../../domain/types';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import { formatPrice } from '../format';
import { ProductPhoto } from './ProductPhoto';

export function CandidateList({
  candidates,
  locale,
  onSelect,
}: {
  candidates: ProductCandidate[];
  locale: Locale;
  onSelect: (c: ProductCandidate) => void;
}) {
  const S = strings(locale);
  return (
    <div className="candidate-list">
      <p className="text-caption">{S.RESULTS_NOTICE}</p>
      <ul>
        {candidates.map((c) => (
          <li key={c.pdNo}>
            <button type="button" className="text-body" onClick={() => onSelect(c)}>
              <ProductPhoto imageUrl={c.imageUrl} name={c.name} />
              <span>{c.name}</span>
              <span>{formatPrice(c.price, locale)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
