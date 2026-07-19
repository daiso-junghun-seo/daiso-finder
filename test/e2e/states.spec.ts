// test/e2e/states.spec.ts
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('daiso.storeContext', JSON.stringify({ strCd: '001', strNm: '명동역점' }));
  });
});

const scenarios = [
  'inStock',
  'noLocation',
  'temporarilyOut',
  'discontinued',
  'notCarried',
  'restockArriving',
  'franchise',
  'empty',
  'errorCached',
  'errorNoCache',
];

for (const scenario of scenarios) {
  test(`state "${scenario}" renders a non-blank surface (no dead end)`, async ({ page }) => {
    await page.goto(`/?scenario=${scenario}`);
    const main = page.locator('main');
    await expect(main).toBeVisible();
    await expect(main).not.toBeEmpty(); // Blank screens prohibited in every state
  });
}
