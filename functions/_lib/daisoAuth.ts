// functions/_lib/daisoAuth.ts
// Server-only anonymous-JWT → AES-128-CBC/PKCS7 → Bearer handshake (SKILL.md observed contract).
// WebCrypto only (Workers runtime). The enc key is a public vendor constant injected via env — never hardcoded.
import { PATHS } from './daisoUpstream';

export interface DaisoAuth {
  bearer: string; // base64(IV) + base64(ciphertext)
  uid: string; // x-dm-uid
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Injectable IV for test determinism; production passes none → random 16 bytes.
export async function encryptJwt(
  jwt: string,
  encKey: string,
  iv: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(encKey),
    { name: 'AES-CBC' },
    false,
    ['encrypt'],
  );
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    new TextEncoder().encode(jwt),
  );
  return toBase64(iv) + toBase64(new Uint8Array(ct));
}

export async function requestAuth(deps: {
  fapiBase: string;
  encKey: string;
  fetchImpl?: typeof fetch;
  iv?: Uint8Array<ArrayBuffer>;
}): Promise<DaisoAuth> {
  const doFetch = deps.fetchImpl ?? fetch;
  const res = await doFetch(`${deps.fapiBase}${PATHS.auth}`, { method: 'GET' });
  if (!res.ok) throw new Error(`auth ${res.status}`);
  const jwt = (await res.text()).trim();
  const uid = res.headers.get('x-dm-uid') ?? '';
  if (!jwt || !uid) throw new Error('auth: missing jwt/uid');
  const iv = deps.iv ?? crypto.getRandomValues(new Uint8Array(16));
  return { bearer: await encryptJwt(jwt, deps.encKey, iv), uid };
}
