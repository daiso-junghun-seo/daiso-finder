// src/ui/components/StoreContextLine.tsx
// Store-context display (Interface §2 IA: "always present and always correctable").
// 매장 변경 opens the D082 store-selection sheet via the injected handler; the surface may pass a
// ref to the button so the modal sheet can restore focus to its opener on close (Interface §6).
// The locale control beside it is a KO|EN segmented pair (each segment ≥44px); the store line
// wraps the pair to its own row when a narrow phone cannot hold the name and both actions.
// It only switches guidance language; match tokens never translate (D069).
import type { Ref } from 'react';
import type { StoreContext } from '../../domain/types';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';

export function StoreContextLine({
  store,
  locale,
  onSelectLocale,
  onChangeStore,
  changeButtonRef,
}: {
  store: StoreContext;
  locale: Locale;
  onSelectLocale: (locale: Locale) => void;
  onChangeStore?: () => void;
  changeButtonRef?: Ref<HTMLButtonElement>;
}) {
  const S = strings(locale);
  return (
    <div className="store-context-line text-caption" id="store-line">
      <span>{S.storeLine(store.strNm)}</span>
      <span className="store-context-actions">
        {/* Segmented language control (iOS idiom at 44px): the pressed segment shows the
            CURRENT language — the single-toggle it replaces showed only the target, which
            read as the current state. Both segments stay ≥44px (Interface §6 wins over the
            32pt idiom). */}
        <fieldset className="locale-segmented">
          <legend className="visually-hidden">{S.LOCALE_GROUP_LABEL}</legend>
          <button
            type="button"
            className="text-label"
            aria-pressed={locale === 'ko'}
            onClick={() => onSelectLocale('ko')}
          >
            KO
          </button>
          <button
            type="button"
            className="text-label"
            aria-pressed={locale === 'en'}
            onClick={() => onSelectLocale('en')}
          >
            EN
          </button>
        </fieldset>
        <button ref={changeButtonRef} type="button" className="text-label" onClick={onChangeStore}>
          {S.STORE_CHANGE_BUTTON}
        </button>
      </span>
    </div>
  );
}
