// src/ui/AnswerCard.tsx
// Renders the answer-card content for every non-default state (Interface §4). AvailabilitySurface renders
// Default separately (no card, no GlassSurface — just the landing headline).
import type { Ref } from 'react';
import type { DataOwnerPolicy } from '../domain/policy';
import type { AvailabilityAnswer, UiState } from '../domain/types';
import { GlassSurface } from './components/GlassSurface';
import { ProductPhoto } from './components/ProductPhoto';
import {
  ERROR_CACHED_BANNER,
  ERROR_NO_CACHE_BODY,
  LIVE_FRESHNESS_CAPTION,
  LOADING_CARD_COPY,
  LOADING_DELAY_LINE,
  PARTIAL_FRANCHISE_BODY,
  PARTIAL_FRANCHISE_CTA,
  PARTIAL_NO_LOCATION_CTA,
  PARTIAL_NO_LOCATION_NOTE,
  PARTIAL_STALE_CACHE_CTA,
  RETRY_BUTTON,
  SCAN_BUTTON_LABEL,
  cachedFreshnessCaption,
  emptyBody,
  extraPositionsLabel,
  factsFor,
  lowQtyCaption,
  partialLocationMissingConfirmed,
  partialStaleCacheBody,
  priceLocationLine,
  scanEmptyBody,
} from './copy';
import { formatLocation, formatPrice, formatRelativeTimeKo } from './format';

type NonDefaultUiState = Exclude<UiState, { state: 'default' }>;

export function AnswerCard({
  ui,
  policy,
  nowMs,
  onRetry,
  onScan,
  cardRef,
}: {
  ui: NonDefaultUiState;
  policy: DataOwnerPolicy;
  nowMs: number;
  // Wired ONLY to the four 다시 확인 renders (error/cached, error/noCache, partial/locationMissing,
  // partial/staleCache): re-runs the retained query (B15). All other CTAs stay inert stubs.
  onRetry?: () => void;
  // Wired ONLY to the Empty render (Bible Interface §4: the Empty card carries its own scan CTA).
  // Scan-origin empties reuse it as the scan retry.
  onScan?: () => void;
  // Retry-focus target (decision 6): the surface root is focusable (tabIndex -1) so focus never falls
  // to <body> when the retry button unmounts on the Loading swap.
  cardRef?: Ref<HTMLDivElement>;
}) {
  return (
    <GlassSurface className="answer-card" tabIndex={-1} surfaceRef={cardRef}>
      {renderBody(ui, policy, nowMs, onRetry, onScan)}
    </GlassSurface>
  );
}

function renderBody(
  ui: NonDefaultUiState,
  policy: DataOwnerPolicy,
  nowMs: number,
  onRetry?: () => void,
  onScan?: () => void,
) {
  switch (ui.state) {
    case 'loading':
      return (
        <div>
          {/* Skeleton shell (Bible Interface §3: skeleton <100ms, no blank screen). Decorative
              blocks only — aria-hidden, opacity pulse, killed by the global reduce-motion cut. */}
          <div className="skeleton-block skeleton-photo" aria-hidden="true" />
          <div className="skeleton-block skeleton-line" aria-hidden="true" />
          <div className="skeleton-block skeleton-line skeleton-line--short" aria-hidden="true" />
          <p className="text-body">{LOADING_CARD_COPY}</p>
          {ui.slow && <p className="text-caption">{LOADING_DELAY_LINE}</p>}
        </div>
      );
    case 'empty':
      return (
        <div>
          <div className="empty-medallion" aria-hidden="true">
            <svg
              width="26"
              height="26"
              viewBox="0 0 26 26"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M16.5 16.5 23 23" />
            </svg>
          </div>
          <p className="text-body">
            {ui.origin === 'scan' ? scanEmptyBody(ui.query) : emptyBody(ui.query)}
          </p>
          <button type="button" className="text-label cta--primary" onClick={onScan}>
            {SCAN_BUTTON_LABEL}
          </button>
        </div>
      );
    case 'candidates':
      // Unreachable: candidates is a pre-answer state that AvailabilitySurface renders separately
      // (later task) — AnswerCard never receives it. Present only to keep this switch exhaustive.
      return null;
    case 'error':
      return ui.variant === 'cached'
        ? renderErrorCached(ui.answer, ui.freshness.observedAt, nowMs, onRetry)
        : renderErrorNoCache(onRetry);
    case 'success':
      return renderSuccess(ui.answer, policy);
    case 'partial':
      return renderPartial(ui, nowMs, onRetry);
  }
}

function renderErrorCached(
  answer: AvailabilityAnswer,
  observedAt: number,
  nowMs: number,
  onRetry?: () => void,
) {
  const facts = factsFor(answer);
  const line = priceLocationLine(answer);
  // priceLocationLine requires both price and location together; an inStock answer can be cached with a
  // known price but no location (state-machine.ts only gates Success/Partial on hasLocation, not the
  // FAILURE/cache path), so fall back to price-only rather than silently dropping it.
  const priceOnly = !line && answer.kind === 'inStock' ? formatPrice(answer.price) : undefined;
  // Cached facts keep Success's collapsed disclosure for extra positions (P6-4): same markup shape.
  const rest = answer.kind === 'inStock' ? answer.locations.slice(1) : [];
  return (
    <div>
      <p className="text-body error-banner">
        <span aria-hidden="true">⚠ </span>
        {ERROR_CACHED_BANNER}
      </p>
      <ProductPhoto imageUrl={answer.imageUrl} name={answer.productName} />
      <p className="text-heading">{answer.productName}</p>
      <p className="text-display status-pill status-pill--neutral">{facts.status}</p>
      {line && <p className="text-heading">{line}</p>}
      {priceOnly && <p className="text-heading">{priceOnly}</p>}
      {rest.length > 0 && (
        <button type="button" className="text-caption">
          {extraPositionsLabel(rest.length)}
        </button>
      )}
      <p className="text-caption">
        {cachedFreshnessCaption(formatRelativeTimeKo(observedAt, nowMs))}
      </p>
      {answer.kind === 'franchiseUndeterminable' && (
        // Decision 5: a cached franchise answer keeps its own CTA (inert stub) — the outage frame
        // alone would strand the shopper with a retry that cannot ever determine franchise stock.
        <button type="button" className="text-label">
          {facts.cta}
        </button>
      )}
      <button type="button" className="text-label cta--primary" onClick={onRetry}>
        {RETRY_BUTTON}
      </button>
    </div>
  );
}

function renderErrorNoCache(onRetry?: () => void) {
  return (
    <div>
      <p className="text-body error-banner">
        <span aria-hidden="true">⚠ </span>
        {ERROR_NO_CACHE_BODY}
      </p>
      <button type="button" className="text-label cta--primary" onClick={onRetry}>
        {RETRY_BUTTON}
      </button>
    </div>
  );
}

function renderSuccess(answer: AvailabilityAnswer, policy: DataOwnerPolicy) {
  const facts = factsFor(answer);
  if (answer.kind === 'inStock') {
    const [primary, ...rest] = answer.locations;
    const isLowQty = answer.qtyUpperBound <= policy.lowQtyCutoff;
    return (
      <div>
        <ProductPhoto imageUrl={answer.imageUrl} name={answer.productName} />
        <p className="text-heading">{answer.productName}</p>
        <p className="text-display success-status status-pill status-pill--success">
          <span aria-hidden="true">✓ </span>
          {facts.status}
        </p>
        {primary && (
          <p className="text-heading price-line">
            {formatPrice(answer.price)} · {formatLocation(primary)}
          </p>
        )}
        <p className="text-caption">
          {isLowQty ? lowQtyCaption(answer.qtyUpperBound) : LIVE_FRESHNESS_CAPTION}
        </p>
        {rest.length > 0 && (
          <button type="button" className="text-caption">
            {extraPositionsLabel(rest.length)}
          </button>
        )}
        <button type="button" className="text-label">
          {facts.cta}
        </button>
      </div>
    );
  }
  return (
    <div>
      <ProductPhoto imageUrl={answer.imageUrl} name={answer.productName} />
      <p className="text-heading">{answer.productName}</p>
      <p className="text-display status-pill status-pill--neutral">{facts.status}</p>
      {/* Freshness is announced for every success (announcementFor) so it must also be
          visible: without this line the surface LiveRegion was its only visual source,
          which forbids hiding that region (LiveRegion's own rule + UI polish dedup). */}
      <p className="text-caption">{LIVE_FRESHNESS_CAPTION}</p>
      <button type="button" className="text-label">
        {facts.cta}
      </button>
      {facts.secondaryCta && (
        <button type="button" className="text-label">
          {facts.secondaryCta}
        </button>
      )}
    </div>
  );
}

function renderPartial(
  ui: Extract<NonDefaultUiState, { state: 'partial' }>,
  nowMs: number,
  onRetry?: () => void,
) {
  const { answer, freshness, trigger } = ui;
  if (trigger === 'franchise') {
    return (
      <div>
        <ProductPhoto imageUrl={answer.imageUrl} name={answer.productName} />
        <p className="text-heading">{answer.productName}</p>
        <p className="text-body">{PARTIAL_FRANCHISE_BODY}</p>
        <button type="button" className="text-label">
          {PARTIAL_FRANCHISE_CTA}
        </button>
      </div>
    );
  }
  if (trigger === 'locationMissing') {
    if (answer.kind !== 'inStock') return null; // unreachable: state machine only routes inStock here
    // Two honestly-separated blocks (Interface §333, I6): the confirmed line in Text Primary (.text-body),
    // the unconfirmed location note in Text Secondary (.text-caption). Separation is carried by the two
    // paragraphs (layout) and their distinct sentences (text) — the color role only reinforces it (F5).
    return (
      <div>
        <ProductPhoto imageUrl={answer.imageUrl} name={answer.productName} />
        <p className="text-heading">{answer.productName}</p>
        <p className="text-body">{partialLocationMissingConfirmed(answer.price)}</p>
        <p className="text-caption">{PARTIAL_NO_LOCATION_NOTE}</p>
        <button type="button" className="text-label cta--primary" onClick={onRetry}>
          {PARTIAL_NO_LOCATION_CTA}
        </button>
      </div>
    );
  }
  const relativeTime = freshness ? formatRelativeTimeKo(freshness.observedAt, nowMs) : '';
  return (
    <div>
      <ProductPhoto imageUrl={answer.imageUrl} name={answer.productName} />
      <p className="text-heading">{answer.productName}</p>
      <p className="text-body">{partialStaleCacheBody(relativeTime)}</p>
      <button type="button" className="text-label cta--primary" onClick={onRetry}>
        {PARTIAL_STALE_CACHE_CTA}
      </button>
    </div>
  );
}
