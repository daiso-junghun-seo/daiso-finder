// src/ui/components/StoreContextLine.tsx
// Static store-context display (Interface §2 IA: "always present and always correctable").
// The 매장 변경 button is present for focus-order/IA fidelity; wiring the store-selection sheet is Phase 5 (D082).
import type { StoreContext } from '../../domain/types';
import { STORE_CHANGE_BUTTON, storeLine } from '../copy';

export function StoreContextLine({ store }: { store: StoreContext }) {
  return (
    <div className="store-context-line text-caption" id="store-line">
      <span>{storeLine(store.strNm)}</span>
      <button type="button" className="text-label">
        {STORE_CHANGE_BUTTON}
      </button>
    </div>
  );
}
