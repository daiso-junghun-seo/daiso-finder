import 'fake-indexeddb/auto';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockAnswers } from '../adapters/mock/fixtures';
import { AvailabilitySurface } from './AvailabilitySurface';
import { emptyBody } from './copy';
import { useAvailabilityStore } from './store';

beforeEach(() => {
  localStorage.clear();
  useAvailabilityStore.setState({
    ui: { state: 'default' },
    store: { strCd: '001', strNm: '명동역점' },
    sheetOpen: false,
  });
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

describe('first run (D082)', () => {
  beforeEach(() => {
    useAvailabilityStore.setState({ store: null, sheetOpen: true });
  });

  test('leads with only the store-selection sheet — no store line, no search bar', () => {
    render(<AvailabilitySurface />);
    expect(screen.getByRole('dialog', { name: '매장 선택' })).toBeInTheDocument();
    expect(screen.queryByLabelText('상품 검색')).not.toBeInTheDocument();
    expect(screen.queryByText('다이소 명동역점')).not.toBeInTheDocument();
  });

  test('selecting a store lands on Default with the chosen store in the store line', async () => {
    render(<AvailabilitySurface />);
    await userEvent.type(screen.getByPlaceholderText('매장명 또는 지역명으로 검색'), '명동');
    await userEvent.click(await screen.findByRole('button', { name: '명동역점' }));
    expect(await screen.findByText('이 매장에 있는지 바로 확인해 보세요')).toBeInTheDocument();
    expect(screen.getByText('다이소 명동역점')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('store change (D082)', () => {
  test('매장 변경 opens the sheet over the current state and 닫기 closes it without changing the store', async () => {
    render(<AvailabilitySurface />);
    await userEvent.click(screen.getByRole('button', { name: '매장 변경' }));
    expect(await screen.findByRole('dialog', { name: '매장 선택' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('다이소 명동역점')).toBeInTheDocument();
  });
});

describe('live search', () => {
  test('submitting 밀폐용기 runs the query pipeline to Success', async () => {
    render(<AvailabilitySurface />);
    const input = screen.getByLabelText('상품 검색');
    await userEvent.type(input, '밀폐용기{Enter}');
    expect(input).toHaveValue('밀폐용기');
    expect(await screen.findByText('이 매장에 있어요')).toBeInTheDocument();
  });

  test('submitting an unknown keyword ends in Empty with the Bible body', async () => {
    render(<AvailabilitySurface />);
    await userEvent.type(screen.getByLabelText('상품 검색'), '락앤락같은통{Enter}');
    // The a11y LiveRegion announces the same sentence; target the answer-card paragraph.
    expect(
      await screen.findByText(emptyBody('락앤락같은통'), { selector: 'p' }),
    ).toBeInTheDocument();
  });

  test('submitting a blank query does nothing', async () => {
    render(<AvailabilitySurface />);
    await userEvent.type(screen.getByLabelText('상품 검색'), '   {Enter}');
    expect(useAvailabilityStore.getState().ui).toEqual({ state: 'default' });
  });
});

describe('retry (B15)', () => {
  test('다시 확인 re-runs the retained query, not the input field', async () => {
    useAvailabilityStore.setState({
      ui: { state: 'error', variant: 'noCache', query: '밀폐용기' },
    });
    render(<AvailabilitySurface />);
    await userEvent.click(screen.getByRole('button', { name: '다시 확인' }));
    expect(await screen.findByText('이 매장에 있어요')).toBeInTheDocument();
    expect(useAvailabilityStore.getState().ui).toMatchObject({
      state: 'success',
      query: '밀폐용기',
    });
  });
});
