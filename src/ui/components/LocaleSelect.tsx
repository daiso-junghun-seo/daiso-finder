// src/ui/components/LocaleSelect.tsx — the 12-language guidance picker.
// A native select keeps the platform picker (wheel on iOS, list on Android) and the
// accessible label contract; each option names its own language so the control stays
// usable when the current UI language is unreadable. Fixed inline size + ellipsis stop
// the control from resizing the store line when the selection changes (CLS).
import { LOCALES, LOCALE_NAMES, type Locale, isLocale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';

export function LocaleSelect({
  locale,
  onSelect,
  className,
}: {
  locale: Locale;
  onSelect: (locale: Locale) => void;
  className?: string;
}) {
  const S = strings(locale);
  return (
    <select
      className={className ? `locale-select ${className}` : 'locale-select'}
      aria-label={S.LOCALE_GROUP_LABEL}
      value={locale}
      onChange={(e) => {
        if (isLocale(e.target.value)) onSelect(e.target.value);
      }}
    >
      {LOCALES.map((value) => (
        <option key={value} value={value} lang={value}>
          {LOCALE_NAMES[value]}
        </option>
      ))}
    </select>
  );
}
