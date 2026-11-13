// src/ui/components/SheetShell.tsx
// The dialog frame shared by the lazy wrappers (cart sheet, scanner overlay). It exists so a chunk that
// has not landed yet can still open as a REAL dialog: same GlassSurface, same labelled section, 닫기
// focused on mount and Escape wired — the modal contract the loaded surface then inherits unchanged.
//
// It is deliberately NOT used by the loaded surfaces themselves: importing the shell from them would be
// fine, but touching the frozen §B47 cart sheet for a bundle split is not. The frame markup is small and
// stable, and keeping the lazy side on one copy is what pays for the split.
import { type ReactNode, useEffect, useRef } from 'react';
import { GlassSurface } from './GlassSurface';

export function SheetShell({
  className,
  titleId,
  title,
  closeLabel,
  onClose,
  headerClassName = 'store-selection-sheet__header',
  grabber = false,
  children,
}: {
  className: string;
  titleId: string;
  title: string;
  closeLabel: string;
  onClose: () => void;
  headerClassName?: string;
  grabber?: boolean;
  children?: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return; // IME composition Escape cancels the composition, not the dialog
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  return (
    <GlassSurface className={className}>
      <section role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {grabber && <div className="sheet-grabber" aria-hidden="true" />}
        <div className={headerClassName}>
          <h2 id={titleId} className="text-heading">
            {title}
          </h2>
          <button ref={closeRef} type="button" className="text-label" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
        {children}
      </section>
    </GlassSurface>
  );
}
