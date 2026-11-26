// src/ui/components/StoreContextLine.tsx
// Store-context display (Interface §2 IA: "always present and always correctable").
// 매장 변경 opens the D082 store-selection sheet via the injected handler; the surface may pass a
// ref to the button so the modal sheet can restore focus to its opener on close (Interface §6).
// The locale control is a 12-language native select (each option names itself); install is the
// one-time §B51 entry. Both are utilities, not context, so they own a second row: measured on
// production 2026-11-24, three controls in one cluster wrapped to three lines at 320px in ru/fr/es
// (header 193px) and sat edge-to-edge at 390px in mn (356 of 358px). Split by role, the context row
// holds the name and its correction, the utility row holds install + language, and the measured
// header (2026-11-24, ko/en/mn/th/vi/ja/zh/id at 320–390) is 111px common, 163px worst case
// (320px ru/ja/es/fr, where install and the 136px select wrap inside the utility row).
// It only switches guidance language; match tokens never translate (D069).
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
      <span className="store-context-context">
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
        <span className="store-context-name">{S.storeLine(store.strNm)}</span>
        <button ref={changeButtonRef} type="button" className="text-label" onClick={onChangeStore}>
          {S.STORE_CHANGE_BUTTON}
        </button>
      </span>
      <span className="store-context-utilities">
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
      </span>
    </div>
  );
}
