// src/ui/components/ScannerOverlay.tsx
// Barcode viewfinder. The Bible defines the scan BUTTON and the entry path but never a scanning screen,
// so this overlay is an app-owned surface built on the StoreSelectionSheet precedent (modal dialog,
// Escape, focus). It is UI-shell state, NOT a 7th UiState — the 6 answer states are untouched.
// Every outcome ends with a concrete next step (Anti-goal 5); a slow decode keeps the camera open and
// only adds a hint (Bible Engineering §5).
import { useEffect, useRef, useState } from 'react';
import type { ScanOutcome, ScannerPort } from '../../domain/ports';
import {
  SCAN_BUTTON_LABEL,
  SCAN_FAILED,
  SCAN_HINT,
  SCAN_PERMISSION_DENIED,
  SCAN_UNSUPPORTED,
  STORE_SELECT_CLOSE,
} from '../copy';
import { GlassSurface } from './GlassSurface';

const DEFAULT_HINT_DELAY_MS = 10_000;

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
      <section role="dialog" aria-modal="true" aria-labelledby="scanner-title">
        <div className="scanner-overlay__header">
          <h2 id="scanner-title" className="text-heading">
            {SCAN_BUTTON_LABEL}
          </h2>
          <button ref={closeRef} type="button" className="text-label" onClick={onClose}>
            {STORE_SELECT_CLOSE}
          </button>
        </div>
        {/* Decorative preview: the camera image carries no information a screen reader can use — every
            state is stated in text below. */}
        <video
          ref={videoRef}
          className="scanner-overlay__video"
          aria-hidden="true"
          tabIndex={-1}
          playsInline
          muted
          autoPlay
        />
        {notice ? (
          <p className="text-body">{notice}</p>
        ) : (
          hinting && <p className="text-caption">{SCAN_HINT}</p>
        )}
      </section>
    </GlassSurface>
  );
}
