// src/ui/components/ScannerOverlayLoader.tsx — the lazy boundary around the barcode viewfinder.
//
// The camera adapter is already loaded on the first scan (composition.createScanner), but the overlay
// itself — its outcome copy, aim guide and frame loop wiring — was still in the entry chunk even though
// it only exists after the shopper taps 바코드 스캔. This wrapper keeps it in its own chunk and paints a
// same-shape dialog shell — title, 닫기 (focused, Escape wired) — while it loads, so the modal contract
// (focus lands inside the dialog, background inert, Escape dismisses) holds from the first frame.
//
// A rejected chunk import must not throw during render and unmount the root (the same discipline as
// main.tsx, the Flow 3 surface and the cart sheet). The stand-in says the scan could not be started and
// offers the only retry that can work for a failed chunk — a reload.
import { type ComponentType, type ReactNode, Suspense, lazy } from 'react';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import { LiveRegion } from '../a11y/LiveRegion';
import type { ScannerOverlayProps } from './ScannerOverlay';
import { SheetShell } from './SheetShell';

const loadScannerOverlay = () => import('./ScannerOverlay');

const ScannerOverlay = lazy<ComponentType<ScannerOverlayProps>>(() =>
  loadScannerOverlay()
    .then((module) => ({ default: module.ScannerOverlay }))
    .catch(() => ({ default: ScannerOverlayUnavailable })),
);

// The shell carries the same contract as the overlay: the same labelled dialog, the same viewfinder
// styling, 닫기 focused on open and Escape dismissing.
function ScannerOverlayShell({
  locale,
  onClose,
  children,
}: {
  locale: Locale;
  onClose: () => void;
  children?: ReactNode;
}) {
  const S = strings(locale);
  return (
    <SheetShell
      className="scanner-overlay"
      titleId="scanner-title"
      title={S.SCAN_BUTTON_LABEL}
      closeLabel={S.STORE_SELECT_CLOSE}
      onClose={onClose}
      headerClassName="scanner-overlay__header"
    >
      {children}
    </SheetShell>
  );
}

function ScannerOverlayUnavailable({ locale, onClose }: ScannerOverlayProps) {
  const S = strings(locale ?? 'ko');
  return (
    <ScannerOverlayShell locale={locale ?? 'ko'} onClose={onClose}>
      <LiveRegion message={S.ERROR_NO_CACHE_BODY} visuallyHidden />
      <p className="text-body">{S.ERROR_NO_CACHE_BODY}</p>
      <button
        type="button"
        className="text-label cta--primary"
        onClick={() => window.location.reload()}
      >
        {S.RETRY_BUTTON}
      </button>
    </ScannerOverlayShell>
  );
}

export function ScannerOverlayLoader(props: ScannerOverlayProps) {
  return (
    <Suspense
      fallback={<ScannerOverlayShell locale={props.locale ?? 'ko'} onClose={props.onClose} />}
    >
      <ScannerOverlay {...props} />
    </Suspense>
  );
}
