import 'fake-indexeddb/auto';
import type { AvailabilityAnswer } from '../domain/types';
import { createIndexedDbCache } from './cache-storage';

const answer: AvailabilityAnswer = {
  kind: 'inStock',
  productName: 'X',
  price: 2000,
  locations: [{ floor: '11', zone: '56' }],
  qtyUpperBound: 50,
};

test('written answer is read back with its observedAt stamp', async () => {
  const cache = createIndexedDbCache();
  await cache.writeAnswer('1:밀폐용기', answer, 1_700_000_000_000);
  await expect(cache.readAnswer('1:밀폐용기')).resolves.toEqual({
    answer,
    observedAt: 1_700_000_000_000,
  });
});
test('missing key reads back null (no cache path)', async () => {
  const cache = createIndexedDbCache();
  await expect(cache.readAnswer('1:없는상품')).resolves.toBeNull();
});
