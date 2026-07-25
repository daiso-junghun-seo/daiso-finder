// test/e2e/interactive.spec.ts — live search, retry-adjacent store change, and first run (Phase 5).
import { expect, test } from '@playwright/test';

// Bible §4 empty-state sentence for the query 락앤락같은통 (emptyBody in src/ui/copy.ts).
const EMPTY_BODY =
  "'락앤락같은통'(으)로 등록된 상품을 찾지 못했어요. 바코드를 스캔하거나 다른 이름으로 검색해 보세요.";

// Bible-verbatim literal-results notice (Interface §copy-table AI-low; RESULTS_NOTICE in src/ui/copy.ts).
const RESULTS_NOTICE = '검색 결과예요. 바코드를 스캔하면 더 정확해요.';

test.describe('with a persisted store context', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'daiso.storeContext',
        JSON.stringify({ strCd: '001', strNm: '명동역점' }),
      );
    });
  });

  // DEV build runs the mock ProductSearchPort (createMockProductSearch), which returns 3 candidates for
  // "밀폐용기" — search-first shows the candidate list before any answer; picking a candidate re-queries
  // by pdNo and lands on Success (the keyword-mock repo matches 리빙 밀폐용기 1.2L to inStock).
  test('typing 밀폐용기 and submitting shows the candidate list, then tapping a candidate ends in Success', async ({
    page,
  }) => {
    await page.goto('/');
    const input = page.getByLabel('상품 검색');
    await input.fill('밀폐용기');
    await input.press('Enter');
    // RESULTS_NOTICE renders in both the visible CandidateList <p> and the hidden a11y LiveRegion —
    // scope to the paragraph to avoid a strict-mode multiple-match.
    await expect(page.locator('p', { hasText: RESULTS_NOTICE })).toBeVisible();
    const candidateRow = page.getByRole('button', { name: /리빙 밀폐용기 1\.2L/ });
    await expect(candidateRow).toBeVisible();
    await candidateRow.click();
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

  // The DEV composition wires the mock ScannerPort (no camera), which resolves the mock catalog's base
  // pdNo (19987) — the keyword-mock repo matches it to the inStock fixture, so the scan lands directly
  // on the Success card without any candidate list (an exact identifier skips the search-first path).
  test('scanning a barcode answers with the availability card', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '바코드 스캔' }).click();
    // The mock scanner (no camera) resolves its decode almost immediately, so the dialog can already be
    // gone by the time this assertion runs — assert the answer card the decode lands on, not the
    // overlay's continued presence (the overlay unmounts as soon as a decode lands). The status text
    // renders in both the visible AnswerCard and the hidden a11y LiveRegion (same pattern as the
    // 밀폐용기 candidate test above) — .first() avoids the strict-mode multiple-match.
    await expect(page.getByText('이 매장에 있어요').first()).toBeVisible();
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
