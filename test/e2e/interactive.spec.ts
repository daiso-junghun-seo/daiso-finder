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
    // RESULTS_NOTICE renders in the CandidateList <p>; the surface LiveRegion carries the
    // same sentence for screen readers only (visually-hidden since the 2026-10-12 polish — it
    // duplicated the visible line before that). Scope to the paragraph regardless.
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
    // renders in both the AnswerCard and the surface's a11y LiveRegion (same pattern as the 밀폐용기
    // candidate test above, and equally on screen) — .first() avoids the strict-mode multiple-match.
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

/** How far `inner` sticks out past `outer` on its worst side, in px; ≤ 0 means fully contained. */
function overflowPx(inner: Box, outer: Box): number {
  return Math.max(
    outer.x - inner.x,
    outer.y - inner.y,
    inner.x + inner.width - (outer.x + outer.width),
    inner.y + inner.height - (outer.y + outer.height),
  );
}

// The aiming square carries an instruction the shopper has to be able to obey — 네모에 꽉 채워 주세요
// (SCAN_AIM_GUIDE). A square larger than the visible preview cannot be filled, and its lower brackets
// land on the dialog background instead of the camera image. Presence assertions cannot see that, and
// neither can the CSS-text assertions in src/styles/layout.test.ts: a percentage on `width` resolves
// against the containing block's WIDTH, so a width-sized square is not bounded by the preview's height
// at all. Only measured geometry catches it.
test('the aiming square stays inside the camera preview (phone 390×844)', async ({ page }) => {
  // Hold the scan open. DEV wires the no-camera mock scanner, which decodes on the next microtask and
  // closes the overlay before anything can be measured. This substitutes ONE module — the test double
  // the DEV build already uses — for a scan that never settles, which is the exact state the guide
  // exists for: a shopper aiming at a package that has not decoded yet. The overlay, its markup and
  // its stylesheet are the app's own.
  await page.route('**/adapters/mock/scanner.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: [
        "export const MOCK_SCAN_VALUE = '19987';",
        'export function createMockScanner() {',
        '  return { scan: () => new Promise(() => {}) };',
        '}',
      ].join('\n'),
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('daiso.storeContext', JSON.stringify({ strCd: '001', strNm: '명동역점' }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: '바코드 스캔' }).click();
  const aim = page.locator('.scanner-overlay__aim');
  await expect(aim).toBeVisible();

  const videoBox = await boxOf(page.locator('.scanner-overlay__video'), 'camera preview');
  const aimBox = await boxOf(aim, 'aiming square');
  const geometry =
    `preview ${videoBox.width}×${videoBox.height} at y=${videoBox.y} · ` +
    `aim ${aimBox.width}×${aimBox.height} at y=${aimBox.y} · ` +
    `overflow=${overflowPx(aimBox, videoBox)}px`;

  // A collapsed or non-square box would satisfy containment vacuously while showing the shopper
  // something that is not the 네모 the copy names, so pin the shape before the containment.
  expect(aimBox.height, geometry).toBeGreaterThan(0);
  expect(Math.abs(aimBox.width - aimBox.height), geometry).toBeLessThanOrEqual(1);
  // 0.5px of slack for subpixel rounding of the percentage sizing and the centring translate.
  expect(overflowPx(aimBox, videoBox), geometry).toBeLessThanOrEqual(0.5);

  // The DEV build has no camera, so the preview above falls back to <video>'s default 300×150 object
  // size — squat, and not the shape the overflow was found at. The field device (iPhone 390×844 with
  // the 1920×1080 stream the panel reported on 2026-07-28) renders it ~388×218. Force that height and
  // re-measure: a preview shorter than 60% of its own width is precisely the case a width-sized square
  // could not survive, and a height-sized one has to.
  await page
    .locator('.scanner-overlay__video')
    .evaluate((el) => el.setAttribute('style', 'height: 218px'));
  const fieldVideoBox = await boxOf(
    page.locator('.scanner-overlay__video'),
    'camera preview (16:9)',
  );
  const fieldAimBox = await boxOf(aim, 'aiming square (16:9)');
  const fieldGeometry =
    `preview ${fieldVideoBox.width}×${fieldVideoBox.height} at y=${fieldVideoBox.y} · ` +
    `aim ${fieldAimBox.width}×${fieldAimBox.height} at y=${fieldAimBox.y} · ` +
    `overflow=${overflowPx(fieldAimBox, fieldVideoBox)}px`;
  expect(Math.abs(fieldAimBox.width - fieldAimBox.height), fieldGeometry).toBeLessThanOrEqual(1);
  expect(overflowPx(fieldAimBox, fieldVideoBox), fieldGeometry).toBeLessThanOrEqual(0.5);
});

// Usability floor (2026-10-11-ui-floor-pass-design.md §3) — geometry only a rendered page
// can prove. The CSS-text guards in src/styles/layout.test.ts pin the declarations; these
// measure what the shopper gets at phone width.
test.describe('usability floor (phone 390×844)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem(
        'daiso.storeContext',
        JSON.stringify({ strCd: '001', strNm: '명동역점' }),
      );
    });
    // The mock catalogue points at the vendor CDN, which this sandbox cannot reach — without
    // this every photo would take the honest unmount path (ProductPhoto onError) and there
    // would be no box to measure. A 1px PNG keeps the element mounted; the 64px thumb and
    // card bounds under test come from CSS, not the bitmap.
    await page.route('**/cdn.daisomall.co.kr/**', (route) =>
      route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          'base64',
        ),
      }),
    );
    await page.goto('/');
  });

  test('the search input and the 스캔 button share one row inside the viewport', async ({
    page,
  }) => {
    const viewport: Box = { x: 0, y: 0, width: 390, height: 844 };
    const input = page.getByLabel('상품 검색');
    const scan = page.getByRole('button', { name: '바코드 스캔' });
    await expect(input).toBeVisible();
    await expect(scan).toBeVisible();
    const inputBox = await boxOf(input, 'search input');
    const scanBox = await boxOf(scan, 'scan button');
    const geometry =
      `input ${inputBox.width}×${inputBox.height} at y=${inputBox.y} · ` +
      `scan ${scanBox.width}×${scanBox.height} at y=${scanBox.y}`;
    // One row: the two boxes overlap vertically. Stacked (input above button) would read
    // as a broken search bar at this width.
    expect(verticalOverlapPx(inputBox, scanBox), geometry).toBeGreaterThan(0);
    expect(overflowPx(inputBox, viewport), geometry).toBeLessThanOrEqual(0.5);
    expect(overflowPx(scanBox, viewport), geometry).toBeLessThanOrEqual(0.5);
  });

  test('candidate photos are bounded thumbs inside their rows', async ({ page }) => {
    const input = page.getByLabel('상품 검색');
    await input.fill('밀폐용기');
    await input.press('Enter');
    const photos = page.locator('.candidate-list .product-photo');
    await expect(photos).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      const photo = photos.nth(i);
      const row = page.locator('.candidate-list li').nth(i);
      const photoBox = await boxOf(photo, `candidate photo ${i}`);
      const rowBox = await boxOf(row, `candidate row ${i}`);
      const geometry = `photo ${photoBox.width}×${photoBox.height} · row ${rowBox.width}×${rowBox.height}`;
      // 64px thumb + 0.5px subpixel slack. An unbounded remote image would measure in the
      // hundreds here (its intrinsic size), blowing the row out of the viewport.
      expect(photoBox.width, geometry).toBeLessThanOrEqual(64.5);
      expect(photoBox.height, geometry).toBeLessThanOrEqual(64.5);
      expect(overflowPx(photoBox, rowBox), geometry).toBeLessThanOrEqual(0.5);
    }
  });

  test('the answer photo stays inside the answer card', async ({ page }) => {
    const input = page.getByLabel('상품 검색');
    await input.fill('밀폐용기');
    await input.press('Enter');
    await page.getByRole('button', { name: /리빙 밀폐용기 1\.2L/ }).click();
    await expect(page.getByText('이 매장에 있어요').first()).toBeVisible();
    const photo = page.locator('.answer-card .product-photo');
    await expect(photo).toBeVisible();
    const photoBox = await boxOf(photo, 'answer photo');
    const cardBox = await boxOf(page.locator('.answer-card'), 'answer card');
    const geometry = `photo ${photoBox.width}×${photoBox.height} · card ${cardBox.width}×${cardBox.height}`;
    expect(overflowPx(photoBox, cardBox), geometry).toBeLessThanOrEqual(0.5);
  });
});

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
