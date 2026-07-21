// src/ui/components/StoreContextLine.tsx
// Store-context display (Interface §2 IA: "always present and always correctable").
// 매장 변경 opens the D082 store-selection sheet via the injected handler; the surface may pass a
// ref to the button so the modal sheet can restore focus to its opener on close (Interface §6).
import type { Ref } from 'react';
import type { StoreContext } from '../../domain/types';
import { STORE_CHANGE_BUTTON, storeLine } from '../copy';

export function StoreContextLine({
  store,
  onChangeStore,
  changeButtonRef,
}: {
  store: StoreContext;
  onChangeStore?: () => void;
  changeButtonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="store-context-line text-caption" id="store-line">
      <span>{storeLine(store.strNm)}</span>
      <button ref={changeButtonRef} type="button" className="text-label" onClick={onChangeStore}>
        {STORE_CHANGE_BUTTON}
      </button>
    </div>
  );
}
