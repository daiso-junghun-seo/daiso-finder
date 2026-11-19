// src/ui/components/CartMatchPanel.tsx — owner decision §B52: the explicit "check nearby stock"
// step inside the shopping list. It never runs on open, never switches stores by itself, and
// reports unknown rows separately from missing rows. Lives in the lazy cart chunk.
import { useEffect, useRef, useState } from 'react';
import type { StoreContext } from '../../domain/types';
import type { Locale } from '../../i18n/locale';
import { strings } from '../../i18n/strings';
import type { CartItem } from '../../infra/cart';
import {
  CART_MATCH_MAX_ITEMS,
  type CartMatchDeps,
  type CartMatchResult,
  type CartStoreMatch,
  createCartMatchDeps,
  matchCart,
} from '../cart-match';
import { formatDistance } from '../format';

type MatchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; result: CartMatchResult }
  | { status: 'failed' };

export function CartMatchPanel({
  store,
  items,
  locale,
  onShopAt,
  deps,
}: {
  store: StoreContext;
  items: CartItem[];
  locale: Locale;
  onShopAt?: (store: StoreContext, result: CartMatchResult) => void;
  deps?: CartMatchDeps;
}) {
  const S = strings(locale);
  const [state, setState] = useState<MatchState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const checked = items.filter((item) => item.checked);
  // Toggling/removing a row invalidates the verdict: reset and abort rather than show a result
  // that describes a list the shopper no longer has.
  const checkedKey = checked.map((item) => item.id).join('|');
  const lastCheckedKey = useRef(checkedKey);

  useEffect(() => {
    if (lastCheckedKey.current === checkedKey) return;
    lastCheckedKey.current = checkedKey;
    controller.current?.abort();
    setState({ status: 'idle' });
  }, [checkedKey]);

  useEffect(() => () => controller.current?.abort(), []);

  const run = async () => {
    if (checked.length === 0) return;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setState({ status: 'loading' });
    try {
      const result = await matchCart({
        activeStore: store,
        items: checked,
        deps: deps ?? createCartMatchDeps(),
        signal: next.signal,
      });
      if (next.signal.aborted) return;
      setState({ status: 'done', result });
    } catch {
      if (next.signal.aborted) return;
      setState({ status: 'failed' });
    }
  };

  const done = state.status === 'done' ? state.result : null;
  const full = done?.fullMatch ?? null;
  const partials = done ? done.stores.filter((entry) => !entry.full && entry.matchedCount > 0) : [];
  // With a full match, the only partial worth showing is the current store (the shopper may
  // prefer to stay and buy most of the list). Without one, show up to three Plan B stores.
  const shownPartials = full ? partials.filter((entry) => entry.active) : partials.slice(0, 3);

  return (
    <section className="cart-match" aria-label={S.CART_MATCH_BUTTON}>
      <p className="text-caption">{S.CART_MATCH_HINT}</p>
      <button
        type="button"
        className="text-label cta--primary cart-match__button"
        onClick={run}
        disabled={checked.length === 0 || state.status === 'loading'}
      >
        {state.status === 'done' ? S.RETRY_BUTTON : S.CART_MATCH_BUTTON}
      </button>
      {checked.length === 0 && <p className="text-caption">{S.CART_MATCH_NONE_CHECKED}</p>}
      {checked.length > CART_MATCH_MAX_ITEMS && (
        <p className="text-caption">{S.cartMatchLimitNote(CART_MATCH_MAX_ITEMS)}</p>
      )}

      {state.status === 'loading' && (
        <output className="text-caption cart-match__status">{S.CART_MATCH_LOADING}</output>
      )}
      {state.status === 'failed' && (
        <output className="text-caption cart-match__status">{S.ALT_NEARBY_FAILED}</output>
      )}

      {done && (
        <output className="cart-match__result">
          {done.nearbyUnavailable && (
            <p className="text-caption">{S.CART_MATCH_NEARBY_UNAVAILABLE}</p>
          )}
          {full ? (
            <>
              <p className="text-label">{S.CART_MATCH_FULL_TITLE}</p>
              <StoreMatchRow match={full} locale={locale} onShopAt={onShopAt} result={done} />
            </>
          ) : (
            <p className="text-caption">{S.CART_MATCH_NO_FULL}</p>
          )}
          {shownPartials.length > 0 && (
            <>
              <p className="text-label">{S.CART_MATCH_PARTIAL_TITLE}</p>
              <div className="cart-match__list">
                {shownPartials.map((entry) => (
                  <StoreMatchRow
                    key={entry.store.strCd}
                    match={entry}
                    locale={locale}
                    onShopAt={onShopAt}
                    result={done}
                  />
                ))}
              </div>
            </>
          )}
          {done.checkedCount > done.evaluatedCount && (
            <p className="text-caption">{S.cartMatchLimitNote(CART_MATCH_MAX_ITEMS)}</p>
          )}
        </output>
      )}
    </section>
  );
}

function StoreMatchRow({
  match,
  locale,
  onShopAt,
  result,
}: {
  match: CartStoreMatch;
  locale: Locale;
  onShopAt?: (store: StoreContext, result: CartMatchResult) => void;
  result: CartMatchResult;
}) {
  const S = strings(locale);
  const missing = match.items.filter((item) => item.available === false).map((item) => item.name);
  const unknown = match.items.filter((item) => item.available === null).map((item) => item.name);
  return (
    <div className={`cart-match__store${match.full ? ' cart-match__store--full' : ''}`}>
      <p className="text-body cart-match__store-head">
        <span>{match.active ? S.CART_MATCH_CURRENT_STORE : match.store.strNm}</span>
        {!match.active && match.store.distanceM !== undefined && (
          <span className="text-caption">{formatDistance(match.store.distanceM)}</span>
        )}
        <span className="text-label cart-match__coverage">
          {S.cartMatchCoverage(match.matchedCount, match.totalCount)}
        </span>
      </p>
      {missing.length > 0 && (
        <p className="text-caption">{S.cartMatchMissingLabel(missing.join(', '))}</p>
      )}
      {unknown.length > 0 && (
        <p className="text-caption">{S.cartMatchUnknownLabel(unknown.join(', '))}</p>
      )}
      {match.full && match.active ? (
        <p className="text-caption">{S.CART_MATCH_ALREADY_HERE}</p>
      ) : (
        !match.active &&
        onShopAt && (
          <button
            type="button"
            className="text-label cart-match__switch"
            aria-label={S.cartMatchSwitchLabel(match.store.strNm)}
            // Only identity crosses the seam: distance is match metadata, not store context.
            onClick={() => onShopAt({ strCd: match.store.strCd, strNm: match.store.strNm }, result)}
          >
            {S.CART_MATCH_SWITCH}
          </button>
        )
      )}
    </div>
  );
}
