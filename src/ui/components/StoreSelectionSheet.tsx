// src/ui/components/StoreSelectionSheet.tsx
// D082 store selection (Interface §4 "Store selection (매장 변경)"): the Store Context is user-owned.
// GPS only RECOMMENDS (orders the nearby list); tapping a row is the only way a store is set.
// No location → the Bible note + the search field takes focus. First run (current === null) hides 닫기:
// a Store Context must exist before Flow 1 can query.
import { useEffect, useRef, useState } from 'react';
import type { GeolocationPort, StoreDirectoryPort } from '../../domain/ports';
import type { StoreContext } from '../../domain/types';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import { GlassSurface } from './GlassSurface';

export function StoreSelectionSheet({
  current,
  locale,
  directory,
  geolocation,
  onSelect,
  onClose,
}: {
  current: StoreContext | null;
  locale: Locale;
  directory: StoreDirectoryPort;
  geolocation: GeolocationPort;
  onSelect: (store: StoreContext) => void;
  onClose?: () => void;
}) {
  const S = strings(locale);
  const [nearby, setNearby] = useState<Array<StoreContext & { distanceM: number }> | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StoreContext[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  // Modal dialogs must receive focus on open (Interface §6). The search field takes it in BOTH
  // paths — it is always rendered, and the Bible's no-location behavior is a subset of this.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Escape dismisses like 닫기 — but never on first run (onClose undefined): a Store Context must
  // exist before the sheet may close. Registered at document level so Escape still works when focus
  // has drifted outside the dialog (P6-4); this replaces the old section-scoped onKeyDown.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return; // IME composition Escape cancels the composition, not the sheet
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    geolocation
      .getNearbyStores()
      .then((stores) => {
        if (cancelled) return;
        setNearby(stores);
        if (stores.length === 0) searchRef.current?.focus();
      })
      .catch(() => {
        if (cancelled) return;
        setNearby([]);
        searchRef.current?.focus();
      });
    return () => {
      cancelled = true;
    };
  }, [geolocation]);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    directory
      .searchStores(q)
      .then((stores) => {
        if (!cancelled) setResults(stores);
      })
      .catch(() => {
        // Directory failure degrades like the geolocation path: clear the list, keep typing usable.
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query, directory]);

  const searching = query.trim().length > 0;

  return (
    <GlassSurface className="store-selection-sheet">
      <section role="dialog" aria-modal="true" aria-labelledby="store-select-title">
        <div className="sheet-grabber" aria-hidden="true" />
        <div className="store-selection-sheet__header">
          <h2 id="store-select-title" className="text-heading">
            {S.STORE_SELECT_TITLE}
          </h2>
          {onClose && (
            <button type="button" className="text-label" onClick={onClose}>
              {S.STORE_SELECT_CLOSE}
            </button>
          )}
        </div>
        <input
          ref={searchRef}
          aria-label={S.STORE_SELECT_SEARCH_PLACEHOLDER}
          placeholder={S.STORE_SELECT_SEARCH_PLACEHOLDER}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {searching ? (
          <ul className="store-selection-sheet__results">
            {results.map((store) => (
              <li key={store.strCd}>
                <button type="button" className="text-body" onClick={() => onSelect(store)}>
                  {store.strNm}
                </button>
              </li>
            ))}
          </ul>
        ) : nearby === null ? null : nearby.length > 0 ? (
          <div className="store-selection-sheet__nearby-group">
            <p className="text-caption">{S.STORE_SELECT_NEARBY_HEADER}</p>
            <ul className="store-selection-sheet__nearby">
              {nearby.map((store) => (
                <li key={store.strCd}>
                  <button
                    type="button"
                    className="text-body"
                    aria-current={current?.strCd === store.strCd ? 'true' : undefined}
                    onClick={() => onSelect({ strCd: store.strCd, strNm: store.strNm })}
                  >
                    {S.nearbyStoreRowLabel(store.strNm, store.distanceM)}
                    {current?.strCd === store.strCd && <span aria-hidden="true"> ✓</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-body">{S.STORE_SELECT_NO_LOCATION_NOTE}</p>
        )}
      </section>
    </GlassSurface>
  );
}
