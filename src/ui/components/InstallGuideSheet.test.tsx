// src/ui/components/InstallGuideSheet.test.tsx — §B51 iOS guide. Same modal contract as the
// D082 sheet: focus lands on 닫기, Escape dismisses, and the copy tells the share-sheet steps.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallGuideSheet } from './InstallGuideSheet';

test('renders the two share-sheet steps and takes focus on 닫기', () => {
  render(<InstallGuideSheet locale="ko" onClose={() => {}} />);

  expect(screen.getByRole('dialog', { name: '홈 화면에 추가' })).toBeInTheDocument();
  expect(screen.getByText('공유 버튼을 누르세요.')).toBeInTheDocument();
  expect(screen.getByText("'홈 화면에 추가'를 선택하세요.")).toBeInTheDocument();
  expect(
    screen.getByText('홈 화면의 DAISO Finder 아이콘으로 바로 열 수 있어요.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();
});

test('닫기 and Escape both dismiss', async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<InstallGuideSheet locale="ko" onClose={onClose} />);

  await user.click(screen.getByRole('button', { name: '닫기' }));
  expect(onClose).toHaveBeenCalledTimes(1);

  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(2);
});

test('the English guide translates the instructions only', () => {
  render(<InstallGuideSheet locale="en" onClose={() => {}} />);
  expect(screen.getByRole('dialog', { name: 'Add to Home Screen' })).toBeInTheDocument();
  expect(screen.getByText('Tap the Share button.')).toBeInTheDocument();
  expect(screen.getByText("Choose 'Add to Home Screen'.")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
});
