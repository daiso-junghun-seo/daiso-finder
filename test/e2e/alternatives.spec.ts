// test/e2e/alternatives.spec.ts — Flow 3 Alternative Discovery (Interface/alternative-discovery.md).
// Black-box net: Flow 3 copy is inlined Bible-verbatim so a src/ui/copy.ts drift still FAILS here.
import { type Page, expect, test } from '@playwright/test';

const SIMILAR = '이 매장에 있는 비슷한 상품';
const NEARBY = '이 상품이 있는 근처 매장';
const OUT_CTA = '대안 보기';
const RESEARCH = '다른 이름으로 다시 검색해 보세요.';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('daiso.storeContext', JSON.stringify({ strCd: '001', strNm: '명동역점' }));
  });
});

// ?scenario= dispatches a RESULT directly, so the answer card carries 대안 보기 with data in hand.
// ?alt= widens the mock-only nearby branch for the DEV sweep (the production gate withholds it).
async function openFromFlow1(page: Page, alt = '') {
  await page.goto(`/?scenario=temporarilyOut${alt ? `&alt=${alt}` : ''}`);
  await page.getByRole('button', { name: OUT_CTA }).click();
}

test('대안 보기 opens the list from the answer in hand and hides the Flow 1 dock', async ({
  page,
}) => {
  await openFromFlow1(page);
  await expect(page.getByRole('heading', { name: SIMILAR })).toBeVisible();
  await expect(page.getByText('리빙 밀폐용기 1.4L')).toBeVisible();
  await expect(page.getByText('지금은 품절이에요')).toBeVisible();
  // One primary action: the dock and cart link do not follow the shopper into the alternatives.
  await expect(page.getByLabel('상품 검색')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /장바구니/ })).toHaveCount(0);
});

test('back returns to the answer card with focus on the 대안 보기 CTA', async ({ page }) => {
  await openFromFlow1(page);
  await page.getByRole('button', { name: '뒤로' }).click();
  await expect(page.getByLabel('상품 검색')).toBeVisible();
  await expect(page.getByRole('button', { name: OUT_CTA })).toBeFocused();
});

test('a row opens Flow 2 guidance over the list; back returns to the same row', async ({
  page,
}) => {
  await openFromFlow1(page);
  const row = page.getByRole('button', { name: /리빙 밀폐용기 1\.4L/ });
  await row.click();
  await expect(page.locator('p.navigation-location')).toContainText('11층 56번');
  await page.getByRole('button', { name: '뒤로' }).click();
  await expect(row).toBeFocused();
  await expect(page.getByRole('heading', { name: SIMILAR })).toBeVisible();
});

test('nearby rows open the store card with the map handoff, and back restores the row', async ({
  page,
}) => {
  await openFromFlow1(page, 'nearby');
  await expect(page.getByRole('heading', { name: NEARBY })).toBeVisible();
  const row = page.getByRole('button', { name: /을지로입구점/ });
  await row.click();
  await expect(page.getByText('을지로입구점에 있어요 · 850m')).toBeVisible();
  await expect(page.getByRole('link', { name: /서울 중구 을지로 2/ })).toBeVisible();
  await page.getByRole('button', { name: '뒤로' }).click();
  await expect(row).toBeFocused();
});

test('the Flow 2 sold-out exit opens Flow 3, and back restores the sold-out state and its CTA', async ({
  page,
}) => {
  await page.goto('/?scenario=inStock&navRefresh=soldOut');
  await page.getByRole('button', { name: '위치 보기' }).click();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const soldOutCta = page.getByRole('button', { name: OUT_CTA });
  await expect(soldOutCta).toBeVisible();
  await soldOutCta.click();
  await expect(page.getByRole('heading', { name: SIMILAR })).toBeVisible();

  await page.getByRole('button', { name: '뒤로' }).click();
  // The live region also carries this sentence; assert the visible heading paragraph, not the a11y echo.
  await expect(
    page.locator('p.text-heading', { hasText: '방금 다시 확인해 보니 품절됐어요.' }),
  ).toBeVisible();
  await expect(soldOutCta).toBeFocused();
});

test('an empty Group A degrades to Empty without the mall ladder and hands the term back', async ({
  page,
}) => {
  await openFromFlow1(page, 'aEmpty');
  await expect(
    page.locator('p.text-heading', { hasText: '이 매장에는 비슷한 상품이 없어요.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '다이소몰에서 주문할 수 있어요.' })).toHaveCount(0);

  await page.getByRole('button', { name: RESEARCH }).click();
  const input = page.getByLabel('상품 검색');
  await expect(input).toHaveValue('리빙 밀폐용기 1.2L');
  await expect(input).toBeFocused();
});

test('both groups empty offers the mall ladder and the literal re-search', async ({ page }) => {
  await openFromFlow1(page, 'bothEmpty');
  await expect(
    page.locator('p.text-heading', { hasText: '이 매장과 근처 매장 모두에서' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '다이소몰에서 주문할 수 있어요.' })).toBeVisible();
  await expect(page.getByRole('button', { name: RESEARCH })).toBeVisible();
});

test('a failed Group A is Error with its retry, never a fabricated Empty', async ({ page }) => {
  await openFromFlow1(page, 'aFailed');
  await expect(page.getByRole('status')).toHaveText('대안을 불러오지 못했어요.');
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expect(page.getByText('직원에게 문의해 주세요.')).toBeVisible();
});

test('the nearby branch renders progressively: Group A first, then Group B', async ({ page }) => {
  await openFromFlow1(page, 'bSlow');
  // Group A settles immediately; Group B is still reserved as a skeleton (decorative, no rows).
  await expect(page.getByText('리빙 밀폐용기 1.4L')).toBeVisible();
  await expect(page.getByRole('button', { name: /을지로입구점/ })).toBeVisible({ timeout: 5_000 });
});
