// src/i18n/strings.ts — per-locale copy tables. ko stays the Bible-verbatim source
// (ui/copy.ts, untouched); en is the first-draft mirror (./en). Locale-free helpers
// (priceLocationLine, splitAimGuide, formatters) are shared, never mirrored — only
// TEXT-bearing exports belong here, enforced by the key-parity test (strings.test.ts).
import type { AvailabilityAnswer } from '../domain/types';
import * as ko from '../ui/copy';
import * as en from './en';
import type { Locale } from './locale';

export interface CopyTable {
  readonly DEFAULT_HEADLINE: string;
  readonly DEFAULT_SUBHEAD: string;
  readonly SEARCH_PLACEHOLDER: string;
  readonly SCAN_BUTTON_LABEL: string;
  readonly STORE_CHANGE_BUTTON: string;
  readonly SEARCH_INPUT_LABEL: string;
  readonly LOCALE_TOGGLE_TO_EN: string;
  readonly LOCALE_TOGGLE_TO_KO: string;
  readonly LOADING_CARD_COPY: string;
  readonly LOADING_DELAY_LINE: string;
  readonly ERROR_CACHED_BANNER: string;
  readonly ERROR_NO_CACHE_BODY: string;
  readonly RETRY_BUTTON: string;
  readonly SUCCESS_IN_STOCK_STATUS: string;
  readonly SUCCESS_IN_STOCK_CTA: string;
  readonly LIVE_FRESHNESS_CAPTION: string;
  readonly SUCCESS_OUT_BODY: string;
  readonly SUCCESS_OUT_CTA: string;
  readonly SUCCESS_OUT_SECONDARY_CTA: string;
  readonly SUCCESS_ENDED_BODY: string;
  readonly SUCCESS_ENDED_CTA: string;
  readonly SUCCESS_NOT_CARRIED_BODY: string;
  readonly SUCCESS_NOT_CARRIED_CTA: string;
  readonly SUCCESS_RESTOCKING_CTA: string;
  readonly PARTIAL_FRANCHISE_BODY: string;
  readonly PARTIAL_FRANCHISE_CTA: string;
  readonly PARTIAL_NO_LOCATION_CTA: string;
  readonly PARTIAL_STALE_CACHE_CTA: string;
  readonly STORE_SELECT_TITLE: string;
  readonly STORE_SELECT_CLOSE: string;
  readonly STORE_SELECT_NEARBY_HEADER: string;
  readonly STORE_SELECT_SEARCH_PLACEHOLDER: string;
  readonly STORE_SELECT_NO_LOCATION_NOTE: string;
  readonly PARTIAL_NO_LOCATION_NOTE: string;
  readonly RECENT_SEARCHES_LABEL: string;
  readonly RESULTS_NOTICE: string;
  readonly SCAN_AIM_GUIDE: string;
  readonly SCAN_AIM_GUIDE_TOKEN: string;
  readonly SCAN_PERMISSION_DENIED: string;
  readonly SCAN_UNSUPPORTED: string;
  readonly SCAN_FAILED: string;
  readonly SCAN_HINT: string;
  nearbyStoreRowLabel(strNm: string, distanceM: number): string;
  storeLine(storeName: string): string;
  emptyBody(query: string): string;
  lowQtyCaption(qtyUpperBound: number): string;
  cachedFreshnessCaption(relativeTime: string): string;
  extraPositionsLabel(count: number): string;
  restockBody(lchDay: string): string;
  partialLocationMissingConfirmed(price: number): string;
  partialStaleCacheBody(relativeTime: string): string;
  factsFor(
    answer: AvailabilityAnswer,
    locale?: Locale,
  ): { status: string; cta: string; secondaryCta?: string };
  scanEmptyBody(value: string): string;
}

export const STR: Record<Locale, CopyTable> = { ko, en };

export function strings(locale: Locale): CopyTable {
  return STR[locale];
}
