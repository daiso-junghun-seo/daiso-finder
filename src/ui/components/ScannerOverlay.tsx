// src/ui/components/ScannerOverlay.tsx
// Barcode viewfinder. The Bible defines the scan BUTTON and the entry path but never a scanning screen,
// so this overlay is an app-owned surface built on the StoreSelectionSheet precedent (modal dialog,
// Escape, focus). It is UI-shell state, NOT a 7th UiState — the 6 answer states are untouched.
// Every outcome ends with a concrete next step (Anti-goal 5); a slow decode keeps the camera open and
// only adds a hint (Bible Engineering §5).
import { useEffect, useRef, useState } from 'react';
import type { ScanOutcome, ScannerPort } from '../../domain/ports';
import { LiveRegion } from '../a11y/LiveRegion';
import {
  SCAN_AIM_GUIDE,
  SCAN_AIM_GUIDE_TOKEN,
  SCAN_BUTTON_LABEL,
  SCAN_FAILED,
  SCAN_HINT,
  SCAN_PERMISSION_DENIED,
  SCAN_UNSUPPORTED,
  STORE_SELECT_CLOSE,
  splitAimGuide,
} from '../copy';
import { GlassSurface } from './GlassSurface';

const DEFAULT_HINT_DELAY_MS = 10_000;
const AIM_GUIDE_ID = 'scanner-aim-guide';
const AIM_GUIDE_PARTS = splitAimGuide(SCAN_AIM_GUIDE, SCAN_AIM_GUIDE_TOKEN);

function noticeFor(outcome: ScanOutcome | null): string | null {
  if (!outcome) return null;
  switch (outcome.kind) {
    case 'permissionDenied':
      return SCAN_PERMISSION_DENIED;
    case 'unsupported':
      return SCAN_UNSUPPORTED;
    case 'failed':
      return SCAN_FAILED;
    default:
      return null; // decoded/cancelled leave no notice behind
  }
}

export function ScannerOverlay({
  scanner,
  onDecoded,
  onClose,
  hintDelayMs = DEFAULT_HINT_DELAY_MS,
}: {
  scanner: ScannerPort;
  onDecoded: (value: string) => void;
  onClose: () => void;
  hintDelayMs?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [hinting, setHinting] = useState(false);

  // The dialog must own focus while it is open (Interface §6); 닫기 is the safe landing target.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setHinting(true), hintDelayMs);
    return () => clearTimeout(timer);
  }, [hintDelayMs]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return; // IME composition Escape cancels the composition, not the overlay
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // One scan per mount. Unmount aborts it — the adapter stops the camera on abort, so the camera can
  // never outlive this overlay.
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    const video = videoRef.current;
    if (!video) return;
    scanner
      .scan({ video }, controller.signal)
      .then((result) => {
        if (!live || result.kind === 'cancelled') return;
        if (result.kind === 'decoded') {
          onDecoded(result.value);
          return;
        }
        setOutcome(result);
      })
      .catch(() => {
        // Defensive only: ScannerPort is contractually throw-free (spec §3.1).
        if (live) setOutcome({ kind: 'failed' });
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [scanner, onDecoded]);

  const notice = noticeFor(outcome);

  return (
    <GlassSurface className="scanner-overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-title"
        aria-describedby={notice ? undefined : AIM_GUIDE_ID}
      >
        <div className="scanner-overlay__header">
          <h2 id="scanner-title" className="text-heading">
            {SCAN_BUTTON_LABEL}
          </h2>
          <button ref={closeRef} type="button" className="text-label" onClick={onClose}>
            {STORE_SELECT_CLOSE}
          </button>
        </div>
        <div className="scanner-overlay__viewport">
          {/* Decorative preview: the camera image carries no information a screen reader can use — every
              state is stated in text below. */}
          {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: <video> without controls is not focusable */}
          <video
            ref={videoRef}
            className="scanner-overlay__video"
            aria-hidden="true"
            playsInline
            muted
            autoPlay
          />
          {/* Aiming brackets, decoration only. Hidden once a notice lands: an aiming guide over a camera
              that failed is an instruction the app cannot honour. */}
          {!notice && (
            <div className="scanner-overlay__aim" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
        {notice ? (
          <p className="text-body">{notice}</p>
        ) : (
          <>
            {/* Visible from mount, for the whole time scanning is in progress: DataMatrix-only
                decoding (B30-2) makes aiming at the package's 1D code a silent dead end otherwise.
                Wired as the dialog's accessible description (aria-describedby above) because focus
                stays on 닫기 for the whole overlay — a bare paragraph would never be announced. */}
            <p id={AIM_GUIDE_ID} className="text-body">
              {AIM_GUIDE_PARTS ? (
                <>
                  {AIM_GUIDE_PARTS[0]}
                  <strong>{AIM_GUIDE_PARTS[1]}</strong>
                  {AIM_GUIDE_PARTS[2]}
                </>
              ) : (
                /* A token that cannot be found must never cost the shopper the instruction. */
                SCAN_AIM_GUIDE
              )}
            </p>
            {hinting && <p className="text-caption">{SCAN_HINT}</p>}
          </>
        )}
        {/* Focus stays on 닫기 for the whole overlay, so an outcome notice that is only rendered is
            never spoken. The surface's idiom applies here too: visible copy plus a live region that
            echoes it. Mounted with the dialog and left in place (message '') so that when an outcome
            lands only the TEXT changes — a live region inserted together with its content is announced
            unreliably. */}
        <LiveRegion message={notice ?? ''} visuallyHidden />
      </section>
    </GlassSurface>
  );
}
