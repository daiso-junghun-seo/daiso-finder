// src/ui/availability/StoreContextBar.tsx
import type { Ref } from 'react';
import type { StoreContext } from '../../domain/types';
import type { Locale } from '../../i18n/locale';
import { GlassSurface } from '../components/GlassSurface';
import { StoreContextLine } from '../components/StoreContextLine';

// The always-present, always-correctable store line (Interface §2). Shared by all three rendered
// surfaces (Default, candidates, answer) so the sticky glass wrapper cannot drift between them.
export function StoreContextBar({
  store,
  locale,
  onSelectLocale,
  onChangeStore,
  changeButtonRef,
  onBack,
}: {
  store: StoreContext;
  locale: Locale;
  onSelectLocale: (locale: Locale) => void;
  onChangeStore: () => void;
  changeButtonRef: Ref<HTMLButtonElement>;
  onBack?: () => void;
}) {
  return (
    <GlassSurface className="store-context-surface">
      <StoreContextLine
        store={store}
        locale={locale}
        onSelectLocale={onSelectLocale}
        onChangeStore={onChangeStore}
        changeButtonRef={changeButtonRef}
        onBack={onBack}
      />
    </GlassSurface>
  );
}
