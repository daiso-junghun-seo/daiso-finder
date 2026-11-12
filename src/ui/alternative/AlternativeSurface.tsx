// src/ui/alternative/AlternativeSurface.tsx
// Flow 3's single surface (Interface/alternative-discovery.md). UI-shell state over the answer, not a
// seventh UiState: the six availability states, their reducer and copy are untouched.
//
// The surface owns the whole flow's stack (list → store card, list → Flow 2 guidance) so returning
// from an overlay never re-queries: the answer stays in hand, exactly as it was when the shopper left
// it. The parent still owns the header back button; it reports depth and accepts a pop.
import { type TouchEvent, useEffect, useRef, useState } from 'react';
import { defaultPolicy } from '../../domain/policy';
import type { AlternativeRepository } from '../../domain/ports';
import type { NearbyAlternative, SimilarAlternative } from '../../domain/types';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import { LiveRegion } from '../a11y/LiveRegion';
import { GlassSurface } from '../components/GlassSurface';
import { ProductPhoto } from '../components/ProductPhoto';
import {
  formatDistance,
  formatLocation,
  formatPrice,
  formatRelativeTimeEn,
  formatRelativeTimeKo,
} from '../format';
import { NavigationSurface } from '../navigation/NavigationSurface';
import { PULL_TO_REFRESH_PX } from '../navigation/NavigationSurface';
import type { InStockAnswer, NavigationEntry } from '../navigation/navigation-refresh';
import { alternativeCache } from './alternative-cache';
import type { AlternativeCache } from './alternative-cache';
import {
  ALT_TIMEOUT_MS,
  type AlternativeQueryDeps,
  type AnySlotOutcome,
  initialSnapshot,
  refreshAlternative,
  retryAlternativeSlot,
  startAlternativeQuery,
} from './alternative-query';
import {
  type AlternativeEntry,
  type AlternativeSnapshot,
  type SlotKind,
  type SlotResult,
  altReasonLabel,
  issuedKinds,
} from './alternative-types';
import { currentMapPlatform, mapHref } from './map-link';

const CLOCK_INTERVAL_MS = 30_000;

type Overlay =
  | { kind: 'navigation'; row: SimilarAlternative; entry: NavigationEntry }
  | { kind: 'card'; row: NearbyAlternative };

export interface AlternativeSurfaceProps {
  entry: AlternativeEntry;
  locale: Locale;
  // Test seam; production leaves it undefined and the query composes the repository.
  repo?: AlternativeRepository;
  // Test seam for cache rules; production uses the module's single whole-answer cache.
  cache?: AlternativeCache;
  now?: () => number;
  timeoutMs?: number;
  // The parent's header back asks an overlay to pop. 0 means "no request yet".
  backSignal?: number;
  // 1 = list, 2 = an overlay is on top. The parent routes its header back with it.
  onDepthChange?: (depth: 1 | 2) => void;
  // Empty ladder "다른 이름으로 다시 검색" — return to Flow 1 with the term filled, never auto-submit.
  onResearch: (term: string) => void;
}

export function AlternativeSurface({
  entry,
  locale,
  repo,
  cache,
  now = Date.now,
  timeoutMs = ALT_TIMEOUT_MS,
  backSignal = 0,
  onDepthChange,
  onResearch,
}: AlternativeSurfaceProps) {
  const S = strings(locale);
  const [snapshot, setSnapshot] = useState<AlternativeSnapshot>(() => initialSnapshot(entry));
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [nowMs, setNowMs] = useState(() => now());
  const [pull, setPull] = useState(0);
  const [rowFocus, setRowFocus] = useState<string | null>(null);

  const contextRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const queryHandle = useRef<ReturnType<typeof startAlternativeQuery> | null>(null);
  const refreshAbort = useRef<AbortController | null>(null);
  const queryToken = useRef(0);
  const overlayRef = useRef<Overlay | null>(null);
  const pullStart = useRef<number | null>(null);
  const pullDistance = useRef(0);
  const mounted = useRef(false);

  const deps: AlternativeQueryDeps = { repo, cache, now, timeoutMs };
  const kinds = issuedKinds(entry.issued);

  // A full (re)start: Error retry and the mount entry. Rows disappear only here, because the shopper
  // asked for a fresh look, not a background top-up.
  function start() {
    queryHandle.current?.cancel();
    refreshAbort.current?.abort();
    const token = ++queryToken.current;
    setSnapshot(initialSnapshot(entry));
    const handle = startAlternativeQuery(entry, {
      ...deps,
      onUpdate: (next) => {
        if (!mounted.current || token !== queryToken.current) return;
        setSnapshot(next);
      },
    });
    queryHandle.current = handle;
  }

  // Pull / resume / stale retry: the rows on screen are never cleared; a failed read ages the stamp.
  async function refresh() {
    if (!mounted.current || !snapshot.settled) return;
    refreshAbort.current?.abort();
    const controller = new AbortController();
    refreshAbort.current = controller;
    const token = queryToken.current;
    try {
      const next = await refreshAlternative(entry, snapshot, {
        ...deps,
        signal: controller.signal,
      });
      if (!mounted.current || token !== queryToken.current) return;
      setSnapshot(next);
    } finally {
      if (refreshAbort.current === controller) refreshAbort.current = null;
    }
  }

  async function retrySlot(kind: SlotKind) {
    const outcome: AnySlotOutcome = await retryAlternativeSlot(entry, kind, deps);
    if (!mounted.current) return;
    setSnapshot((prev) => {
      const slots = { ...prev.slots };
      if (kind === 'similar') slots.similar = outcome.result as SlotResult<SimilarAlternative>;
      else slots.nearby = outcome.result as SlotResult<NearbyAlternative>;
      const succeeded = outcome.result.status === 'ready' || outcome.result.status === 'empty';
      const observedAt =
        succeeded && outcome.observedAt !== null
          ? prev.observedAt === null
            ? outcome.observedAt
            : Math.min(prev.observedAt, outcome.observedAt)
          : prev.observedAt;
      const next: AlternativeSnapshot = {
        slots,
        issued: prev.issued,
        observedAt,
        source: 'live',
        settled: true,
      };
      // The retry may have completed the pair; only then is the answer memorable. The query pipeline
      // owns start/refresh caching, so this is the one save the surface performs itself.
      const complete = kinds.every((k) => {
        const slot = slots[k];
        return slot.status === 'ready' || slot.status === 'empty';
      });
      if (complete) (cache ?? alternativeCache).save(entry, next);
      return next;
    });
  }

  function openSimilar(row: SimilarAlternative) {
    const answer: InStockAnswer = {
      kind: 'inStock',
      pdNo: row.pdNo,
      productName: row.productName,
      price: row.price,
      locations: row.locations,
      qtyUpperBound: row.qtyUpperBound,
      ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
    };
    setOverlay({
      kind: 'navigation',
      row,
      entry: {
        store: entry.store,
        answer,
        // The guidance card renders before any request; the shared stamp is the honest age.
        freshness: { class: 'live', observedAt: snapshot.observedAt ?? now() },
        term: { kind: 'pdNo', pdNo: row.pdNo, keyword: row.productName },
      },
    });
  }

  function openCard(row: NearbyAlternative) {
    setOverlay({ kind: 'card', row });
  }

  // Pop one level. The list remounts, so focus returns by the contract attribute, not a ref.
  function closeOverlay() {
    const current = overlayRef.current;
    setOverlay(null);
    if (current) setRowFocus(current.kind === 'navigation' ? current.row.pdNo : current.row.strCd);
  }

  const depthChangeRef = useRef(onDepthChange);
  useEffect(() => {
    depthChangeRef.current = onDepthChange;
  });

  useEffect(() => {
    overlayRef.current = overlay;
    depthChangeRef.current?.(overlay ? 2 : 1);
  }, [overlay]);

  // The parent's back button request: pop one level, never the whole flow.
  // biome-ignore lint/correctness/useExhaustiveDependencies: backSignal is the trigger, not a read.
  useEffect(() => {
    if (backSignal === 0) return;
    closeOverlay();
  }, [backSignal]);

  // Entry focus: the context header is the first element in reading order (spec §1).
  useEffect(() => {
    contextRef.current?.focus();
  }, []);

  // Returning from an overlay restores focus to the row that was tapped.
  useEffect(() => {
    if (rowFocus === null) return;
    const rows = bodyRef.current?.querySelectorAll<HTMLButtonElement>('[data-alt-row]');
    Array.from(rows ?? [])
      .find((row) => row.dataset.altRow === rowFocus)
      ?.focus();
    setRowFocus(null);
  }, [rowFocus]);

  // Answer entry is one query start; a new store/identity is a new surface (parent key).
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only; a new entry remounts.
  useEffect(() => {
    mounted.current = true;
    start();
    return () => {
      mounted.current = false;
      queryHandle.current?.cancel();
      refreshAbort.current?.abort();
    };
  }, []);

  // Display clock only: it ages the stamp; it never queries.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [now]);

  // App resume: the shared freshness contract, background only. The ref carries today's closure so
  // the listener registers once, like Flow 2's.
  const latestRefresh = useRef(refresh);
  useEffect(() => {
    latestRefresh.current = refresh;
  });
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void latestRefresh.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const onTouchStart = (event: TouchEvent) => {
    if (overlayRef.current || window.scrollY > 0) return;
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
    if (distance >= PULL_TO_REFRESH_PX) void refresh();
  };

  if (overlay?.kind === 'navigation') {
    // Flow 2 owns the guidance from here. Its exit (대안 보기) returns to this list, where the
    // alternatives already are — no circular re-entry.
    return (
      <NavigationSurface entry={overlay.entry} locale={locale} onSeeAlternatives={closeOverlay} />
    );
  }

  if (overlay?.kind === 'card') {
    return <StoreCard row={overlay.row} locale={locale} snapshot={snapshot} nowMs={nowMs} />;
  }

  const totalRows = kinds.reduce((count, kind) => {
    const slot = snapshot.slots[kind];
    return slot.status === 'ready' ? count + slot.rows.length : count;
  }, 0);
  const pending = kinds.some((kind) => snapshot.slots[kind].status === 'pending');
  const settled = snapshot.settled;
  const failedKinds = kinds.filter((kind) => snapshot.slots[kind].status === 'failed');
  const emptyKinds = kinds.filter((kind) => snapshot.slots[kind].status === 'empty');
  const bothIssued = entry.issued.similar && entry.issued.nearby;
  const bothEmpty = bothIssued && emptyKinds.length === 2;
  const showStateBlock = settled && totalRows === 0;

  const reason = altReasonLabel(entry.reason, S);

  const relative = (at: number) =>
    locale === 'en' ? formatRelativeTimeEn(at, nowMs) : formatRelativeTimeKo(at, nowMs);

  const headingFor = (kind: SlotKind) =>
    kind === 'similar' ? S.ALT_SIMILAR_HEADING : S.ALT_NEARBY_HEADING;
  const emptyFor = (kind: SlotKind) =>
    kind === 'similar' ? S.ALT_SIMILAR_EMPTY : S.ALT_NEARBY_EMPTY;
  const failedFor = (kind: SlotKind) =>
    kind === 'similar' ? S.ALT_SIMILAR_FAILED : S.ALT_NEARBY_FAILED;

  // The live Empty keeps the Bible's no-stamp layout; a cached answer keeps its age in the stamp
  // slot (the open question in §B50-⑤). Rows, degraded Empty and Error behave the same way.
  const showStamp =
    settled && snapshot.observedAt !== null && (!showStateBlock || snapshot.source === 'cache');

  const stamp = showStamp ? (
    snapshot.source === 'cache' ? (
      nowMs - (snapshot.observedAt ?? 0) >= defaultPolicy.stalenessThresholdMs ? (
        <>
          <p className="text-caption">{S.altStaleBody(relative(snapshot.observedAt ?? nowMs))}</p>
          <button
            type="button"
            className="text-label alt-stamp-retry"
            onClick={() => void refresh()}
          >
            {S.ALT_SLOT_RETRY}
          </button>
        </>
      ) : (
        <p className="text-caption">
          {S.cachedFreshnessCaption(relative(snapshot.observedAt ?? nowMs))}
        </p>
      )
    ) : (
      <p className="text-caption">
        {S.navigationFreshnessCaption(snapshot.observedAt ?? nowMs, nowMs)}
      </p>
    )
  ) : null;

  const settledAnnouncements = kinds.flatMap((kind) => {
    const slot = snapshot.slots[kind];
    if (slot.status === 'ready') return [headingFor(kind)];
    if (slot.status === 'empty') return [emptyFor(kind)];
    if (slot.status === 'failed') return [failedFor(kind)];
    return [];
  });
  // Empty states can only name an empty slot; if none is empty (unreachable), the entry's own group
  // is the honest stand-in — the block is never rendered then.
  const emptyStatement = bothEmpty
    ? S.ALT_EMPTY_BOTH
    : emptyFor(
        emptyKinds.includes('nearby') && !emptyKinds.includes('similar') ? 'nearby' : 'similar',
      );
  const announcement = showStateBlock
    ? failedKinds.length > 0
      ? S.ALT_ERROR_BODY
      : emptyStatement
    : settledAnnouncements.length > 0
      ? settledAnnouncements.join('. ')
      : pending
        ? S.altLoadingLine(entry.issued)
        : '';

  const groupOrder: SlotKind[] =
    entry.issued.similar && entry.issued.nearby
      ? entry.lead === 'nearby'
        ? ['nearby', 'similar']
        : ['similar', 'nearby']
      : kinds;

  const renderSimilar = (slot: SlotResult<SimilarAlternative>) => {
    if (slot.status === 'withheld') return null;
    return (
      <section className="alt-group" aria-labelledby="alt-similar-heading">
        <h2 id="alt-similar-heading" className="text-body alt-heading">
          {S.ALT_SIMILAR_HEADING}
        </h2>
        {slot.status === 'pending' ? (
          <Skeleton rows={3} />
        ) : slot.status === 'ready' ? (
          <ul className="alt-rows">
            {slot.rows.map((row) => {
              const primary = row.locations[0];
              return (
                <li key={row.pdNo}>
                  <button
                    type="button"
                    className="alt-row"
                    data-alt-row={row.pdNo}
                    aria-label={S.altSimilarRowLabel(row, defaultPolicy)}
                    onClick={() => openSimilar(row)}
                  >
                    <ProductPhoto imageUrl={row.imageUrl} name={row.productName} />
                    <span className="alt-row-text">
                      <span className="text-heading alt-row-name">{row.productName}</span>
                      <span className="text-body alt-row-meta">
                        {formatPrice(row.price, locale)}
                        {primary ? ` · ${formatLocation(primary, locale)}` : ''}
                      </span>
                      {row.qtyUpperBound <= defaultPolicy.lowQtyCutoff && (
                        <span className="text-caption">{S.lowQtyCaption(row.qtyUpperBound)}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : slot.status === 'empty' ? (
          <p className="text-body alt-slot-status">{S.ALT_SIMILAR_EMPTY}</p>
        ) : (
          <div className="alt-slot-failure">
            <p className="text-body">{S.ALT_SIMILAR_FAILED}</p>
            {slotRetry('similar')}
          </div>
        )}
      </section>
    );
  };

  const renderNearby = (slot: SlotResult<NearbyAlternative>) => {
    if (slot.status === 'withheld') return null;
    return (
      <section className="alt-group" aria-labelledby="alt-nearby-heading">
        <h2 id="alt-nearby-heading" className="text-body alt-heading">
          {S.ALT_NEARBY_HEADING}
        </h2>
        {slot.status === 'pending' ? (
          <Skeleton rows={3} />
        ) : slot.status === 'ready' ? (
          <ul className="alt-rows">
            {slot.rows.map((row) => {
              const hours = row.closedToday
                ? S.ALT_STORE_CARD_CLOSED
                : S.altClosingLabel(row.closingTime);
              return (
                <li key={row.strCd}>
                  <button
                    type="button"
                    className="alt-row"
                    data-alt-row={row.strCd}
                    aria-label={S.altNearbyRowLabel(
                      row.strNm,
                      row.distanceM,
                      row.closingTime,
                      row.closedToday,
                    )}
                    onClick={() => openCard(row)}
                  >
                    <span className="alt-row-text">
                      <span className="text-heading alt-row-name">
                        {row.strNm} · {formatDistance(row.distanceM)}
                      </span>
                      <span className="text-body alt-row-meta">
                        {hours ? `${hours} · ` : ''}
                        {S.ALT_STORE_CARD_IN_STOCK}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : slot.status === 'empty' ? (
          <p className="text-body alt-slot-status">{S.ALT_NEARBY_EMPTY}</p>
        ) : (
          <div className="alt-slot-failure">
            <p className="text-body">{S.ALT_NEARBY_FAILED}</p>
            {slotRetry('nearby')}
          </div>
        )}
      </section>
    );
  };

  const slotRetry = (kind: SlotKind) => (
    <button
      type="button"
      className="text-label alt-slot-retry"
      onClick={() => void retrySlot(kind)}
    >
      {S.ALT_SLOT_RETRY}
    </button>
  );

  const stateBlock = showStateBlock ? (
    failedKinds.length > 0 ? (
      <div className="alt-state">
        <p className="text-body error-banner">
          <span aria-hidden="true">⚠ </span>
          {S.ALT_ERROR_BODY}
        </p>
        <button type="button" className="text-label cta--primary" onClick={start}>
          {S.ALT_ERROR_RETRY}
        </button>
        <p className="text-body alt-state-note">{S.ALT_ERROR_STAFF}</p>
      </div>
    ) : (
      <div className="alt-state">
        <p className="text-heading">{emptyStatement}</p>
        <div className="alt-ladder">
          {bothEmpty && (
            <a
              className="text-label alt-ladder-link"
              href="https://www.daisomall.co.kr/"
              target="_blank"
              rel="noopener noreferrer"
            >
              {S.ALT_EMPTY_MALL}
            </a>
          )}
          <button
            type="button"
            className="text-label alt-ladder-link"
            onClick={() => onResearch(entry.keyword)}
          >
            {S.ALT_EMPTY_RESEARCH}
          </button>
          <p className="text-body alt-state-note">{S.ALT_EMPTY_STAFF}</p>
        </div>
      </div>
    )
  ) : null;

  return (
    <GlassSurface className="answer-card alternative-surface">
      <LiveRegion message={announcement} visuallyHidden />
      <div
        className="alternative-body"
        ref={bodyRef}
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
        <header
          className="alternative-context"
          ref={contextRef}
          tabIndex={-1}
          aria-labelledby="alt-context-name alt-context-reason"
        >
          <p id="alt-context-name" className="text-heading alt-context-name">
            {entry.productName}
          </p>
          <p id="alt-context-reason" className="text-body alt-context-reason">
            {reason}
          </p>
        </header>
        {stateBlock ?? (
          <>
            {pending && <p className="text-body alt-loading">{S.altLoadingLine(entry.issued)}</p>}
            {groupOrder.map((kind) => (
              <div key={kind}>
                {kind === 'similar'
                  ? renderSimilar(snapshot.slots.similar)
                  : renderNearby(snapshot.slots.nearby)}
              </div>
            ))}
            {stamp}
          </>
        )}
        {showStateBlock && stamp}
      </div>
    </GlassSurface>
  );
}

// Three reserved rows per pending group: the second answer must not move the first group (spec §5.1).
function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="alt-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        // The index is the row's only identity — the block is decorative.
        // biome-ignore lint/suspicious/noArrayIndexKey: decorative rows have no identity
        <div key={index} className="alt-skeleton-row">
          <div className="skeleton-block alt-skeleton-photo" />
          <div className="alt-skeleton-lines">
            <div className="skeleton-block skeleton-line" />
            <div className="skeleton-block skeleton-line skeleton-line--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function StoreCard({
  row,
  locale,
  snapshot,
  nowMs,
}: {
  row: NearbyAlternative;
  locale: Locale;
  snapshot: AlternativeSnapshot;
  nowMs: number;
}) {
  const S = strings(locale);
  const headingRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const href = mapHref(row.address, currentMapPlatform());
  const relative =
    locale === 'en'
      ? formatRelativeTimeEn(snapshot.observedAt ?? nowMs, nowMs)
      : formatRelativeTimeKo(snapshot.observedAt ?? nowMs, nowMs);
  const hours = row.closedToday ? S.ALT_STORE_CARD_CLOSED : S.altClosingLabel(row.closingTime);
  const stale =
    snapshot.source === 'cache' &&
    snapshot.observedAt !== null &&
    nowMs - snapshot.observedAt >= defaultPolicy.stalenessThresholdMs;
  return (
    <GlassSurface className="answer-card alternative-surface store-card">
      <div className="alternative-body">
        <p className="text-heading alt-card-heading" ref={headingRef} tabIndex={-1}>
          {S.altStoreCardHeading(row.strNm, row.distanceM)}
        </p>
        <p className="text-body alt-card-status">{S.ALT_STORE_CARD_IN_STOCK}</p>
        {hours && <p className="text-body alt-card-hours">{hours}</p>}
        {href ? (
          <a
            className="text-label alt-card-address"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={S.altMapLinkLabel(row.address)}
          >
            {row.address}
          </a>
        ) : (
          <p className="text-body alt-card-address">{row.address}</p>
        )}
        {snapshot.observedAt !== null &&
          (stale ? (
            <p className="text-caption">{S.altStaleBody(relative)}</p>
          ) : snapshot.source === 'cache' ? (
            <p className="text-caption">{S.cachedFreshnessCaption(relative)}</p>
          ) : (
            <p className="text-caption">
              {S.navigationFreshnessCaption(snapshot.observedAt, nowMs)}
            </p>
          ))}
      </div>
    </GlassSurface>
  );
}
