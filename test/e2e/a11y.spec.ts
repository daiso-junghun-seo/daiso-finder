// test/e2e/a11y.spec.ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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
}
