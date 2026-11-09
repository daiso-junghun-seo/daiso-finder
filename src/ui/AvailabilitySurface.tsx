// src/ui/AvailabilitySurface.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createGeolocation, createScanner, createStoreDirectory } from '../adapters/composition';
import { defaultPolicy } from '../domain/policy';
import type { ProductCandidate, StoreContext } from '../domain/types';
import { strings } from '../i18n/strings';
import type { RecentView } from '../infra/recent-views';
import { LiveRegion } from './a11y/LiveRegion';
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
import { StoreSelectionSheet } from './components/StoreSelectionSheet';
import { announcementFor } from './copy';
import { useAvailabilityStore } from './store';

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

  let body: ReactNode;
  if (ui.state === 'default') {
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
        />
        {body}
        {ui.state !== 'candidates' && cartLink}
        {ui.state !== 'candidates' && cartNoticeRegion}
        {searchBar}
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
