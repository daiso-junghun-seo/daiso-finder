import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreContextLine } from './StoreContextLine';

test('renders the Bible store line and a labeled 매장 변경 button', () => {
  render(
    <StoreContextLine
      store={{ strCd: '0', strNm: '명동역점' }}
      locale="ko"
      onSelectLocale={() => {}}
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
      onSelectLocale={() => {}}
      onChangeStore={onChangeStore}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: '매장 변경' }));
  expect(onChangeStore).toHaveBeenCalled();
});

test('the segmented control presses the CURRENT language, not the target', async () => {
  const onSelectLocale = vi.fn();
  render(
    <StoreContextLine
      store={{ strCd: '0', strNm: '명동역점' }}
      locale="ko"
      onSelectLocale={onSelectLocale}
    />,
  );
  // ko pressed, EN unpressed — the state the old target-only toggle misreported.
  expect(screen.getByRole('button', { name: 'KO' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(screen.getByRole('button', { name: 'EN' }));
  expect(onSelectLocale).toHaveBeenCalledWith('en');
  expect(screen.getByText('다이소 명동역점')).toBeInTheDocument();
});

test('the install entry appears only when the platform offers one', async () => {
  const onInstall = vi.fn();
  const { rerender } = render(
    <StoreContextLine
      store={{ strCd: '0', strNm: '명동역점' }}
      locale="ko"
      onSelectLocale={() => {}}
      install="button"
      onInstall={onInstall}
    />,
  );
  const button = screen.getByRole('button', { name: '앱 설치' });
  // A native prompt is not a dialog — no aria-haspopup.
  expect(button).not.toHaveAttribute('aria-haspopup');
  await userEvent.click(button);
  expect(onInstall).toHaveBeenCalledTimes(1);

  rerender(
    <StoreContextLine
      store={{ strCd: '0', strNm: '명동역점' }}
      locale="ko"
      onSelectLocale={() => {}}
    />,
  );
  expect(screen.queryByRole('button', { name: '앱 설치' })).not.toBeInTheDocument();
});

test('the iOS install entry announces that it opens the guide dialog', () => {
  render(
    <StoreContextLine
      store={{ strCd: '0', strNm: '명동역점' }}
      locale="ko"
      onSelectLocale={() => {}}
      install="guide"
      onInstall={() => {}}
    />,
  );
  expect(screen.getByRole('button', { name: '앱 설치' })).toHaveAttribute(
    'aria-haspopup',
    'dialog',
  );
});
