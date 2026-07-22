import { encryptJwt, requestAuth } from './daisoAuth';

const KEY = 'PRE_AUTH_ENC_KEY'; // 16 ASCII bytes → AES-128
const IV = new Uint8Array(16); // fixed IV for deterministic assertions

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

test('encryptJwt is deterministic and round-trips back to the JWT (AES-128-CBC/PKCS7)', async () => {
  const jwt = 'header.payload.sig';
  const bearer1 = await encryptJwt(jwt, KEY, IV);
  const bearer2 = await encryptJwt(jwt, KEY, IV);
  expect(bearer1).toBe(bearer2);

  const ivB64 = bearer1.slice(0, 24); // base64 of 16 bytes = 24 chars
  expect(b64ToBytes(ivB64)).toEqual(IV);

  // Independently decrypt to prove the ciphertext really is the JWT (no fabrication).
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(KEY),
    { name: 'AES-CBC' },
    false,
    ['decrypt'],
  );
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: IV },
    key,
    b64ToBytes(bearer1.slice(24)),
  );
  expect(new TextDecoder().decode(pt)).toBe(jwt);
});

test('requestAuth fetches the JWT + uid and returns a Bearer', async () => {
  const fetchImpl = (async () =>
    new Response('the.jwt.token', {
      status: 200,
      headers: { 'x-dm-uid': 'uid-123' },
    })) as typeof fetch;
  const auth = await requestAuth({ fapiBase: 'https://fapi.x', encKey: KEY, fetchImpl, iv: IV });
  expect(auth.uid).toBe('uid-123');
  expect(auth.bearer).toBe(await encryptJwt('the.jwt.token', KEY, IV));
});

test('requestAuth throws when the auth endpoint fails or omits jwt/uid', async () => {
  const notOk = (async () => new Response('', { status: 500 })) as typeof fetch;
  await expect(requestAuth({ fapiBase: 'x', encKey: KEY, fetchImpl: notOk })).rejects.toThrow();
  const noUid = (async () => new Response('jwt', { status: 200 })) as typeof fetch;
  await expect(
    requestAuth({ fapiBase: 'x', encKey: KEY, fetchImpl: noUid, iv: IV }),
  ).rejects.toThrow();
});
