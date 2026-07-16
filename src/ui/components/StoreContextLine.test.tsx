import { render, screen } from '@testing-library/react';
import { StoreContextLine } from './StoreContextLine';

test('renders the Bible store line and a labeled 매장 변경 button', () => {
  render(<StoreContextLine store={{ strCd: '0', strNm: '명동역점' }} />);
  expect(screen.getByText('다이소 명동역점')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '매장 변경' })).toBeInTheDocument();
});
