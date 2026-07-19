// functions/api/stock.test.ts
import { onRequestPost, stripMallOnlyFields } from './stock';

test('mall-only commerce fields are stripped at the proxy boundary', () => {
  const upstream = {
    data: { msStrVOList: [{ strCd: '1', qty: '3', pkupYn: 'Y', pntAcmYn: 'Y', intUseYn: 'Y' }] },
  };
  const out = stripMallOnlyFields(upstream);
  const row = out.data.msStrVOList[0];
  expect(row.qty).toBe('3');
  expect('pkupYn' in row).toBe(false);
  expect('pntAcmYn' in row).toBe(false);
  expect('intUseYn' in row).toBe(false);
});

describe('onRequestPost upstream hardening', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('upstream fetch rejection → 502 upstream_unavailable with CORS + no-store', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    const res = await onRequestPost({
      request: new Request('http://x', { method: 'POST', body: '{}' }),
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream_unavailable' });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  test('upstream resolves but body is not JSON → 502 upstream_unavailable with CORS + no-store', async () => {
    globalThis.fetch = (async () =>
      new Response('not json', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })) as typeof fetch;
    const res = await onRequestPost({
      request: new Request('http://x', { method: 'POST', body: '{}' }),
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream_unavailable' });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
