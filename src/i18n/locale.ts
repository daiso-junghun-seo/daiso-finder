// src/i18n/locale.ts — locale resolution + persistence. ko default; en second.
// Match tokens (product/store names, prices, floors/zones) never translate (D069) —
// this module only decides WHICH guidance language renders, never what the data says.
export type Locale = 'ko' | 'en';

const KEY = 'daiso.locale';

export function isLocale(value: unknown): value is Locale {
  return value === 'ko' || value === 'en';
}

// Precedence: explicit ?lang= > stored choice > device language > ko. An invalid ?lang=
// is ignored (falls through), never an error state — a shared link must not break the app.
export function resolveLocale(input: {
  search: string;
  stored: unknown;
  navigatorLanguage: string | undefined;
}): Locale {
  const param = new URLSearchParams(input.search).get('lang');
  if (isLocale(param)) return param;
  if (isLocale(input.stored)) return input.stored;
  if (input.navigatorLanguage?.toLowerCase().startsWith('en')) return 'en';
  return 'ko';
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
