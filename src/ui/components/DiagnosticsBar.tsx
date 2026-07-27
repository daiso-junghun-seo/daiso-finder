// The ?debug=1 diagnostics bar. Development/test instrumentation, NOT a shopper surface: it is reachable
// only by URL parameter, it never alters app behaviour, and it is not downloaded when the flag is off.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '../../diagnostics/bus';
import {
  type AppFacts,
  buildReport,
  collectEnvironment,
  summaryLine,
} from '../../diagnostics/report';
import { useAvailabilityStore } from '../store';
import '../../styles/diagnostics.css';

const TICK_MS = 500;

function appFacts(
  ui: ReturnType<typeof useAvailabilityStore.getState>['ui'],
  store: ReturnType<typeof useAvailabilityStore.getState>['store'],
  now: number,
): AppFacts {
  return {
    state: ui.state === 'error' ? `error/${ui.variant}` : ui.state,
    query: 'query' in ui ? ui.query : null,
    origin: 'origin' in ui ? (ui.origin ?? null) : null,
    storeId: store?.strCd ?? null,
    storeName: store?.strNm ?? null,
    candidateCount: ui.state === 'candidates' ? ui.candidates.length : null,
    freshnessAgeMs: 'freshness' in ui && ui.freshness ? now - ui.freshness.observedAt : null,
  };
}

export default function DiagnosticsBar() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const ui = useAvailabilityStore((s) => s.ui);
  const store = useAvailabilityStore((s) => s.store);
  const [expanded, setExpanded] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [, forceTick] = useState(0);

  const scanning = snapshot.scanner.startedAt !== null && snapshot.scanner.outcome === null;

  // Elapsed time is derived from a clock, not from a publish, so nothing would repaint it on its own.
  // Ticking only while a scan is live or the panel is open keeps an idle page free of timers.
  useEffect(() => {
    if (!scanning && !expanded) return;
    const timer = setInterval(() => forceTick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [scanning, expanded]);

  const now = Date.now();
  const report = buildReport(collectEnvironment(), snapshot, appFacts(ui, store, now), now);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopyFailed(false);
    } catch {
      // Plain http (the LAN phone-testing setup) has no clipboard API. Say so — the textarea below is
      // already on screen, so the tester still has a way to get the text out.
      setCopyFailed(true);
    }
  };

  return (
    <div className="diagnostics-bar">
      <button
        type="button"
        className="diagnostics-bar__summary"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {summaryLine(snapshot.scanner, now)}
      </button>
      {expanded && (
        <div className="diagnostics-bar__body">
          <div className="diagnostics-bar__actions">
            <button type="button" onClick={copy}>
              복사
            </button>
            {copyFailed && (
              <span className="diagnostics-bar__note">
                복사 실패 — 아래 텍스트를 선택해 주세요.
              </span>
            )}
          </div>
          <textarea
            className="diagnostics-bar__report"
            aria-label="진단 보고서"
            readOnly
            value={report}
          />
        </div>
      )}
    </div>
  );
}
