// src/infra/cart.ts — owner-exception §B47 slice 2: the shopping-list memo.
// A cart is per-store, local-only, and NEVER an availability claim: every row carries the
// snapshot taken when it was added (price · location · our observation time) plus an honest
// caption, and today's stock is only ever re-checked by an explicit per-item 다시 확인.
import type { AvailabilityAnswer, Money, StoreLocation } from '../domain/types';

export interface CartItem {
  // pdNo when the lookup resolved one, else the product name — exact match only (D069).
  id: string;
  // Korean product name, verbatim match token (D069).
  name: string;
  // Keyword to re-run for 다시 확인.
  query: string;
  pdNo?: string;
  // Snapshot at add time. Always present: priceless answers (notCarried/franchise) cannot
  // be added — there is nothing to total and nothing to walk to.
  price: Money;
  imageUrl?: string;
  // Snapshot of the primary position when the answer had one (inStock only).
  location?: StoreLocation;
  // 담을 수량 — the shopper's intended count, NEVER a stock count (Bible quantity rule).
  qty: number;
  // Unchecked rows stay listed but leave the total.
  checked: boolean;
  addedAt: number;
  // Freshness of the SNAPSHOT (our observation, D061) — not today's stock.
  observedAt: number;
}

export interface StoreCart {
  storeCd: string;
  storeName: string;
  items: CartItem[];
}

// Per-store carts keyed by strCd: switching stores never rewrites another store's list (B44
// keeps the product; the cart keeps the store).
export type Carts = Record<string, StoreCart>;

const KEY = 'daiso.carts.v1';
// Bounded so one store's list can neither scroll forever nor bloat storage.
const MAX_ITEMS_PER_STORE = 30;
const MAX_QTY = 99;

// Snapshot constructor. Returns undefined for priceless answers — the surface hides 담기 there.
export function itemFromAnswer(
  query: string,
  pdNo: string | undefined,
  answer: AvailabilityAnswer,
  observedAt: number,
  addedAt: number,
): CartItem | undefined {
  if (!('price' in answer)) return undefined;
  const location = answer.kind === 'inStock' ? answer.locations[0] : undefined;
  return {
    id: pdNo ?? answer.productName,
    name: answer.productName,
    query,
    pdNo,
    price: answer.price,
    imageUrl: answer.imageUrl,
    location,
    qty: 1,
    checked: true,
    addedAt,
    observedAt,
  };
}

export function cartFor(carts: Carts, storeCd: string): StoreCart | null {
  return carts[storeCd] ?? null;
}

// Pure: re-adding an existing row bumps its 담을 수량 (capped), it never duplicates the row.
export function addToCart(carts: Carts, storeCd: string, storeName: string, item: CartItem): Carts {
  const existing = carts[storeCd];
  const items = existing ? [...existing.items] : [];
  const at = items.findIndex((i) => i.id === item.id);
  if (at >= 0) {
    const row = items[at];
    if (!row) return carts;
    items[at] = { ...row, qty: Math.min(row.qty + item.qty, MAX_QTY) };
  } else {
    items.unshift(item);
  }
  return {
    ...carts,
    [storeCd]: { storeCd, storeName, items: items.slice(0, MAX_ITEMS_PER_STORE) },
  };
}

// Pure: 담을 수량 clamps to 1..99 — a stepper can never produce 0 or a runaway.
export function setItemQty(carts: Carts, storeCd: string, id: string, qty: number): Carts {
  const cart = carts[storeCd];
  if (!cart) return carts;
  const clamped = Math.max(1, Math.min(Math.round(qty) || 1, MAX_QTY));
  return {
    ...carts,
    [storeCd]: {
      ...cart,
      items: cart.items.map((i) => (i.id === id ? { ...i, qty: clamped } : i)),
    },
  };
}

export function toggleItemChecked(carts: Carts, storeCd: string, id: string): Carts {
  const cart = carts[storeCd];
  if (!cart) return carts;
  return {
    ...carts,
    [storeCd]: {
      ...cart,
      items: cart.items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)),
    },
  };
}

export function removeItem(carts: Carts, storeCd: string, id: string): Carts {
  const cart = carts[storeCd];
  if (!cart) return carts;
  return { ...carts, [storeCd]: { ...cart, items: cart.items.filter((i) => i.id !== id) } };
}

// Total over CHECKED rows only — unchecked rows are listed, not summed.
export function cartTotal(cart: StoreCart): Money {
  return cart.items.reduce((sum, i) => (i.checked ? sum + i.price * i.qty : sum), 0);
}

// 담을 개수 across all rows (checked or not) — the link label counts the bag, not the bill.
export function cartQtyCount(cart: StoreCart): number {
  return cart.items.reduce((sum, i) => sum + i.qty, 0);
}

function isValidLocation(v: unknown): v is StoreLocation {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.floor === 'string' && typeof o.zone === 'string';
}

function isValidItem(v: unknown): v is CartItem {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.query === 'string' &&
    typeof o.price === 'number' &&
    Number.isInteger(o.qty) &&
    (o.qty as number) >= 1 &&
    (o.qty as number) <= MAX_QTY &&
    typeof o.checked === 'boolean' &&
    typeof o.addedAt === 'number' &&
    typeof o.observedAt === 'number' &&
    (o.pdNo === undefined || typeof o.pdNo === 'string') &&
    (o.imageUrl === undefined || typeof o.imageUrl === 'string') &&
    (o.location === undefined || isValidLocation(o.location))
  );
}

function isValidCart(v: unknown): v is StoreCart {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.storeCd === 'string' &&
    typeof o.storeName === 'string' &&
    Array.isArray(o.items) &&
    (o.items as unknown[]).every(isValidItem)
  );
}

export function loadCarts(): Carts {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (!entries.every(([, v]) => isValidCart(v))) return {};
    return Object.fromEntries(entries) as Carts;
  } catch {
    return {}; // corrupt/unavailable storage degrades to empty — never blocks the surface (G3)
  }
}

export function saveCarts(carts: Carts): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(carts));
  } catch {
    // blocked/unavailable storage → best-effort persistence only; the in-memory cart still
    // works for the session, so adding never dead-ends the shopper (G3)
  }
}
