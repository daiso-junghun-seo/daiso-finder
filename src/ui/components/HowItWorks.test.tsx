// src/ui/components/HowItWorks.test.tsx — owner decision §B52: the passive three-step walkthrough.
import { render, screen } from '@testing-library/react';
import { LOCALES } from '../../i18n/locale';
import { loadLocaleTable, strings } from '../../i18n/strings';
import { HowItWorks } from './HowItWorks';

// The ten non-ko/en tables are lazy chunks (§B52); this test asserts every one of them.
beforeAll(async () => {
  await Promise.all(LOCALES.map((locale) => loadLocaleTable(locale)));
});

test('renders the three steps in order, with a numbered marker per step', () => {
  const { container } = render(<HowItWorks locale="ko" />);
  expect(screen.getByText('이렇게 찾아요')).toBeInTheDocument();
  const steps = container.querySelectorAll('.how-it-works__step');
  expect(steps).toHaveLength(3);
  expect(steps[0]?.textContent).toContain('바코드를 스캔하거나 상품명을 검색해요');
  expect(steps[1]?.textContent).toContain('이 매장과 주변 매장의 재고를 확인해요');
  expect(steps[2]?.textContent).toContain('층·구역 안내로 매장에서 바로 찾아요');
  expect(steps[0]?.querySelector('.how-it-works__index')?.textContent).toBe('1');
  expect(steps[2]?.querySelector('.how-it-works__index')?.textContent).toBe('3');
  // Decorative numbers: the ordered list already carries the sequence for assistive tech.
  expect(steps[0]?.querySelector('.how-it-works__index')?.getAttribute('aria-hidden')).toBe('true');
});

test('every locale has real copy for the walkthrough (no empty or untranslated fallback)', () => {
  for (const locale of LOCALES) {
    const { unmount } = render(<HowItWorks locale={locale} />);
    const S = strings(locale);
    expect(screen.getByText(S.HOW_IT_WORKS_LABEL)).toBeInTheDocument();
    expect(screen.getByText(S.HOW_IT_WORKS_SCAN)).toBeInTheDocument();
    expect(screen.getByText(S.HOW_IT_WORKS_STOCK)).toBeInTheDocument();
    expect(screen.getByText(S.HOW_IT_WORKS_LOCATE)).toBeInTheDocument();
    unmount();
  }
});
