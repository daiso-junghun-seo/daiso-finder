// src/i18n/en.ts — English guidance strings. Korean product/store names, prices,
// and image alts NEVER translate (D069 match tokens) — only the surrounding guidance
// does. Floors/zones translate GRAMMAR only (11F · No. 56, digits identical) per owner
// order §B46 — signage risk recorded there, not hidden here. First-draft app copy;
// Bible ratification may reword through the same verbatim-replace path as the ko drafts. Completeness against
// copy.ts is compiler-checked (CopyTable in ./strings) plus a runtime key test.
import type { DataOwnerPolicy } from '../domain/policy';
import type { AvailabilityAnswer, UiState } from '../domain/types';
import { formatLocation, formatPrice, formatRelativeTimeEn } from '../ui/format';

export const DEFAULT_HEADLINE = 'Check if this store has it';
export const DEFAULT_SUBHEAD = 'Scan a barcode or type a product name.';
export const SEARCH_PLACEHOLDER = 'Product name or scan barcode';
export const SCAN_BUTTON_LABEL = 'Scan';
export const STORE_CHANGE_BUTTON = 'Change store';
export const SEARCH_INPUT_LABEL = 'Search products';
export const LOCALE_GROUP_LABEL = 'Display language';

export const LOADING_CARD_COPY = 'Checking this store’s stock…';
export const LOADING_DELAY_LINE = 'The connection is slow, taking a little longer.';

export const ERROR_CACHED_BANNER =
  'Connection is unstable. Showing the last confirmed information.';
export const ERROR_NO_CACHE_BODY = 'Connection is unstable. Please try again or ask store staff.';
export const RETRY_BUTTON = 'Retry';

export const SUCCESS_IN_STOCK_STATUS = 'In stock at this store';
export const SUCCESS_IN_STOCK_CTA = 'View location';
export const LIVE_FRESHNESS_CAPTION = 'Just checked';

export const SUCCESS_OUT_BODY = 'Out of stock for now. We can show nearby stock and similar items.';
export const SUCCESS_OUT_CTA = 'See alternatives';
export const SUCCESS_OUT_SECONDARY_CTA = 'Restock alerts';

export const SUCCESS_ENDED_BODY = 'This product has been discontinued. We can show similar items.';
export const SUCCESS_ENDED_CTA = 'See alternatives';

export const SUCCESS_NOT_CARRIED_BODY =
  'This store does not carry this product. We can show nearby stores.';
export const SUCCESS_NOT_CARRIED_CTA = 'See nearby stores';

export const SUCCESS_RESTOCKING_CTA = 'Restock alerts';

export const PARTIAL_FRANCHISE_BODY =
  'This store carries it, but as a franchise we cannot check stock. Please ask staff.';
export const PARTIAL_FRANCHISE_CTA = 'See nearby stores';
export const PARTIAL_NO_LOCATION_CTA = 'Retry';
export const PARTIAL_STALE_CACHE_CTA = 'Retry';

export const STORE_SELECT_TITLE = 'Select store';
export const STORE_SELECT_CLOSE = 'Close';
export const STORE_SELECT_NEARBY_HEADER = 'Nearby stores';
export const STORE_SELECT_SEARCH_PLACEHOLDER = 'Search by store or area name';
export const STORE_SELECT_NO_LOCATION_NOTE =
  'Location unavailable. Please search by store or area name.';

export function nearbyStoreRowLabel(strNm: string, distanceM: number): string {
  return `${strNm} · ${distanceM}m`;
}

export function storeLine(storeName: string): string {
  return `DAISO ${storeName}`;
}

export function emptyBody(query: string): string {
  return `No product registered as '${query}'. Scan the barcode or try another name.`;
}

export function lowQtyCaption(qtyUpperBound: number): string {
  return `${qtyUpperBound} or fewer left · just checked`;
}

export function cachedFreshnessCaption(relativeTime: string): string {
  return `Checked ${relativeTime}`;
}

export function extraPositionsLabel(count: number): string {
  return count === 1 ? '1 more location ▾' : `${count} more locations ▾`;
}

// The restock DATE stays Korean-rendered: answers carry the formatted `lchDay`
// (ISO is lost upstream of render), so a translated date needs ISO plumbing —
// recorded follow-up, not silent mixing. The expectation itself translates.
export function restockBody(lchDay: string): string {
  return lchDay ? `Expected around ${lchDay}.` : 'Restock expected, date to be announced.';
}

export function partialLocationMissingConfirmed(price: number): string {
  return `In stock here · ${formatPrice(price, 'en')}`;
}
export const PARTIAL_NO_LOCATION_NOTE = 'No location info. Please ask staff where it is.';

export function partialStaleCacheBody(relativeTime: string): string {
  return `This store sells it. Could not check today’s stock — it was in stock ${relativeTime}.`;
}

export interface AnswerFacts {
  status: string;
  cta: string;
  secondaryCta?: string;
}

export function factsFor(answer: AvailabilityAnswer): AnswerFacts {
  switch (answer.kind) {
    case 'inStock':
      return { status: SUCCESS_IN_STOCK_STATUS, cta: SUCCESS_IN_STOCK_CTA };
    case 'temporarilyOut':
      return {
        status: SUCCESS_OUT_BODY,
        cta: SUCCESS_OUT_CTA,
        secondaryCta: answer.restockOfferable ? SUCCESS_OUT_SECONDARY_CTA : undefined,
      };
    case 'discontinued':
      return { status: SUCCESS_ENDED_BODY, cta: SUCCESS_ENDED_CTA };
    case 'notCarried':
      return { status: SUCCESS_NOT_CARRIED_BODY, cta: SUCCESS_NOT_CARRIED_CTA };
    case 'restockArriving':
      return { status: restockBody(answer.lchDay), cta: SUCCESS_RESTOCKING_CTA };
    case 'franchiseUndeterminable':
      return { status: PARTIAL_FRANCHISE_BODY, cta: PARTIAL_FRANCHISE_CTA };
  }
}

export const RECENT_SEARCHES_LABEL = 'Recent';

// Owner-exception §B47 (explicit): no Bible slot — en draft of the ko draft above.
export const RECENT_VIEWS_LABEL = 'Recently viewed';

// ── Shopping list (owner-exception §B47, explicit) ───────────────────────────────────────────
export const ADD_TO_CART_BUTTON = 'Add';
export const CART_ADDED_NOTICE = 'Added to your list';
export const CART_TITLE = 'Shopping list';
export const CART_EMPTY_NOTE = 'Nothing here yet. Press Add on an answer card.';
export const CART_SNAPSHOT_NOTE =
  'Saved info from when you added it. Check again for today’s stock.';
export const CART_CLOSE = 'Close';
export const CART_QTY_DECREASE = 'Decrease quantity';
export const CART_QTY_INCREASE = 'Increase quantity';
export const CART_REMOVE_BUTTON = 'Remove';
export function cartLinkLabel(count: number, total: number): string {
  return `List ${count} · ${formatPrice(total, 'en')}`;
}
export function cartTotalLabel(total: number): string {
  return `Total ${formatPrice(total, 'en')}`;
}
export function cartQtyText(qty: number): string {
  return `${qty}`;
}
export function cartCheckLabel(name: string): string {
  return `Include ${name} in total`;
}
export function cartOtherStoresLabel(count: number): string {
  return `Lists in ${count} other stores`;
}

export const RESULTS_NOTICE = 'These are search results. Scanning is more accurate.';

export const SCAN_AIM_GUIDE = `Fill the frame with the square code next to '계산바코드'.`;
export const SCAN_AIM_GUIDE_TOKEN = `'계산바코드'`;

// splitAimGuide is locale-free shared logic — imported from ui/copy, never mirrored here.
export const SCAN_PERMISSION_DENIED = 'Camera unavailable. Please search by product name.';
export const SCAN_UNSUPPORTED = 'This browser cannot scan barcodes. Please search by product name.';
export const SCAN_FAILED = 'Cannot scan right now. Please search by product name.';
export const SCAN_HINT = 'If the barcode will not read, please search by product name.';

export function scanEmptyBody(value: string): string {
  return `No product registered for barcode '${value}'. Please search by product name.`;
}

type NonDefaultUiState = Exclude<UiState, { state: 'default' }>;

// Mirrors copy.announcementFor's structure with English pieces (same order contract:
// status → price/location → freshness → CTA). The ko path in copy.ts stays byte-identical;
// this is the English twin, tested in strings.test.ts.
export function announcementForEn(
  ui: NonDefaultUiState,
  policy: DataOwnerPolicy,
  nowMs: number,
): string[] {
  switch (ui.state) {
    case 'loading':
      return ui.slow ? [LOADING_CARD_COPY, LOADING_DELAY_LINE] : [LOADING_CARD_COPY];
    case 'empty':
      return [ui.origin === 'scan' ? scanEmptyBody(ui.query) : emptyBody(ui.query)];
    case 'candidates':
      return [];
    case 'error': {
      if (ui.variant === 'noCache') return [ERROR_NO_CACHE_BODY, RETRY_BUTTON];
      const facts = factsFor(ui.answer);
      const line = priceLocationLine(ui.answer);
      const relative = cachedFreshnessCaption(formatRelativeTimeEn(ui.freshness.observedAt, nowMs));
      return [ERROR_CACHED_BANNER, facts.status, ...(line ? [line] : []), relative, RETRY_BUTTON];
    }
    case 'success': {
      const { answer } = ui;
      const facts = factsFor(answer);
      const line = priceLocationLine(ui.answer);
      const freshnessCap =
        answer.kind === 'inStock' && answer.qtyUpperBound <= policy.lowQtyCutoff
          ? lowQtyCaption(answer.qtyUpperBound)
          : LIVE_FRESHNESS_CAPTION;
      // Same §B40 rule as ko: inStock announces no CTA (its button was removed as a dead stub).
      const cta = answer.kind === 'inStock' ? [] : [facts.cta];
      return [facts.status, ...(line ? [line] : []), freshnessCap, ...cta];
    }
    case 'partial': {
      const { answer, freshness, trigger } = ui;
      if (trigger === 'franchise') return [PARTIAL_FRANCHISE_BODY, PARTIAL_FRANCHISE_CTA];
      if (trigger === 'locationMissing') {
        if (answer.kind !== 'inStock') return [];
        return [
          partialLocationMissingConfirmed(answer.price),
          PARTIAL_NO_LOCATION_NOTE,
          PARTIAL_NO_LOCATION_CTA,
        ];
      }
      const relative = freshness ? formatRelativeTimeEn(freshness.observedAt, nowMs) : '';
      return [partialStaleCacheBody(relative), PARTIAL_STALE_CACHE_CTA];
    }
  }
}

function priceLocationLine(answer: AvailabilityAnswer): string | undefined {
  if (answer.kind !== 'inStock') return undefined;
  const primary = answer.locations[0];
  if (!primary) return undefined;
  return `${formatPrice(answer.price, 'en')} · ${formatLocation(primary, 'en')}`;
}
