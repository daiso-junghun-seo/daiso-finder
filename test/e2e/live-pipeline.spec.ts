// test/e2e/live-pipeline.spec.ts — prod build (real adapters) + page.route fixtures at the /api boundary.
// Exercises browser → createDaisoStore* → fetch /api/* → parse/map → UI, hermetically (no live daisomall).
import { expect, test } from '@playwright/test';

const RAW_INSTOCK = {
  strCd: '001',
  pdNo: '19987',
  productName: '리빙 밀폐용기 1.2L',
  price: 2000,
  directYn: 'Y',
  stck: '50',
  sleStsCd: '1',
  mrkGdsYn: null,
  lchDay: null,
  locations: [{ floor: '11', zone: '56' }],
  imageUrl: null,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('daiso.storeContext', JSON.stringify({ strCd: '001', strNm: '명동역점' }));
  });
});

test('real adapter → /api/availability (fixture) → mapStoreObservation → inStock surface', async ({
  page,
}) => {
  // PROD build now runs search-first: /api/search is called BEFORE /api/availability. A single
  // candidate is unambiguous — runQuery proceeds straight through to availability with its pdNo, no
  // tap needed.
  await page.route('**/api/search', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [{ pdNo: '19987', name: '리빙 밀폐용기 1.2L', price: 2000, imageUrl: null }],
      }),
    }),
  );
  await page.route('**/api/availability', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: RAW_INSTOCK }),
    }),
  );
  await page.goto('/');
  const input = page.getByLabel('상품 검색');
  await input.fill('밀폐용기');
  await input.press('Enter');
  await expect(page.getByText('이 매장에 있어요').first()).toBeVisible();
  await expect(page.getByText('11층 56번').first()).toBeVisible();
});

test('proxy noMatch → Bible empty state', async ({ page }) => {
  // Zero candidates → search-first falls through to the raw keyword against /api/availability, unchanged.
  await page.route('**/api/search', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [] }),
    }),
  );
  await page.route('**/api/availability', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ noMatch: true }),
    }),
  );
  await page.goto('/');
  await page.getByLabel('상품 검색').fill('없는상품');
  await page.getByLabel('상품 검색').press('Enter');
  await expect(page.getByText(/등록된 상품을 찾지 못했어요/).first()).toBeVisible();
});

test('store search hits /api/stores (fixture) and lists the store', async ({ page }) => {
  await page.route('**/api/stores', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stores: [{ strCd: '003', strNm: '을지로점' }] }),
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: '매장 변경' }).click();
  await page.getByPlaceholder('매장명 또는 지역명으로 검색').fill('을지로');
  await expect(page.getByRole('button', { name: '을지로점' })).toBeVisible();
});
