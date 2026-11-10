// src/ui/navigation/NavigationSurface.tsx
// Flow 2's single surface (Interface/in-store-navigation.md). It renders from the answer handed over
// by Flow 1 before any request starts, then refreshes in the background. This is UI-shell state, not
// a seventh UiState: the six availability states and their reducer are untouched.
import {
  type ReactNode,
  type TouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { defaultPolicy } from '../../domain/policy';
import type { StoreStockRepository } from '../../domain/ports';
import type { Freshness, StoreLocation } from '../../domain/types';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import { LiveRegion } from '../a11y/LiveRegion';
import { GlassSurface } from '../components/GlassSurface';
import { ProductPhoto } from '../components/ProductPhoto';
import { formatLocation, formatPrice, formatRelativeTimeEn, formatRelativeTimeKo } from '../format';
import { createDevRefreshRepository, parseDevRefreshMode } from './dev-refresh';
import {
  type InStockAnswer,
  NAV_REFRESH_TIMEOUT_MS,
  type NavigationEntry,
  type NavigationRefreshOutcome,
  otherLocationOf,
  refreshNavigation,
  sameLocation,
} from './navigation-refresh';

export const PULL_TO_REFRESH_PX = 72;
const CLOCK_INTERVAL_MS = 30_000;

type Phase =
  | { kind: 'guidance' }
  | { kind: 'recoveryOther'; answer: InStockAnswer; location: StoreLocation; freshness: Freshness }
  | { kind: 'recoveryStill' }
  | { kind: 'soldOut' };

// Announcements are stored as tokens, not sentences, so a language switch re-renders them in the
// current locale instead of leaving yesterday's language in the live region.
type Announcement =
  | { kind: 'none' }
  | { kind: 'soldOut' }
  | { kind: 'recoveryStill' }
  | { kind: 'recoveryOther'; location: StoreLocation }
  | { kind: 'stale' };

export function NavigationSurface({
  entry,
  locale,
  repo,
  now = Date.now,
  timeoutMs = NAV_REFRESH_TIMEOUT_MS,
  clockIntervalMs = CLOCK_INTERVAL_MS,
}: {
  entry: NavigationEntry;
  locale: Locale;
  // Test seam; production leaves it undefined and refreshNavigation uses the composed repository.
  repo?: StoreStockRepository;
  now?: () => number;
  timeoutMs?: number;
  clockIntervalMs?: number;
}) {
  const S = strings(locale);
  const [answer, setAnswer] = useState(entry.answer);
  const [freshness, setFreshness] = useState(entry.freshness);
  const [phase, setPhase] = useState<Phase>({ kind: 'guidance' });
  const [selected, setSelected] = useState<StoreLocation | null>(null);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => now());
  const [pull, setPull] = useState(0);
  const [announcement, setAnnouncement] = useState<Announcement>({ kind: 'none' });

  const primaryRef = useRef<HTMLElement | null>(null);
  const setPrimary = useCallback((node: HTMLElement | null) => {
    primaryRef.current = node;
  }, []);
  const pullStart = useRef<number | null>(null);
  const pullDistance = useRef(0);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const refreshToken = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const staleNotified = useRef(false);

  // The dev-only ?navRefresh= harness must keep its per-mount call counter across renders.
  const repository = useMemo(() => {
    if (repo) return repo;
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const mode = parseDevRefreshMode(window.location.search);
      if (mode) return createDevRefreshRepository(entry, mode);
    }
    return undefined;
  }, [repo, entry]);

  const relativeTime = (at: number) =>
    locale === 'en' ? formatRelativeTimeEn(at, nowMs) : formatRelativeTimeKo(at, nowMs);
  const stale = nowMs - freshness.observedAt >= defaultPolicy.stalenessThresholdMs;

  // Display-only clock: it re-renders the age caption and the stale demotion. It never refreshes.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(now()), clockIntervalMs);
    return () => clearInterval(timer);
  }, [now, clockIntervalMs]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Aging is the Error (system) state: announce the demotion once, but never move focus on a timer.
  useEffect(() => {
    if (stale && !staleNotified.current && phase.kind === 'guidance') {
      setAnnouncement({ kind: 'stale' });
    }
    staleNotified.current = stale;
  }, [stale, phase.kind]);

  function choose(next: InStockAnswer, location: StoreLocation, nextFreshness: Freshness) {
    setAnswer(next);
    setFreshness(nextFreshness);
    setSelected(location);
    setDisclosureOpen(false);
    setPhase({ kind: 'guidance' });
  }

  function applyOutcome(
    outcome: NavigationRefreshOutcome,
    purpose: 'background' | 'retry' | 'recovery',
    currentAnswer: InStockAnswer,
    currentSelected: StoreLocation | null,
  ) {
    if (outcome.kind === 'failed') {
      // Failure costs freshness, never guidance. After 못 찾겠어요 the designed still-in-stock
      // recovery is the honest branch: the data in hand still says stock exists.
      if (purpose === 'recovery') setAnnouncement({ kind: 'recoveryStill' });
      return;
    }
    if (outcome.kind === 'soldOut') {
      setAnnouncement({ kind: 'soldOut' });
      setPhase({ kind: 'soldOut' });
      return;
    }
    if (outcome.kind === 'unchanged') {
      setAnswer(outcome.answer);
      setFreshness(outcome.freshness);
      if (purpose === 'recovery') {
        const primary = currentSelected ?? currentAnswer.locations[0] ?? null;
        const other = primary === null ? null : otherLocationOf(outcome.answer, primary);
        if (other) {
          setPhase({
            kind: 'recoveryOther',
            answer: outcome.answer,
            location: other,
            freshness: outcome.freshness,
          });
          setAnnouncement({ kind: 'recoveryOther', location: other });
        } else {
          setPhase({ kind: 'recoveryStill' });
          setAnnouncement({ kind: 'recoveryStill' });
        }
      } else {
        // A successful check retires any stale warning the live region was holding.
        setAnnouncement({ kind: 'none' });
      }
      return;
    }
    if (outcome.kind === 'changed') {
      // The background refresh never applies a location move (D4, open in the Bible). The human
      // triggered recovery may still branch: "also here" only when this position remains listed.
      if (purpose !== 'recovery') return;
      const primary = currentSelected ?? currentAnswer.locations[0] ?? null;
      const other = primary === null ? null : otherLocationOf(outcome.answer, primary);
      if (other) {
        setAnswer(outcome.answer);
        setFreshness(outcome.freshness);
        setPhase({
          kind: 'recoveryOther',
          answer: outcome.answer,
          location: other,
          freshness: outcome.freshness,
        });
        setAnnouncement({ kind: 'recoveryOther', location: other });
      } else {
        setPhase({ kind: 'recoveryStill' });
        setAnnouncement({ kind: 'recoveryStill' });
      }
      return;
    }
    // unapplied: a negative state other than 품절. No exit copy exists yet (D4), so nothing new
    // surfaces and the stamp keeps aging — we do not invent a claim the Bible has not designed.
  }

  async function runRefresh(purpose: 'background' | 'retry' | 'recovery') {
    // Entry, resume and pull are background refreshes and never stack. The stale 다시 확인 and
    // 못 찾겠어요 are human actions: they cancel whatever is in flight and the newest lands.
    if (purpose === 'background' && (inFlight.current || phase.kind !== 'guidance')) return;
    if (purpose !== 'recovery' && phase.kind !== 'guidance') return;
    // A human-triggered refresh supersedes an in-flight background one; only the newest may land.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const token = ++refreshToken.current;
    inFlight.current = true;
    const current = { answer, freshness, selected };
    try {
      const outcome = await refreshNavigation(
        {
          store: entry.store,
          answer: current.answer,
          freshness: current.freshness,
          term: entry.term,
        },
        { repo: repository, now, timeoutMs, signal: controller.signal },
      );
      if (!mounted.current || token !== refreshToken.current) return;
      applyOutcome(outcome, purpose, current.answer, current.selected);
    } finally {
      if (token === refreshToken.current) {
        inFlight.current = false;
        if (abortRef.current === controller) abortRef.current = null;
      }
    }
  }

  // Flow-entry trigger. The ref pins the function from the first render: answer/freshness updates
  // must not re-trigger entry (that would turn every silent caption update into a request).
  const entryRefresh = useRef(runRefresh);
  useEffect(() => {
    void entryRefresh.current('background');
  }, []);

  // App-resume trigger (screen unlock or foreground). The effect registers once; the ref carries
  // the current render's closure so resume sees today's answer and phase, not the mount-time ones.
  const latestRefresh = useRef(runRefresh);
  useEffect(() => {
    latestRefresh.current = runRefresh;
  });
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void latestRefresh.current('background');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const onTouchStart = (event: TouchEvent) => {
    if (phase.kind !== 'guidance' || window.scrollY > 0) return;
    pullStart.current = event.touches[0]?.clientY ?? null;
    pullDistance.current = 0;
  };
  const onTouchMove = (event: TouchEvent) => {
    if (pullStart.current === null) return;
    const y = event.touches[0]?.clientY;
    const distance = y === undefined ? 0 : Math.max(0, y - pullStart.current);
    pullDistance.current = distance;
    setPull(distance);
  };
  const onTouchEnd = () => {
    const distance = pullDistance.current;
    pullStart.current = null;
    pullDistance.current = 0;
    setPull(0);
    if (distance >= PULL_TO_REFRESH_PX) void runRefresh('background');
  };

  const multi = selected === null && answer.locations.length > 1;
  const primary = selected ?? answer.locations[0] ?? null;
  const focusKey =
    phase.kind === 'guidance'
      ? multi
        ? 'multi'
        : `guidance:${primary?.floor}:${primary?.zone}`
      : phase.kind === 'recoveryOther'
        ? `recovery:${phase.location.floor}:${phase.location.zone}`
        : phase.kind;
  // Reading order starts here (Interface §6): location first, then identity, freshness, recovery.
  // Focus only follows a structural change, never the display clock or a silent refresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: focusKey is the trigger, not a read.
  useEffect(() => {
    primaryRef.current?.focus();
  }, [focusKey]);

  // Unreachable by construction (entry requires a position and every applied refresh validated one).
  if (primary === null) return null;

  const announcementText =
    announcement.kind === 'none'
      ? ''
      : announcement.kind === 'soldOut'
        ? `${S.NAV_SOLD_OUT_BODY} ${S.SUCCESS_OUT_CTA}`
        : announcement.kind === 'recoveryStill'
          ? `${S.NAV_RECOVERY_STILL_BODY} ${S.SUCCESS_OUT_CTA}`
          : announcement.kind === 'recoveryOther'
            ? S.navigationRecoveryOther(announcement.location)
            : `${S.navigationStaleBody(relativeTime(freshness.observedAt))} ${S.RETRY_BUTTON}`;

  const identity = (current: InStockAnswer) => (
    <div className="navigation-identity">
      <ProductPhoto
        imageUrl={current.imageUrl}
        name={current.productName}
        fallback={<p className="text-caption">{S.NAV_PHOTO_MISSING_NOTE}</p>}
      />
      <div>
        <p className="text-heading">{current.productName}</p>
        <p className="text-body navigation-price">{formatPrice(current.price, locale)}</p>
      </div>
    </div>
  );

  const staleBlock = (
    <>
      <p className="text-body">{S.navigationStaleBody(relativeTime(freshness.observedAt))}</p>
      <button
        type="button"
        className="text-label cta--primary"
        onClick={() => void runRefresh('retry')}
      >
        {S.RETRY_BUTTON}
      </button>
    </>
  );

  const shell = (children: ReactNode) => (
    <SurfaceShell
      announcement={announcementText}
      pull={pull}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {children}
    </SurfaceShell>
  );

  if (phase.kind === 'soldOut') {
    return shell(
      <>
        <p className="text-heading" ref={setPrimary} tabIndex={-1}>
          {S.NAV_SOLD_OUT_BODY}
        </p>
        <button type="button" className="text-label cta--primary">
          {S.SUCCESS_OUT_CTA}
        </button>
      </>,
    );
  }

  if (phase.kind === 'recoveryStill') {
    return shell(
      <>
        <p className="text-heading" ref={setPrimary} tabIndex={-1}>
          {S.NAV_RECOVERY_STILL_BODY}
        </p>
        <button type="button" className="text-label cta--primary">
          {S.SUCCESS_OUT_CTA}
        </button>
      </>,
    );
  }

  if (phase.kind === 'recoveryOther') {
    return shell(
      <button
        ref={setPrimary}
        type="button"
        className="text-heading navigation-recovery-row"
        onClick={() => choose(phase.answer, phase.location, phase.freshness)}
      >
        {S.navigationRecoveryOther(phase.location)}
      </button>,
    );
  }

  return shell(
    multi ? (
      <>
        <p className="text-heading" ref={setPrimary} tabIndex={-1}>
          {S.navigationMultiHeading(answer.locations.length)}
        </p>
        <div className="navigation-positions">
          {answer.locations.map((location) => (
            <button
              key={`${location.floor}:${location.zone}`}
              type="button"
              className="text-label navigation-position"
              onClick={() => choose(answer, location, freshness)}
            >
              {formatLocation(location, locale)}
            </button>
          ))}
        </div>
        {identity(answer)}
        {stale ? (
          staleBlock
        ) : (
          <p className="text-caption">
            {S.navigationFreshnessCaption(freshness.observedAt, nowMs)}
          </p>
        )}
      </>
    ) : (
      <>
        <p className="text-display navigation-location" ref={setPrimary} tabIndex={-1}>
          <span className="visually-hidden">{S.NAV_LOCATION_LABEL} </span>
          {formatLocation(primary, locale)}
        </p>
        {identity(answer)}
        {stale ? (
          staleBlock
        ) : (
          <>
            <p className="text-caption">
              {S.navigationFreshnessCaption(freshness.observedAt, nowMs)}
            </p>
            {answer.locations.length > 1 && (
              <button
                type="button"
                className="text-caption navigation-disclosure"
                aria-expanded={disclosureOpen}
                onClick={() => setDisclosureOpen((open) => !open)}
              >
                {S.extraPositionsLabel(
                  answer.locations.filter((location) => !sameLocation(location, primary)).length,
                )}
              </button>
            )}
            {disclosureOpen && (
              <div className="navigation-positions">
                {answer.locations
                  .filter((location) => !sameLocation(location, primary))
                  .map((location) => (
                    <button
                      key={`${location.floor}:${location.zone}`}
                      type="button"
                      className="text-label navigation-position"
                      onClick={() => choose(answer, location, freshness)}
                    >
                      {formatLocation(location, locale)}
                    </button>
                  ))}
              </div>
            )}
            <button
              type="button"
              className="text-label navigation-missing"
              onClick={() => void runRefresh('recovery')}
            >
              {S.NAV_MISSING_LINK}
            </button>
          </>
        )}
      </>
    ),
  );
}

// The card chrome + gesture surface + live region. Kept outside the phase branches so every state
// shares one DOM root (no blank screen, one announcement channel).
function SurfaceShell({
  announcement,
  pull,
  children,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: {
  announcement: string;
  pull: number;
  children: ReactNode;
  onTouchStart: (event: TouchEvent) => void;
  onTouchMove: (event: TouchEvent) => void;
  onTouchEnd: () => void;
}) {
  return (
    <GlassSurface className="answer-card navigation-surface">
      <LiveRegion message={announcement} visuallyHidden />
      <div
        className="navigation-body"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          className="navigation-pull"
          aria-hidden="true"
          data-visible={pull > 0}
          style={{ transform: `scaleX(${Math.min(pull / PULL_TO_REFRESH_PX, 1)})` }}
        />
        {children}
      </div>
    </GlassSurface>
  );
}
