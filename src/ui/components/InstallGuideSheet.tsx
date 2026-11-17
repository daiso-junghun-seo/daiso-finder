// src/ui/components/InstallGuideSheet.tsx
// iOS install guidance (§B51, owner exception). Safari never fires beforeinstallprompt, so the
// header entry opens the two share-sheet steps instead. Same modal contract as the D082 store
// sheet: the dialog takes focus on open (닫기), Escape dismisses like 닫기, and the surface
// restores focus to the header opener on close (Interface §6).
import { useEffect, useRef } from 'react';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import { GlassSurface } from './GlassSurface';

export function InstallGuideSheet({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const S = strings(locale);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Modal dialogs must receive focus on open — the sheet pattern: 닫기 takes it.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Escape dismisses like 닫기 (IME-safe, document-level so drifted focus still works).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <GlassSurface className="store-selection-sheet">
      <section role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="store-selection-sheet__header">
          <h2 id="install-guide-title" className="text-heading">
            {S.INSTALL_GUIDE_TITLE}
          </h2>
          <button ref={closeRef} type="button" className="text-label" onClick={onClose}>
            {S.STORE_SELECT_CLOSE}
          </button>
        </div>
        <ol className="install-guide-steps">
          <li className="text-body">{S.INSTALL_GUIDE_STEP_SHARE}</li>
          <li className="text-body">{S.INSTALL_GUIDE_STEP_ADD}</li>
        </ol>
        <p className="text-caption">{S.INSTALL_GUIDE_NOTE}</p>
      </section>
    </GlassSurface>
  );
}
