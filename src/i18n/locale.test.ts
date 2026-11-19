import {
  LOCALES,
  LOCALE_NAMES,
  isLocale,
  loadLocale,
  matchDeviceLocale,
  resolveLocale,
  saveLocale,
} from './locale';

test('exactly 12 locales ship, each with a self-naming label', () => {
  expect(LOCALES).toHaveLength(12);
  expect(new Set(LOCALES).size).toBe(12);
  for (const locale of LOCALES) {
    expect(LOCALE_NAMES[locale].trim()).not.toBe('');
  }
});

test('resolveLocale prefers an explicit valid ?lang= over everything', () => {
  expect(resolveLocale({ search: '?lang=en', stored: 'ko', navigatorLanguage: 'ko-KR' })).toBe(
    'en',
  );
  expect(resolveLocale({ search: '?lang=ko', stored: 'en', navigatorLanguage: 'en-US' })).toBe(
    'ko',
  );
  expect(resolveLocale({ search: '?lang=ja', stored: 'ko', navigatorLanguage: 'en-US' })).toBe(
    'ja',
  );
});

test('resolveLocale accepts every shipped locale through ?lang=', () => {
  for (const locale of LOCALES) {
    expect(
      resolveLocale({
        search: `?lang=${encodeURIComponent(locale)}`,
        stored: null,
        navigatorLanguage: undefined,
      }),
    ).toBe(locale);
  }
});

test('resolveLocale ignores an invalid ?lang= and falls through', () => {
  expect(resolveLocale({ search: '?lang=xx', stored: null, navigatorLanguage: 'en-US' })).toBe(
    'en',
  );
  expect(resolveLocale({ search: '?lang=xx', stored: 'en', navigatorLanguage: 'ko-KR' })).toBe(
    'en',
  );
});

test('resolveLocale falls back stored -> device -> en', () => {
  expect(resolveLocale({ search: '', stored: 'en', navigatorLanguage: 'ko-KR' })).toBe('en');
  expect(resolveLocale({ search: '', stored: 'fr', navigatorLanguage: 'ko-KR' })).toBe('fr');
  expect(resolveLocale({ search: '', stored: null, navigatorLanguage: 'en-US' })).toBe('en');
  expect(resolveLocale({ search: '', stored: null, navigatorLanguage: 'en-GB' })).toBe('en');
  expect(resolveLocale({ search: '', stored: null, navigatorLanguage: 'ko-KR' })).toBe('ko');
  expect(resolveLocale({ search: '', stored: null, navigatorLanguage: undefined })).toBe('en');
  expect(resolveLocale({ search: '', stored: 'xx', navigatorLanguage: undefined })).toBe('en');
});

test('unsupported device languages fall back to English, never Korean', () => {
  expect(matchDeviceLocale('de-DE')).toBeNull();
  expect(matchDeviceLocale('pt-BR')).toBeNull();
  expect(resolveLocale({ search: '', stored: null, navigatorLanguage: 'de-DE' })).toBe('en');
});

test('matchDeviceLocale maps plain and regional tags', () => {
  expect(matchDeviceLocale('ko')).toBe('ko');
  expect(matchDeviceLocale('ko-KR')).toBe('ko');
  expect(matchDeviceLocale('en')).toBe('en');
  expect(matchDeviceLocale('ja-JP')).toBe('ja');
  expect(matchDeviceLocale('th-TH')).toBe('th');
  expect(matchDeviceLocale('mn-MN')).toBe('mn');
  expect(matchDeviceLocale('ru-RU')).toBe('ru');
  expect(matchDeviceLocale('vi-VN')).toBe('vi');
  expect(matchDeviceLocale('es-419')).toBe('es');
  expect(matchDeviceLocale('fr-CA')).toBe('fr');
  expect(matchDeviceLocale(undefined)).toBeNull();
  expect(matchDeviceLocale('')).toBeNull();
});

test('matchDeviceLocale splits Chinese by script and region', () => {
  expect(matchDeviceLocale('zh')).toBe('zh-CN');
  expect(matchDeviceLocale('zh-CN')).toBe('zh-CN');
  expect(matchDeviceLocale('zh-Hans')).toBe('zh-CN');
  expect(matchDeviceLocale('zh-Hans-CN')).toBe('zh-CN');
  expect(matchDeviceLocale('zh-SG')).toBe('zh-CN');
  expect(matchDeviceLocale('zh-TW')).toBe('zh-TW');
  expect(matchDeviceLocale('zh-Hant')).toBe('zh-TW');
  expect(matchDeviceLocale('zh-Hant-TW')).toBe('zh-TW');
  expect(matchDeviceLocale('zh-HK')).toBe('zh-TW');
  expect(matchDeviceLocale('zh-MO')).toBe('zh-TW');
});

test('matchDeviceLocale accepts the legacy Indonesian tag', () => {
  expect(matchDeviceLocale('id-ID')).toBe('id');
  expect(matchDeviceLocale('in')).toBe('id');
  expect(matchDeviceLocale('in-ID')).toBe('id');
});

test('matchDeviceLocale is case-insensitive', () => {
  expect(matchDeviceLocale('ZH-HANT-TW')).toBe('zh-TW');
  expect(matchDeviceLocale('JA-jp')).toBe('ja');
  expect(matchDeviceLocale('FR')).toBe('fr');
});

test('locale storage round-trips valid choices and degrades on anything else', () => {
  localStorage.clear();
  expect(loadLocale()).toBeNull();
  saveLocale('zh-TW');
  expect(loadLocale()).toBe('zh-TW');
  localStorage.setItem('daiso.locale', 'xx');
  expect(loadLocale()).toBeNull();
  for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
  expect(isLocale('xx')).toBe(false);
  expect(isLocale(undefined)).toBe(false);
  expect(isLocale(42)).toBe(false);
});
