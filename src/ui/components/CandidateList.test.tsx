import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProductCandidate } from '../../domain/types';
import { RESULTS_NOTICE } from '../copy';
import { formatPrice } from '../format';
import { CandidateList } from './CandidateList';

const withImage: ProductCandidate = {
  pdNo: '19987',
  name: '리빙 밀폐용기 1.2L',
  price: 2000,
  imageUrl: 'https://cdn.daisomall.co.kr/file/PD/test1.jpg',
};
const noImage: ProductCandidate = { pdNo: '19988', name: '리빙 밀폐용기 2.0L', price: 3000 };
const candidates: ProductCandidate[] = [withImage, noImage];

test('renders the Bible-verbatim results notice, not the AI-suggestion tier copy', () => {
  render(<CandidateList candidates={candidates} onSelect={() => {}} />);
  expect(screen.getByText(RESULTS_NOTICE)).toBeInTheDocument();
  expect(screen.queryByText('이걸 찾으시나요?')).not.toBeInTheDocument();
});

test('renders each candidate name and price, and a photo (alt = name) when supplied', () => {
  render(<CandidateList candidates={candidates} onSelect={() => {}} />);
  expect(screen.getByText('리빙 밀폐용기 1.2L')).toBeInTheDocument();
  expect(screen.getByText(formatPrice(2000))).toBeInTheDocument();
  const img = screen.getByRole('img', { name: '리빙 밀폐용기 1.2L' });
  expect(img).toHaveAttribute('src', withImage.imageUrl);

  expect(screen.getByText('리빙 밀폐용기 2.0L')).toBeInTheDocument();
  expect(screen.getByText(formatPrice(3000))).toBeInTheDocument();
});

test('never shows availability on a candidate row (identity only — stock checked on tap)', () => {
  render(<CandidateList candidates={candidates} onSelect={() => {}} />);
  expect(screen.queryByText(/이 매장에 있어요/)).not.toBeInTheDocument();
  expect(screen.queryByText(/품절/)).not.toBeInTheDocument();
});

test('a candidate without an imageUrl renders no photo (no fabricated placeholder)', () => {
  render(<CandidateList candidates={[noImage]} onSelect={() => {}} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('clicking a candidate row calls onSelect with that candidate', async () => {
  const onSelect = vi.fn();
  render(<CandidateList candidates={candidates} onSelect={onSelect} />);
  await userEvent.click(screen.getByRole('button', { name: /리빙 밀폐용기 1\.2L/ }));
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith(withImage);
});
