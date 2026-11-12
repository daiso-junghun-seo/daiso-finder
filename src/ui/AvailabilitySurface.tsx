// src/ui/AvailabilitySurface.tsx
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType, ReactNode, Ref } from 'react';
import {
  createGeolocation,
  createScanner,
  createStoreDirectory,
  currentDevAltScenario,
} from '../adapters/composition';
import { defaultPolicy } from '../domain/policy';
import type { ProductCandidate, StoreContext } from '../domain/types';
import type { Locale } from '../i18n/locale';
import { strings } from '../i18n/strings';
import type { RecentView } from '../infra/recent-views';
import { LiveRegion } from './a11y/LiveRegion';
import type { AlternativeSurfaceProps } from './alternative/AlternativeSurface';
import { alternativeCache } from './alternative/alternative-cache';
import {
  alternativeEntryFromNavigation,
  alternativeEntryOf,
  devForceNearby,
} from './alternative/alternative-entry';
import type { AlternativeEntry } from './alternative/alternative-types';
import { altReasonLabel } from './alternative/alternative-types';
import { AnswerBody } from './availability/AnswerBody';
import { CandidatesBody } from './availability/CandidatesBody';
import { DefaultBody } from './availability/DefaultBody';
import { SearchBar } from './availability/SearchBar';
import { StoreContextBar } from './availability/StoreContextBar';
import { SurfaceModals } from './availability/SurfaceModals';
import {
  type SubmittedQuery,
  planStoreSwitch,
  pricedAnswerOf,
  runByPdNo,
  runByScan,
  runQuery,
} from './availability/pipelines';
import { runScenario } from './availability/scenario';
import { useCartController } from './availability/useCart';
import { GlassSurface } from './components/GlassSurface';
import { StoreSelectionSheet } from './components/StoreSelectionSheet';
import { altLoadingLine, announcementFor } from './copy';
import { NavigationSurface } from './navigation/NavigationSurface';
import { navigationEntryOf, parseDevAgeMinutes } from './navigation/navigation-entry';
import type { NavigationEntry } from './navigation/navigation-refresh';
import { useAvailabilityStore } from './store';

// Flow 3 is a cold path (spec §1, §B50-11 budget exception): the surface and its query, cache and
// DEV fixtures travel in a lazily imported chunk so the entry bundle keeps room for the flows every
// shopper uses. A wired CTA warms the same module graph below, so the tap renders without a network
// round trip in practice while the entry chunk stays inside budget.
//
// The rejection path mirrors main.tsx's diagnostics rule: this Suspense has no error boundary above
// it, so a rejected chunk import must never throw during render and unmount the root. The catch
// swaps in a stand-in that says, truthfully, that alternatives could not be loaded.
const loadAlternativeSurface = () => import('./alternative/AlternativeSurface');
const AlternativeSurface = lazy<ComponentType<AlternativeSurfaceProps>>(() =>
  loadAlternativeSurface()
    .then((module) => ({ default: module.AlternativeSurface }))
    .catch(() => ({ default: AlternativeUnavailable })),
);

// Store directory + geolocation for the D082 sheet: the composition root selects the live /api adapters
// in prod builds and the mocks in dev/test. GPS only recommends nearby stores (A9) — it never sets the store.
const storeDirectory = createStoreDirectory();
const browserGeolocation = createGeolocation();
// Barcode scanner for the 바코드 스캔 entry: the composition root selects the real camera adapter in
// prod, the no-camera mock in dev/test. Module scope keeps its identity stable across renders — the
// overlay's scan effect depends on it, so a per-render instance would restart the camera.
const scanner = createScanner();

export function AvailabilitySurface() {
  const ui = useAvailabilityStore((s) => s.ui);
  const dispatch = useAvailabilityStore((s) => s.dispatch);
  const store = useAvailabilityStore((s) => s.store);
  const sheetOpen = useAvailabilityStore((s) => s.sheetOpen);
  const openSheet = useAvailabilityStore((s) => s.openSheet);
  const closeSheet = useAvailabilityStore((s) => s.closeSheet);
  const selectStore = useAvailabilityStore((s) => s.selectStore);
  const recentSearches = useAvailabilityStore((s) => s.recentSearches);
  const recordSearch = useAvailabilityStore((s) => s.recordSearch);
  const recentViews = useAvailabilityStore((s) => s.recentViews);
  const scannerOpen = useAvailabilityStore((s) => s.scannerOpen);
  const openScanner = useAvailabilityStore((s) => s.openScanner);
  const closeScanner = useAvailabilityStore((s) => s.closeScanner);
  const locale = useAvailabilityStore((s) => s.locale);
  const setLocale = useAvailabilityStore((s) => s.setLocale);
  const S = strings(locale);
  const [input, setInput] = useState('');
  const changeStoreRef = useRef<HTMLButtonElement>(null);
  const cartButtonRef = useRef<HTMLButtonElement>(null);
  const answerCardRef = useRef<HTMLDivElement>(null);
  const scanButtonRef = useRef<HTMLButtonElement>(null);
  // Flow 2 is UI-shell state over the answer (not a seventh UiState): the guidance card is built
  // from data in hand at tap time, so a store switch or any new lookup simply drops it.
  const [navigation, setNavigation] = useState<NavigationEntry | null>(null);
  const navigateButtonRef = useRef<HTMLButtonElement>(null);
  const wasNavigating = useRef(false);
  // Flow 3 is UI-shell state stacked over Flow 2 / the answer (D076, §B50-1). It owns its own
  // overlays internally; the parent routes the header back by depth and hides Flow 2 underneath
  // instead of unmounting it, so back returns to the exact guidance state (and exit CTA) it left.
  const [alternative, setAlternative] = useState<AlternativeEntry | null>(null);
  const [altDepth, setAltDepth] = useState<1 | 2>(1);
  const [altBackSignal, setAltBackSignal] = useState(0);
  const alternativesButtonRef = useRef<HTMLButtonElement>(null);
  const exitButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const altOrigin = useRef<'flow1' | 'flow2' | null>(null);
  const wasAlternative = useRef(false);
  const researchPending = useRef(false);
  // Last submitted lookup (UI-shell memory, not domain): kept across store switches so the
  // product survives them. Overwritten by every new submit/tap/decode; never cleared (a switch
  // with no prior lookup simply finds nothing to keep — see planStoreSwitch).
  const lastSubmit = useRef<SubmittedQuery | null>(null);
  const wasSheetOpen = useRef(sheetOpen);
  const wasScannerOpen = useRef(scannerOpen);

  const cart = useCartController({ store, ui, lastSubmit, locale, dispatch });
  const wasCartOpen = useRef(cart.cartOpen);

  useEffect(() => {
    // The ?scenario= harness drives the Playwright state sweep against the MOCK pipeline. It must never
    // run in a production build: a crafted URL could otherwise paint a fabricated answer over live data,
    // violating the read-only/no-fabrication boundary (F4). DEV is true under vitest and the dev server.
    if (!import.meta.env.DEV) return;
    const scenario = new URLSearchParams(window.location.search).get('scenario');
    if (!scenario) return;
    void runScenario(scenario, dispatch);
  }, [dispatch]);

  // Modal close (닫기 / Escape / store select) returns focus to the 매장 변경 opener — never body
  // (Interface §6 focus order). After a first-run select the button mounts on the same commit.
  useEffect(() => {
    if (wasSheetOpen.current && !sheetOpen) changeStoreRef.current?.focus();
    wasSheetOpen.current = sheetOpen;
  }, [sheetOpen]);

  // Closing the scanner (닫기 / Escape / a decode) returns focus to its opener — never <body>.
  useEffect(() => {
    if (wasScannerOpen.current && !scannerOpen) scanButtonRef.current?.focus();
    wasScannerOpen.current = scannerOpen;
  }, [scannerOpen]);

  // Closing the cart sheet returns focus to the 장바구니 opener — never <body> (sheet contract).
  useEffect(() => {
    if (wasCartOpen.current && !cart.cartOpen) cartButtonRef.current?.focus();
    wasCartOpen.current = cart.cartOpen;
  }, [cart.cartOpen]);

  // Any state change away from Success invalidates the Flow 2 handoff: a new lookup, a store change
  // (CHANGE_STORE lands Default), or an error drops the card instead of showing guidance for a
  // question the shopper has already left. Flow 3 has the same rule for every state that cannot
  // carry it (its entry is built from a negative Success/Partial answer).
  useEffect(() => {
    if (ui.state !== 'success') setNavigation(null);
    if (ui.state !== 'success' && ui.state !== 'partial') setAlternative(null);
  }, [ui.state]);

  // Back returns focus to the 위치 보기 CTA that opened the flow — never <body>.
  useEffect(() => {
    if (wasNavigating.current && navigation === null) navigateButtonRef.current?.focus();
    wasNavigating.current = navigation !== null;
  }, [navigation]);

  // Back from the Flow 3 list returns focus to the CTA that opened it: 대안 보기 on the answer card
  // when Flow 1 sent the shopper, the Flow 2 exit button when Flow 2 did (that surface stays mounted
  // underneath, so the button is still there).
  useEffect(() => {
    if (wasAlternative.current && alternative === null) {
      if (altOrigin.current === 'flow2') exitButtonRef.current?.focus();
      else alternativesButtonRef.current?.focus();
      altOrigin.current = null;
    }
    wasAlternative.current = alternative !== null;
  }, [alternative]);

  // The Empty ladder's re-search handoff: Flow 1 comes back with the term filled and the input
  // focused — never auto-submitted (the same failure would only repeat).
  useEffect(() => {
    if (alternative !== null || !researchPending.current) return;
    researchPending.current = false;
    searchInputRef.current?.focus();
  }, [alternative]);

  // Warm the Flow 3 chunk only where an exit can actually lead there: a negative Success answer that
  // promises alternatives, or Flow 2 (one resume can turn its guidance into the sold-out exit). A
  // rejected warm-up stays silent — the tap itself retries the import and owns the visible outcome.
  const alternativeCtaAvailable =
    (ui.state === 'success' &&
      (ui.answer.kind === 'temporarilyOut' || ui.answer.kind === 'discontinued')) ||
    navigation !== null;
  useEffect(() => {
    if (alternativeCtaAvailable) void loadAlternativeSurface().catch(() => {});
  }, [alternativeCtaAvailable]);

  // Memoised on purpose: ScannerOverlay's scan effect has deps [scanner, onDecoded], so a fresh inline
  // arrow on every parent render would abort the in-flight scan and restart the camera each time the
  // surface re-renders. Its deps are all stable (zustand actions and the selected store).
  const handleDecoded = useCallback(
    (value: string) => {
      closeScanner(); // the camera stops on unmount; the answer takes the surface from here
      if (!store) return; // unreachable: the scan button only exists once a store is chosen (D082)
      lastSubmit.current = { kind: 'scan', value };
      void runByScan(store, value, dispatch);
    },
    [store, dispatch, closeScanner],
  );

  // Store switch that keeps the product: the reducer still lands Default (D082 context swap),
  // then the retained lookup re-runs under the new store — scans and candidate taps keep exact
  // pdNo identity (runByScan/runByPdNo), typed keywords go search-first. No recent-search bump
  // (not a new submit).
  // The plan reads the PRE-switch ui: selectStore resets to Default first, so planning after
  // it would always find nothing to keep.
  const handleSelectStore = (next: StoreContext) => {
    // Flow 3's whole-answer cache is store-scoped by key, but the stack is not: drop both explicitly
    // (§3) so a switch never leaves yesterday's alternatives over today's store.
    alternativeCache.clear();
    setAlternative(null);
    setNavigation(null);
    const keep = planStoreSwitch(ui, lastSubmit.current);
    selectStore(next);
    if (!keep) return;
    if (keep.kind === 'scan') void runByScan(next, keep.value, dispatch);
    else if (keep.kind === 'candidate') void runByPdNo(next, keep.candidate, dispatch);
    else void runQuery(next, keep.keyword, dispatch);
  };

  // Typed submit and recent-search taps share this: trim/guard, bump recency, retain the lookup,
  // then run search-first. A blank submit is a no-op, exactly as before.
  const submitKeyword = (raw: string) => {
    if (!store) return;
    const keyword = raw.trim();
    if (!keyword) return;
    recordSearch(keyword);
    lastSubmit.current = { kind: 'typed', keyword };
    void runQuery(store, keyword, dispatch);
  };

  const handleRecentSearch = (keyword: string) => {
    setInput(keyword);
    submitKeyword(keyword);
  };

  // Recent-view rows: exact pdNo identity when the view resolved one (runByPdNo); otherwise the
  // typed keyword goes search-first — the same two paths a fresh submit takes.
  const handleRecentView = (view: RecentView) => {
    if (!store) return;
    if (view.pdNo && view.price !== undefined) {
      const candidate = {
        pdNo: view.pdNo,
        name: view.name,
        price: view.price,
        imageUrl: view.imageUrl,
      };
      lastSubmit.current = { kind: 'candidate', candidate };
      void runByPdNo(store, candidate, dispatch);
    } else {
      setInput(view.query);
      recordSearch(view.query);
      lastSubmit.current = { kind: 'typed', keyword: view.query };
      void runQuery(store, view.query, dispatch);
    }
  };

  const handleCandidateSelect = (candidate: ProductCandidate) => {
    if (!store) return;
    lastSubmit.current = { kind: 'candidate', candidate };
    void runByPdNo(store, candidate, dispatch);
  };

  const handleRetry = (query: string) => {
    if (!store) return;
    void runQuery(store, query, dispatch);
    // The retry button unmounts on the Loading swap — move focus to the persistent card
    // surface so it never falls to <body> (decision 6).
    answerCardRef.current?.focus();
  };

  // Flow 2 entry: build the handoff from the answer already on screen. No request is awaited; the
  // dev-only ?navAge= harness can age the observation stamp for the stale-caption sweep.
  const handleNavigate = () => {
    const entry = navigationEntryOf({
      ui,
      store,
      last: lastSubmit.current,
      nowMs: Date.now(),
      devAgeMinutes: import.meta.env.DEV ? parseDevAgeMinutes(window.location.search) : null,
    });
    if (entry) setNavigation(entry);
  };

  // 위치 보기 is offered only under the flow's entry contract (Success + inStock + ≥1 position).
  const navigable =
    ui.state === 'success' && ui.answer.kind === 'inStock' && ui.answer.locations.length > 0;

  // Flow 3 entry (D076): built from data in hand, never fetched. `?alt=` widens the withheld nearby
  // branch for the DEV/E2E sweep only — a production build ignores it.
  const openAlternative = (entry: AlternativeEntry | null, origin: 'flow1' | 'flow2') => {
    if (!entry) return;
    altOrigin.current = origin;
    setAltDepth(1);
    setAltBackSignal(0);
    setAlternative(entry);
  };

  const handleSeeAlternatives = () => {
    if (!store) return;
    const built = alternativeEntryOf({ ui, store, last: lastSubmit.current });
    const scenario = import.meta.env.DEV ? currentDevAltScenario() : null;
    openAlternative(built ? devForceNearby(built, scenario) : null, 'flow1');
  };

  const handleSeeAlternativesFromNavigation = () => {
    if (!navigation) return;
    openAlternative(alternativeEntryFromNavigation({ navigation }), 'flow2');
  };

  // Empty ladder → Flow 1 with the original term in the input, focused, not submitted.
  const handleResearch = (term: string) => {
    researchPending.current = true;
    setAlternative(null);
    setNavigation(null);
    setInput(term);
  };

  const sheet = (
    <StoreSelectionSheet
      current={store}
      locale={locale}
      directory={storeDirectory}
      geolocation={browserGeolocation}
      onSelect={handleSelectStore}
      onClose={store ? closeSheet : undefined}
    />
  );

  // First run (D082): no Store Context yet — the store-selection surface leads; Flow 1 cannot query
  // without a store, so neither the store line nor the search bar renders.
  if (store === null) {
    return <main>{sheet}</main>;
  }

  // D083: the bottom search/scan bar is a glass surface; the form inside is unchanged.
  const searchBar = (
    <SearchBar
      demoted={ui.state !== 'default'}
      value={input}
      onChange={setInput}
      onSubmit={() => submitKeyword(input)}
      onOpenScanner={openScanner}
      scanButtonRef={scanButtonRef}
      inputRef={searchInputRef}
      inputLabel={S.SEARCH_INPUT_LABEL}
      placeholder={S.SEARCH_PLACEHOLDER}
      scanLabel={S.SCAN_BUTTON_LABEL}
    />
  );

  // Modals render as siblings of .surface-content (see SurfaceModals): while one is open the
  // background is inert, and DOM order — not z-index — keeps the scrim and dialog above it.

  // One-line shortcut to the memo (§B47): a link, not content — hidden while every list is empty
  // so Default keeps its single primary action. The count/total label IS the add feedback (I4):
  // it updates on the same commit as the snapshot write, and the notice below announces it.
  const cartLink = cart.showCartLink && (
    <button
      ref={cartButtonRef}
      type="button"
      className="text-body cart-link"
      onClick={cart.openCart}
    >
      {S.cartLinkLabel(cart.activeCartCount, cart.activeCartTotal)}
    </button>
  );
  const cartNoticeRegion = cart.cartNotice && (
    <LiveRegion key={cart.cartNotice.id} message={cart.cartNotice.text} visuallyHidden />
  );

  // While a modal (sheet, scanner, or cart) is open the background is inert (aria-modal made real):
  // unreachable by keyboard and hidden from AT. First run renders the sheet alone, so no container
  // exists to mark.
  const backgroundInert = sheetOpen || scannerOpen || cart.cartOpen ? '' : undefined;

  const alternativeSurface = alternative && (
    <Suspense fallback={<AlternativeLoading entry={alternative} locale={locale} />}>
      <AlternativeSurface
        key={`${alternative.store.strCd}:${alternative.pdNo ?? alternative.keyword}:${alternative.origin}`}
        entry={alternative}
        locale={locale}
        backSignal={altBackSignal}
        onDepthChange={setAltDepth}
        onResearch={handleResearch}
      />
    </Suspense>
  );

  let body: ReactNode;
  if (navigation) {
    // Flow 2 stays mounted (hidden) while Flow 3 sits on top: back restores the exact guidance
    // state and its exit CTA, and neither surface re-queries on the round trip.
    body = (
      <>
        <NavigationSurface
          entry={navigation}
          locale={locale}
          hidden={alternative !== null}
          onSeeAlternatives={handleSeeAlternativesFromNavigation}
          exitButtonRef={exitButtonRef}
        />
        {alternativeSurface}
      </>
    );
  } else if (alternative) {
    body = alternativeSurface;
  } else if (ui.state === 'default') {
    body = (
      <DefaultBody
        locale={locale}
        recentSearches={recentSearches}
        recentViews={recentViews}
        onSearch={handleRecentSearch}
        onView={handleRecentView}
      />
    );
  } else if (ui.state === 'candidates') {
    // Pre-answer literal candidates (search-first): rendered BEFORE the answer-card branch below — a
    // candidate list is not an AvailabilityAnswer, so AnswerCard never mounts for it (Interface §copy-table
    // AI-low; honesty — candidate rows never show availability, only after a tap via runByPdNo).
    body = (
      <CandidatesBody candidates={ui.candidates} locale={locale} onSelect={handleCandidateSelect} />
    );
  } else {
    const nowMs = Date.now();
    const announcement = announcementFor(ui, defaultPolicy, nowMs, locale).join('. ');
    // 담기 exists only for priced answers (§B47) — priceless kinds render no button at all.
    const priced = pricedAnswerOf(ui);
    // 대안 보기 is wired only where the negative answer promises it (temporarilyOut, discontinued);
    // 미취급·가맹점 keep their inert stub until their nearby branch can be answered (§B50-2, D5).
    const seeAlternatives =
      ui.state === 'success' &&
      (ui.answer.kind === 'temporarilyOut' || ui.answer.kind === 'discontinued')
        ? handleSeeAlternatives
        : undefined;
    body = (
      <AnswerBody
        ui={ui}
        announcement={announcement}
        locale={locale}
        nowMs={nowMs}
        cardRef={answerCardRef}
        onScan={openScanner}
        onAdd={priced ? cart.addToCart : undefined}
        onRetry={() => handleRetry(ui.query)}
        onNavigate={navigable ? handleNavigate : undefined}
        navigateButtonRef={navigateButtonRef}
        onSeeAlternatives={seeAlternatives}
        alternativesButtonRef={alternativesButtonRef}
      />
    );
  }

  return (
    <main>
      <div className="surface-content" inert={backgroundInert}>
        <StoreContextBar
          store={store}
          locale={locale}
          onSelectLocale={setLocale}
          onChangeStore={openSheet}
          changeButtonRef={changeStoreRef}
          onBack={
            alternative
              ? altDepth === 2
                ? () => setAltBackSignal((signal) => signal + 1)
                : () => setAlternative(null)
              : navigation
                ? () => setNavigation(null)
                : undefined
          }
        />
        {body}
        {!navigation && !alternative && ui.state !== 'candidates' && cartLink}
        {!navigation && !alternative && ui.state !== 'candidates' && cartNoticeRegion}
        {!navigation && !alternative && searchBar}
      </div>
      <SurfaceModals
        sheetOpen={sheetOpen}
        sheet={sheet}
        scannerOpen={scannerOpen}
        scanner={scanner}
        locale={locale}
        onDecoded={handleDecoded}
        onCloseScanner={closeScanner}
        cartOpen={cart.cartOpen}
        cart={cart.activeCart}
        otherStoreCount={cart.otherStoreCount}
        onCloseCart={cart.closeCart}
        onSetQty={cart.setQty}
        onToggle={cart.toggleChecked}
        onRemove={cart.removeItem}
        onRecheck={cart.recheckItem}
        onImportJson={cart.importJson}
      />
    </main>
  );
}

// ── Flow 3's lazy-load stand-ins ─────────────────────────────────────────────────────────────────
// The chunk is warm in practice (the CTA preloads it), but a cold or failed import still has to
// leave a whole card. Both stand-ins reuse the surface's context header and skeleton classes, take
// focus where the real surface does, and announce through the same live region.

type AlternativeStandInProps = Pick<AlternativeSurfaceProps, 'entry' | 'locale'>;

function AlternativeContext({
  entry,
  locale,
  contextRef,
}: {
  entry: AlternativeEntry;
  locale: Locale;
  contextRef: Ref<HTMLElement>;
}) {
  const S = strings(locale);
  return (
    <header
      className="alternative-context"
      ref={contextRef}
      tabIndex={-1}
      aria-labelledby="alt-context-name alt-context-reason"
    >
      <p id="alt-context-name" className="text-heading alt-context-name">
        {entry.productName}
      </p>
      <p id="alt-context-reason" className="text-body alt-context-reason">
        {altReasonLabel(entry.reason, S)}
      </p>
    </header>
  );
}

function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <div className="alt-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        // The index is the row's only identity — the block is decorative.
        // biome-ignore lint/suspicious/noArrayIndexKey: decorative rows have no identity
        <div key={index} className="alt-skeleton-row">
          <div className="skeleton-block alt-skeleton-photo" />
          <div className="alt-skeleton-lines">
            <div className="skeleton-block skeleton-line" />
            <div className="skeleton-block skeleton-line skeleton-line--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AlternativeLoading({ entry, locale }: AlternativeStandInProps) {
  const contextRef = useRef<HTMLElement>(null);
  const line = altLoadingLine(entry.issued);
  useEffect(() => {
    contextRef.current?.focus();
  }, []);
  return (
    <GlassSurface className="answer-card alternative-surface">
      <LiveRegion message={line} visuallyHidden />
      <div className="alternative-body">
        <AlternativeContext entry={entry} locale={locale} contextRef={contextRef} />
        <p className="text-body alt-loading">{line}</p>
        <LoadingSkeleton rows={3} />
      </div>
    </GlassSurface>
  );
}

function AlternativeUnavailable({ entry, locale }: AlternativeStandInProps) {
  const S = strings(locale);
  const contextRef = useRef<HTMLElement>(null);
  useEffect(() => {
    contextRef.current?.focus();
  }, []);
  return (
    <GlassSurface className="answer-card alternative-surface">
      <LiveRegion message={S.ALT_ERROR_BODY} visuallyHidden />
      <div className="alternative-body">
        <AlternativeContext entry={entry} locale={locale} contextRef={contextRef} />
        <div className="alt-state">
          <p className="text-body error-banner">
            <span aria-hidden="true">⚠ </span>
            {S.ALT_ERROR_BODY}
          </p>
          <button
            type="button"
            className="text-label cta--primary"
            onClick={() => window.location.reload()}
          >
            {S.ALT_ERROR_RETRY}
          </button>
          <p className="text-body alt-state-note">{S.ALT_ERROR_STAFF}</p>
        </div>
      </div>
    </GlassSurface>
  );
}
