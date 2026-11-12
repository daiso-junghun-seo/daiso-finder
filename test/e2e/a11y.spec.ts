// test/e2e/a11y.spec.ts
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

// The six Bible states (availability-check §4). 'loading' is frozen by the dev-only scenario harness;
// the rest resolve to their canonical copy before the scan runs.
const states = [
  { name: 'default', url: '/', signature: '이 매장에 있는지' },
  { name: 'loading', url: '/?scenario=loading', signature: '이 매장 재고를 확인하고 있어요' },
  { name: 'success', url: '/?scenario=inStock', signature: '이 매장에 있어요' },
  { name: 'partial', url: '/?scenario=noLocation', signature: '위치 정보가 없어요' },
  { name: 'empty', url: '/?scenario=empty', signature: '찾지 못했어요' },
  { name: 'error', url: '/?scenario=errorNoCache', signature: '지금 연결이 원활하지 않아요' },
];

const schemes = ['light', 'dark'] as const;

// Flow 2 guidance states (Interface/in-store-navigation.md §4) are reached through the Flow 1 CTA,
// not a URL: the hand-off is UI-shell state over the answer, so each entry names how to get there.
const navigationStates = [
  {
    name: 'navigation-single',
    url: '/?scenario=inStock',
    signature: '11층 56번',
    open: async (page: Page) => {
      await page.getByRole('button', { name: '위치 보기' }).click();
    },
  },
  {
    name: 'navigation-multi',
    url: '/?scenario=inStockMultiLocation',
    signature: '두 곳에 있어요',
    open: async (page: Page) => {
      await page.getByRole('button', { name: '위치 보기' }).click();
    },
  },
  {
    name: 'navigation-sold-out',
    url: '/?scenario=inStock&navRefresh=soldOut',
    signature: '방금 다시 확인해 보니 품절됐어요.',
    open: async (page: Page) => {
      await page.getByRole('button', { name: '위치 보기' }).click();
      // The harness keeps the entry refresh unchanged (guidance must render first); the app-resume
      // trigger is the second, designed refresh that reports 품절.
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    },
  },
  {
    name: 'navigation-recovery',
    url: '/?scenario=inStock&navRefresh=still',
    signature: '재고는 아직 있다고 나오는데, 선반에 없다면 직원에게 문의해 주세요.',
    open: async (page: Page) => {
      await page.getByRole('button', { name: '위치 보기' }).click();
      await page.getByRole('button', { name: '못 찾겠어요' }).click();
    },
  },
];

// Flow 3 states (Interface/alternative-discovery.md §5). ?alt= widens the mock-only nearby branch;
// production withholds it (§B50-2), so every Flow 1 entry goes through 대안 보기.
const openAlternatives = async (page: Page) => {
  await page.getByRole('button', { name: '대안 보기' }).click();
};

const alternativeStates = [
  {
    name: 'alternatives-list',
    url: '/?scenario=temporarilyOut',
    signature: '이 매장에 있는 비슷한 상품',
    open: openAlternatives,
  },
  {
    name: 'alternatives-nearby',
    url: '/?scenario=temporarilyOut&alt=nearby',
    signature: '이 상품이 있는 근처 매장',
    open: openAlternatives,
  },
  {
    name: 'alternatives-store-card',
    url: '/?scenario=temporarilyOut&alt=nearby',
    signature: '을지로입구점에 있어요 · 850m',
    open: async (page: Page) => {
      await openAlternatives(page);
      await page.getByRole('button', { name: /을지로입구점/ }).click();
    },
  },
  {
    name: 'alternatives-empty',
    url: '/?scenario=temporarilyOut&alt=aEmpty',
    signature: '이 매장에는 비슷한 상품이 없어요.',
    open: openAlternatives,
  },
  {
    name: 'alternatives-error',
    url: '/?scenario=temporarilyOut&alt=aFailed',
    signature: '대안을 불러오지 못했어요.',
    open: openAlternatives,
  },
];

for (const scheme of schemes) {
  for (const { name, url, signature } of states) {
    test(`state "${name}" has no serious or critical axe violations (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.addInitScript(() => {
        localStorage.setItem(
          'daiso.storeContext',
          JSON.stringify({ strCd: '001', strNm: '명동역점' }),
        );
      });
      await page.goto(url);
      await expect(page.locator('main')).toContainText(signature);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const blocking = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(
        blocking.map(
          (violation) =>
            `${violation.id}: ${violation.help} (${violation.nodes.length} nodes: ${violation.nodes
              .map((node) => node.target.join(' '))
              .join(', ')})`,
        ),
      ).toEqual([]);
    });
  }

  for (const { name, url, signature, open } of navigationStates) {
    test(`flow 2 "${name}" has no serious or critical axe violations (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.addInitScript(() => {
        localStorage.setItem(
          'daiso.storeContext',
          JSON.stringify({ strCd: '001', strNm: '명동역점' }),
        );
      });
      await page.goto(url);
      await open(page);
      await expect(page.locator('main')).toContainText(signature);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const blocking = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(
        blocking.map(
          (violation) =>
            `${violation.id}: ${violation.help} (${violation.nodes.length} nodes: ${violation.nodes
              .map((node) => node.target.join(' '))
              .join(', ')})`,
        ),
      ).toEqual([]);
    });
  }

  for (const { name, url, signature, open } of alternativeStates) {
    test(`flow 3 "${name}" has no serious or critical axe violations (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.addInitScript(() => {
        localStorage.setItem(
          'daiso.storeContext',
          JSON.stringify({ strCd: '001', strNm: '명동역점' }),
        );
      });
      await page.goto(url);
      await open(page);
      await expect(page.locator('main')).toContainText(signature);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const blocking = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(
        blocking.map(
          (violation) =>
            `${violation.id}: ${violation.help} (${violation.nodes.length} nodes: ${violation.nodes
              .map((node) => node.target.join(' '))
              .join(', ')})`,
        ),
      ).toEqual([]);
    });
  }
}
