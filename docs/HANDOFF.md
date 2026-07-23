# HANDOFF — DAISO Finder

> 이 저장소에서 새 세션을 시작하면 **여기부터** 읽는다. 실행 원장(정본)은 [`.superpowers/sdd/progress.md`](../.superpowers/sdd/progress.md).

## 현재 상태 (2026-07-23)

**Increment 0(PWA 셸) + Flow 1(Availability Check) 코어 + 실 데이터 배선 + 라이브 스모크 검증까지 완료 — 전부 `main`에 로컬 머지(원격 푸시·공개 배포 없음).** 앱은 **로컬에서 실 daisomall 데이터로 전체 플로우가 동작**한다(`npm run dev:live`, dev-proxy). 단 **프로덕션 배포는 런타임 차단 + ToS 게이트로 대기 중**(아래 🔴).

**게이트(main 현재, tip `18cda38`)**: vitest **251/251**, tsc clean, biome clean, Playwright **17/17**(dev 14 + preview 3). src+dist에 시크릿 부재.

### 완료된 것 (main, 시간순)
- **Increment 0 + Flow 1 코어(mock)** — 6상태 UI·Bible-verbatim 카피·D082 매장선택·D083 glass·타이핑 검색·재시도. (머지 `c318e8a`)
- **Flow 1 실 데이터 배선**(2026-07-22, 3-세션 TDD + whole-branch 리뷰 통과) — `functions/`(daisoUpstream · daisoAuth WebCrypto Bearer · `/api/availability` 조건부 팬아웃 · `/api/stores`) + `src/adapters/daisomall/`(rawObservation validator · mapStoreObservation 6상태 **parity oracle** · storeStockRepository · storeDirectory) + format(지하/lchDay/km→m) + 컴포지션 루트(`import.meta.env.PROD` 라이브/mock 스위치) + preview route-intercept E2E. 구식 `newIntSelStr/*`+`stock.ts` 제거. (머지 `830b184`) + 정직 restock 카피 `f3c849f`. 앱 결정 = `open-questions.md §B21–B27`.
- **라이브 스모크**(2026-07-22, owner 승인) — 실 daisomall 읽기전용 프로브로 **프록시 계약 end-to-end 확인, 코드 무변경**. 실 enc 키 = **공개 상수 `"PRE_AUTH_ENC_KEY"`**. B27 호스트정합·인증·좌표 optional·selStr `data[]`·지하 위치 확인. (머지 `44022ce`) 정본: `docs/notes/store-api-observations.md §라이브 스모크 검증`.
- **병렬 트랙 3종**(2026-07-23, main tip `18cda38` — 병렬 worktree TDD, 각 태스크 독립 리뷰 Approved):
  - **data-owner 관측** (`8d48c35`): 읽기전용 바운드 프로브(11요청)로 `sleStsCd:"9"`(재고 공존 → 판매종료 후보) + 빈 `data[]`=매장 미취급 **해소**; `stck` 종류는 표본 편향으로 미해소·심 뒤 격리 유지. 정본: `store-api-observations.md §라이브 스모크 검증 II`.
  - **GPS-근처 실배선** (`3ab356f`): `/api/stores` 근처-모드 분기(검색-모드 무변경) + 실 GPS + `createDaisoNearbyFetch`(km→distanceM 어댑터층) + `createGeolocation()` PROD/mock 스위치. **B16 라이브 배선 완료.** GPS는 추천만(전 실패경로 `[]`), `GeolocationPort` 불변.
  - **최근 검색** (`280c96c`): 로컬 `localStorage` 정확-문자열 dedup·MAX_ENTRIES=5·빈목록 캡션미표시·정직 열화. 카피 `"최근 검색"`=Bible 정본. **B28(앱 소유)**.
  - 통합 fast-follow (`18cda38`): 리뷰 findings(nav required·낡은 주석) 반영. 결합 게이트 GREEN: unit **251**·e2e **17**·tsc·biome clean.

### 🔴 런타임 차단 발견 (2026-07-23) — 프로덕션 아키텍처 결정
daisomall anti-abuse가 **auth-protected 엔드포인트(selStrPkupStck·selIntPdStDispInfo)에서 Cloudflare Workers(workerd)의 TLS/HTTP 지문을 403 차단**한다. 우리 WebCrypto Bearer는 정확(node:crypto와 byte-identical, **node에서 200 수락**)하나 **workerd에서 403** — 쿠키·UA·Origin·`cf-*` 헤더 전부 배제(같은 IP). JA3=런타임 속성 → **프로덕션 CF Pages도 차단 공산 큼**. 영향: workerd에서 `/api/stores`(무인증) OK, `/api/availability`(인증) 502.
- **로컬 해결(완료)**: `scripts/dev-proxy.mjs`(`npm run dev:live`, 포트 8790) — 진짜 `functions/`를 **Node 런타임**(esbuild 번들)에서 실행 → node TLS 수락 → **전체 라이브 플로우 로컬 동작**.
- **프로덕션 결정(user, 2026-07-23)**: 경로=**Option C(Node 프록시)**, 호스트=**gpu01 재사용**, B(프로덕션 CF 검증)=skip. **prep 완료(배포 안 함, merge `3a84d32`)**: env-구동 프로덕션 Node 서버(`/health`·CORS-opt·시크릿-free 로그·graceful shutdown) + `docs/deploy/gpu01-node-proxy.md` 런북. 설계 = `docs/superpowers/specs/2026-07-23-runtime-resolution.md`.

### 거버넌스 (2026-07-21) — 데이터 계약·구현은 앱 소유
`CLAUDE.md §1/§3`: **제품 철학**(안티골·플로우·6상태 의미·UX 카피 규칙·정직성)만 Bible SSOT. **벤더 데이터 계약·구현·매핑**은 앱 소유(도시어 + open-questions §B). 라우팅 기준 = "철학이 바뀌는가?".

## 다음 작업 (순서대로 — UI는 마지막)

**원칙(2026-07-23 owner 결정): 기능·데이터·플로우 토대를 굳힌 뒤 UI(마지막 1마일).** 이른 UI는 (a) AI 해석 레이어가 후보 disambiguation을 흡수, (b) 플로우 미확정(반대형 RFC) → rework 위험.

**게이트별 우선순위:**

1. **[게이트: owner ToS/robots 검토] 프로덕션 런타임 = 실 서빙** — ToS 통과 시 **gpu01 배포**(런북 `docs/deploy/gpu01-node-proxy.md`대로; C prep·서버·런북 완료). 앱을 "실제"로 만드는 1순위 토대. *(B 프로덕션 CF 확인은 skip 결정 — 필요 시 `wrangler login`+ToS로 일회용 프로브. 거의 확실히 403 예상.)*
2. **[게이트: owner Bible 세션] 플로우 결정** — (a) **반대형 store-finder RFC**(`docs/notes/rfc-reverse-store-finder.md`, gated-extension lean; Anti-goal 2 충돌) 결정, (b) **상품 후보 disambiguation 방식**(AI 해석 레이어 vs 리터럴 후보+`직접 검색 결과 보기` 오버라이드)·카피 확정.
3. **지연 기능층**: ~~GPS-근처 매장 실배선~~(✅ 2026-07-23 `18cda38`) · ~~최근 검색~~(✅ 2026-07-23 `18cda38`) · **남음** — AI 검색어 해석 레이어(fallback-first 1s·확신도 티어, **플로우 결정=item 2 게이트**) · 바코드 스캔 진입 · 재입고 구독(로그인 게이트) · 다국어 입력 별칭(A4).
4. **미해결 data-owner 항목**(심 뒤 격리): ~~`sleStsCd` 단종 `"9"`~~(✅ 관측) · ~~`selStrPkupStck` 빈 `data[]` 의미~~(✅ =매장 미취급) · **남음** — `sleStsCd` 미취급 `null`(행 부재로 표현되어 미관측) · `stck` 종류(진열 vs 픽업예약, 표본 편향으로 미해소).
5. **UI(마지막 1마일)**: ① 상품 후보 프레젠테이션 + 후보/오버라이드 UX(카피=Bible), 프레젠테이션 폴리싱. **위 1~3이 굳은 뒤.**
6. **배포 전**: PWA 설치 아이콘/자산(§B19, 미구현). *(오픈 릴레이/키 노출은 키가 공개 상수라 user 종결.)*

**재개 규칙**: 이 HANDOFF → 게이트 확인 → **첫 언블록된 순위부터**. 현재 대부분 **owner court**(ToS 검토·Bible 세션)라, 자율 진행은 게이트가 풀린 뒤 시작한다. 로컬 테스트는 언제든 `npm run dev:live`.

**불변 원칙**: UI/도메인/reducer/query-runner/캐시 불변(헥사고날 심 교체만). 무-날조·정직 분리·신선도(D061)·읽기전용 준수. 키·토큰은 서버에만(커밋/클라 노출 금지). **런타임은 Node(workerd 차단)** — 클라 `/api/*` 계약은 런타임 무관하게 불변.

## 저장소 경계 (중요)

- **제품 철학**은 Product Bible이 SSOT(read-only) — 재서술 금지, 링크/인용. **벤더 데이터 계약·구현은 앱 소유**(도시어 + open-questions §B).
- 철학이 바뀌는 갭만 Bible로 에스컬레이션. 데이터·구현·매핑은 앱이 근거 기록하고 결정(§3 라우팅).
- 재고·거래 **읽기 전용** — 변형 금지(INDEX §7).

## 규범 입력 (정본, 필요 시 원문 확인)

- 실행 원장: [`.superpowers/sdd/progress.md`](../.superpowers/sdd/progress.md) — 커밋·리뷰·결정 이력.
- 실 API 계약·라이브 스모크: [`docs/notes/store-api-observations.md`](notes/store-api-observations.md).
- 앱 결정·미해결·후속: [`docs/notes/open-questions.md`](notes/open-questions.md) (§B 앱 소유, §A Bible, §C 출시-후).
- 런타임 결정: [`docs/superpowers/specs/2026-07-23-runtime-resolution.md`](superpowers/specs/2026-07-23-runtime-resolution.md) + 배포 런북 [`docs/deploy/gpu01-node-proxy.md`](deploy/gpu01-node-proxy.md).
- 반대형 RFC(Bible 계류): [`docs/notes/rfc-reverse-store-finder.md`](notes/rfc-reverse-store-finder.md).
- Flow 1 스펙(앱-레벨): [`docs/superpowers/specs/2026-07-22-flow1-live-data-design.md`](superpowers/specs/2026-07-22-flow1-live-data-design.md). 제품 정본은 Bible: `../product-bible/06_Product/daiso-companion/{Experience,Interface,Engineering,AI}/availability-check.md`.
