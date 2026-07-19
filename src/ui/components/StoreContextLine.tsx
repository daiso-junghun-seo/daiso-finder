// src/ui/components/StoreContextLine.tsx
// Store-context display (Interface §2 IA: "always present and always correctable").
// 매장 변경 opens the D082 store-selection sheet via the injected handler.
import type { StoreContext } from '../../domain/types';
import { STORE_CHANGE_BUTTON, storeLine } from '../copy';

export function StoreContextLine({
  store,
  onChangeStore,
}: {
  store: StoreContext;
  onChangeStore?: () => void;
}) {
  return (
    <div className="store-context-line text-caption" id="store-line">
      <span>{storeLine(store.strNm)}</span>
      <button type="button" className="text-label" onClick={onChangeStore}>
        {STORE_CHANGE_BUTTON}
      </button>
    </div>
  );
}
