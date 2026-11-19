// src/ui/components/StoreContextLine.tsx
// Store-context display (Interface §2 IA: "always present and always correctable").
// 매장 변경 opens the D082 store-selection sheet via the injected handler; the surface may pass a
// ref to the button so the modal sheet can restore focus to its opener on close (Interface §6).
// The locale control beside it is a 12-language native select (each option names itself);
// the store line wraps the control to its own row when a narrow phone cannot hold the name
// and the actions. It only switches guidance language; match tokens never translate (D069).
import type { Ref } from 'react';
import type { StoreContext } from '../../domain/types';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import { LocaleSelect } from './LocaleSelect';

export function StoreContextLine({
  store,
  locale,
  onSelectLocale,
  onChangeStore,
  changeButtonRef,
  onBack,
  install,
  onInstall,
  installButtonRef,
}: {
  store: StoreContext;
  locale: Locale;
  onSelectLocale: (locale: Locale) => void;
  onChangeStore?: () => void;
  changeButtonRef?: Ref<HTMLButtonElement>;
  // Flow 2 back control (Interface/in-store-navigation.md §2 L4). Optional: Flow 1 surfaces never
  // show it. The glyph is decorative; the accessible name comes from the locale table.
  onBack?: () => void;
  // In-app install entry (§B51): 'button' prompts natively (Chromium), 'guide' opens the iOS
  // share-sheet sheet. Absent when installed or when the browser has nothing to offer.
  install?: 'button' | 'guide';
  onInstall?: () => void;
  installButtonRef?: Ref<HTMLButtonElement>;
}) {
  const S = strings(locale);
  return (
    <div className="store-context-line text-caption" id="store-line">
      {onBack && (
        <button
          type="button"
          className="text-label store-context-back"
          aria-label={S.NAV_BACK_LABEL}
          onClick={onBack}
        >
          <span aria-hidden="true">←</span>
        </button>
      )}
      <span>{S.storeLine(store.strNm)}</span>
      <span className="store-context-actions">
        {/* One-time install entry: only rendered while the platform offers a path (native
            prompt on Chromium, share-sheet guidance on iOS) and not once installed. */}
        {install && (
          <button
            ref={installButtonRef}
            type="button"
            className="text-label"
            aria-haspopup={install === 'guide' ? 'dialog' : undefined}
            onClick={onInstall}
          >
            {S.INSTALL_BUTTON}
          </button>
        )}
        {/* Language picker (12 languages). Each option names itself; the fixed-width select
            keeps the store line from jumping when the selection changes (CLS). */}
        <LocaleSelect locale={locale} onSelect={onSelectLocale} />
        <button ref={changeButtonRef} type="button" className="text-label" onClick={onChangeStore}>
          {S.STORE_CHANGE_BUTTON}
        </button>
      </span>
    </div>
  );
}
