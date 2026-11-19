// src/i18n/strings.ts — per-locale copy tables. ko stays the Bible-verbatim source
// (ui/copy.ts, untouched); en is the first-draft mirror (./en). Locale-free helpers
// (priceLocationLine, splitAimGuide, formatters) are shared, never mirrored — only
// TEXT-bearing exports belong here, enforced by the key-parity test (strings.test.ts).
//
// The added ten languages are built by create-copy-table.ts from a text dictionary.
// CopyTable is DERIVED from en (string literals widened), so a new key added to en fails
// compilation in every locale table until it is translated; Record<Locale, CopyTable>
// fails compilation when a language is forgotten in the registry.
import type { DataOwnerPolicy } from '../domain/policy';
import type { AvailabilityAnswer, UiState } from '../domain/types';
import * as ko from '../ui/copy';
import { formatLocation, formatPrice, formatRelativeTime } from '../ui/format';
import type * as en from './en';
import type { Locale } from './locale';

type EnTable = typeof en;
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : T[K] };

export type CopyTable = Widen<Omit<EnTable, 'announcementForEn'>>;

// Only ko (Bible SSOT, the default) stays in the entry chunk. The other eleven tables load on
// demand: inlining all 12 languages cost ~94 kB raw / ~30 kB gzip and broke the bundle budget
// (§B52). A language becomes selectable only after its table is in memory, so no component ever
// renders a half-loaded table — see setLocale in ui/store.ts and the boot gate in main.tsx.
const tables = new Map<Locale, CopyTable>([['ko', ko]]);

const LOADERS: Record<Exclude<Locale, 'ko'>, () => Promise<CopyTable>> = {
  en: () => import('./en').then((m) => m),
  'zh-CN': () => import('./zh-CN').then((m) => m.zhCN),
  'zh-TW': () => import('./zh-TW').then((m) => m.zhTW),
  ja: () => import('./ja').then((m) => m.ja),
  th: () => import('./th').then((m) => m.th),
  mn: () => import('./mn').then((m) => m.mn),
  ru: () => import('./ru').then((m) => m.ru),
  vi: () => import('./vi').then((m) => m.vi),
  id: () => import('./id').then((m) => m.id),
  es: () => import('./es').then((m) => m.es),
  fr: () => import('./fr').then((m) => m.fr),
};

export function isLocaleLoaded(locale: Locale): boolean {
  return tables.has(locale);
}

// Resolves once the table is in memory. The module system caches the chunk, so concurrent calls
// share one fetch. A rejection is the caller's to handle (boot falls back to the resident Korean
// table; setLocale keeps the current language) — strings() never throws.
export async function loadLocaleTable(locale: Locale): Promise<void> {
  if (locale === 'ko') return;
  if (tables.has(locale)) return;
  tables.set(locale, await LOADERS[locale]());
}

// Synchronous by contract: every caller renders the current locale immediately. An unloaded
// table falls back to the resident Korean table — reachable only if a load failed or a test
// skipped the preload, never in the normal switch path (setLocale awaits first).
export function strings(locale: Locale): CopyTable {
  return tables.get(locale) ?? tables.get('en') ?? ko;
}

type NonDefaultUiState = Exclude<UiState, { state: 'default' }>;

// Ordered per Interface §6: status line first, then price·location, then the freshness stamp,
// then the CTA. Same order contract as ko/en; used for every non-ko locale (en included —
// its output stays identical to announcementForEn).
export function announcementForLocale(
  locale: Locale,
  ui: NonDefaultUiState,
  policy: DataOwnerPolicy,
  nowMs: number,
): string[] {
  const S = strings(locale);
  const relTime = (at: number) => formatRelativeTime(locale, at, nowMs);
  switch (ui.state) {
    case 'loading':
      return ui.slow ? [S.LOADING_CARD_COPY, S.LOADING_DELAY_LINE] : [S.LOADING_CARD_COPY];
    case 'empty':
      return [ui.origin === 'scan' ? S.scanEmptyBody(ui.query) : S.emptyBody(ui.query)];
    case 'candidates':
      // Unreachable: AnswerCard never renders candidates, so no announcement copy is needed.
      return [];
    case 'error': {
      if (ui.variant === 'noCache') return [S.ERROR_NO_CACHE_BODY, S.RETRY_BUTTON];
      const facts = S.factsFor(ui.answer);
      const line = localPriceLine(S, ui.answer, locale);
      const relative = S.cachedFreshnessCaption(relTime(ui.freshness.observedAt));
      return [
        S.ERROR_CACHED_BANNER,
        facts.status,
        ...(line ? [line] : []),
        relative,
        S.RETRY_BUTTON,
      ];
    }
    case 'success': {
      const { answer } = ui;
      const facts = S.factsFor(answer);
      const line = localPriceLine(S, answer, locale);
      const freshnessCap =
        answer.kind === 'inStock' && answer.qtyUpperBound <= policy.lowQtyCutoff
          ? S.lowQtyCaption(answer.qtyUpperBound)
          : S.LIVE_FRESHNESS_CAPTION;
      return [facts.status, ...(line ? [line] : []), freshnessCap, facts.cta];
    }
    case 'partial': {
      const { answer, freshness, trigger } = ui;
      if (trigger === 'franchise') return [S.PARTIAL_FRANCHISE_BODY, S.PARTIAL_FRANCHISE_CTA];
      if (trigger === 'locationMissing') {
        if (answer.kind !== 'inStock') return [];
        return [
          S.partialLocationMissingConfirmed(answer.price),
          S.PARTIAL_NO_LOCATION_NOTE,
          S.PARTIAL_NO_LOCATION_CTA,
        ];
      }
      const relative = freshness ? relTime(freshness.observedAt) : '';
      return [S.partialStaleCacheBody(relative), S.PARTIAL_STALE_CACHE_CTA];
    }
  }
}

// priceLocationLine in ui/copy.ts defaults to ko; this one is locale-explicit for every
// added language. It is text-free (digits are match tokens), so it lives here rather than
// being duplicated into all ten dictionaries.
function localPriceLine(
  _S: CopyTable,
  answer: AvailabilityAnswer,
  locale: Locale,
): string | undefined {
  if (answer.kind !== 'inStock') return undefined;
  const primary = answer.locations[0];
  if (!primary) return undefined;
  return `${formatPrice(answer.price, locale)} · ${formatLocation(primary, locale)}`;
}
