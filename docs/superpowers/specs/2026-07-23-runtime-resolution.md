# Runtime Resolution — Flow 1 프록시 (2026-07-23)

> **상태**: 설계(design) — 구현/배포 없음. 이 문서는 **런타임 결정**을 위한 옵션 분석·권고다.
> **거버넌스**(CLAUDE.md §3/§4): 호스팅·런타임·구현은 **앱 소유 결정**(Bible D-번호 미소비) → 여기 기록.
> **공개 배포(Option B의 probe·Option C의 프록시)는 ToS/robots 게이트 = owner 판단** — 앱이 임의 결정하지 않는다.
> **철학 불변**: 무-날조·정직한 분리·신선도(D061)·읽기전용은 어느 런타임에서도 동일.
> 근거: open-questions.md 「🔴 런타임 차단 발견」 + store-api-observations.md §라이브 스모크.

---

## 0. TL;DR

- **문제**: daisomall anti-abuse가 **workerd(CF Workers/Pages) TLS/HTTP 지문(JA3)** 을 인증 엔드포인트에서 403. JA3는 **런타임 속성**이라 로컬 `wrangler pages dev`(miniflare)와 프로덕션 CF Pages가 **동일 지문** → 프로덕션 CF Pages도 막힐 공산이 큼. **Node 런타임은 수락**(dev-proxy가 증명).
- **불변식**: 클라이언트가 보는 **`/api/*` 계약은 런타임과 무관하게 UNCHANGED**. 클라이언트·어댑터·매핑·컴포지션 선택 로직은 **바뀌지 않는다** — 바뀌는 것은 **프록시가 어디서 도느냐** 뿐(+ 하이브리드 시 `/api` base URL 문자열 하나).
- **권고**: **Option C 하이브리드** — 정적 클라이언트는 CF Pages, `/api/*`만 **Node 런타임 프록시**로. 커밋 전 **Option B**(일회용 CF probe)로 프로덕션 CF egress도 막히는지 값싸게 확정(또는 JA3 논리상 skip).
- **필요한 owner 입력**: (1) **ToS/robots 게이트 판단**(공개 egress 전제 — 유일한 실블로커), (2) Option B용 `wrangler login`, (3) Option C 호스트 선택.

---

## 1. Finding recap + 불변식

**Finding(재진단 아님, 확정 사실)**: WebCrypto Bearer는 node:crypto와 바이트 동일하고 **Node에서 200 수락 / workerd에서 403 거부**. 쿠키·UA·Origin/Referer·`cf-*`·IP 전부 배제됨 → 남은 변수는 **런타임 TLS/HTTP 지문**. workerd에서 `/api/stores`(무인증)는 OK, `/api/availability`(인증 selStrPkupStck·selIntPdStDispInfo)는 502.

**불변식 (설계 전반의 앵커)**:

| 층 | 바뀌나? | 이유 |
|---|---|---|
| 클라이언트 UI·상태머신·6상태 | ❌ | 런타임과 무관 |
| 어댑터(`storeStockRepository`·`storeDirectory`) | ❌ | 이미 `endpoint` 주입 가능(기본 `/api/*`) |
| `mapStoreObservation` 6상태 합성 | ❌ | 클라이언트-side, raw 계약 불변 |
| 컴포지션 선택(PROD=live/DEV=mock) | ❌ | `import.meta.env.PROD` 게이트 그대로 |
| `functions/api/*` 핸들러 로직 | ❌ | **재사용**(재구현 금지) |
| **프록시가 도는 런타임/호스트** | ✅ | 유일한 변경점 |
| **`/api` base URL 문자열**(하이브리드 시) | ✅(1개) | same-origin → cross-origin일 때만 |

→ 어떤 옵션도 **네트워크 계약(`/api/availability`·`/api/stores` 요청/응답 JSON)을 건드리지 않는다.**

---

## 2. Option B — 프로덕션 CF Pages 확정 (값싼 사전 확인)

**목적**: Option C의 운영 부담을 지기 전에, **프로덕션 CF egress도 403인지** 일회용 배포로 정산. auth + `selStrPkupStck`만 프로브.

**예상 결과(JA3 논리)**: 프로덕션 workerd 지문 = 로컬 miniflare 지문 → **403 유력**. 그래서 이 단계는 **skip 가능**(논리적 확정). **200이 나오면** → 프로덕션 CF egress가 로컬과 다르다는 뜻(예: CF 프로덕션 egress IP/TLS 상이, 또는 차단이 부분적으로 IP-상관) → **전-CF 경로가 살아남음**(신규 인프라 0, 현 `functions/` 그대로 배포) → 그 경우 Option C 불필요.

**Ready-to-run 스텝** (owner의 인터랙티브 `wrangler login` 필요 — 에이전트 대행 불가):

```powershell
# 0) 사전: owner가 ToS/robots 게이트를 승인해야 공개 egress 가능 (§4).
# 1) 일회용 Worker 하나 — 공개 상수 키 하드코딩(민감 아님), 관측 fixture(pdNo 1070646 / strCd 10803).
#    probe.js (throwaway):
#      export default { async fetch() {
#        const ENC='PRE_AUTH_ENC_KEY';
#        const a=await fetch('https://fapi.daisomall.co.kr/auth/request');
#        const jwt=(await a.text()).trim(), uid=a.headers.get('x-dm-uid');
#        const iv=crypto.getRandomValues(new Uint8Array(16));
#        const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(ENC),{name:'AES-CBC'},false,['encrypt']);
#        const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-CBC',iv},key,new TextEncoder().encode(jwt)));
#        const b64=u=>btoa(String.fromCharCode(...u));
#        const bearer=b64(iv)+b64(ct);
#        const s=await fetch('https://fapi.daisomall.co.kr/pd/pdh/selStrPkupStck',{method:'POST',
#          headers:{'content-type':'application/json',authorization:`Bearer ${bearer}`,'x-dm-uid':uid},
#          body:JSON.stringify([{pdNo:'1070646',strCd:'10803'}])});
#        return Response.json({authStatus:a.status,stckStatus:s.status,snippet:(await s.text()).slice(0,200)});
#      }};
wrangler login                                             # 2) owner 인터랙티브
wrangler deploy probe.js --name daiso-probe --compatibility-date 2024-09-01
curl https://daiso-probe.<subdomain>.workers.dev          # 3) stckStatus 확인
wrangler delete daiso-probe                               # 4) 즉시 철거 (throwaway)
```

**판독**: `stckStatus:403` → 프로덕션 CF도 차단 → **Option C 확정**. `stckStatus:200` → 전-CF 유효 → 현 `functions/` 그대로 CF Pages 배포(Option C 불요).
**주의**: probe도 실 daisomall에 공개 egress로 닿으므로 **ToS/robots 게이트 적용**(§4). 프로덕션 workerd를 정확히 재현하려면 반드시 **CF에서** 실행해야 함(로컬 Node로는 프로덕션 CF 지문을 확인할 수 없다 — 그건 이미 Node라 200).
**대안(실 핸들러로 확정)**: probe 대신 현 Pages 프로젝트를 preview로 배포(`wrangler pages deploy dist --branch probe`)하고 `/api/availability`를 1회 호출해도 동일하게 정산됨(실 핸들러 경유). 단 클라이언트 빌드가 선행돼야 해 무게가 큼 → 확인 목적엔 위 일회용 Worker가 최소.

---

## 3. Option C — Node-runtime 프록시 (유력 프로덕션 경로)

`dev-proxy.mjs`가 이미 이 런타임을 end-to-end 증명(availability 200). 프로덕션은 같은 **패턴을 승격**할 뿐.

### 3.1 실 핸들러 재사용 (재구현 금지)

`functions/api/*`·`functions/_lib/*`는 **런타임 무관**: `fetch`·`crypto.subtle`·`Request`/`Response`·`btoa`·`TextEncoder`·`URLSearchParams` — **전부 Node 20+ 내장**. 그래서 **로직 복제 0**:

- `dev-proxy.mjs`가 프로덕션 래퍼의 프로토타입(95% 동일). esbuild로 실 핸들러를 번들 → `onRequestPost`를 그대로 호출.
- 프로덕션 델타(로직 아님, 배선만):
  - **번들 시점**: 부팅마다 번들 대신 **배포 시 1회 esbuild 프리컴파일**(`functions/api/*.ts` → `dist-proxy/*.mjs`) 권장.
  - **env 주입**: `.dev.vars` 대신 **호스트 env**(systemd `EnvironmentFile` / 플랫폼 secrets).
  - **정적 서빙**: 하이브리드면 `dist/` 서빙 제거(CF가 클라이언트 담당) — 프록시는 `/api/*`만.
  - **TLS 인바운드**: 리버스 프록시(Caddy/nginx)나 플랫폼이 종단.
  - **프로세스 관리·헬스체크**: systemd + `/health`(k-skill 패턴 동일).

### 3.2 호스팅 옵션 (정직한 트레이드오프)

| 옵션 | 운영부담 | 비용 | KR-지연(→daiso) | 지문 안전성 | TLS 종단 | 시크릿 주입 | 유지보수 |
|---|---|---|---|---|---|---|---|
| **(a) gpu01 systemd** (k-skill-proxy 패턴 재사용/확장) | **낮음**(인프라 존재) | ~0 한계비용 | **박스 위치 의존(확인 필요 — nomadamas.org, KR 미확정)** | ✅ Node 수락(증명됨) | 기존 커스텀 도메인+리버스프록시 | 기존 `.env` runtime 주입 | 공유 호스트·`main` merge→cron 자동배포. 단 daiso-finder 릴리스가 그 서비스 수명에 결합 |
| **(b) 단독 소형 VPS** (KR 리전 이상적) | **높음**(패치·TLS·supervisor 자가) | 소액 월정액 | **최상(KR 리전 시 최소 RTT)** | ✅ Node 수락 | 자가(Caddy auto-TLS 최소) | systemd `EnvironmentFile` | 박스 전량 소유 |
| **(c) 관리형 Node** (Fly.io/Render/Railway) | **낮음**(git-push 배포) | 무료/저가 티어 | Fly `nrt`(도쿄) 근접·Render/Railway US/EU 기본 → VPS-KR보다 열위 | ⚠️ **표준 Node면 수락이나 컷오버 전 반드시 지문 스모크**(플랫폼이 Node를 자체 프록시로 감싸면 지문 상이 가능; **Edge/workerd류 런타임은 금지** — Vercel Edge·CF는 곧 workerd) | 관리형 | 플랫폼 secrets UI | 낮음 |
| **(d) Cloudflare 자체 런타임** | — | — | — | ❌ **Pages/Workers 전부 workerd → 무용**(바로 이 문제의 원인) | — | — | — |

> **(c) 필수 게이트**: 신규 호스트는 **컷오버 전** Option-B식 probe(그 호스트에서 auth+selStrPkupStck)로 **수락(200) 확인** 필수. 수락/거부는 **런타임·egress별 지문 속성**이라 **bare Node만 증명됨**.

**(d) 활용법**: CF는 `/api`엔 무용하나 **정적 클라이언트 서빙엔 최적**(빠름·무료·기존 `wrangler.jsonc` 그대로) → 하이브리드.

### 3.3 하이브리드 권고 (평가 대상)

**정적 클라이언트 = CF Pages** (빠름·저렴·현행) **+ `/api/*` = Node 프록시** (daisomall 수락).

- **`/api` base URL**: 어댑터는 이미 `endpoint` 오버라이드를 받음(`createDaisoStoreStockRepository({endpoint})`·`storeDirectory({endpoint})`, 기본 `/api/*`). split-origin이면 **컴포지션 루트에서 base를 주입**: `import.meta.env.VITE_API_BASE + '/api/availability'`. → **어댑터/매핑/컴포지션-선택 로직 무변경, 엔드포인트 문자열 1개만.** same-origin(단일 Node가 클라+API 둘 다) 유지 시엔 이마저도 불필요.
- **CORS(신규 요구)**: cross-origin이 되면 브라우저가 **preflight OPTIONS**를 보냄(POST + `content-type: application/json` = non-simple). 현 핸들러는 `onRequestPost`만 있음 → **`onRequestOptions`(204 + CORS 헤더) 추가 필요**. 이것이 하이브리드가 새로 요구하는 유일한 핸들러 변경(로직 아님, CORS 전처리). ACAO는 현 `'*'`로 기능상 충분하나 Pages origin으로 핀 권장(open-questions: 키가 공개상수라 오픈릴레이 노출 무해 종결됨 — 그래도 origin 핀은 위생).
- **컴포지션 루트**: PROD=live/DEV=mock 게이트 그대로 + base-URL env 추가. **읽기전용/no-store 불변**.

### 3.4 시크릿·읽기전용·화이트리스트 (전 옵션 공통 보존)

- **시크릿**: `PRE_AUTH_ENC_KEY`(공개 상수지만 rotation/위생상 env 유지)·`UPSTREAM_BASE`·`SEARCH_BASE`를 **호스트 env로만** 주입. 세션 JWT/`x-dm-uid`/Bearer는 **서버 전용·30s TTL·미로깅**. 클라이언트 노출 0 — 불변.
- **읽기전용/no-store**: 핸들러가 이미 (a) 조회 엔드포인트만 호출(변형 없음), (b) `cache-control: no-store` 설정, (c) 출력 **화이트리스트**(`RawStoreObservation`·`{strCd,strNm}`만). **동일 코드 재사용이므로 세 속성 전부 자동 보존** — 재구현하지 않는 게 핵심.

---

## 4. 결정 기준 + 권고

| 조건 | 귀결 |
|---|---|
| Option B = **403**(예상) | 전-CF `/api` 사망 → **Option C 하이브리드** |
| Option B = **200**(이변) | 전-CF 유효 → 현 `functions/` 그대로 CF Pages 배포, **Option C 불요·신규 인프라 0** |
| Option B skip(JA3 논리 신뢰) | 바로 **Option C 하이브리드** 준비 |

**권고**:
1. **owner가 ToS/robots 게이트 승인 + `wrangler login` 가능하면 Option B 먼저**(값싸게 정산). 아니면 JA3 논리로 skip.
2. 어느 쪽이든 **Option C 하이브리드**를 유력 경로로 준비: **CF Pages(정적) + Node 프록시(`/api`)**.
3. 호스트 우선순위: **(a) gpu01** — 박스가 KR·저지연이고 서비스 결합이 수용 가능하면 최저비용 재사용; 아니면 **(b) KR VPS** — 지연 최상; **(c) 관리형** — 저운영 폴백(도쿄 리전, **컷오버 전 지문 스모크 필수**).

**필요한 사용자 입력**:
- **① ToS/robots 게이트 판단(owner)** — 공개 egress(B probe·C 프록시) 전제. **유일한 실블로커**(철학 아님·법/정책 게이트 → owner, 앱 임의결정 금지).
- **② `wrangler login`(인터랙티브)** — Option B용.
- **③ Option C 호스트 선택** — gpu01 재사용 vs 신규 VPS(리전?) vs 관리형; + gpu01 **리전/지연·서비스 결합 수용 여부** 확인.

**거버넌스 기록**: 런타임/호스팅/구현 = **앱 소유 결정**(Bible D-번호 미소비, 이 문서가 기록). 공개 배포 = **ToS/robots 게이트 = owner call**. 클라이언트 `/api/*` 계약·6상태·정직성 철학 = **불변**.
