// src/domain/guards.test.ts
import { hasLocation, isNegative } from './guards';
import type { AvailabilityAnswer } from './types';

const inStockNoLoc: AvailabilityAnswer = {
  kind: 'inStock',
  productName: 'X',
  price: 2000,
  locations: [],
  qtyUpperBound: 50,
};
const inStockLoc: AvailabilityAnswer = {
  kind: 'inStock',
  productName: 'X',
  price: 2000,
  locations: [{ floor: '11', zone: '56' }],
  qtyUpperBound: 50,
};

test('hasLocation is false for in-stock with no locations', () => {
  expect(hasLocation(inStockLoc)).toBe(true);
  expect(hasLocation(inStockNoLoc)).toBe(false);
});
test('isNegative covers the four negative answers, not in-stock', () => {
  expect(isNegative({ kind: 'discontinued', productName: 'X', price: 2000 })).toBe(true);
  expect(isNegative(inStockLoc)).toBe(false);
});
