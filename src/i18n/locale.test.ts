import { type Locale, isLocale, loadLocale, resolveLocale, saveLocale } from './locale';

test('resolveLocale prefers an explicit valid ?lang= over everything', () => {
  expect(resolveLocale({ search: '?lang=en', stored: 'ko', navigatorLanguage: 'ko-KR' })).toBe(
    'en',
  );
  expect(resolveLocale({ search: '?lang=ko', stored: 'en', navigatorLanguage: 'en-US' })).toBe(
    'ko',
  );
});

test('resolveLocale ignores an invalid ?lang= and falls through', () => {
  expect(resolveLocale({ search: '?lang=xx', stored: null, navigatorLanguage: 'en-US' })).toBe(
    'en',
  );
  expect(resolveLocale({ search: '?lang=xx', stored: 'en', navigatorLanguage: 'ko-KR' })).toBe(
    'en',
  );
});

test('resolveLocale falls back stored -> device -> ko', () => {
  expect(resolveLocale({ search: '', stored: 'en', navigatorLanguage: 'ko-KR' })).toBe('en');
  expect(resolveLocale({ search: '', stored: null, navigatorLanguage: 'en-US' })).toBe('en');
  expect(resolveLocale({ search: '', stored: null, navigatorLanguage: 'en-GB' })).toBe('en');
  expect(resolveLocale({ search: '', stored: null, navigatorLanguage: 'ko-KR' })).toBe('ko');
  expect(resolveLocale({ search: '', stored: null, navigatorLanguage: undefined })).toBe('ko');
  expect(resolveLocale({ search: '', stored: 'xx', navigatorLanguage: undefined })).toBe('ko');
});

test('locale storage round-trips valid choices and degrades on anything else', () => {
  localStorage.clear();
  expect(loadLocale()).toBeNull();
  saveLocale('en' as Locale);
  expect(loadLocale()).toBe('en');
  localStorage.setItem('daiso.locale', 'xx');
  expect(loadLocale()).toBeNull();
  expect(isLocale('ko') && isLocale('en')).toBe(true);
  expect(isLocale('xx')).toBe(false);
});
