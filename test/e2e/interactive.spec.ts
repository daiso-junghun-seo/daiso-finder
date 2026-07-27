// test/e2e/interactive.spec.ts — live search, retry-adjacent store change, and first run (Phase 5).
import { type Locator, expect, test } from '@playwright/test';

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

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator, what: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`${what} has no bounding box (not rendered?)`);
  return box;
}

/** Vertical overlap in px; ≤ 0 means the two rectangles are clear of each other. */
function verticalOverlapPx(a: Box, b: Box): number {
  return Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
}

test.describe('diagnostics panel', () => {
  test('?debug=1 shows the diagnostics bar', async ({ page }) => {
    await page.goto('/?debug=1');
    await expect(page.locator('.diagnostics-bar')).toBeVisible();
  });

  test('without the parameter the bar is not in the DOM at all', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.diagnostics-bar')).toHaveCount(0);
  });

  // The bar is `position: fixed; bottom: 0` and the search/scan bar is `position: sticky; bottom: 0`,
  // so both want the same strip of viewport. Every reading this panel exists to collect
  // (BarcodeDetector · 지원 포맷 · 디코더 · 트랙 해상도) is only produced by tapping 스캔 first, and on a
  // phone tapping is the only affordance — an opaque bar over that button makes the instrument
  // unusable. Presence/absence assertions cannot see this, so measure the geometry. Both viewports
  // are asserted because the reserved height must clear the bar at the narrow width too, where the
  // summary line has the least room.
  for (const viewport of [
    { name: 'desktop 1280×720', width: 1280, height: 720 },
    { name: 'phone 390×844', width: 390, height: 844 },
  ]) {
    test(`the collapsed bar covers neither the search input nor the 스캔 button (${viewport.name})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.addInitScript(() => {
        localStorage.setItem(
          'daiso.storeContext',
          JSON.stringify({ strCd: '001', strNm: '명동역점' }),
        );
      });
      await page.goto('/?debug=1');
      const bar = page.locator('.diagnostics-bar');
      await expect(bar).toBeVisible();
      const scanButton = page.getByRole('button', { name: '바코드 스캔' });
      await expect(scanButton).toBeVisible();

      const barBox = await boxOf(bar, 'diagnostics bar');
      const scanBox = await boxOf(scanButton, '스캔 button');
      const inputBox = await boxOf(page.getByLabel('상품 검색'), 'search input');
      const geometry =
        `bar h=${barBox.height} y=[${barBox.y}, ${barBox.y + barBox.height}] · ` +
        `스캔 y=[${scanBox.y}, ${scanBox.y + scanBox.height}] · ` +
        `input y=[${inputBox.y}, ${inputBox.y + inputBox.height}]`;

      expect(verticalOverlapPx(barBox, scanBox), geometry).toBeLessThanOrEqual(0);
      expect(verticalOverlapPx(barBox, inputBox), geometry).toBeLessThanOrEqual(0);
    });
  }
});
