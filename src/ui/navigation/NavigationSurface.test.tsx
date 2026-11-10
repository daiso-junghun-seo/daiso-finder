import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { mockAnswers } from '../../adapters/mock/fixtures';
import type { StoreStockRepository } from '../../domain/ports';
import type { AvailabilityAnswer, StoreContext } from '../../domain/types';
import { STR } from '../../i18n/strings';
import {
  NAV_MISSING_LINK,
  NAV_PHOTO_MISSING_NOTE,
  NAV_RECOVERY_STILL_BODY,
  NAV_SOLD_OUT_BODY,
  RETRY_BUTTON,
  SUCCESS_OUT_CTA,
  navigationRecoveryOther,
} from '../copy';
import { NavigationSurface, PULL_TO_REFRESH_PX } from './NavigationSurface';
import type { InStockAnswer, NavigationEntry } from './navigation-refresh';

const NOW = new Date(2026, 6, 15, 9, 0).getTime();
const STORE: StoreContext = { strCd: '001', strNm: '명동역점' };
const ANSWER = mockAnswers.inStock as InStockAnswer;
const MULTI = mockAnswers.inStockMultiLocation as InStockAnswer;
const KO = STR.ko;
const EN = STR.en;

function entry(overrides: Partial<NavigationEntry> = {}): NavigationEntry {
  return {
    store: STORE,
    answer: ANSWER,
    freshness: { class: 'live', observedAt: NOW },
    term: { kind: 'keyword', keyword: '밀폐용기' },
    ...overrides,
  };
}

function repoReturning(...answers: AvailabilityAnswer[]): StoreStockRepository {
  const query = vi.fn();
  for (const answer of answers) query.mockResolvedValueOnce(answer);
  query.mockResolvedValue(answers[answers.length - 1] ?? ANSWER);
  return { query };
}

// For render-only assertions: keeps the entry refresh pending so no background outcome can race
// the assertion (and unmount cleans the controller up).
function pendingRepo(): StoreStockRepository {
  return { query: vi.fn(() => new Promise<AvailabilityAnswer>(() => {})) };
}

function renderSurface(
  props: Partial<ComponentProps<typeof NavigationSurface>> = {},
  repo: StoreStockRepository = repoReturning(ANSWER),
) {
  return render(
    <NavigationSurface entry={entry()} locale="ko" repo={repo} now={() => NOW} {...props} />,
  );
}

test('renders guidance from data in hand before any request resolves', () => {
  const repo = pendingRepo();
  renderSurface({}, repo);
  expect(screen.getByText(/11층 56번/)).toBeInTheDocument();
  expect(screen.getByText('리빙 밀폐용기 1.2L')).toBeInTheDocument();
  expect(screen.getByText('2,000원')).toBeInTheDocument();
  expect(screen.getByText('방금 확인한 재고예요')).toBeInTheDocument();
  // Reading order starts at the location line, not the top of the page.
  expect(screen.getByText(/11층 56번/)).toHaveFocus();
  expect(repo.query).toHaveBeenCalledTimes(1);
});

test('a missing photo carries the identity note instead of a blank frame', () => {
  renderSurface({ entry: entry({ answer: { ...ANSWER, imageUrl: undefined } }) }, pendingRepo());
  expect(screen.getByText(NAV_PHOTO_MISSING_NOTE)).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('multiple positions ask the shopper to choose, then become one guidance line', async () => {
  const user = userEvent.setup();
  renderSurface({ entry: entry({ answer: MULTI }) }, pendingRepo());
  expect(screen.getByText('두 곳에 있어요')).toHaveFocus();
  await user.click(screen.getByRole('button', { name: '2층 14번' }));
  // The chosen position becomes the single dominant line; the other stays disclosed at L3.
  expect(screen.getByText(/2층 14번/)).toHaveFocus();
  const disclosure = screen.getByRole('button', { name: '다른 위치 1곳 더 ▾' });
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await user.click(disclosure);
  expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: '11층 56번' })).toBeInTheDocument();
});

test('N>2 positions use the mechanical count heading', () => {
  renderSurface(
    {
      entry: entry({
        answer: { ...ANSWER, locations: [...MULTI.locations, { floor: '3', zone: '12' }] },
      }),
    },
    pendingRepo(),
  );
  expect(screen.getByText('3곳에 있어요')).toBeInTheDocument();
});

test('못 찾겠어요 offers another position when the refresh still lists this one', async () => {
  const user = userEvent.setup();
  const repo: StoreStockRepository = {
    query: vi
      .fn()
      .mockResolvedValueOnce(ANSWER)
      .mockResolvedValueOnce({
        ...ANSWER,
        locations: [...ANSWER.locations, { floor: '2', zone: '14' }],
      }),
  };
  renderSurface({}, repo);
  await waitFor(() => expect(repo.query).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole('button', { name: NAV_MISSING_LINK }));
  const other = await screen.findByRole('button', {
    name: navigationRecoveryOther({ floor: '2', zone: '14' }),
  });
  expect(other).toHaveFocus();
  await user.click(other);
  expect(screen.getByText(/2층 14번/, { selector: 'p' })).toHaveFocus();
});

test('못 찾겠어요 falls back to the staff sentence when no other position exists', async () => {
  const user = userEvent.setup();
  const repo = repoReturning(ANSWER);
  renderSurface({}, repo);
  await waitFor(() => expect(repo.query).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole('button', { name: NAV_MISSING_LINK }));
  const heading = await screen.findByText(NAV_RECOVERY_STILL_BODY);
  expect(heading).toHaveFocus();
  expect(screen.getByRole('button', { name: SUCCESS_OUT_CTA })).toBeInTheDocument();
});

test('a failed background refresh leaves the guidance and the stamp untouched', async () => {
  const repo: StoreStockRepository = { query: vi.fn(() => Promise.reject(new Error('offline'))) };
  renderSurface({}, repo);
  await waitFor(() => expect(repo.query).toHaveBeenCalledTimes(1));
  expect(screen.getByText(/11층 56번/)).toBeInTheDocument();
  expect(screen.getByText('방금 확인한 재고예요')).toBeInTheDocument();
  expect(screen.queryByText(NAV_SOLD_OUT_BODY)).not.toBeInTheDocument();
});

test('a refresh that reports temporarilyOut exits to the sold-out state', async () => {
  const repo = repoReturning(mockAnswers.temporarilyOut, mockAnswers.temporarilyOut);
  renderSurface({}, repo);
  const heading = await screen.findByText(NAV_SOLD_OUT_BODY);
  expect(heading).toHaveFocus();
  expect(screen.getByRole('button', { name: SUCCESS_OUT_CTA })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(`${NAV_SOLD_OUT_BODY} ${SUCCESS_OUT_CTA}`);
});

test('a negative state other than sold out is unapplied (D4): guidance stays', async () => {
  const repo = repoReturning(mockAnswers.discontinued);
  renderSurface({}, repo);
  await waitFor(() => expect(repo.query).toHaveBeenCalledTimes(1));
  expect(screen.getByText(/11층 56번/)).toBeInTheDocument();
  expect(screen.queryByText(NAV_SOLD_OUT_BODY)).not.toBeInTheDocument();
  expect(screen.queryByText(NAV_RECOVERY_STILL_BODY)).not.toBeInTheDocument();
});

test('a stale stamp demotes to the system-error body and 다시 확인 recovers it', async () => {
  const user = userEvent.setup();
  const repo: StoreStockRepository = {
    query: vi
      .fn()
      .mockImplementationOnce(() => new Promise<AvailabilityAnswer>(() => {}))
      .mockResolvedValue(ANSWER),
  };
  renderSurface(
    {
      entry: entry({
        freshness: { class: 'cachedBeyondThreshold', observedAt: NOW - 7 * 3_600_000 },
      }),
    },
    repo,
  );
  expect(screen.getByText(/오늘 재고는 확인하지 못했어요/, { selector: 'p' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: RETRY_BUTTON }));
  await waitFor(() => expect(screen.getByText('방금 확인한 재고예요')).toBeInTheDocument());
  expect(
    screen.queryByText(/오늘 재고는 확인하지 못했어요/, { selector: 'p' }),
  ).not.toBeInTheDocument();
});

test('pull-to-refresh triggers one request only past the threshold', async () => {
  const repo = repoReturning(ANSWER);
  const { container } = renderSurface({}, repo);
  await waitFor(() => expect(repo.query).toHaveBeenCalledTimes(1));
  const body = container.querySelector('.navigation-body');
  if (!body) throw new Error('navigation body missing');
  const pull = container.querySelector('.navigation-pull');

  fireEvent.touchStart(body, { touches: [{ clientY: 100 }] });
  fireEvent.touchMove(body, { touches: [{ clientY: 100 + PULL_TO_REFRESH_PX - 1 }] });
  expect(pull).toHaveAttribute('data-visible', 'true');
  fireEvent.touchEnd(body);
  expect(repo.query).toHaveBeenCalledTimes(1);
  expect(pull).toHaveAttribute('data-visible', 'false');

  fireEvent.touchStart(body, { touches: [{ clientY: 100 }] });
  fireEvent.touchMove(body, { touches: [{ clientY: 100 + PULL_TO_REFRESH_PX }] });
  fireEvent.touchEnd(body);
  await waitFor(() => expect(repo.query).toHaveBeenCalledTimes(2));
});

test('returning to the foreground refreshes once', async () => {
  const repo = repoReturning(ANSWER);
  renderSurface({}, repo);
  await waitFor(() => expect(repo.query).toHaveBeenCalledTimes(1));
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitFor(() => expect(repo.query).toHaveBeenCalledTimes(2));
});

test('the display clock re-renders the age but never becomes a polling request', async () => {
  vi.useFakeTimers();
  try {
    const repo = repoReturning(ANSWER);
    renderSurface({}, repo);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(repo.query).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect(repo.query).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

test('English renders the same guidance with translated grammar', async () => {
  const user = userEvent.setup();
  const repo = repoReturning(ANSWER);
  renderSurface({ locale: 'en' }, repo);
  expect(screen.getByText(/11F · No\. 56/)).toBeInTheDocument();
  expect(screen.getByText('Just checked')).toBeInTheDocument();
  await waitFor(() => expect(repo.query).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole('button', { name: EN.NAV_MISSING_LINK }));
  expect(await screen.findByText(EN.NAV_RECOVERY_STILL_BODY)).toBeInTheDocument();
});

test('unmount aborts the in-flight request', async () => {
  let seen: AbortSignal | undefined;
  const repo: StoreStockRepository = {
    query: vi.fn((_store, _term, signal) => {
      seen = signal;
      return new Promise<AvailabilityAnswer>(() => {});
    }),
  };
  const { unmount } = renderSurface({}, repo);
  await waitFor(() => expect(repo.query).toHaveBeenCalledTimes(1));
  unmount();
  expect(seen?.aborted).toBe(true);
});

test('the full Korean sentence set is reachable from the surface (copy wiring)', () => {
  renderSurface({}, pendingRepo());
  expect(screen.getByText(/11층 56번/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: KO.NAV_MISSING_LINK })).toBeInTheDocument();
});
