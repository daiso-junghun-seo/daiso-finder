import { render, screen } from '@testing-library/react';
import { mockAnswers } from '../adapters/mock/fixtures';
import { defaultPolicy } from '../domain/policy';
import { AnswerCard } from './AnswerCard';
import {
  ERROR_CACHED_BANNER,
  ERROR_NO_CACHE_BODY,
  LIVE_FRESHNESS_CAPTION,
  LOADING_CARD_COPY,
  LOADING_DELAY_LINE,
  PARTIAL_FRANCHISE_BODY,
  PARTIAL_FRANCHISE_CTA,
  PARTIAL_NO_LOCATION_CTA,
  PARTIAL_STALE_CACHE_CTA,
  RETRY_BUTTON,
  SUCCESS_ENDED_BODY,
  SUCCESS_ENDED_CTA,
  SUCCESS_IN_STOCK_CTA,
  SUCCESS_IN_STOCK_STATUS,
  SUCCESS_NOT_CARRIED_BODY,
  SUCCESS_NOT_CARRIED_CTA,
  SUCCESS_OUT_BODY,
  SUCCESS_OUT_CTA,
  SUCCESS_OUT_SECONDARY_CTA,
  SUCCESS_RESTOCKING_CTA,
  cachedFreshnessCaption,
  emptyBody,
  extraPositionsLabel,
  lowQtyCaption,
  partialLocationMissingBody,
  partialStaleCacheBody,
  restockBody,
} from './copy';

const NOW = new Date(2026, 6, 15, 9, 0).getTime();
const YESTERDAY_6PM = new Date(2026, 6, 14, 18, 0).getTime();

test('loading (fast) shows the card copy without the delay line', () => {
  render(
    <AnswerCard
      ui={{ state: 'loading', query: '밀폐용기', slow: false }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByText(LOADING_CARD_COPY)).toBeInTheDocument();
  expect(screen.queryByText(LOADING_DELAY_LINE)).not.toBeInTheDocument();
});

test('loading (slow) adds the delay line', () => {
  render(
    <AnswerCard
      ui={{ state: 'loading', query: '밀폐용기', slow: true }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByText(LOADING_DELAY_LINE)).toBeInTheDocument();
});

test('empty renders the Bible body with the query quoted', () => {
  render(
    <AnswerCard
      ui={{ state: 'empty', query: '락앤락같은통', suggestions: [] }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByText(emptyBody('락앤락같은통'))).toBeInTheDocument();
});

test('error/noCache renders the no-cache body and the retry button', () => {
  render(
    <AnswerCard
      ui={{ state: 'error', variant: 'noCache', query: '밀폐용기' }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByText(ERROR_NO_CACHE_BODY)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: RETRY_BUTTON })).toBeInTheDocument();
});

test('error/cached renders the banner, cached facts, cache-age caption, and retry', () => {
  render(
    <AnswerCard
      ui={{
        state: 'error',
        variant: 'cached',
        query: '밀폐용기',
        answer: mockAnswers.inStock,
        freshness: { class: 'cachedWithinThreshold', observedAt: YESTERDAY_6PM },
      }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByText(ERROR_CACHED_BANNER)).toBeInTheDocument();
  expect(screen.getByText(mockAnswers.inStock.productName)).toBeInTheDocument();
  expect(screen.getByText(SUCCESS_IN_STOCK_STATUS)).toBeInTheDocument();
  expect(screen.getByText('2,000원 · 11층 56번')).toBeInTheDocument();
  expect(screen.getByText(cachedFreshnessCaption('어제 오후 6시'))).toBeInTheDocument();
  expect(screen.getByRole('button', { name: RETRY_BUTTON })).toBeInTheDocument();
});

test('error/cached still shows the known price when the cached inStock answer has no location', () => {
  render(
    <AnswerCard
      ui={{
        state: 'error',
        variant: 'cached',
        query: '밀폐용기',
        answer: mockAnswers.noLocation,
        freshness: { class: 'cachedWithinThreshold', observedAt: YESTERDAY_6PM },
      }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByText(SUCCESS_IN_STOCK_STATUS)).toBeInTheDocument();
  expect(screen.getByText('2,000원')).toBeInTheDocument();
});

test('error/noCache body carries the same Error color role as error/cached (Interface §5/§9 decision 6)', () => {
  render(
    <AnswerCard
      ui={{ state: 'error', variant: 'noCache', query: '밀폐용기' }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByText(ERROR_NO_CACHE_BODY)).toHaveClass('error-banner');
});

test('success inStock (ample qty) shows live freshness, price/location, and the CTA', () => {
  render(
    <AnswerCard
      ui={{
        state: 'success',
        query: '밀폐용기',
        answer: mockAnswers.inStock,
        freshness: { class: 'live', observedAt: NOW },
      }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByText(SUCCESS_IN_STOCK_STATUS)).toBeInTheDocument();
  expect(screen.getByText('2,000원 · 11층 56번')).toBeInTheDocument();
  expect(screen.getByText(LIVE_FRESHNESS_CAPTION)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: SUCCESS_IN_STOCK_CTA })).toBeInTheDocument();
});

test('success inStock (low qty) swaps in the upper-bound caption', () => {
  render(
    <AnswerCard
      ui={{
        state: 'success',
        query: '밀폐용기',
        answer: mockAnswers.inStockLowQty,
        freshness: { class: 'live', observedAt: NOW },
      }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByText(lowQtyCaption(3))).toBeInTheDocument();
  expect(screen.queryByText(LIVE_FRESHNESS_CAPTION)).not.toBeInTheDocument();
});

test('success inStock (multi-location) shows the extra-positions disclosure button', () => {
  render(
    <AnswerCard
      ui={{
        state: 'success',
        query: '밀폐용기',
        answer: mockAnswers.inStockMultiLocation,
        freshness: { class: 'live', observedAt: NOW },
      }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByRole('button', { name: extraPositionsLabel(1) })).toBeInTheDocument();
});

test('success temporarilyOut shows the body plus both the primary and secondary CTA', () => {
  render(
    <AnswerCard
      ui={{
        state: 'success',
        query: '밀폐용기',
        answer: mockAnswers.temporarilyOut,
        freshness: { class: 'live', observedAt: NOW },
      }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByText(SUCCESS_OUT_BODY)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: SUCCESS_OUT_CTA })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: SUCCESS_OUT_SECONDARY_CTA })).toBeInTheDocument();
});

const negativeSuccessCases = [
  { scenario: 'discontinued' as const, body: SUCCESS_ENDED_BODY, cta: SUCCESS_ENDED_CTA },
  { scenario: 'notCarried' as const, body: SUCCESS_NOT_CARRIED_BODY, cta: SUCCESS_NOT_CARRIED_CTA },
  {
    scenario: 'restockArriving' as const,
    body: restockBody('7월 15일'),
    cta: SUCCESS_RESTOCKING_CTA,
  },
];

for (const { scenario, body, cta } of negativeSuccessCases) {
  test(`success ${scenario} shows its Bible body and CTA`, () => {
    render(
      <AnswerCard
        ui={{
          state: 'success',
          query: '밀폐용기',
          answer: mockAnswers[scenario],
          freshness: { class: 'live', observedAt: NOW },
        }}
        policy={defaultPolicy}
        nowMs={NOW}
      />,
    );
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: cta })).toBeInTheDocument();
  });
}

test('partial/franchise shows the franchise body and CTA', () => {
  render(
    <AnswerCard
      ui={{
        state: 'partial',
        trigger: 'franchise',
        query: '밀폐용기',
        answer: mockAnswers.franchise,
        freshness: null,
      }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByText(PARTIAL_FRANCHISE_BODY)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: PARTIAL_FRANCHISE_CTA })).toBeInTheDocument();
});

test('partial/locationMissing shows the confirmed-price body and the retry CTA', () => {
  render(
    <AnswerCard
      ui={{
        state: 'partial',
        trigger: 'locationMissing',
        query: '밀폐용기',
        answer: mockAnswers.noLocation,
        freshness: null,
      }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByText(partialLocationMissingBody(2000))).toBeInTheDocument();
  expect(screen.getByRole('button', { name: PARTIAL_NO_LOCATION_CTA })).toBeInTheDocument();
});

test('partial/staleCache shows the last-seen body and the retry CTA', () => {
  render(
    <AnswerCard
      ui={{
        state: 'partial',
        trigger: 'staleCache',
        query: '밀폐용기',
        answer: mockAnswers.inStock,
        freshness: { class: 'cachedBeyondThreshold', observedAt: YESTERDAY_6PM },
      }}
      policy={defaultPolicy}
      nowMs={NOW}
    />,
  );
  expect(screen.getByText(partialStaleCacheBody('어제 오후 6시'))).toBeInTheDocument();
  expect(screen.getByRole('button', { name: PARTIAL_STALE_CACHE_CTA })).toBeInTheDocument();
});
