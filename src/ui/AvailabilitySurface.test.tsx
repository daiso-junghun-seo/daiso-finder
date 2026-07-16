import { act, render, screen } from '@testing-library/react';
import { mockAnswers } from '../adapters/mock/fixtures';
import { AvailabilitySurface } from './AvailabilitySurface';
import { useAvailabilityStore } from './store';

afterEach(() => {
  useAvailabilityStore.setState({ ui: { state: 'default' } });
});

test('default surface shows the purpose headline', () => {
  render(<AvailabilitySurface />);
  expect(screen.getByText('이 매장에 있는지 바로 확인해 보세요')).toBeInTheDocument();
});

test('a RESULT event renders the real Bible copy for the in-stock answer, not a raw state name', () => {
  render(<AvailabilitySurface />);
  act(() => {
    useAvailabilityStore.getState().dispatch({
      type: 'RESULT',
      answer: mockAnswers.inStock,
      freshness: { class: 'live', observedAt: Date.now() },
    });
  });
  expect(screen.getByText('이 매장에 있어요')).toBeInTheDocument();
  expect(screen.queryByText('success')).not.toBeInTheDocument();
});
