import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreContextLine } from './StoreContextLine';

test('renders the Bible store line and a labeled 매장 변경 button', () => {
  render(
    <StoreContextLine
      store={{ strCd: '0', strNm: '명동역점' }}
      locale="ko"
      onToggleLocale={() => {}}
    />,
  );
  expect(screen.getByText('다이소 명동역점')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '매장 변경' })).toBeInTheDocument();
});

test('매장 변경 invokes the change handler', async () => {
  const onChangeStore = vi.fn();
  render(
    <StoreContextLine
      store={{ strCd: '0', strNm: '명동역점' }}
      locale="ko"
      onToggleLocale={() => {}}
      onChangeStore={onChangeStore}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: '매장 변경' }));
  expect(onChangeStore).toHaveBeenCalled();
});

test('the locale toggle shows the target language and calls back (match tokens stay Korean)', async () => {
  const onToggleLocale = vi.fn();
  render(
    <StoreContextLine
      store={{ strCd: '0', strNm: '명동역점' }}
      locale="ko"
      onToggleLocale={onToggleLocale}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: '영어로 보기' }));
  expect(onToggleLocale).toHaveBeenCalled();
  expect(screen.getByText('다이소 명동역점')).toBeInTheDocument();
});
