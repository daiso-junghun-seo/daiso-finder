// test/e2e/navigation.spec.ts — Flow 2 In-Store Navigation (Interface/in-store-navigation.md).
// Black-box net: guidance copy is inlined Bible-verbatim so a src/ui/copy.ts drift still FAILS here.
import { type Page, expect, test } from '@playwright/test';

const MISSING = '못 찾겠어요';
const RETRY = '다시 확인';
const SOLD_OUT = '방금 다시 확인해 보니 품절됐어요.';
const RECOVERY_STILL = '재고는 아직 있다고 나오는데, 선반에 없다면 직원에게 문의해 주세요.';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('daiso.storeContext', JSON.stringify({ strCd: '001', strNm: '명동역점' }));
  });
});

// Flow 1 answer first, then the hand-off. ?scenario= dispatches a RESULT directly, so no lookup is
// retained and the refresh term falls back to the display query (still a valid mock key).
async function answerThenNavigate(page: Page, scenario: string, extra = '') {
  await page.goto(`/?scenario=${scenario}${extra}`);
  await expect(page.locator('p', { hasText: '이 매장에 있어요' }).first()).toBeVisible();
  await page.getByRole('button', { name: '위치 보기' }).click();
}

test('위치 보기 hands the answer over as guidance and hides the Flow 1 dock', async ({ page }) => {
  await answerThenNavigate(page, 'inStock');
  await expect(page.locator('p.navigation-location')).toContainText('11층 56번');
  await expect(page.getByText('리빙 밀폐용기 1.2L')).toBeVisible();
  await expect(page.getByText('2,000원')).toBeVisible();
  await expect(page.getByText('방금 확인한 재고예요')).toBeVisible();
  // L4 store context stays present and correctable; the search/scan dock and cart link do not follow
  // the shopper into the aisle (one primary action: the guidance itself).
  await expect(page.getByRole('button', { name: '매장 변경' })).toBeVisible();
  await expect(page.getByRole('button', { name: '뒤로' })).toBeVisible();
  await expect(page.getByLabel('상품 검색')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /장바구니/ })).toHaveCount(0);
});

test('back returns to the answer card with focus on the CTA that opened the flow', async ({
  page,
}) => {
  await answerThenNavigate(page, 'inStock');
  await page.getByRole('button', { name: '뒤로' }).click();
  await expect(page.locator('p', { hasText: '이 매장에 있어요' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '위치 보기' })).toBeFocused();
  await expect(page.getByLabel('상품 검색')).toBeVisible();
});

test('multiple positions ask the shopper to choose, then disclose the other at L3', async ({
  page,
}) => {
  await answerThenNavigate(page, 'inStockMultiLocation');
  await expect(page.getByText('두 곳에 있어요')).toBeVisible();
  await page.getByRole('button', { name: '2층 14번' }).click();
  await expect(page.locator('p.navigation-location')).toContainText('2층 14번');
  const disclosure = page.getByRole('button', { name: '다른 위치 1곳 더 ▾' });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: '11층 56번' })).toBeVisible();
});

test('the language switch re-renders guidance grammar without translating match tokens', async ({
  page,
}) => {
  await answerThenNavigate(page, 'inStock');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.locator('p.navigation-location')).toContainText('11F · No. 56');
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  // The product name is a match token — never translated (D069).
  await expect(page.getByText('리빙 밀폐용기 1.2L')).toBeVisible();
});

test('a refresh that reports 품절 exits to the sold-out state with 대안 보기', async ({ page }) => {
  await answerThenNavigate(page, 'inStock', '&navRefresh=soldOut');
  // The harness leaves the entry refresh unchanged by design (the shopper must see guidance first),
  // so the second request is the app-resume trigger — a designed Flow 2 refresh.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('p', { hasText: SOLD_OUT })).toBeVisible();
  await expect(page.getByRole('button', { name: '대안 보기' })).toBeVisible();
  await expect(page.locator('p.navigation-location')).toHaveCount(0);
});

test('a failed refresh costs freshness only — the guidance stays', async ({ page }) => {
  await answerThenNavigate(page, 'inStock', '&navRefresh=failed');
  await expect(page.locator('p.navigation-location')).toContainText('11층 56번');
  await expect(page.getByText('방금 확인한 재고예요')).toBeVisible();
  await expect(page.getByText(SOLD_OUT)).toHaveCount(0);
  await expect(page.getByText(RECOVERY_STILL)).toHaveCount(0);
});

test('a non-품절 negative refresh is not applied (D4: no exit copy exists yet)', async ({
  page,
}) => {
  await answerThenNavigate(page, 'inStock', '&navRefresh=unapplied');
  await expect(page.locator('p.navigation-location')).toContainText('11층 56번');
  await expect(page.getByText(MISSING)).toBeVisible();
  await expect(page.getByText(SOLD_OUT)).toHaveCount(0);
});

test('못 찾겠어요 offers another position that the refresh still lists', async ({ page }) => {
  await answerThenNavigate(page, 'inStock', '&navRefresh=other');
  await page.getByRole('button', { name: MISSING }).click();
  await page.getByRole('button', { name: '2층 14번에도 있어요.' }).click();
  await expect(page.locator('p.navigation-location')).toContainText('2층 14번');
});

test('못 찾겠어요 falls back to the staff sentence when no other position exists', async ({
  page,
}) => {
  await answerThenNavigate(page, 'inStock', '&navRefresh=still');
  await page.getByRole('button', { name: MISSING }).click();
  await expect(page.locator('p', { hasText: RECOVERY_STILL })).toBeVisible();
  await expect(page.getByRole('button', { name: '대안 보기' })).toBeVisible();
});

test('a stale observation demotes to the system-error body and 다시 확인 recovers it', async ({
  page,
}) => {
  // ?navAge= ages the hand-off stamp past the 6 h threshold; recoverStale fails the entry refresh so
  // the stale block survives the first render, then answers on 다시 확인.
  await answerThenNavigate(page, 'inStock', '&navAge=400&navRefresh=recoverStale');
  const staleBody = page.locator('p', { hasText: '오늘 재고는 확인하지 못했어요' });
  await expect(staleBody).toBeVisible();
  await expect(page.locator('p.navigation-location')).toContainText('11층 56번');
  await page.getByRole('button', { name: RETRY }).click();
  await expect(page.getByText('방금 확인한 재고예요')).toBeVisible();
  await expect(staleBody).toHaveCount(0);
});

test('the stale body and the missing link are mutually exclusive (Interface §4 Partial c)', async ({
  page,
}) => {
  await answerThenNavigate(page, 'inStock', '&navAge=400&navRefresh=failed');
  await expect(page.locator('p', { hasText: '오늘 재고는 확인하지 못했어요' })).toBeVisible();
  await expect(page.getByText(MISSING)).toHaveCount(0);
});

test('a store change drops the guidance and lands on Default for the new store', async ({
  page,
}) => {
  await answerThenNavigate(page, 'inStock');
  await page.getByRole('button', { name: '매장 변경' }).click();
  await page.getByPlaceholder('매장명 또는 지역명으로 검색').fill('을지로');
  await page.getByRole('button', { name: '을지로점' }).click();
  await expect(page.getByText('다이소 을지로점')).toBeVisible();
  await expect(page.locator('p.navigation-location')).toHaveCount(0);
  await expect(page.getByText('이 매장에 있는지 바로 확인해 보세요')).toBeVisible();
});
