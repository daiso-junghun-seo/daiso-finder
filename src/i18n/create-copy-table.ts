// src/i18n/create-copy-table.ts — one implementation of the CopyTable functions, reused by
// every added locale. The ten new language files supply TEXT (constants) and TEMPLATES
// (sentences with {tokens}); the grammar, formatting and conditional branches live here once.
// This keeps 127 entries × 10 languages from becoming 1,270 lines of duplicated logic, while
// the compile-time key contract stays in strings.ts (CopyTable derived from en).
import type { SimilarAlternative, StoreLocation } from '../domain/types';
import {
  formatDistance,
  formatHour,
  formatLocation,
  formatPrice,
  formatRelativeTime,
} from '../ui/format';
import type { Locale } from './locale';
import type { CopyTable } from './strings';

type AnyFunction = (...args: never[]) => unknown;
type FunctionKey = {
  [K in keyof CopyTable]: CopyTable[K] extends AnyFunction ? K : never;
}[keyof CopyTable];

// Every non-function entry is a translated constant; functions are implemented below.
export type CopyTextKey = Exclude<keyof CopyTable, FunctionKey>;

// Sentence templates. {tokens} are filled by createCopyTable; a translator may reorder them
// freely (important for ja/mn/ru word order).
export interface CopyTemplates {
  readonly CART_LINK: string; // {count} {total}
  readonly CART_TOTAL: string; // {total}
  readonly CART_QTY: string; // {qty}
  readonly CART_CHECK: string; // {name}
  readonly CART_OTHER_STORES: string; // {count}
  readonly CART_IMPORT_DONE: string; // {count}
  readonly CART_IMPORT_CROSS_STORE: string; // {count}
  readonly CART_MATCH_COVERAGE: string; // {matched} {total}
  readonly CART_MATCH_STORE_ROW: string; // {store} {distance}
  readonly CART_MATCH_MISSING: string; // {items}
  readonly CART_MATCH_UNKNOWN: string; // {items}
  readonly CART_MATCH_SWITCH: string; // {store}
  readonly CART_MATCH_LIMIT: string; // {max}
  readonly NAVIGATION_MULTI_HEADING: string; // {count}
  readonly NAVIGATION_MULTI_HEADING_2: string;
  readonly NAVIGATION_RECOVERY_OTHER: string; // {location}
  readonly NAVIGATION_STALE_BODY: string; // {time}
  readonly NAVIGATION_MINUTES_AGO: string; // {minutes}
  readonly NAVIGATION_CHECKED_AT: string; // {time}
  readonly NEARBY_STORE_ROW: string; // {store} {distance}
  readonly STORE_LINE: string; // {store}
  readonly EMPTY_BODY: string; // {query}
  readonly LOW_QTY_CAPTION: string; // {n}
  readonly CACHED_FRESHNESS_CAPTION: string; // {time}
  readonly EXTRA_POSITIONS: string; // {count}
  readonly RESTOCK_BODY: string; // {date}
  readonly RESTOCK_BODY_NO_DATE: string;
  readonly PARTIAL_LOCATION_MISSING: string; // {price}
  readonly PARTIAL_STALE_BODY: string; // {time}
  readonly SCAN_EMPTY_BODY: string; // {value}
  readonly ALT_STALE_BODY: string; // {time}
  readonly ALT_LOW_QTY_INLINE: string; // {n} — inline suffix inside a row label
  readonly ALT_SIMILAR_ROW: string; // {name} {price} {location} {lowQty}
  readonly ALT_NEARBY_ROW: string; // {store} {distance} {inStock}
  readonly ALT_NEARBY_ROW_HOURS: string; // {store} {distance} {hours} {inStock}
  readonly ALT_STORE_CARD_HEADING: string; // {store} {distance}
  readonly ALT_CLOSING: string; // {time}
  readonly ALT_MAP_LINK: string; // {address}
}

export type CopyDict = Record<CopyTextKey, string>;

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function createCopyTable(locale: Locale, text: CopyDict, t: CopyTemplates): CopyTable {
  const price = (value: number) => formatPrice(value, locale);
  const location = (value: StoreLocation) => formatLocation(value, locale);

  const nearbyStoreRowLabel = (strNm: string, distanceM: number) =>
    fill(t.NEARBY_STORE_ROW, { store: strNm, distance: formatDistance(distanceM) });

  const storeLine = (storeName: string) => fill(t.STORE_LINE, { store: storeName });

  const emptyBody = (query: string) => fill(t.EMPTY_BODY, { query });

  const lowQtyCaption = (qtyUpperBound: number) => fill(t.LOW_QTY_CAPTION, { n: qtyUpperBound });

  const cachedFreshnessCaption = (relativeTime: string) =>
    fill(t.CACHED_FRESHNESS_CAPTION, { time: relativeTime });

  const extraPositionsLabel = (count: number) => fill(t.EXTRA_POSITIONS, { count });

  const restockBody = (lchDay: string) =>
    lchDay ? fill(t.RESTOCK_BODY, { date: lchDay }) : t.RESTOCK_BODY_NO_DATE;

  const partialLocationMissingConfirmed = (value: number) =>
    fill(t.PARTIAL_LOCATION_MISSING, { price: price(value) });

  const partialStaleCacheBody = (relativeTime: string) =>
    fill(t.PARTIAL_STALE_BODY, { time: relativeTime });

  const scanEmptyBody = (value: string) => fill(t.SCAN_EMPTY_BODY, { value });

  const navigationMultiHeading = (count: number) =>
    count === 2 ? t.NAVIGATION_MULTI_HEADING_2 : fill(t.NAVIGATION_MULTI_HEADING, { count });

  const navigationRecoveryOther = (at: StoreLocation) =>
    fill(t.NAVIGATION_RECOVERY_OTHER, { location: location(at) });

  const navigationStaleBody = (relativeTime: string) =>
    fill(t.NAVIGATION_STALE_BODY, { time: relativeTime });

  const navigationFreshnessCaption = (observedAtMs: number, nowMs: number) => {
    const minutes = Math.max(0, Math.floor((nowMs - observedAtMs) / 60_000));
    if (minutes < 1) return text.LIVE_FRESHNESS_CAPTION;
    if (minutes < 60) return fill(t.NAVIGATION_MINUTES_AGO, { minutes });
    return fill(t.NAVIGATION_CHECKED_AT, { time: formatRelativeTime(locale, observedAtMs, nowMs) });
  };

  const altLoadingLine = (issued: { similar: boolean; nearby: boolean }) => {
    if (issued.similar && issued.nearby) return text.ALT_LOADING_BOTH;
    return issued.similar ? text.ALT_LOADING_SIMILAR : text.ALT_LOADING_NEARBY;
  };

  const altStaleBody = (relativeTime: string) => fill(t.ALT_STALE_BODY, { time: relativeTime });

  const altSimilarRowLabel = (row: SimilarAlternative, policy: { lowQtyCutoff: number }) => {
    const primary = row.locations[0];
    const locationPart = primary ? ` · ${location(primary)}` : '';
    const lowQtyPart =
      row.qtyUpperBound <= policy.lowQtyCutoff
        ? ` · ${fill(t.ALT_LOW_QTY_INLINE, { n: row.qtyUpperBound })}`
        : '';
    return fill(t.ALT_SIMILAR_ROW, {
      name: row.productName,
      price: price(row.price),
      location: locationPart,
      lowQty: lowQtyPart,
    });
  };

  const altClosingLabel = (closingTime: string): string | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(closingTime.trim());
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
    return fill(t.ALT_CLOSING, { time: formatHour(locale, hour, minute) });
  };

  const altNearbyRowLabel = (
    strNm: string,
    distanceM: number,
    closingTime: string,
    closedToday: boolean,
  ) => {
    const hours = closedToday ? text.ALT_STORE_CARD_CLOSED : altClosingLabel(closingTime);
    const vars = {
      store: strNm,
      distance: formatDistance(distanceM),
      inStock: text.ALT_STORE_CARD_IN_STOCK,
    };
    return hours ? fill(t.ALT_NEARBY_ROW_HOURS, { ...vars, hours }) : fill(t.ALT_NEARBY_ROW, vars);
  };

  const altStoreCardHeading = (strNm: string, distanceM: number) =>
    fill(t.ALT_STORE_CARD_HEADING, { store: strNm, distance: formatDistance(distanceM) });

  const altMapLinkLabel = (address: string) => fill(t.ALT_MAP_LINK, { address });

  return {
    ...text,
    nearbyStoreRowLabel,
    storeLine,
    emptyBody,
    lowQtyCaption,
    cachedFreshnessCaption,
    extraPositionsLabel,
    restockBody,
    partialLocationMissingConfirmed,
    partialStaleCacheBody,
    scanEmptyBody,
    cartLinkLabel: (count, total) => fill(t.CART_LINK, { count, total: price(total) }),
    cartTotalLabel: (total) => fill(t.CART_TOTAL, { total: price(total) }),
    cartQtyText: (qty) => fill(t.CART_QTY, { qty }),
    cartCheckLabel: (name) => fill(t.CART_CHECK, { name }),
    cartOtherStoresLabel: (count) => fill(t.CART_OTHER_STORES, { count }),
    cartImportDoneLabel: (count) => fill(t.CART_IMPORT_DONE, { count }),
    cartImportCrossStoreLabel: (count) => fill(t.CART_IMPORT_CROSS_STORE, { count }),
    cartMatchCoverage: (matched, total) => fill(t.CART_MATCH_COVERAGE, { matched, total }),
    cartMatchStoreRow: (storeName, distanceM) =>
      fill(t.CART_MATCH_STORE_ROW, { store: storeName, distance: formatDistance(distanceM) }),
    cartMatchMissingLabel: (items) => fill(t.CART_MATCH_MISSING, { items }),
    cartMatchUnknownLabel: (items) => fill(t.CART_MATCH_UNKNOWN, { items }),
    cartMatchSwitchLabel: (storeName) => fill(t.CART_MATCH_SWITCH, { store: storeName }),
    cartMatchLimitNote: (max) => fill(t.CART_MATCH_LIMIT, { max }),
    navigationMultiHeading,
    navigationRecoveryOther,
    navigationStaleBody,
    navigationFreshnessCaption,
    factsFor: (answer) => {
      switch (answer.kind) {
        case 'inStock':
          return { status: text.SUCCESS_IN_STOCK_STATUS, cta: text.SUCCESS_IN_STOCK_CTA };
        case 'temporarilyOut':
          return {
            status: text.SUCCESS_OUT_BODY,
            cta: text.SUCCESS_OUT_CTA,
            secondaryCta: answer.restockOfferable ? text.SUCCESS_OUT_SECONDARY_CTA : undefined,
          };
        case 'discontinued':
          return { status: text.SUCCESS_ENDED_BODY, cta: text.SUCCESS_ENDED_CTA };
        case 'notCarried':
          return { status: text.SUCCESS_NOT_CARRIED_BODY, cta: text.SUCCESS_NOT_CARRIED_CTA };
        case 'restockArriving':
          return { status: restockBody(answer.lchDay), cta: text.SUCCESS_RESTOCKING_CTA };
        case 'franchiseUndeterminable':
          return { status: text.PARTIAL_FRANCHISE_BODY, cta: text.PARTIAL_FRANCHISE_CTA };
      }
    },
    altLoadingLine,
    altStaleBody,
    altSimilarRowLabel,
    altNearbyRowLabel,
    altStoreCardHeading,
    altClosingLabel,
    altMapLinkLabel,
  };
}
