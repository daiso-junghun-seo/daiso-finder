// test/e2e/states.spec.ts
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('daiso.storeContext', JSON.stringify({ strCd: '001', strNm: '명동역점' }));
  });
});

// Bible-verbatim strings inlined here (never imported from src/ui/copy.ts): E2E is a black-box net,
// so copy drift in the UI must FAIL this suite even if it happened to stay in sync with copy.ts.
const scenarios: { name: string; signatures: string[]; absent?: string[] }[] = [
  { name: 'inStock', signatures: ['이 매장에 있어요'] },
  {
    name: 'noLocation',
    // Two honestly-separated blocks (Interface §333, F5): the confirmed line and the location note as
    // distinct signatures. The " / " table joiner must never render — asserted NEGATIVELY via `absent`
    // so a revert to the single joined string (which still contains both substrings) FAILS this net.
    signatures: [
      '이 매장에 있어요 · 2,000원',
      '위치 정보가 없어요. 직원에게 위치를 문의해 주세요.',
    ],
    absent: [' / '],
  },
  {
    name: 'temporarilyOut',
    signatures: ['지금은 품절이에요. 근처 매장 재고와 비슷한 상품을 보여드릴게요.'],
  },
  { name: 'discontinued', signatures: ['판매가 끝난 상품이에요. 비슷한 상품을 보여드릴게요.'] },
  {
    name: 'notCarried',
    signatures: ['이 매장에서는 팔지 않는 상품이에요. 근처 매장을 보여드릴게요.'],
  },
  { name: 'restockArriving', signatures: ['7월 15일 전후에 들어올 예정이에요.'] },
  {
    name: 'franchise',
    signatures: ['상품은 취급하지만, 가맹점이라 재고를 확인할 수 없어요. 직원에게 문의해 주세요.'],
  },
  {
    name: 'empty',
    signatures: [
      "'empty'(으)로 등록된 상품을 찾지 못했어요. 바코드를 스캔하거나 다른 이름으로 검색해 보세요.",
    ],
  },
  {
    name: 'errorCached',
    signatures: [
      '지금 연결이 원활하지 않아요. 마지막으로 확인된 정보를 보여드릴게요.',
      '리빙 밀폐용기 1.2L',
    ],
  },
  {
    name: 'errorNoCache',
    signatures: [
      '지금 연결이 원활하지 않아요. 다시 시도하거나 매장 직원에게 문의해 주세요.',
      '다시 확인',
    ],
  },
];

for (const { name, signatures, absent } of scenarios) {
  test(`state "${name}" renders a non-blank surface (no dead end)`, async ({ page }) => {
    await page.goto(`/?scenario=${name}`);
    const main = page.locator('main');
    await expect(main).toBeVisible();
    await expect(main).not.toBeEmpty(); // Blank screens prohibited in every state
    for (const signature of signatures) {
      await expect(main).toContainText(signature); // Bible-verbatim copy signature for this scenario
    }
    for (const forbidden of absent ?? []) {
      await expect(main).not.toContainText(forbidden); // copy artifact that must never render
    }
  });
}
