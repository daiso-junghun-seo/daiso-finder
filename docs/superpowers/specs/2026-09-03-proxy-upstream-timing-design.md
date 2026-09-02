# 프록시 상류 계측 설계 — 경로 지연과 벤더 지연 분리

> 상태: 오너 승인(2026-09-03). 구현 플랜은 별도 문서.
> 선행: [`2026-07-23-runtime-resolution.md`](2026-07-23-runtime-resolution.md), [`2026-08-03-debug-zoom-override-design.md`](2026-08-03-debug-zoom-override-design.md)
> 결정 기록: `docs/notes/open-questions.md` §B30-18 ①·②·⑧·⑨ · §B31

---

## 0. 왜 지금 — 기록이 이미 다음 걸음을 지정했다

§B30-18 ②의 2026-07-30 정정이 그대로 적어 놓았다:

> 남는 진짜 제약은 **근거**다: 실측 지연이 전부 localtunnel을 통과했고 **프록시가 자기 업스트림 소요를 보고하지 않아 경로 지연과 벤더 지연이 분리되지 않는다.** … 다음 걸음은 owner escalation이 아니라 **프록시가 자기 업스트림 소요를 보고하게 만드는 계측**이다.

`storeStockRepository.ts:40`의 코드 주석도 같은 것을 가리킨다 — *"step is proxy upstream instrumentation. 1800ms is what fits under the cap meanwhile."*

**닫히지 않고 있는 것**: `query-cache.ts`의 2000ms 상한과 그 아래 끼워 넣은 `AVAILABILITY_ATTEMPT_TIMEOUT_MS = 1800`은 **결합된 한 쌍**이고, 창이 `1445 < T < 2000`으로 좁아 요구된 "generous headroom"이 **이 상한 아래에서는 달성 불가능**하다(§B30-18 ③). 그것 자체가 escalation 근거인데, **분리된 숫자가 없어서** 무엇을 근거로 올려야 하는지 말할 수 없다. 지금 패널이 아는 것은 `#1/3 · 200 · 1169ms` 한 줄뿐이고, 그 안에 터널·프록시·다섯 벤더 레그가 전부 접혀 있다.

이 계측이 그것을 편다. **owner의 다음 실기기 세션 한 번이 스캔 답 넷에 더해 네트워크 분해까지 낸다** — 서버 사이드 변경이라 스캔 기준선(번들·모션·메인스레드)을 건드리지 않으므로 같은 런에서 안전하게 함께 답한다.

---

## 1. 무엇을 만드는가

프록시가 상류 호출 각각의 소요와 **핸들러 벽시계**를 재서 표준 `Server-Timing` 응답 헤더로 싣는다. 클라이언트가 그것을 읽어 진단 버스에 붙이고, `?debug=1` 패널이 네트워크 줄 아래 한 줄로 편다.

```
  /api/availability #1/3 · 200 · 1169ms · 상류 412ms
    검색 88 · 매장 61 · 인증 96 · 진열 94 · 재고 310
  /api/availability #2/3 · 취소 · 1171ms
  /api/availability #3/3 · 취소 · 1172ms
```

읽히는 것: **잔차 `1169 − 412 = 757ms` = 터널 + Node HTTP 오버헤드**, 그리고 벤더 안에서는 `재고(310)`가 지배적이라는 사실.

### 본문이 아니라 헤더인 이유

응답 JSON에 `_timing` 필드를 넣는 대안을 **기각한다**. 두 가지가 막는다:

1. **§B30-18 ⑨가 발행 순서를 못박아 놨다** — `publish(res.status, 'ok')`는 **본문 파싱 전에** 실행된다("응답이 도착한 것은 본문 내용과 무관한 네트워크 사실"). 본문에 실으면 그 규칙을 깨야 하고, 그러면 본문이 깨진 200이 전송을 누명 쓰게 된다.
2. **실패 응답에서는 `json()`이 아니라 `text()`를 읽는다**(`readErrorBody`). 본문에 실으면 **가장 궁금한 502에서 계측이 통째로 사라진다.**

서버 콘솔 로그만 두는 대안도 기각한다. 측정은 터널 너머 폰에서 일어나고 노트에 복사되는 것은 패널 리포트다 — 콘솔 줄과 패널 줄을 타임스탬프로 손수 조인하는 작업은 이 저장소가 이미 오독을 낸 모양이며, 잔차를 **복사되는 산출물 안에서** 계산할 수 없다.

---

## 2. 서버 — `functions/_lib/timing.ts` (신규)

```ts
export interface UpstreamTimer {
  leg<T>(name: string, run: () => Promise<T>): Promise<T>;
  header(): string | null;
}
export function createUpstreamTimer(enabled: boolean, now?: () => number): UpstreamTimer;
```

- `leg()`는 **스루풋 통과**한다 — thunk의 결과를 그대로 반환하고, 거부는 원본 그대로 재throw한다. `try/finally`이므로 **throw해도 레그는 기록된다**(502 경로에서 어디까지 갔는지가 보인다).
- `header()`는 `total;dur=412, search;dur=88, …`를 반환한다. `total`은 타이머 생성 시점부터 `header()` 호출 시점까지의 **핸들러 벽시계**이고 레그는 **호출 순서**로 나열된다. **활성 상태에서는 항상 `total`을 싣는다** — 레그가 하나도 완료되지 않았어도(400 조기 반환 등) 헤더 자체는 존재한다. §6의 읽는 규칙이 이 성질에 의존한다.
- **분기는 생성 시점 한 곳뿐이다.** `enabled === false`면 `leg()`는 thunk를 그대로 돌리고 아무것도 기록하지 않으며 `header()`가 `null`을 반환한다 — 호출부는 무조건부이고 **동작 변화가 0**이다.
- 주입 가능한 시계(`now`)를 받는다 — `decoderReadyMs`를 고정한 것과 같은 이유로, 테스트가 실제 지연에 의존하지 않는다.

### 붙이는 자리: `jsonResponse()` 단일 관문

`daisoUpstream.ts`의 `jsonResponse()`가 **세 핸들러와 `badGateway()`가 공유하는 유일한 응답 생성점**이다. 여기에 타이머를 넘겨 헤더를 붙인다:

```ts
export function jsonResponse(body: unknown, status = 200, timer?: UpstreamTimer): Response;
export function badGateway(timer?: UpstreamTimer): Response;
```

인자를 빠뜨린 반환 경로는 계측을 조용히 잃는다. **핸들러별로 모든 종료 경로(200 · 400 · 502 · `noMatch`)에 테스트를 건다** — 이것이 그 위험에 대한 유일한 방어다.

### CORS 노출 헤더

`SERVE_STATIC=0` + `ALLOW_ORIGIN` 조합(순수 `/api` 모드)에서는 클라이언트가 **교차 출처**가 되고, 브라우저는 `Access-Control-Expose-Headers` 없이는 응답 헤더를 스크립트에 넘기지 않는다. 계측이 켜졌을 때 `access-control-expose-headers: server-timing`을 함께 싣는다 — 없으면 그 모드에서 `상류`가 영원히 비어 보이고 원인을 찾을 단서가 없다.

---

## 3. 레그 지도 — 그리고 진행 중인 레그는 부재다

| 엔드포인트 | 레그 |
|---|---|
| `/api/availability` | `search`(SearchGoods) · `str`(selStr) · `auth`(auth/request) · `disp`(selIntPdStDispInfo) · `stck`(selStrPkupStck) |
| `/api/stores` | `str` |
| `/api/search` | `search` |

호출부에서 `timer.leg('str', () => fetchDirectYn(...))` 형태로 감싼다 — **`searchGoods`·`fetchDirectYn`·`requestAuth`·`fetchLocations`·`fetchStock`의 시그니처는 하나도 바뀌지 않는다.**

### 미완료 레그는 헤더에 없다 (설계상 의도)

`availability.ts`의 wave 1은 세 호출을 **동시에 띄우고**(`productP`·`directYnP`·`authP`), `product`만 먼저 기다린다. 그래서:

- `noMatch`(line 212)와 `badGateway()`(line 211)는 **`str`·`auth`가 아직 날고 있는 동안** 응답한다.
- franchise + 진열구역 없음이면 `stck`은 **아예 호출되지 않는다**(`locations.length > 0` 조건).

`header()`는 **그 시점에 완료된 레그만** 렌더한다. 기다리지 않는다 — 응답을 늦추는 계측은 자기가 재려는 것을 오염시킨다. 결과적으로 **`noMatch` 응답은 보통 `search` 하나만 보여 준다**, 그리고 **호출되지 않은 `stck`은 `0`이 아니라 부재**다. 미관측과 측정된 0을 구분하는 저장소 규칙 그대로다.

---

## 4. 노출 통제 — 기본 OFF

`enabled = env.DIAG_TIMING === '1'`. **명시적 opt-in이고 기본값은 꺼짐이다.**

`scripts/dev-proxy.mjs:2`가 스스로 적어 놓았듯 그 파일은 **로컬 dev와 프로덕션(gpu01) 양쪽**이다. 코드 기본값으로 dev/prod를 가를 수 없으므로 갈림은 env 하나뿐이고, 그렇다면 **기본 ON + 런북에서 끄기**는 env 한 줄을 빠뜨리는 순간 헤더가 새는 **fail-open** 통제가 된다. 채택하지 않는다.

기본 OFF의 비용은 실질적으로 없다 — 테스터는 이미 `$env:HOST='0.0.0.0';`를 치고 있고 거기 하나가 더 붙을 뿐이다. `resolveUpstreamEnv()`가 `DIAG_TIMING`을 `process.env` → `.dev.vars` 순으로 통과시키고, `docs/deploy/gpu01-node-proxy.md`에 한 줄 추가한다(**프로덕션에서는 설정하지 않는다**).

이것은 보안 통제가 아니라 **노출 축소**다. 헤더에 시크릿은 없다 — 다만 배포 뒤 누구나 우리가 어떤 벤더 엔드포인트를 몇 번 치는지 읽을 수 있게 만들 이유가 없고, ToS 게이트가 아직 열리지 않았다.

---

## 5. 클라이언트 — 읽는 자리 둘

`/api/availability`는 **`createDiagnosticFetch`를 거치지 않는다** — 어댑터가 자체 발행한다(§B30-18, 이중 기록 방지). 따라서 헤더를 읽는 자리가 둘이다:

| 자리 | 대상 |
|---|---|
| `composition.ts` `createDiagnosticFetch` | `/api/stores` · `/api/search` |
| `storeStockRepository.ts` `publish()` | `/api/availability` (ok · httpError 양쪽) |

### `src/diagnostics/serverTiming.ts` (신규)

```ts
export interface UpstreamTiming {
  totalMs: number | null;
  legs: ReadonlyArray<{ name: string; ms: number }>;
}
export function parseServerTiming(value: string | null): UpstreamTiming | null;
export function readServerTiming(res: object): UpstreamTiming | null;
```

`parseServerTiming`은 **순수 함수**라 단독으로 테스트된다. 형식이 깨진 항목은 버리고, 아무것도 파싱되지 않으면 `null`을 반환한다 — 빈 객체를 대역으로 세우지 않는다.

`readServerTiming`은 **`hasTextBody`와 같은 모양의 구조 프로브**를 쓴다:

```ts
function hasHeaders(res: object): res is { headers: { get(name: string): string | null } } {
  return (
    'headers' in res &&
    typeof res.headers === 'object' &&
    res.headers !== null &&
    'get' in res.headers &&
    typeof res.headers.get === 'function'
  );
}
```

연쇄 `in`이 `object`를 단계적으로 좁히므로 **cast 없이** `typeof res.headers.get`이 합법이다 — `hasTextBody`가 `'text' in res`로 하는 것과 같은 수법이다.

**`FetchLike`를 넓히지 않는다** — §B30-18 ⑧이 기록한 그대로, 저장소 전역의 테스트 더블이 정확히 `{ ok, status, json }`을 구현하므로 타입을 넓히면 전부 깨진다. cast·`as unknown as`·`@ts-expect-error` **전무**이고, 소스 텍스트 가드 테스트가 그것을 고정한다(`readErrorBody`가 이미 밟은 길).

`NetworkEntry`에 `upstream?: UpstreamTiming`을 더한다. **부재 = 미관측**이며, 그 이상을 주장하지 않는다.

---

## 6. 패널 렌더링 — 세 규칙

1. **`· 상류 <total>ms`는 관측됐을 때만** 본 줄에 붙는다(`errorBody`의 기존 존재-기반 규칙과 동일).
2. **`상류`는 `errorBody`보다 앞에** 온다. `errorBody`에는 "마지막에 붙어야 앞을 밀어내지 못한다"는 자기 규칙이 이미 있고, 뒤에 무언가를 붙이면 그 규칙이 깨진다.
3. **모르는 레그 이름은 그대로 출력한다.** 한글 라벨(`검색`·`매장`·`인증`·`진열`·`재고`)은 아는 이름에만 적용하고, 모르는 이름은 **버리지도 개명하지도 않는다** — 패널이 서버가 보고한 사실을 조용히 삼키면 안 된다.

레그 줄은 `legs.length > 0`일 때만, 4칸 들여쓰기로 렌더한다.

### 읽는 규칙 — 이것을 절차에 넣는다

패자 2개는 응답 도착 전에 abort되므로 헤더가 없고 `상류`가 붙지 않는다. 그러므로:

> **한 조회를 마쳤는데 `상류`가 한 줄도 없으면 `DIAG_TIMING`이 꺼진 것이다.**

성공한 조회에는 승자가 반드시 하나 있으므로 이 규칙은 성립한다. 이것을 적어 두지 않으면 테스터가 플래그를 잊은 런을 "프록시가 빠르다"로 오독할 수 있다 — zoom 오버라이드에서 `줌 요청:` 줄을 넣었던 것과 같은 이유다.

`NETWORK_LIMIT = 12`는 **유지**한다. 레그 줄은 승자에게만 붙으므로 12항목 = 4조회 = 실질 16줄이고, 그 상수의 주석이 근거로 삼은 "40vh 텍스트영역에서 한 플릭" 안에 그대로 있다.

---

## 7. `상류`는 레그의 합이 아니다 — 이 설계에서 가장 중요한 한 가지

availability는 direct 매장에서 `disp`와 `stck`을 **`Promise.all`로 병렬 호출**하고(`availability.ts:223`), wave 1의 세 호출도 동시에 뜬다. 레그를 더하면 **실제 벽시계를 넘어서고 잔차가 음수가 된다.**

그래서 서버가 **`total`을 별도 메트릭으로** 싣고, 패널의 `상류`는 **그 값**이다. 클라이언트는 레그를 **절대 합산하지 않는다.**

**Σ레그 > `상류`는 오류가 아니라 병렬이 동작한다는 증거**로 읽는다. 이 문장을 여기 적는 이유는, 합산하는 계측기를 만들었다면 그것이 만들어 냈을 오독이 `경과: 14.1s`(디코드 시간으로 읽힌 벽시계)와 **정확히 같은 모양**이기 때문이다.

---

## 8. 명시할 한계 둘

1. **재발급 재시도가 레그 안에 접힌다.** `makeAuthedCall`은 401을 만나면 토큰을 재발급하고 **같은 호출을 한 번 더 친다**(`availability.ts:133-137`). 별도 마커를 두지 않기로 했으므로(owner 결정, 2026-09-03) `진열 94ms`는 **1왕복일 수도 2왕복일 수도 있다.** 이 숫자를 왕복당 지연으로 읽지 않는다.
2. **`total`은 상류 네트워크가 아니라 핸들러 벽시계다.** 프록시 자신의 연산(요청 본문 파싱, 상류 JSON 파싱, 응답 직렬화)을 포함한다. 따라서 잔차 `클라 ms − total`은 **터널 + Node HTTP 오버헤드**이고, 프록시 연산은 잔차가 아니라 `total` 쪽에 있다.

---

## 9. 테스트

- **`timing.ts`**: 비활성 시 `header()`가 `null`이고 `leg()`가 스루풋 통과 · 레그 순서 · **throw해도 레그가 기록됨** · 미완료 레그는 헤더에 부재 · `total`이 주입 시계로 고정됨 · 아무 레그도 없을 때의 헤더 형태.
- **핸들러 3종**: `DIAG_TIMING='1'`일 때 헤더가 붙고 없을 때 안 붙음 · **종료 경로 전부**(200 · 400 · 502 · `noMatch`) · `noMatch`가 미완료 레그를 싣지 않음 · CORS expose 헤더 동반.
- **`serverTiming.ts`**: 정상 파싱 · 형식 파손 항목 폐기 · 아무것도 못 읽으면 `null` · `headers` 없는 객체에서 `null`(구조 프로브) · **소스 텍스트 가드**로 cast 부재 고정.
- **`composition.test.ts`**: 래퍼가 `upstream`을 붙여 발행함(목이 받는 인자까지 고정 — §B30-23이 남긴 규칙).
- **`storeStockRepository.test.ts`**: ok·httpError **양쪽** 경로에서 `upstream`이 실림 · 헤더 없는 더블에서 부재.
- **`report.test.ts`**: 본 줄 렌더 · 레그 줄 렌더 · 부재 시 무출력 · **모르는 레그 이름 그대로** · **`상류`가 `errorBody`보다 앞**.

각 수정은 뮤테이션으로 검증한다 — 특히 `?? null`/`|| null`, `total` 누락, 존재-기반 렌더의 조건 반전.

---

## 10. 하지 않는 것

- 본문(JSON) 계약 **불변**. 매핑·검증(`parseRawObservation`·`mapStoreObservation`)은 손대지 않는다.
- `FetchLike` 타입 **불변**. `AVAILABILITY_ATTEMPTS = 3`·`AVAILABILITY_ATTEMPT_TIMEOUT_MS = 1800`·`query-cache`의 2000ms **전부 불변** — 이 웨이브는 **그 숫자들을 바꿀 근거를 만드는 것**이지 숫자를 바꾸는 것이 아니다.
- 6상태·전이·Zustand 배선·UX 카피·CSS·스캔 경로 **전부 불변**.
- 재발급 재시도 마커 **없음**(§8-1의 한계로 대신 기록).
- 상류 요청에 타임아웃을 새로 걸지 않는다(프록시에는 지금도 없다 — §B30-18 ①).

---

## 11. 측정 절차와 게이트

```powershell
$env:HOST='0.0.0.0'; $env:DIAG_TIMING='1'; npm run dev:live
```

폰은 **HTTPS 필수**(LAN http은 `secureContext:false`라 카메라가 열리지 않는다) — 터널은 대안이 아니라 요건이다. 첫 조회 뒤 `상류`가 한 줄이라도 보이는지 **먼저 확인**한다(§6의 읽는 규칙).

게이트: `npm run test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run e2e` 전부 통과. 엔트리 JS 증가는 파서 + 렌더러 분량(수백 바이트)을 예상하며, **실측치를 게이트 기록에 남긴다**(예상치를 정본으로 삼지 않는다).
