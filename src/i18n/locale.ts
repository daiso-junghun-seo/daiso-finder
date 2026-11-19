// src/i18n/locale.ts — locale resolution + persistence.
// Match tokens (product/store names, prices, floors/zones) never translate (D069) —
// this module only decides WHICH guidance language renders, never what the data says.
export const LOCALES = [
  'ko',
  'en',
  'zh-CN',
  'zh-TW',
  'ja',
  'th',
  'mn',
  'ru',
  'vi',
  'id',
  'es',
  'fr',
] as const;

export type Locale = (typeof LOCALES)[number];

// Each language names itself — the picker is usable even when the current UI language is
// unreadable to the shopper.
export const LOCALE_NAMES: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  'zh-CN': '中文（简体）',
  'zh-TW': '中文（繁體）',
  ja: '日本語',
  th: 'ไทย',
  mn: 'Монгол',
  ru: 'Русский',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  es: 'Español',
  fr: 'Français',
};

const KEY = 'daiso.locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

// Device tags arrive as BCP-47 (`zh-Hant-TW`, `en-US`, legacy `in-ID`). Matching is prefix
// based on purpose: a regional variant still reads that language. Chinese needs the script
// split because `zh` alone does not say Simplified or Traditional.
export function matchDeviceLocale(tag: string | undefined): Locale | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if (lower.startsWith('zh')) {
    return /(hant|tw|hk|mo)/.test(lower) ? 'zh-TW' : 'zh-CN';
  }
  if (lower === 'ko' || lower.startsWith('ko-')) return 'ko';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  if (lower === 'ja' || lower.startsWith('ja-')) return 'ja';
  if (lower === 'th' || lower.startsWith('th-')) return 'th';
  if (lower === 'mn' || lower.startsWith('mn-')) return 'mn';
  if (lower === 'ru' || lower.startsWith('ru-')) return 'ru';
  if (lower === 'vi' || lower.startsWith('vi-')) return 'vi';
  // `id` is the current Indonesian tag; `in` is the legacy one still emitted by older browsers.
  if (lower === 'id' || lower.startsWith('id-') || lower === 'in' || lower.startsWith('in-')) {
    return 'id';
  }
  if (lower === 'es' || lower.startsWith('es-')) return 'es';
  if (lower === 'fr' || lower.startsWith('fr-')) return 'fr';
  return null;
}

// Precedence: explicit ?lang= > stored choice > device language > en. An invalid ?lang=
// is ignored (falls through), never an error state — a shared link must not break the app.
// Unsupported device languages fall back to English (the app-wide second language), not ko:
// a Japanese shopper with a mis-tagged device must still see guidance they can read.
export function resolveLocale(input: {
  search: string;
  stored: unknown;
  navigatorLanguage: string | undefined;
}): Locale {
  const param = new URLSearchParams(input.search).get('lang');
  if (isLocale(param)) return param;
  if (isLocale(input.stored)) return input.stored;
  return matchDeviceLocale(input.navigatorLanguage) ?? 'en';
}

export function loadLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(KEY);
    return isLocale(raw) ? raw : null; // corrupt/foreign values degrade to "no choice"
  } catch {
    return null; // blocked storage never blocks the surface (G3 pattern)
  }
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    // best-effort only — the in-memory choice still applies this session
  }
}
