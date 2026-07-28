// src/ui/a11y/LiveRegion.test.tsx
import { render, screen } from '@testing-library/react';
import { LiveRegion } from './LiveRegion';
import { FOCUS_ORDER } from './focusOrder';

test('announces politely', () => {
  render(<LiveRegion message="이 매장에 있어요" />);
  const region = screen.getByText('이 매장에 있어요');
  expect(region).toHaveAttribute('aria-live', 'polite');
});
test('focus order matches Interface §6', () => {
  expect(FOCUS_ORDER).toEqual(['store-line', 'answer-card', 'cta', 'candidates', 'search-bar']);
});

test('the region is visible by default', () => {
  render(<LiveRegion message="이 매장에 있어요" />);
  expect(screen.getByRole('status')).not.toHaveClass('visually-hidden');
});

test('it can be hidden visually while staying in the accessibility tree', () => {
  render(<LiveRegion message="이 매장에 있어요" visuallyHidden />);
  const region = screen.getByRole('status'); // getByRole excludes a11y-hidden nodes by default
  expect(region).toHaveClass('visually-hidden');
  expect(region).toHaveAttribute('aria-live', 'polite');
});
