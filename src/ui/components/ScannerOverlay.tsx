// src/ui/components/ScannerOverlay.tsx
// Barcode viewfinder. The Bible defines the scan BUTTON and the entry path but never a scanning screen,
// so this overlay is an app-owned surface built on the StoreSelectionSheet precedent (modal dialog,
// Escape, focus). It is UI-shell state, NOT a 7th UiState — the 6 answer states are untouched.
// Every outcome ends with a concrete next step (Anti-goal 5); a slow decode keeps the camera open and
// only adds a hint (Bible Engineering §5).
import { useEffect, useRef, useState } from 'react';
import type { ScanOutcome, ScannerPort } from '../../domain/ports';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import { LiveRegion } from '../a11y/LiveRegion';
import { splitAimGuide } from '../copy';
import { GlassSurface } from './GlassSurface';

const DEFAULT_HINT_DELAY_MS = 10_000;
const AIM_GUIDE_ID = 'scanner-aim-guide';

function noticeFor(outcome: ScanOutcome | null, S: ReturnType<typeof strings>): string | null {
  if (!outcome) return null;
  switch (outcome.kind) {
    case 'permissionDenied':
      return S.SCAN_PERMISSION_DENIED;
    case 'unsupported':
      return S.SCAN_UNSUPPORTED;
    case 'failed':
      return S.SCAN_FAILED;
    default:
      return null; // decoded/cancelled leave no notice behind
  }
}

export function ScannerOverlay({
  scanner,
  locale,
  onDecoded,
  onClose,
  hintDelayMs = DEFAULT_HINT_DELAY_MS,
}: {
  scanner: ScannerPort;
  // Guidance language for every line on this surface (D069 — match tokens stay Korean
  // regardless). Defaults to ko so existing callers/tests are unaffected.
  locale?: Locale;
  onDecoded: (value: string) => void;
  onClose: () => void;
  hintDelayMs?: number;
}) {
  const S = strings(locale ?? 'ko');
  const aimGuideParts = splitAimGuide(S.SCAN_AIM_GUIDE, S.SCAN_AIM_GUIDE_TOKEN);
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [hinting, setHinting] = useState(false);
  // Not "the scan started" — "frames are arriving". getUserMedia can be outstanding for a second or
  // more on iOS because the permission prompt lives inside it, and the brackets must not claim to be
  // reading anything during that window.
  const [streaming, setStreaming] = useState(false);

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

  const notice = noticeFor(outcome, S);

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
            {S.SCAN_BUTTON_LABEL}
          </h2>
          <button ref={closeRef} type="button" className="text-label" onClick={onClose}>
            {S.STORE_SELECT_CLOSE}
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
            onPlaying={() => setStreaming(true)}
            // The design enumerated terminal outcomes as the only reason frames stop (a notice unmounts
            // the brackets; success and cancel unmount the whole overlay) and concluded no teardown was
            // needed. That enumeration is complete for outcomes but not for frames stopping WITHOUT one:
            // an iOS app switch, an incoming call, or another app taking the camera can suspend capture
            // while scan() is still pending, and without this handler `streaming` stayed true — the
            // brackets kept asserting "the camera is delivering frames", the one claim this motion is
            // allowed to make, after it stopped being true. `playing` fires again on resume, so this
            // costs nothing on recovery; a platform that never fires `pause` for such an interruption
            // behaves exactly as it did before this line existed.
            onPause={() => setStreaming(false)}
          />
          {/* Aiming brackets, decoration only. Hidden once a notice lands: an aiming guide over a camera
              that failed is an instruction the app cannot honour. */}
          {!notice && (
            <div
              className={`scanner-overlay__aim${streaming ? ' scanner-overlay__aim--live' : ''}`}
              aria-hidden="true"
            >
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
              {aimGuideParts ? (
                <>
                  {aimGuideParts[0]}
                  <strong>{aimGuideParts[1]}</strong>
                  {aimGuideParts[2]}
                </>
              ) : (
                /* A token that cannot be found must never cost the shopper the instruction. */
                S.SCAN_AIM_GUIDE
              )}
            </p>
            {hinting && <p className="text-caption">{S.SCAN_HINT}</p>}
          </>
        )}
        {/* Focus stays on 닫기 for the whole overlay, so an outcome notice that is only rendered is
            never spoken. The surface's idiom applies here too: visible copy plus a live region that
            echoes it. THIS instance is the only one that hides the echo (D7): the notice is already on
            screen one line above, so leaving it visible would print the same sentence twice. The two
            AvailabilitySurface instances echo visibly-hidden for the same reason since the 2026-10-12
            polish dedup (their cards carry every announced sentence — verified per state). Mounted with
            the dialog and left in place (message '') so that when an outcome lands
            only the TEXT changes — a live region inserted together with its content is announced
            unreliably. */}
        <LiveRegion message={notice ?? ''} visuallyHidden />
      </section>
    </GlassSurface>
  );
}
