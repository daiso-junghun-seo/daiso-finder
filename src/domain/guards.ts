// src/domain/guards.ts
import type { AvailabilityAnswer } from './types';

export const isInStock = (
  a: AvailabilityAnswer,
): a is Extract<AvailabilityAnswer, { kind: 'inStock' }> => a.kind === 'inStock';
export const hasLocation = (a: AvailabilityAnswer): boolean =>
  isInStock(a) && a.locations.length > 0;
export const isNegative = (a: AvailabilityAnswer): boolean =>
  a.kind === 'temporarilyOut' ||
  a.kind === 'discontinued' ||
  a.kind === 'notCarried' ||
  a.kind === 'restockArriving';
