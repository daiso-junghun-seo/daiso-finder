// src/ui/availability/SurfaceModals.tsx
import type { ReactNode } from 'react';
import type { ScannerPort } from '../../domain/ports';
import type { StoreContext } from '../../domain/types';
import type { Locale } from '../../i18n/locale';
import type { CartItem, StoreCart } from '../../infra/cart';
import type { CartMatchResult } from '../cart-match';
import { CartSheetLoader } from '../components/CartSheetLoader';
import { InstallGuideSheet } from '../components/InstallGuideSheet';
import { ScannerOverlayLoader } from '../components/ScannerOverlayLoader';

// Modal siblings of .surface-content, in one place so the DOM order (and therefore stacking) cannot
// drift: store sheet, viewfinder, cart sheet, install guide. Scrim first, dialog last; the cart and
// install sheets are last because they are the most recently opened overlays.
export function SurfaceModals({
  sheetOpen,
  sheet,
  scannerOpen,
  scanner,
  locale,
  onDecoded,
  onCloseScanner,
  cartOpen,
  cart,
  otherStoreCount,
  onCloseCart,
  onSetQty,
  onToggle,
  onRemove,
  onRecheck,
  onImportJson,
  onShopAt,
  installGuideOpen,
  onCloseInstallGuide,
}: {
  sheetOpen: boolean;
  sheet: ReactNode;
  scannerOpen: boolean;
  scanner: ScannerPort;
  locale: Locale;
  onDecoded: (value: string) => void;
  onCloseScanner: () => void;
  cartOpen: boolean;
  cart: StoreCart | null;
  otherStoreCount: number;
  onCloseCart: () => void;
  onSetQty: (id: string, qty: number) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onRecheck: (item: CartItem) => void;
  onImportJson: (text: string) => { ok: boolean; count: number; crossStore: boolean };
  onShopAt: (store: StoreContext, result: CartMatchResult) => void;
  installGuideOpen: boolean;
  onCloseInstallGuide: () => void;
}) {
  return (
    <>
      {sheetOpen && (
        <>
          <div className="sheet-scrim" aria-hidden="true" />
          {sheet}
        </>
      )}
      {scannerOpen && (
        <>
          <div className="sheet-scrim" aria-hidden="true" />
          <ScannerOverlayLoader
            scanner={scanner}
            locale={locale}
            onDecoded={onDecoded}
            onClose={onCloseScanner}
          />
        </>
      )}
      {cartOpen && (
        <>
          <div className="sheet-scrim" aria-hidden="true" />
          <CartSheetLoader
            cart={cart}
            otherStoreCount={otherStoreCount}
            locale={locale}
            onClose={onCloseCart}
            onSetQty={onSetQty}
            onToggle={onToggle}
            onRemove={onRemove}
            onRecheck={onRecheck}
            onImportJson={onImportJson}
            onShopAt={onShopAt}
          />
        </>
      )}
      {installGuideOpen && (
        <>
          <div className="sheet-scrim" aria-hidden="true" />
          <InstallGuideSheet locale={locale} onClose={onCloseInstallGuide} />
        </>
      )}
    </>
  );
}
