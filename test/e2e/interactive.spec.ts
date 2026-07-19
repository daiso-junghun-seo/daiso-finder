// test/e2e/interactive.spec.ts — live search, retry-adjacent store change, and first run (Phase 5).
import { expect, test } from '@playwright/test';

// Bible §4 empty-state sentence for the query 락앤락같은통 (emptyBody in src/ui/copy.ts).
const EMPTY_BODY =
  "'락앤락같은통'(으)로 등록된 상품을 찾지 못했어요. 바코드를 스캔하거나 다른 이름으로 검색해 보세요.";

test.describe('with a persisted store context', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'daiso.storeContext',
        JSON.stringify({ strCd: '001', strNm: '명동역점' }),
      );
    });
  });

  test('typing 밀폐용기 and submitting ends in Success', async ({ page }) => {
    await page.goto('/');
    const input = page.getByLabel('상품 검색');
    await input.fill('밀폐용기');
    await input.press('Enter');
    await expect(page.getByText('이 매장에 있어요').first()).toBeVisible();
  });

  test('typing an unknown keyword ends in Empty with the Bible sentence', async ({ page }) => {
    await page.goto('/');
    const input = page.getByLabel('상품 검색');
    await input.fill('락앤락같은통');
    await input.press('Enter');
    await expect(page.getByText(EMPTY_BODY).first()).toBeVisible();
  });

  test('매장 변경 opens the store-selection sheet and selecting a store updates the store line', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '매장 변경' }).click();
    await expect(page.getByRole('dialog', { name: '매장 선택' })).toBeVisible();
    await page.getByPlaceholder('매장명 또는 지역명으로 검색').fill('을지로');
    await page.getByRole('button', { name: '을지로점' }).click();
    await expect(page.getByText('다이소 을지로점')).toBeVisible();
  });
});

test('first run leads with the store-selection sheet; choosing a store lands on Default', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: '매장 선택' })).toBeVisible();
  await expect(page.getByLabel('상품 검색')).toHaveCount(0);
  await page.getByPlaceholder('매장명 또는 지역명으로 검색').fill('명동');
  await page.getByRole('button', { name: '명동역점' }).click();
  await expect(
    page.getByRole('heading', { name: '이 매장에 있는지 바로 확인해 보세요' }),
  ).toBeVisible();
  await expect(page.getByText('다이소 명동역점')).toBeVisible();
});
