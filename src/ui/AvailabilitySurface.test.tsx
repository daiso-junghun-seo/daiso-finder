import { render, screen } from '@testing-library/react';
import { AvailabilitySurface } from './AvailabilitySurface';

test('default surface shows the purpose headline', () => {
  render(<AvailabilitySurface />);
  expect(screen.getByText('이 매장에 있는지 바로 확인해 보세요')).toBeInTheDocument();
});
