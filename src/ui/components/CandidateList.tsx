// src/ui/components/CandidateList.tsx
// Pre-answer literal search results (Interface §copy-table AI-low notice). A candidate row is honestly
// identity-only — photo/name/price — never availability: stock is checked only after a tap (search-first
// flow, no AI confidence model — see RESULTS_NOTICE in ../copy.ts).
import type { ProductCandidate } from '../../domain/types';
import { RESULTS_NOTICE } from '../copy';
import { formatPrice } from '../format';
import { ProductPhoto } from './ProductPhoto';

export function CandidateList({
  candidates,
  onSelect,
}: {
  candidates: ProductCandidate[];
  onSelect: (c: ProductCandidate) => void;
}) {
  return (
    <div className="candidate-list">
      <p className="text-caption">{RESULTS_NOTICE}</p>
      <ul>
        {candidates.map((c) => (
          <li key={c.pdNo}>
            <button type="button" className="text-body" onClick={() => onSelect(c)}>
              <ProductPhoto imageUrl={c.imageUrl} name={c.name} />
              <span>{c.name}</span>
              <span>{formatPrice(c.price)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
