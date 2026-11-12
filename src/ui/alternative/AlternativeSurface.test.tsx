import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactElement } from 'react';
import { mockNearbyRows, mockSimilarRows } from '../../adapters/mock/alternativeFixtures';
import { defaultPolicy } from '../../domain/policy';
import type { AlternativeRepository } from '../../domain/ports';
import type { NearbyAlternative, SimilarAlternative } from '../../domain/types';
import {
  ALT_EMPTY_BOTH,
  ALT_EMPTY_MALL,
  ALT_EMPTY_RESEARCH,
  ALT_EMPTY_STAFF,
  ALT_ERROR_BODY,
  ALT_ERROR_RETRY,
  ALT_ERROR_STAFF,
  ALT_LOADING_BOTH,
  ALT_LOADING_SIMILAR,
  ALT_NEARBY_EMPTY,
  ALT_NEARBY_HEADING,
  ALT_REASON_TEMPORARILY_OUT,
  ALT_SIMILAR_EMPTY,
  ALT_SIMILAR_FAILED,
  ALT_SIMILAR_HEADING,
  ALT_SLOT_RETRY,
  ALT_STORE_CARD_CLOSED,
  ALT_STORE_CARD_IN_STOCK,
  altNearbyRowLabel,
  altSimilarRowLabel,
  altStaleBody,
  altStoreCardHeading,
  cachedFreshnessCaption,
} from '../copy';
import { formatRelativeTimeKo } from '../format';
import { PULL_TO_REFRESH_PX } from '../navigation/NavigationSurface';
import { AlternativeSurface } from './AlternativeSurface';
import { createAlternativeCache } from './alternative-cache';
import type { AlternativeEntry, AlternativeSnapshot } from './alternative-types';
import { currentMapPlatform, mapHref } from './map-link';

const NOW = new Date(2026, 6, 15, 9, 0).getTime();
const STORE = { strCd: '001', strNm: '명동역점' };
const PRODUCT = '리빙 밀폐용기 1.2L';
// The fixture rows are typed as arrays; these pin the rows the assertions name without non-null noise.
const SIMILAR_FIRST = mockSimilarRows[0] as SimilarAlternative;
const SIMILAR_LOW = mockSimilarRows[1] as SimilarAlternative;
const NEARBY_FIRST = mockNearbyRows[0] as NearbyAlternative;
const NEARBY_CLOSED = mockNearbyRows[2] as NearbyAlternative;

function entry(overrides: Partial<AlternativeEntry> = {}): AlternativeEntry {
  return {
    store: STORE,
    reason: 'temporarilyOut',
    productName: PRODUCT,
    pdNo: '19987',
    imageUrl: 'https://cdn.daisomall.co.kr/file/PD/test.jpg',
    price: 2000,
    keyword: PRODUCT,
    issued: { similar: true, nearby: false },
    lead: 'similar',
    origin: 'flow1',
    ...overrides,
  };
}

function repoReturning(
  similar: () => Promise<SimilarAlternative[]> = async () => mockSimilarRows,
  nearby: () => Promise<NearbyAlternative[]> = async () => mockNearbyRows,
): AlternativeRepository {
  return { querySimilar: vi.fn(similar), queryNearby: vi.fn(nearby) };
}

function pendingRepo(): AlternativeRepository {
  return {
    querySimilar: vi.fn(() => new Promise<SimilarAlternative[]>(() => {})),
    queryNearby: vi.fn(() => new Promise<NearbyAlternative[]>(() => {})),
  };
}

function failingRepo(): AlternativeRepository {
  return {
    querySimilar: vi.fn(() => Promise.reject(new Error('similar failed'))),
    queryNearby: vi.fn(() => Promise.reject(new Error('nearby failed'))),
  };
}

function renderSurface(
  props: Partial<ComponentProps<typeof AlternativeSurface>> = {},
  repository: AlternativeRepository = repoReturning(),
  cache = createAlternativeCache(() => NOW),
) {
  const onResearch = props.onResearch ?? vi.fn();
  const element = (
    extra: Partial<ComponentProps<typeof AlternativeSurface>> = {},
  ): ReactElement => (
    <AlternativeSurface
      entry={entry()}
      locale="ko"
      repo={repository}
      cache={cache}
      now={() => NOW}
      onResearch={onResearch}
      {...props}
      {...extra}
    />
  );
  return { ...render(element()), element, onResearch };
}

function successSnapshot(): AlternativeSnapshot {
  return {
    slots: {
      similar: { status: 'ready', rows: mockSimilarRows },
      nearby: { status: 'ready', rows: mockNearbyRows },
    },
    issued: { similar: true, nearby: true },
    observedAt: NOW,
    source: 'live',
    settled: true,
  };
}

function nearbyLabel(row: NearbyAlternative): string {
  return altNearbyRowLabel(row.strNm, row.distanceM, row.closingTime, row.closedToday);
}

test('opens on the answer in hand: context first, then Group A rows — no waiting for the network', () => {
  renderSurface({}, pendingRepo());
  // Reading order starts at the context header, not the top of the card (spec §1).
  expect(screen.getByText(PRODUCT).closest('header')).toHaveFocus();
  expect(screen.getByText(ALT_REASON_TEMPORARILY_OUT)).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(ALT_LOADING_SIMILAR);
  expect(screen.getByText(ALT_LOADING_SIMILAR, { selector: 'p.alt-loading' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: ALT_SIMILAR_HEADING })).toBeInTheDocument();
  // A withheld group renders nothing at all: not a heading, not an empty sentence.
  expect(screen.queryByRole('heading', { name: ALT_NEARBY_HEADING })).not.toBeInTheDocument();
});

test('a ready Group A row carries the same identity label a screen reader gets on tap', async () => {
  renderSurface();
  const first = await screen.findByRole('button', {
    name: altSimilarRowLabel(SIMILAR_FIRST, defaultPolicy),
  });
  expect(first).toBeInTheDocument();
  expect(screen.getByText(SIMILAR_FIRST.productName)).toBeInTheDocument();
  // Row two is under the provisional low-quantity cutoff, so its caption is visible, not only spoken.
  expect(screen.getByText(SIMILAR_LOW.productName)).toBeInTheDocument();
  expect(screen.getByText(/재고 3개 이하/)).toBeInTheDocument();
});

test('both issued groups render in lead order (similar first) with their own headings', async () => {
  renderSurface({ entry: entry({ issued: { similar: true, nearby: true } }) });
  await screen.findByRole('button', { name: nearbyLabel(NEARBY_FIRST) });
  const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
  expect(headings).toEqual([ALT_SIMILAR_HEADING, ALT_NEARBY_HEADING]);
});

test('a not-carried entry leads with nearby stores', async () => {
  renderSurface({
    entry: entry({
      reason: 'notCarried',
      issued: { similar: true, nearby: true },
      lead: 'nearby',
    }),
  });
  await screen.findByRole('button', { name: nearbyLabel(NEARBY_FIRST) });
  const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
  expect(headings).toEqual([ALT_NEARBY_HEADING, ALT_SIMILAR_HEADING]);
});

test('the first answer renders while the second group is still pending (no barrier)', async () => {
  let resolveNearby: (rows: NearbyAlternative[]) => void = () => {};
  const nearby = new Promise<NearbyAlternative[]>((resolve) => {
    resolveNearby = resolve;
  });
  renderSurface(
    { entry: entry({ issued: { similar: true, nearby: true } }) },
    { querySimilar: vi.fn(async () => mockSimilarRows), queryNearby: vi.fn(() => nearby) },
  );
  expect(
    await screen.findByRole('button', {
      name: altSimilarRowLabel(SIMILAR_FIRST, defaultPolicy),
    }),
  ).toBeInTheDocument();
  expect(screen.getByText(ALT_LOADING_BOTH, { selector: 'p.alt-loading' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: ALT_NEARBY_HEADING })).toBeInTheDocument();

  await act(async () => {
    resolveNearby(mockNearbyRows);
  });
  expect(
    await screen.findByRole('button', { name: nearbyLabel(NEARBY_FIRST) }),
  ).toBeInTheDocument();
});

test('Group A empty with Group B withheld is a degraded Empty: no mall ladder, research still offered', async () => {
  const { onResearch } = renderSurface(
    {},
    repoReturning(async () => []),
  );
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(ALT_SIMILAR_EMPTY));
  expect(screen.queryByText(ALT_EMPTY_MALL)).not.toBeInTheDocument();
  expect(screen.getByText(ALT_EMPTY_STAFF)).toBeInTheDocument();
  // A live Empty has no stamp (the cached both-empty shape is where the age belongs — §B50-⑤).
  expect(screen.queryByText(/확인한 정보예요/)).not.toBeInTheDocument();

  await userEvent.setup().click(screen.getByRole('button', { name: ALT_EMPTY_RESEARCH }));
  expect(onResearch).toHaveBeenCalledWith(PRODUCT);
});

test('both groups empty is the full Empty: mall ladder plus the literal re-search handoff', async () => {
  const { onResearch } = renderSurface(
    { entry: entry({ issued: { similar: true, nearby: true } }) },
    repoReturning(
      async () => [],
      async () => [],
    ),
  );
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(ALT_EMPTY_BOTH));
  const mall = screen.getByRole('link', { name: ALT_EMPTY_MALL });
  expect(mall).toHaveAttribute('href', 'https://www.daisomall.co.kr/');
  expect(mall).toHaveAttribute('target', '_blank');

  await userEvent.setup().click(screen.getByRole('button', { name: ALT_EMPTY_RESEARCH }));
  expect(onResearch).toHaveBeenCalledWith(PRODUCT);
});

test('a failed Group A is the Error state, and its retry starts a fresh query', async () => {
  const repository: AlternativeRepository = {
    querySimilar: vi.fn(() => Promise.reject(new Error('dead'))),
    queryNearby: vi.fn(),
  };
  renderSurface({}, repository);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(ALT_ERROR_BODY));
  expect(screen.getByText(ALT_ERROR_STAFF)).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: ALT_ERROR_RETRY }));
  expect(repository.querySimilar).toHaveBeenCalledTimes(2);
});

test('every issued slot failing without a cache is Error — never a manufactured Empty', async () => {
  renderSurface({ entry: entry({ issued: { similar: true, nearby: true } }) }, failingRepo());
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(ALT_ERROR_BODY));
  expect(screen.queryByText(ALT_EMPTY_BOTH)).not.toBeInTheDocument();
  expect(screen.queryByText(ALT_EMPTY_MALL)).not.toBeInTheDocument();
});

test('a whole-answer cache serves only after every slot failed, with its own age and a retry', async () => {
  const cacheAt = NOW - 7 * 3_600_000;
  const cache = createAlternativeCache(() => cacheAt);
  const bothIssued = entry({ issued: { similar: true, nearby: true } });
  cache.save(bothIssued, successSnapshot());

  renderSurface(
    { entry: entry({ issued: { similar: true, nearby: true } }) },
    failingRepo(),
    cache,
  );
  expect(
    await screen.findByRole('button', {
      name: altSimilarRowLabel(SIMILAR_FIRST, defaultPolicy),
    }),
  ).toBeInTheDocument();
  // The stamp reports the cache write, not "just now" — and past 6h it says the check failed.
  expect(screen.getByText(altStaleBody(formatRelativeTimeKo(cacheAt, NOW)))).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: ALT_SLOT_RETRY }).length).toBeGreaterThan(0);
});

test('a fresh cache keeps its age caption rather than the stale warning', async () => {
  const cacheAt = NOW - 60_000;
  const cache = createAlternativeCache(() => cacheAt);
  cache.save(entry({ issued: { similar: true, nearby: true } }), successSnapshot());

  renderSurface(
    { entry: entry({ issued: { similar: true, nearby: true } }) },
    failingRepo(),
    cache,
  );
  expect(
    await screen.findByText(cachedFreshnessCaption(formatRelativeTimeKo(cacheAt, NOW))),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(altStaleBody(formatRelativeTimeKo(cacheAt, NOW))),
  ).not.toBeInTheDocument();
});

test('a nearby row opens the store card: closed hours, in-stock status, and the map handoff', async () => {
  const user = userEvent.setup();
  renderSurface({ entry: entry({ issued: { similar: true, nearby: true } }) });
  const closedRow = NEARBY_CLOSED;
  await user.click(await screen.findByRole('button', { name: nearbyLabel(closedRow) }));

  const heading = screen.getByText(altStoreCardHeading(closedRow.strNm, closedRow.distanceM));
  expect(heading).toHaveFocus();
  expect(screen.getByText(ALT_STORE_CARD_CLOSED)).toBeInTheDocument();
  expect(screen.getByText(ALT_STORE_CARD_IN_STOCK)).toBeInTheDocument();
  const href = mapHref(closedRow.address, currentMapPlatform());
  if (href) {
    expect(
      screen.getByRole('link', { name: `${closedRow.address} — 지도 앱에서 열기` }),
    ).toHaveAttribute('href', href);
  }
});

test('the header back pops one level and returns focus to the row that opened it', async () => {
  const user = userEvent.setup();
  const { rerender, element } = renderSurface({
    entry: entry({ issued: { similar: true, nearby: true } }),
  });
  const row = await screen.findByRole('button', { name: nearbyLabel(NEARBY_FIRST) });
  await user.click(row);
  expect(
    screen.getByText(altStoreCardHeading(NEARBY_FIRST.strNm, NEARBY_FIRST.distanceM)),
  ).toHaveFocus();

  rerender(element({ backSignal: 1 }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: nearbyLabel(NEARBY_FIRST) })).toHaveFocus(),
  );
});

test('depth is reported for the parent header: 1 list, 2 with an overlay on top', async () => {
  const user = userEvent.setup();
  const onDepthChange = vi.fn();
  renderSurface({ entry: entry({ issued: { similar: true, nearby: true } }), onDepthChange });
  await waitFor(() => expect(onDepthChange).toHaveBeenLastCalledWith(1));
  await user.click(await screen.findByRole('button', { name: nearbyLabel(NEARBY_FIRST) }));
  await waitFor(() => expect(onDepthChange).toHaveBeenLastCalledWith(2));
});

test('a mixed answer keeps a failed slot inside its group: failure sentence, no empty claim, slot retry', async () => {
  const user = userEvent.setup();
  let similarCalls = 0;
  const repository: AlternativeRepository = {
    querySimilar: vi.fn(async () => {
      similarCalls += 1;
      if (similarCalls === 1) throw new Error('dead');
      return mockSimilarRows;
    }),
    queryNearby: vi.fn(async () => mockNearbyRows),
  };
  renderSurface({ entry: entry({ issued: { similar: true, nearby: true } }) }, repository);

  // Nearby rows prove this is a Partial answer, not Error — the failure stays slot-scoped.
  await screen.findByRole('button', { name: nearbyLabel(NEARBY_FIRST) });
  expect(screen.getByText(ALT_SIMILAR_FAILED)).toBeInTheDocument();
  // A failed slot must never borrow the empty sentence: it did not learn that nothing exists.
  expect(screen.queryByText(ALT_SIMILAR_EMPTY)).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: ALT_SLOT_RETRY }));
  expect(
    await screen.findByRole('button', {
      name: altSimilarRowLabel(SIMILAR_FIRST, defaultPolicy),
    }),
  ).toBeInTheDocument();
  expect(screen.queryByText(ALT_SIMILAR_FAILED)).not.toBeInTheDocument();
  expect(repository.querySimilar).toHaveBeenCalledTimes(2);
  // Slot-scoped means exactly that: the ready group is not re-queried.
  expect(repository.queryNearby).toHaveBeenCalledTimes(1);
});

test('a ready Group A still names an empty Group B', async () => {
  renderSurface(
    { entry: entry({ issued: { similar: true, nearby: true } }) },
    repoReturning(undefined, async () => []),
  );
  await screen.findByRole('button', { name: altSimilarRowLabel(SIMILAR_FIRST, defaultPolicy) });
  await waitFor(() => expect(screen.getByText(ALT_NEARBY_EMPTY)).toBeInTheDocument());
});

test('an app resume refreshes in the background and the rows never blank out', async () => {
  let calls = 0;
  const repository: AlternativeRepository = {
    querySimilar: vi.fn(async () => {
      calls += 1;
      return calls === 1 ? mockSimilarRows : [SIMILAR_FIRST];
    }),
    queryNearby: vi.fn(),
  };
  renderSurface({}, repository);
  await screen.findByRole('button', {
    name: altSimilarRowLabel(SIMILAR_FIRST, defaultPolicy),
  });
  expect(screen.getByText(SIMILAR_LOW.productName)).toBeInTheDocument();

  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitFor(() => expect(repository.querySimilar).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(SIMILAR_LOW.productName)).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: altSimilarRowLabel(SIMILAR_FIRST, defaultPolicy) }),
  ).toBeInTheDocument();
});

test('pull-to-refresh fires once past the threshold and the rows stay in hand', async () => {
  const repository = repoReturning();
  const { container } = renderSurface({}, repository);
  await screen.findByRole('button', {
    name: altSimilarRowLabel(SIMILAR_FIRST, defaultPolicy),
  });
  const body = container.querySelector('.alternative-body');
  if (!body) throw new Error('alternative body missing');
  const pull = container.querySelector('.navigation-pull');

  fireEvent.touchStart(body, { touches: [{ clientY: 100 }] });
  fireEvent.touchMove(body, { touches: [{ clientY: 100 + PULL_TO_REFRESH_PX - 1 }] });
  expect(pull).toHaveAttribute('data-visible', 'true');
  fireEvent.touchEnd(body);
  expect(repository.querySimilar).toHaveBeenCalledTimes(1);
  expect(pull).toHaveAttribute('data-visible', 'false');
  expect(
    screen.getByRole('button', { name: altSimilarRowLabel(SIMILAR_FIRST, defaultPolicy) }),
  ).toBeInTheDocument();

  fireEvent.touchStart(body, { touches: [{ clientY: 100 }] });
  fireEvent.touchMove(body, { touches: [{ clientY: 100 + PULL_TO_REFRESH_PX }] });
  fireEvent.touchEnd(body);
  await waitFor(() => expect(repository.querySimilar).toHaveBeenCalledTimes(2));
});

test('a similar row opens Flow 2 guidance over the list; back restores the row', async () => {
  const user = userEvent.setup();
  const { rerender, element } = renderSurface();
  const row = await screen.findByRole('button', {
    name: altSimilarRowLabel(SIMILAR_FIRST, defaultPolicy),
  });
  await user.click(row);

  // Flow 2 renders the row's own locations from data in hand — no second query for the answer.
  expect(screen.getByText(SIMILAR_FIRST.productName)).toBeInTheDocument();
  expect(screen.getByText(/11층 56번/, { selector: 'p' })).toBeInTheDocument();

  rerender(element({ backSignal: 1 }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: altSimilarRowLabel(SIMILAR_FIRST, defaultPolicy) }),
    ).toHaveFocus(),
  );
});
