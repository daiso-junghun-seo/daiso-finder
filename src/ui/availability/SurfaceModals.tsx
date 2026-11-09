// src/ui/availability/SurfaceModals.tsx
import type { ReactNode } from 'react';
import type { ScannerPort } from '../../domain/ports';
import type { Locale } from '../../i18n/locale';
import type { CartItem, StoreCart } from '../../infra/cart';
import { CartSheet } from '../components/CartSheet';
import { ScannerOverlay } from '../components/ScannerOverlay';

// Modal siblings of .surface-content, in one place so the DOM order (and therefore stacking) cannot
// drift: store sheet, viewfinder, cart sheet. Scrim first, dialog last; the cart sheet is last because
// it is the most recently opened overlay.
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
          <ScannerOverlay
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
          <CartSheet
            cart={cart}
            otherStoreCount={otherStoreCount}
            locale={locale}
            onClose={onCloseCart}
            onSetQty={onSetQty}
            onToggle={onToggle}
            onRemove={onRemove}
            onRecheck={onRecheck}
            onImportJson={onImportJson}
          />
        </>
      )}
    </>
  );
}
