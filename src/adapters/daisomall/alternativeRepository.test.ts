import { UnmappableAnswerError } from '../../domain/errors';
import type { SimilarAlternative } from '../../domain/types';
import { createDaisoAlternativeRepository } from './alternativeRepository';
import { parseRawAlternatives } from './rawAlternative';

const STORE = { strCd: '10803', strNm: '명동역점' };
const ROW = {
  pdNo: '20001',
  productName: '리빙 밀폐용기 1.4L',
  price: 3000,
  imageUrl: 'https://cdn.daisomall.co.kr/file/PD/20001.jpg',
  qtyUpperBound: 12,
  locations: [{ floor: '11', zone: '56' }],
};

function fakeFetch(payload: unknown, status = 200) {
  const calls: Array<{
    url: string;
    init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal };
  }> = [];
  const fetchImpl = async (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
  ) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
  };
  return { calls, fetchImpl };
}

test('querySimilar POSTs the store/term and maps validated rows', async () => {
  const { calls, fetchImpl } = fakeFetch({ rows: [ROW], omitted: 0 });
  const repo = createDaisoAlternativeRepository({ fetchImpl });
  const rows = await repo.querySimilar(STORE, { keyword: '밀폐용기', excludePdNo: '19987' });
  expect(rows).toEqual([
    {
      pdNo: '20001',
      productName: '리빙 밀폐용기 1.4L',
      price: 3000,
      qtyUpperBound: 12,
      locations: [{ floor: '11', zone: '56' }],
      imageUrl: 'https://cdn.daisomall.co.kr/file/PD/20001.jpg',
    },
  ]);
  expect(calls[0]?.url).toBe('/api/alternatives');
  expect(calls[0]?.init.method).toBe('POST');
  expect(calls[0]?.init.headers).toEqual({ 'content-type': 'application/json' });
  expect(JSON.parse(calls[0]?.init.body ?? '{}')).toEqual({
    strCd: '10803',
    keyword: '밀폐용기',
    excludePdNo: '19987',
  });
});

test('querySimilar omits excludePdNo when absent and forwards the abort signal', async () => {
  const { calls, fetchImpl } = fakeFetch({ rows: [], omitted: 0 });
  const repo = createDaisoAlternativeRepository({ fetchImpl });
  const controller = new AbortController();
  await repo.querySimilar(STORE, { keyword: '밀폐용기' }, controller.signal);
  expect(JSON.parse(calls[0]?.init.body ?? '{}')).toEqual({
    strCd: '10803',
    keyword: '밀폐용기',
  });
  expect(calls[0]?.init.signal).toBe(controller.signal);
});

test('null imageUrl and extra whitespace are normalized; empty imageUrl is dropped', async () => {
  const { fetchImpl } = fakeFetch({
    rows: [
      { ...ROW, pdNo: ' 20001 ', productName: ' 이름 ', imageUrl: null },
      { ...ROW, pdNo: '20002', imageUrl: '' },
    ],
    omitted: 0,
  });
  const rows = await createDaisoAlternativeRepository({ fetchImpl }).querySimilar(STORE, {
    keyword: '밀폐용기',
  });
  expect(rows[0]).toEqual({
    pdNo: '20001',
    productName: '이름',
    price: 3000,
    qtyUpperBound: 12,
    locations: [{ floor: '11', zone: '56' }],
  });
  expect(rows[1]).not.toHaveProperty('imageUrl');
});

test('a non-ok response throws → the slot fails', async () => {
  const { fetchImpl } = fakeFetch({ error: 'upstream_unavailable' }, 502);
  const repo = createDaisoAlternativeRepository({ fetchImpl });
  await expect(repo.querySimilar(STORE, { keyword: '밀폐용기' })).rejects.toThrow(
    'alternatives 502',
  );
});

test('a malformed payload throws, never an empty claim', async () => {
  for (const payload of [null, {}, { rows: 'nope', omitted: 0 }, { rows: [], omitted: -1 }]) {
    const { fetchImpl } = fakeFetch(payload);
    const repo = createDaisoAlternativeRepository({ fetchImpl });
    await expect(repo.querySimilar(STORE, { keyword: '밀폐용기' })).rejects.toBeInstanceOf(
      UnmappableAnswerError,
    );
  }
});

test('rows=[] omitted=0 is an honest empty', async () => {
  const { fetchImpl } = fakeFetch({ rows: [], omitted: 0 });
  await expect(
    createDaisoAlternativeRepository({ fetchImpl }).querySimilar(STORE, { keyword: '밀폐용기' }),
  ).resolves.toEqual([]);
});

test('rows=[] omitted>0 is a failed slot, not “no similar items”', async () => {
  const { fetchImpl } = fakeFetch({ rows: [], omitted: 2 });
  await expect(
    createDaisoAlternativeRepository({ fetchImpl }).querySimilar(STORE, { keyword: '밀폐용기' }),
  ).rejects.toThrow('candidates found but none publishable');
});

test('an unreadable row is dropped while readable siblings survive', () => {
  const parsed = parseRawAlternatives({
    rows: [
      ROW,
      { ...ROW, pdNo: '' },
      { ...ROW, price: Number.NaN },
      { ...ROW, qtyUpperBound: 0 },
      { ...ROW, locations: [{ floor: '11', zone: '  ' }] },
      { ...ROW, locations: [] },
    ],
    omitted: 0,
  });
  expect(parsed.rows).toHaveLength(1);
  expect(parsed.omitted).toBe(5); // dropped rows count as unpublishable evidence
});

test('all rows unreadable throws instead of reporting empty', () => {
  expect(() => parseRawAlternatives({ rows: [{ pdNo: '' }], omitted: 0 })).toThrow(
    UnmappableAnswerError,
  );
});

test('queryNearby is withheld, not silently answered', async () => {
  const repo = createDaisoAlternativeRepository({ fetchImpl: fakeFetch({}).fetchImpl });
  await expect(repo.queryNearby(STORE, '19987')).rejects.toThrow('nearby live is withheld');
});

test('parse returns SimilarAlternative rows with the location pairs intact', () => {
  const parsed: { rows: SimilarAlternative[] } = parseRawAlternatives({
    rows: [
      {
        ...ROW,
        locations: [
          { floor: '11', zone: '56' },
          { floor: '2', zone: '14' },
        ],
      },
    ],
    omitted: 0,
  });
  expect(parsed.rows[0]?.locations).toEqual([
    { floor: '11', zone: '56' },
    { floor: '2', zone: '14' },
  ]);
});
