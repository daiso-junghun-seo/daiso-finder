// src/ui/availability/DefaultBody.tsx
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import type { RecentView } from '../../infra/recent-views';
import { formatPrice } from '../format';

// Default state body: the purpose statement, recent searches, and recently resolved products.
// A row is a shortcut to a lookup, never an availability claim (D061).
export function DefaultBody({
  locale,
  recentSearches,
  recentViews,
  onSearch,
  onView,
}: {
  locale: Locale;
  recentSearches: string[];
  recentViews: RecentView[];
  onSearch: (keyword: string) => void;
  onView: (view: RecentView) => void;
}) {
  const S = strings(locale);
  return (
    <>
      <h1>{S.DEFAULT_HEADLINE}</h1>
      <p className="text-caption">{S.DEFAULT_SUBHEAD}</p>
      {recentSearches.length > 0 && (
        <div className="recent-searches">
          <p className="text-caption">{S.RECENT_SEARCHES_LABEL}</p>
          <ul>
            {recentSearches.map((keyword) => (
              <li key={keyword}>
                <button type="button" className="text-body" onClick={() => onSearch(keyword)}>
                  {keyword}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Owner-exception §B47: resolved products, most-recent-first. Dual class reuses the
          recent-searches rhythm (no new CSS); rows re-run the lookup, never show availability
          (a row is a shortcut, not an answer — D061). */}
      {recentViews.length > 0 && (
        <div className="recent-searches recent-views">
          <p className="text-caption">{S.RECENT_VIEWS_LABEL}</p>
          <ul>
            {recentViews.map((view) => (
              <li key={view.key}>
                <button type="button" className="text-body" onClick={() => onView(view)}>
                  {view.name}
                  {view.price !== undefined && ` · ${formatPrice(view.price, locale)}`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
