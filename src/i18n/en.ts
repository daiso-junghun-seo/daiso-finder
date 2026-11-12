// src/i18n/en.ts — English guidance strings. Korean product/store names, prices,
// and image alts NEVER translate (D069 match tokens) — only the surrounding guidance
// does. Floors/zones translate GRAMMAR only (11F · No. 56, digits identical) per owner
// order §B46 — signage risk recorded there, not hidden here. First-draft app copy;
// Bible ratification may reword through the same verbatim-replace path as the ko drafts. Completeness against
// copy.ts is compiler-checked (CopyTable in ./strings) plus a runtime key test.
import type { DataOwnerPolicy } from '../domain/policy';
import type {
  AvailabilityAnswer,
  SimilarAlternative,
  StoreLocation,
  UiState,
} from '../domain/types';
import { formatDistance, formatLocation, formatPrice, formatRelativeTimeEn } from '../ui/format';

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
export const CART_SHARE_BUTTON = 'Share';
export const CART_EXPORT_BUTTON = 'Export';
export const CART_IMPORT_BUTTON = 'Import';
export const CART_IMPORT_LABEL = 'Paste exported text';
export const CART_IMPORT_CONFIRM = 'Load';
export const CART_COPIED = 'Copied';
export const CART_COPY_FAILED = 'Could not copy. Select the text below by hand.';
export const CART_SHARE_TEXT_LABEL = 'Text to share';
export const CART_EXPORT_TEXT_LABEL = 'Exported text';
export const CART_IMPORT_FAILED = 'Could not load it. Check the copied text.';
export const CART_UNCHECKED_MARK = '(excluded)';
export function cartImportDoneLabel(count: number): string {
  return `Loaded ${count} items`;
}
export function cartImportCrossStoreLabel(count: number): string {
  return `Loaded ${count} items. Shelf locations from the other store were cleared.`;
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

// ── Flow 2 In-Store Navigation ──────────────────────────────────────────────────────────────
// English twins of the ko drafts in copy.ts (D068/D069). Match tokens stay Korean.
export const NAV_BACK_LABEL = 'Back';
export const NAV_LOCATION_LABEL = 'Location';
export const NAV_MISSING_LINK = 'Can’t find it';
export const NAV_PHOTO_MISSING_NOTE = 'No product photo. Please confirm by name and price.';
export const NAV_RECOVERY_STILL_BODY =
  'Our data says it is still in stock. If it is not on the shelf, please ask staff.';
export const NAV_SOLD_OUT_BODY = 'Just checked again — it is now out of stock.';

export function navigationMultiHeading(count: number): string {
  return count === 2 ? 'It is in two places' : `It is in ${count} places`;
}

export function navigationRecoveryOther(location: StoreLocation): string {
  return `It is also at ${formatLocation(location, 'en')}.`;
}

export function navigationStaleBody(relativeTime: string): string {
  return `Could not check today’s stock — it was in stock ${relativeTime}.`;
}

export function navigationFreshnessCaption(observedAtMs: number, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - observedAtMs) / 60_000));
  if (minutes < 1) return 'Just checked';
  if (minutes < 60) return `Checked ${minutes} min ago`;
  return `Checked ${formatRelativeTimeEn(observedAtMs, nowMs)}`;
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
      // Flow 2 restored 위치 보기 as a wired control, so its CTA is announced again (§B40).
      return [facts.status, ...(line ? [line] : []), freshnessCap, facts.cta];
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

// ── Flow 3 Alternative Discovery (Interface/alternative-discovery.md §4, en twins) ─────────────
export const ALT_BACK_LABEL = 'Back';
export const ALT_REASON_TEMPORARILY_OUT = 'It is out of stock right now';
export const ALT_REASON_DISCONTINUED = 'This product has been discontinued';
export const ALT_REASON_NOT_CARRIED = 'This store does not carry this product';
export const ALT_REASON_FRANCHISE = 'This is a franchise store, so stock cannot be checked';
export const ALT_REASON_FLOW2 = 'Not found on the shelf';
export const ALT_SIMILAR_HEADING = 'Similar items in this store';
export const ALT_NEARBY_HEADING = 'Nearby stores that have this item';
export const ALT_LOADING_BOTH = 'Checking similar items and nearby store stock…';
export const ALT_LOADING_SIMILAR = 'Checking similar items…';
export const ALT_LOADING_NEARBY = 'Checking nearby store stock…';
export const ALT_SIMILAR_EMPTY = 'No similar items in this store.';
export const ALT_NEARBY_EMPTY = 'No nearby store has it in stock.';
export const ALT_SIMILAR_FAILED = 'Could not check similar items. Please try again.';
export const ALT_NEARBY_FAILED = 'Could not check nearby store stock. Please try again.';
export const ALT_SLOT_RETRY = 'Try again';
export const ALT_EMPTY_BOTH = 'We could not find it in this store or in nearby stores.';
export const ALT_EMPTY_MALL = 'You can order it from Daisomall.';
export const ALT_EMPTY_RESEARCH = 'Try searching with a different name.';
export const ALT_EMPTY_STAFF = 'Please ask a staff member.';
export const ALT_ERROR_BODY = 'Could not load alternatives.';
export const ALT_ERROR_RETRY = 'Try again';
export const ALT_ERROR_STAFF = 'Please ask a staff member.';
export const ALT_STORE_CARD_IN_STOCK = 'In stock';
export const ALT_STORE_CARD_CLOSED = 'Closed today';

export function altLoadingLine(issued: { similar: boolean; nearby: boolean }): string {
  if (issued.similar && issued.nearby) return ALT_LOADING_BOTH;
  return issued.similar ? ALT_LOADING_SIMILAR : ALT_LOADING_NEARBY;
}

export function altStaleBody(relativeTime: string): string {
  return `Today's stock could not be checked — as of ${relativeTime}.`;
}

export function altSimilarRowLabel(row: SimilarAlternative, policy: DataOwnerPolicy): string {
  const location = row.locations[0];
  const base = `${row.productName} · ${formatPrice(row.price, 'en')}${location ? ` · ${formatLocation(location, 'en')}` : ''}`;
  return row.qtyUpperBound <= policy.lowQtyCutoff
    ? `${base} · ${lowQtyCaption(row.qtyUpperBound)}`
    : base;
}

export function altNearbyRowLabel(
  strNm: string,
  distanceM: number,
  closingTime: string,
  closedToday: boolean,
): string {
  const hours = closedToday ? ALT_STORE_CARD_CLOSED : altClosingLabel(closingTime);
  return hours
    ? `${strNm} · ${formatDistance(distanceM)} · ${hours} · ${ALT_STORE_CARD_IN_STOCK}`
    : `${strNm} · ${formatDistance(distanceM)} · ${ALT_STORE_CARD_IN_STOCK}`;
}

export function altStoreCardHeading(strNm: string, distanceM: number): string {
  return `${strNm} has it · ${formatDistance(distanceM)}`;
}

export function altClosingLabel(closingTime: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(closingTime.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  const period = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `Open until ${hour12} ${period}`;
}

export function altMapLinkLabel(address: string): string {
  return `${address} — open in maps`;
}
