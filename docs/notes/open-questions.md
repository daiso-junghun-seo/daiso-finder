# Open Questions & Decisions — DAISO Finder

> 목적: 구현 중 마주칠 **미해결 항목**을 (A) Bible 에스컬레이션 필요, (B) 앱-레벨 결정, (C) 출시-후 검증 가설로 분리 추적한다.
>
> **철칙**(CLAUDE.md §2·§3): Canon에 답 있으면 따른다. 없거나 모순이면 **중단·질문**. 스펙 갭은 앱에서 임의 결정 금지 → **Bible에 결정/RFC로 에스컬레이션**(Bible 세션에서, 이 세션과 분리) 후 따른다. 앱-레벨 결정만 이 저장소가 자체 기록(Bible D-번호 미소비).
>
> 최종 갱신: 2026-07-22 (Flow 1 live-data 컷오버 — §B21–B27 앱 소유 결정 + 전체-브랜치 최종 리뷰 후속 4건 추가).

---

## A. Bible 에스컬레이션 필요 (앱에서 임의 결정 금지)

이 항목들은 **Bible 세션에서** 결정/RFC로 되돌려야 한다. 여기서 임의로 메우지 않는다.

| # | 항목 | 왜 갭인가 | 영향 Increment | 코어 블로킹? | 액션 |
|---|---|---|---|---|---|
| A1 | **매장 진입/Store Context — ✅ RESOLVED (Bible D082, 2026-07-13)** | 앱 README가 "매장 QR 진입 전제"였으나 Bible Canon은 메커니즘을 열어둔 채 행동 계약만 규정. **D082로 확정**: Store Context는 **사용자 소유** — 마지막 선택 매장 기본, GPS는 근처 매장 추천만(자동 확정·검색 차단 없음), GPS 실패 시 마지막 매장 유지(컨텍스트 없을 때=최초 실행만 매장 검색), QR 진입 제거, 항상 표시·`매장 변경`. | Inc 1 Default/매장 선택 | — | **완료** — Inc 0/1은 D082 정책 구현. QR 하드코딩 금지. |
| A2 | **staleness 임계값(cache age)** | 값 미설정. Error↔Partial 강등 경계를 실측하려면 필요. data-owner 협의 대상. | Inc 1 Error/Partial | 아니오(심 뒤 설정값+mock) | data-owner 확인 → Bible에 값 기록. 코어는 설정 가능 값으로 진행. |
| A3 | **저재고 컷오프(qty)** | `재고 N개 이하`가 결정-관련이 되는 qty 미설정. | Inc 1 Success(저재고) | 아니오(심) | data-owner 확인 → Bible 기록. |
| A4 | **다국어 언어/타이밍/디자인 + 입력측 검색 별칭** | D068이 다국어를 shipping 요구로 비준했으나 **언어/타이밍/디자인 OPEN**. data-owner의 **입력측 검색 별칭** 미공급 → 비-Korean 쿼리가 Korean 카탈로그 도달 못 함(리터럴 폴백 실패, AI-only는 05_AI가 금지). | Inc 1 검색 범위 | 부분(Korean 경로는 비블로킹) | Bible에 다국어 범위/타이밍 결정 요청 + data-owner 별칭 협의. |
| A5 | **5/6 복구 경로가 Korean 직원 종료(B7 텐션)** | AI Unknown 리다이렉트·위치 없음 Partial·no-cache Error는 물을 수 없는 쇼퍼(B7)에게 데드엔드 — 플로우가 금지하는 것. Bible가 "기록된 텐션, 둘째 데이터-기반 엔딩 대기"로 이미 인지. | Inc 1 복구 카피 | 아니오 | 신규 갭 아님(기록됨). 둘째 엔딩 확보 시 Bible가 갱신. |
| A6 | **D062 범위 이중성(마이너)** | Engineering 로그는 'qty 상한만', Interface/data-contract 로그는 '4개 부정 답+Partial 재트리거'로 글로스 — 한 D-번호가 두 교정을 묶은 듯. | Inc 1 구현 해석 | 아니오 | Bible에 정확 범위 확인 요청(경미). 구현은 양쪽 다 만족하게. |
| A7 | **판매종료 범위(매장 vs 체인)** | Flow 3(Inc 3) Group B 발행 게이트. 미결 동안 discontinued 진입은 nearby withhold. | Inc 3(선행: Inc 0 심 설계) | 아니오 | Inc 0 심을 **매트릭스 재작성 없이 스위치** 가능하게 설계. data-owner 확인. |
| A8 | **데이터 계약 = 단일-샘플 Evidence Level 2** | `sleStsCd` 값 열거 미완, `curLitd`/`strLitd` 철자(경도?) 미확인, 결손 행 처리 미정의, hldyDt 시맨틱 미정의 — 전부 구현 전 확인 필요. **추가(F2)**: `newIntSelStrAdapter`가 요청 바디에 `strCd`를 보내나 data-contract §2 관측 요청 키(keyword·pdNo·curLttd·curLitd·geolocationAgrYn·pkupYn·intCd·pageSize·currentPage)에 `strCd` 부재 — `strCd`는 응답 store-identity 필드(§3). 관측 엔드포인트는 지오로케이션으로 스코프하고 `msStrVOList[]`(근처 매장 다수)를 반환 → 단일 매장 스코핑/다중 매장 재조정 방식 미확인. 어댑터 코드에 `UNVERIFIED` 주석으로 격리. | Inc 0/1 데이터 레이어 | 아니오(관측값 mock, 어댑터 미배선) | data-owner와 라이브 페이로드 대조(요청 계약 포함) → Bible data-contract 갱신 → A9 라이브 배선 전 확정. |
| A9 | **매장 검색/근처 매장 데이터 소스 미관측** | Engineering §5(D082)는 매장명·지역 검색과 거리순 근처 매장 목록을 요구하지만 data-contract에 매장 검색/목록 API가 관측되어 있지 않음(문서화된 것은 상품 스코프 `newIntSelStr`뿐). **관측 후보가 이미 3계열 — 정본 미확정**: (i) k-skill `daiso-product-search` = `www.daisomall.co.kr/api/ms/msg/selStr`·`selStrSrchKeyword`·`selStrInfo`; (ii) Bible 관측 `mapi.daisomall.co.kr/ms/msg/newIntSelStr`(상품 스코프); (iii) **owner 제공 라이브 관측(2026-07-21)** `GET www.daisomall.co.kr/ssn/search/FindStoreGoods?searchTerm={매장명}&searchTerm1={매장명}&pageNum=1&cntPerPage=30&totalCnt=30`(referrer `SCR_MSG_0015` 매장검색 화면, `credentials: include`). **미해결(Bible/data-owner 판단 필요)**: 엔드포인트명 `FindStore**Goods**` vs 인자가 매장명 → 매장 반환인지 상품 반환인지 응답 스키마 미확인; 호스트 계열 3종(`www…/ssn/search`·`www…/api/ms/msg`·`mapi…/ms/msg`) 정합; 세션/쿠키(JWT) 인증 방식 → 프록시(B10/B11) 처리; 요청/응답 스키마 → `StoreDirectoryPort` 매핑. | Inc 1 매장 선택 시트 | 아니오(§B16 심 뒤 mock) | **Bible 세션(이 앱 세션과 분리)에서** 세 후보 라이브 대조 → 정본 엔드포인트·요청/응답 스키마·인증을 data-contract에 기록 → 그 후 앱이 실 어댑터 배선(§B16 심 교체, UI 재작성 없음). **누적 관측 도시어: [`store-api-observations.md`](store-api-observations.md)**(fapi 분리 엔드포인트·위치 응답·인증 구조·엣지). |
| A10 | **노후 캐시의 부정 관측 카피 미정의(F3)** | Bible의 stale-cache Partial 카피(`…에는 있었어요`)는 **긍정 과거 관측**(inStock)을 전제한다. 캐시된 답이 **부정 관측**(품절/단종/미취급)이고 노후 임계값을 넘으면, 이 카피를 재생하는 것은 쇼퍼가 가진 적 없는 과거 재고를 **날조**(Confidence Theater 안티패턴)한다. Bible은 이 케이스(stale-negative)의 카피를 규정하지 않음. | Inc 1 Partial/Error | 아니오(임시 폴백 존재) | **임시 앱 동작**: 부정 관측이 임계값 초과 시 `noCache`로 강등(날조 대신 정직한 무-캐시; `query-cache.ts` inStock 게이트). Bible에 stale-negative 카피 결정 요청 → 확정 후 앱이 게이트를 그 정책으로 교체. |

---

## B. 앱-레벨 결정 (이 저장소가 결정 — Bible D-번호 미소비)

> **2026-07-13 확정** — Increment 0+1 설계 스펙([`docs/superpowers/specs/2026-07-13-increment-0-1-design.md`](../superpowers/specs/2026-07-13-increment-0-1-design.md) §2)에서 owner 승인. 근거는 스펙에 상세. 아래는 확정 요약.

| # | 결정 | 확정 | 근거 | 상태 |
|---|---|---|---|---|
| B1 | 빌드툴/번들러 | **Vite** | SSR 불필요·오프라인 SW 우선; Cloudflare Pages 정적 배포 정합 | ✅ 확정 |
| B2 | 프레임워크/언어 | **React + TypeScript** | 킥오프 확정 | ✅ 확정 |
| B3 | 서비스워커/PWA | **vite-plugin-pwa (Workbox)** | 앱셸 precache 자동화; 단 카탈로그 서브셋 캐시 수명은 Workbox 기본 TTL 미사용 — 신선도 정책(D061)이 지배 | ✅ 확정 |
| B4 | 라우팅 | **라우터 없음·상태구동** | 단일 표면(Interface §2); 매장 선택은 시트/오버레이; Inc 2·3 뷰 전환 시 라우터 도입 | ✅ 확정 |
| B5 | 상태/데이터 레이어 | **신선도-네이티브 커스텀 + UI 스토어 Zustand** | D061 직구현(자동 리페치·TTL 대부분 금지 → 쿼리 라이브러리 부적합). UI 스토어는 domain reducer 얇은 호스트 | ✅ 확정 |
| B6 | 어댑터 심 인터페이스 | **단일 포트 `StoreStockRepository` + 주입 정책** | 6심을 설정값/전략/서브포트로 혼합 격리; §3 매트릭스 재작성 없이 스위치 | ✅ 확정 |
| B7 | 테스트/검증 | **Vitest + Testing Library + Playwright + TDD** | domain 유닛·컴포넌트·6상태 E2E | ✅ 확정 |
| B8 | 커밋 전 게이트 | **ESLint/Biome + tsc + Vitest** | 예산·상태 커버리지 회귀=버그 | ✅ 확정 |
| B9 | iOS Safari PWA 제약 | **Inc 0에서 실측**(필드검증) | SW·설치·카메라/바코드·불안정 매장망이 fallback-first·오프라인 설계에 영향 | 🔬 Inc 0 검증 |
| **B10** | **호스팅** | **Cloudflare Pages(정적 PWA) + Workers(엣지 프록시)** | 무료 티어; DAISO 코어 API 브라우저 CORS 차단 가능성 → pass-through 프록시 필요; Cloudflare 툴링 정합 | ✅ 확정 |
| **B11** | **CORS/프록시 필요성** | **가설 — Inc 0 검증** | 프로덕션 API 브라우저 CORS 차단 여부 미검증; 기본값=프록시(직접호출 베팅 시 전면 재작업 리스크) | 🔬 Inc 0 검증 |
| B12 | 신선도 캡션 상대시간 포맷 알고리즘 | **앱 자체 알고리즘** | Bible은 예시 카피만 제공("어제 오후 6시"), 알고리즘은 미정의. 확정: 캘린더-일 차이 0→오늘/1→어제/≥2→"M월 D일"; 시각은 24h→12h+오전/오후 변환, 분은 절삭(Bible 예시가 분을 보이지 않음) | ✅ 확정(Phase 4) |
| B13 | "다른 위치 N곳 더 ▾" 카운트 파라미터화 | **앱 자체** | Bible 예시는 "다른 위치 1곳 더 ▾" 단일 값뿐; `locations.length - 1`을 대입하는 것은 순수 기계적 파라미터화(카피 자체는 불변) | ✅ 확정(Phase 4) |
| B14 | D083 glass 토큰(`--surface-solid` 등) 최소 정의 시점 | **Phase 4 최소 세트 → Phase 6 전체 검증 완료.** 최종값: 라이트 tint α0.92 / raised α0.96, 다크 α0.85 / α0.92 | `src/styles/contrast.test.ts`가 WCAG 대비를 기계 검증(12행×2테마: 솔리드+glass 최악 합성(흑/백 언더레이 min)+raised, 전부 ≥4.5:1). 검증이 실결함 검출: 라이트 success가 α0.85에서 3.84:1 → α0.92로 교정. `-webkit-backdrop-filter` 동반 선언(iOS Safari <18). **의도적 이월**: 스크롤-트리거 적응 투명도(D083의 hover/focus/scroll 중 scroll — JS/scroll-timeline 필요), reduced-transparency 시 스크림은 반투명 유지(텍스트·blur 없음 → 대비 보장 무관) | ✅ 확정(Phase 6) |
| B15 | UiState 쿼리 보존 형태 | **모든 non-default variant가 `query: string` 보유** | Bible은 "모든 답 상태에서 재검색→Loading"(Interface §3)을 요구하나 `error`/`success`/`partial`이 원 쿼리를 잃어 재시도 배선 불가(Phase 4 발견). reduce가 loading의 query를 RESULT/FAILURE로 스레딩; 재시도=보존 쿼리로 SUBMIT 재디스패치. 순수 앱 내부 타입 결정 | ✅ 확정(Phase 5) |
| B16 | 매장 검색/근처 매장 라이브 데이터 소스 | **UI+포트 심+mock까지 구현, 실 API 배선은 추후 과제** (owner 지시 2026-07-19) | 층/구역 표시·API 호출 구조는 유지(P3/P4 기구축), 매장 검색 실 데이터 소스는 owner가 자료 공유 후 확정(§A9). Phase 5는 `StoreDirectoryPort` 심 뒤 mock 디렉토리로 D082 시트를 완성 — 실 어댑터 교체 시 UI 재작성 없음 | ✅ 확정(Phase 5) |
| B17 | SW 업데이트 전략 | **`registerType: 'autoUpdate'` + `registerSW({ immediate: true })`, 업데이트 프롬프트 UI 없음** | Bible은 PWA 업데이트 UX를 정의하지 않음(카피 발명 금지). 기존 `prompt` 타입 + 무UI는 업데이트가 영구 미표시(Phase 0 Minor 발견). autoUpdate는 카피 불필요·설치 PWA 신선도 보장; Bible에 업데이트 UX가 정의되면 재전환 가능한 순수 인프라 결정 | ✅ 확정(Phase 6) |
| B18 | 저장소 줄바꿈 정책 | **`.gitattributes` — `* text=auto eol=lf`** | Windows autocrlf 체크아웃에서 `tokens.css` 워킹카피가 CRLF로 스머지되어 Biome formatter 게이트가 비결정적으로 실패(Phase 6 리뷰 Critical). 전 텍스트 파일 LF 강제로 커밋 전 게이트(B8)의 결정론 확보 | ✅ 확정(Phase 6) |
| B19 | PWA 설치 아이콘/자산 | **미구현 — 갭 기록만(owner 지시 2026-07-21, 이번 세션 착수 안 함)** | `vite.config.ts` manifest에 `icons` 배열 없음·`public/` 아이콘 자산 없음 → 현재 빌드는 홈화면 추가 시 아이콘 결손으로 **설치 불가**. Inc 0 셸 범위는 상태-머신·표면·게이트 확립이었고 브랜딩 자산은 후속 과제. 실 배포 전 아이콘 세트(192/512 + maskable) + manifest `icons` 배선 필요. 순수 앱 자산 결정(Bible D-번호 미소비) | 🔬 후속(배포 전) |
| B20 | vitest CVE(GHSA-5xrq-8626-4rwp, CVSS 9.8) 대응 | **ACCEPT + 후속 추적(2026-07-15 결정)** | 브리프가 `vitest ^2.1.1` 핀. 취약점은 `vitest --ui`/개발 서버 경로 — 이 저장소에서 **도달 불가**(`--ui` 실행 스크립트 없음), dev-only, 프로덕션 PWA 번들 부재. 버전 핀 유지. **후속(미예약)**: dev 툴체인 메이저 범프(vitest ≥3.2.6 + vite/plugin 호환) 전용 작업 후 `npm audit`로 lockfile 청결 확인 | 🔬 후속(비블로킹) |

> **2026-07-22 확정 — Flow 1 live-data 배선** (플랜 `docs/superpowers/plans/2026-07-22-flow1-live-data.md`; 도시어 `store-api-observations.md`). 앱 소유 결정(Bible D-번호 미소비).

| # | 결정 | 확정 | 근거/검증 |
|---|---|---|---|
| B21 | 6상태 합성 위치 | 클라이언트 `mapStoreObservation` | 프록시=인증·CORS·조건부 팬아웃+정규화 raw; 매핑 유닛 TDD. |
| B22 | 프록시 아키텍처 | CF Pages Functions `/api/availability`·`/api/stores` | 클라는 내부 /api만; JWT·AES키·uid 서버 전용(env); 화이트리스트 반환. |
| B23 | 인증 | 익명 JWT→AES-128-CBC(WebCrypto)→Bearer+X-DM-UID, 401/403 1회 재발급 | SKILL.md 관측; 키=env `PRE_AUTH_ENC_KEY`(하드코딩·커밋 금지). |
| B24 | franchise 판정 정제 | "가맹 AND 위치없음"=franchiseUndeterminable | SCR_MSG_0015 로직; 철학 불변(정직한 미확정) → Bible 미에스컬레이션. |
| B25 | stck:null 불변식 | null ⟺ 의도적 미조회(가맹+무존); 직영 재고실패→502 | rule 0 guard가 fetch 실패의 notCarried 오분류 차단. |
| B26 | 포맷 결정 | 지하 N층 · lchDay 'YYYY-MM-DD'→'M월 D일' · km→m(round×1000) | format.ts TDD; km→m는 GPS-근처 패스에서 표면화. |
| B27 | 호스트 정합 | 기본 fapi(auth/selStr/stck/disp)+www(SearchGoods), env 오버라이드 | 라이브 스모크로 확정. |

**미해결(라이브 스모크 / data-owner 확인 — 심 뒤 격리):** `sleStsCd` 매장 코드 전체 열거('9'/null 외 qty 폴백 격리) · `stck` 종류(진열 vs 픽업예약) · selStrPkupStck 빈 `data[]` 의미(직영 notCarried 가정) · selStr 상세 응답 래핑(data 객체 vs 배열; extractDirectYn 양쪽 처리) · 매장검색 좌표 optional 가정 · ToS/robots(배포 전, 헤르메틱 유지로 CI 회피).

> **✅ 라이브 스모크 해소(2026-07-22, owner 승인 — 도시어 `store-api-observations.md §라이브 스모크 검증`)**: **B27 호스트정합**(fapi=auth/selStr/stck/disp · www=SearchGoods 전부 200) · **인증**(우리 Bearer 키 `"PRE_AUTH_ENC_KEY"` 공개상수로 selStrPkupStck 200 수락, 무-Bearer 403) · **selStr 좌표 optional**(무좌표 바디 200; km만 영향, 미반환이라 무관) · **selStr 상세 `data[]` 래핑** · **`sleStsCd:"1"`(정상)·`stck` 관측**·**지하 위치**(`stairNo:"-1"`) = 전부 라이브 확인, **프록시 무변경**. **잔여(심 뒤)**: `sleStsCd` 단종`"9"`/미취급`null` 미관측(해당 상품 필요)·`stck` 진열vs픽업 구분·빈 `data[]`·**ToS/robots(배포 전)**.

**추가 미해결/후속(전체-브랜치 최종 리뷰, 2026-07-22):**

- **restock-무일자 카피(철학→Bible):** `mrkGdsYn:'Y'`인데 `lchDay:null`인 입고예정 행에서 `formatLchDay`가 이제 `''` 반환(→ NaN 누출 제거, 커밋 `a8da068`). **✅ 사용자 지시로 정직 해소(커밋 `21a210a`)**: 날짜 없으면 `'재입고 예정이지만 입고일은 아직 미정이에요.'`(날짜 날조 없음). Bible-owned 카피 string이므로 **정본 문구는 Bible ratification 대기**.
- **/api/* 오픈 릴레이:** `access-control-allow-origin:'*'` + origin 제한/레이트리밋 없음. **✅ 사용자 종결**: `PRE_AUTH_ENC_KEY`는 공개 벤더 상수 → 노출 무관, allowlist/rate-limit **불필요**. (별개로 프록시 남용 자체가 우려되면 배포 시 재검토 가능.)
- **스테일 주석:** `src/ui/AvailabilitySurface.tsx` 어댑터-배선 주석. **✅ 정리 완료(커밋 `f9ee11e`)** — 컴포지션 기반(prod=live/dev=mock) 정확히 기술.
- **툴체인 결정(앱 소유):** 플랜 verbatim 코드가 설치된 TS 5.9.3에서 `iv:Uint8Array` → `Uint8Array<ArrayBuffer>` 협소화 필요(커밋 `c7cd306`, 동작 동일). 앱 소유 구현 결정.

---

## C. 가설 — 필드 검증 (구현 블로커 아님, 출시-후)

Bible가 `Hypothesis — requires field validation`으로 명시. **구현을 막지 않음**, 출시 후 실측으로 검증/가역.

- C1. 하단 도킹 검색/스캔 바의 실제 아일 유용성(장갑·바구니·아이 동반). 가역(Upward Escalation).
- C2. `submit→first result ≤2s` (중급 Android·매장망) — 예산 커밋이나 가설.
- C3. AI 검색어 해석의 **순-효용**(절약 타이핑 vs 교정/오버라이드 빈도). 음수면 AI 해석 **제거**.
- C4. Flow 3 그룹당 **3행 바운드**의 적정성.
- C5. 게시된 존 번호의 **글랜스 가독성**(존재는 D064 확인, 가독성·시퀀싱·커버리지는 미측정).
- C6. 30,000+ SKU 규모에서 리터럴 키워드 유사도의 대안 품질(실패 시 05_AI 프로세스로만).

---

## 갱신 규칙

- A 항목 해소 → Bible 세션에서 결정 기록 후, 여기에 D-번호·결과 링크로 마킹.
- B 항목 확정 → 제안을 확정으로 바꾸고 근거 1줄(추적성).
- C 항목은 출시-후 계측 결과로만 이동.
