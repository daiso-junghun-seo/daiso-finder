// The ?debug=1 diagnostics bar. Development/test instrumentation, NOT a shopper surface: it is reachable
// only by URL parameter, it never alters app behaviour, and with the flag off this module is never
// imported, parsed or executed. (Its chunk IS still precached by the service worker — see
// open-questions.md §B31-7 — so "never downloaded" would be false.)
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

  // The bar is fixed at the viewport bottom, directly over the sticky search/scan bar. Reserve that
  // strip on the app surface (diagnostics.css `body.has-diagnostics`) for exactly as long as the panel
  // is mounted, so the panel cannot cover the 스캔 button every one of its scanner readings requires.
  // Mount-scoped, so the app's layout is untouched whenever the panel is off (§B31-9). classList
  // add/remove is idempotent, so StrictMode's double mount is harmless.
  useEffect(() => {
    document.body.classList.add('has-diagnostics');
    return () => document.body.classList.remove('has-diagnostics');
  }, []);

  // Elapsed time is derived from a clock, not from a publish, so nothing would repaint it on its own.
  // Tick ONLY while a scan is live — the one moment the counter is the point. Ticking while merely
  // expanded would rewrite the textarea's value twice a second (경과 and 캐시 나이 both move with
  // Date.now()), and React writing node.value resets the caret and drops the user's selection. On plain
  // http there is no clipboard API, so selecting that text by hand IS the copy path; a report that will
  // not hold still defeats the fallback it exists to be. When a scan ends, the bus publish re-renders
  // once with a fresh now and the report then holds still. Idle pages stay timer-free as a side effect.
  useEffect(() => {
    if (!scanning) return;
    const timer = setInterval(() => forceTick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [scanning]);

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
