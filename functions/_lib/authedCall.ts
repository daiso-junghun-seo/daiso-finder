// functions/_lib/authedCall.ts
// The authenticated vendor call shared by every endpoint that hits the JWT-gated fapi paths
// (selStrPkupStck, selIntPdStDispInfo). One retry policy: the FIRST 401/403 re-issues the token once;
// sibling legs already in flight share that reissue instead of requesting a second one. Keeping this
// in one place is what makes the Flow-1 note (availability.ts) true for Flow 3 as well.
import { type DaisoAuth, requestAuth } from './daisoAuth';
import type { UpstreamConfig } from './daisoUpstream';

export type AuthedCall = (url: string, body: string) => Promise<Response>;

export function authHeaders(auth: DaisoAuth): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${auth.bearer}`,
    'x-dm-uid': auth.uid,
  };
}

export function makeAuthedCall(cfg: UpstreamConfig, initial: DaisoAuth): AuthedCall {
  let auth = initial;
  let reissue: Promise<DaisoAuth> | null = null;
  return async (url, body) => {
    let res = await fetch(url, { method: 'POST', headers: authHeaders(auth), body });
    if (res.status === 401 || res.status === 403) {
      if (!reissue)
        reissue = requestAuth({ fapiBase: cfg.fapiBase, encKey: cfg.encKey, force: true });
      auth = await reissue;
      res = await fetch(url, { method: 'POST', headers: authHeaders(auth), body });
    }
    return res;
  };
}
