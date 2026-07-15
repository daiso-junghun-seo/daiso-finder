// functions/api/stock.test.ts
import { stripMallOnlyFields } from './stock';

test('mall-only commerce fields are stripped at the proxy boundary', () => {
  const upstream = {
    data: { msStrVOList: [{ strCd: '1', qty: '3', pkupYn: 'Y', pntAcmYn: 'Y', intUseYn: 'Y' }] },
  };
  const out = stripMallOnlyFields(upstream);
  const row = out.data.msStrVOList[0];
  expect(row.qty).toBe('3');
  expect('pkupYn' in row).toBe(false);
  expect('pntAcmYn' in row).toBe(false);
  expect('intUseYn' in row).toBe(false);
});
