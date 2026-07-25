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

> **✅/⚠️ data-owner 3항목 바운드 프로브(2026-07-23, 읽기 전용 총 11요청 — 도시어 `store-api-observations.md §라이브 스모크 검증 II`)**: **① `sleStsCd "9"` 관측 해소 ✅** — 시즌/구연도 상품에서 `"9"` 실재(pdNo 단위=체인 판매상태, `stck`>0과도 공존 → 판매종료/단종 후보; 정확한 라벨은 data-owner). **단 `null`(upstream 리터럴)은 미관측** — "미취급"은 `sleStsCd=null`이 아니라 **행 부재**로 표현되므로, 프록시가 empty→`sleStsCd:null`로 합성하는 것은 앱측 표현. **③ 빈 `data[]` 해소 ✅** — = **매장 미취급**(엔드포인트가 취급 (pdNo,strCd)쌍만 행 반환; 단건 미취급 → `{data:[],success:true}` 200; 같은 pdNo가 타 매장엔 존재). 프록시 `fetchStock` "empty=notCarried" 가정 **라이브 검증됨**. **② `stck` 종류(진열 vs 픽업예약) 미해소** — 2026-07-23 바운드 프로브가 케이스 미표면(`mrkGdsYn`/`lchDay` 부재로 상관 불가; 온라인지향 시즌 표본이라 진열존 부재가 결론 불가) → **심 뒤 격리 유지.**

> **✅ GPS-근처 실배선 + 최근 검색 구현(2026-07-23, main `18cda38` — 병렬 worktree TDD, 각 태스크 리뷰 Approved)**: **B16 근처 매장 라이브 배선 완료** — `functions/api/stores.ts` 근처-모드 분기(`keyword:"", srchYn:"N", curLttd/curLitd, geolocationAgrYn:"Y"`; **검색-모드는 byte-identical 무변경**) + `browserGeolocation` 실 GPS(`getCurrentPosition`→좌표) + `createDaisoNearbyFetch`(km→distanceM 변환은 **어댑터층**, UI 의존 없음) + `composition.createGeolocation()` PROD/mock 스위치. GPS는 D082대로 **추천만**(무위치/거부/`getCurrentPosition` 에러/fetch 실패 전부 `[]` — 매장 절대 설정 안 함, 시트 데드엔드 없음). `GeolocationPort` 시그니처 불변(frozen seam). **B28(신규, 앱 소유): 최근 검색** = 로컬 `localStorage`(`daiso.recentSearches`), **정확-문자열 dedup + re-bump**(매칭토큰 무정규화 D068/D069), **MAX_ENTRIES=5**(Bible 미지정 → 앱 결정), **빈 목록이면 캡션 미표시**(빈 캡션=부정직 UI 회피), blocked/corrupt storage는 정직 열화(throw 없음, G3). 카피 `"최근 검색"`=Bible 정본(Interface §2 목업·Typography), 항목 텍스트=사용자 입력 그대로. 게이트: unit **251**·e2e **17**, tsc/biome clean. **UI 스타일링(`.recent-searches` CSS)은 UI-마지막 패스로 이월**(리뷰 minor, 비블로킹).

> **✅ B29 — 리터럴 다중후보 + 상품 이미지(2026-07-23, main `e349668`, 4-태스크 순차 SDD + opus 전체리뷰 "Ready:Yes")**: user 지적("검색이 상품 1개만·이미지 없음") 해소. 이건 **Bible 기설계의 앱 구현**(철학 불변): Interface §3.3 확신도 티어(High=단일카드/Medium="이걸 찾으시나요?"/Low=리터럴 결과)와 "with photo"가 이미 설계됨. **AI 확신도 모델이 없으므로 fallback-first Low 티어만 구현** — 발명 아님. 앱 결정: (1) **이미지** `pdImgUrl`(상대경로)을 **프록시에서 `https://cdn.daisomall.co.kr` 절대화**(www 404·§스모크 III 확정) → `RawStoreObservation.imageUrl`(계약 양쪽 미러, optional로 파리티 보존) → `mapStoreObservation`이 6 variant에 스레딩(판정 로직 불변) → `AnswerCard`/후보행 공유 `ProductPhoto`(없으면 렌더 안 함=정직, alt=상품명 Bible §접근성). (2) **다중후보** = 신규 **`/api/search`**(쿠키-only, `stores.ts` 패턴; `MASTER_PD_NO≠""` B-변형 폴딩=Anti-goal1·dedup·cap 10) + `ProductSearchPort`/어댑터/mock + **`candidates` pre-answer UiState**(6상태 답 아님, reducer slice(0,3)). `runQuery` 검색-우선: 0→raw-keyword availability·1→availability(pdNo)·≥2→후보 리스트; 탭→`runByPdNo`(pdNo 재고확인). notice=**Bible 정본** `검색 결과예요. 바코드를 스캔하면 더 정확해요.`(Interface L169 AI-low; `이걸 찾으시나요?` 미사용). (3) **`/api/availability` pdNo-identity 버그 수정**: pdNo 지정 시 `pickProductDoc`이 매칭 doc으로 정체성(docs[0] 아님) → 후보 #3 탭이 #3 상품을 정확히 조회. 게이트: unit **280**·e2e **17**·tsc/biome clean, 시크릿 무유출.
>
> **갭① 관계**: 이전에 "상품 후보 disambiguation UX"를 Bible(item 2b)로 라우팅했으나 — **리터럴/fallback-first 레벨은 Bible 기설계라 앱이 구현 완료**(B29). 남은 것은 **AI 확신도 자동판정**(High/Medium 전환·"이걸 찾으시나요?"·임계값)뿐이며, 이는 AI 해석 레이어(로드맵 item 3, `AI/availability-check.md` 계약; 임계값은 Bible 명시 Hypothesis/현장검증)로 **여전히 이연**. 즉 갭①은 "리터럴 후보=완료, AI 티어링=이연"으로 분리됨.
>
> **후속(opus 리뷰 Minor, 비블로킹)**: M1 `/api/availability` 0-후보 fall-through는 B-변형 폴딩 안 함(docs[0] — pre-existing·희소 데이터형; 일관성 위해 `MASTER_PD_NO` 스킵 고려) · M2 `onlyOnlYn:"Y"` base 상품은 후보에 남음(노이즈; 폴딩 범위 밖) · M3 `/api/search`가 안 쓰는 `PRE_AUTH_ENC_KEY` 요구(stores.ts 패턴 답습, 유출 아님) · M5 캐시 키가 name 기반(동명이pdNo 충돌 희소·무해, best-effort). **M4(alt="" 제안) 기각** — Bible §접근성이 상품명 alt 필수. 이 항목들은 candidate-quality 튜닝(Bible Interface §8 "candidate quality … Hypothesis")과 함께 재고.
>
> **✅ M1/M2 해소 — 후보품질 튜닝(2026-07-24, owner 승인 = M1+M2 둘 다 배송; 병렬 SDD: 2 정찰 + TDD + 2 adversarial 리뷰)**: 공유 판정식 **`isStoreCarryableBaseDoc`**(`MASTER_PD_NO===''` && `onlyOnlYn!=='Y'`, `functions/_lib/daisoUpstream.ts`)를 **양쪽 엔드포인트가 공유** — `/api/search` `foldCandidates`(**M2 = 제외**)와 `/api/availability` `pickProductDoc`(**M1 = preference**)가 "키워드의 base 상품"에 대해 일관(튜닝의 목적 자체). **M1**: pickProductDoc 폴스루(pdNo 무/불일치)가 취급-base를 우선 선택, 없으면 `docs[0]` 폴백 — **정직성 불변식: 문서가 존재하면 절대 `null`(=거짓 NO_MATCH/Empty) 반환 금지**(`firstDoc` 누적기; cross-group teeth 테스트로 회귀 잠금). pdNo-match 브랜치(B29 pdNo-identity 수정)는 불변. **M2**: 온라인전용(`onlyOnlYn:"Y"`) 후보 제외 — **가역적 Hypothesis-class de-noise**로 owner 승인. 근거 취약성을 코드 코멘트에 명시: §SearchGoods line 87 헤지("매장 미취급 **후보**") + §라이브 스모크 II 잠재 반증(`onlyOnlYn`은 selStrPkupStck 재고행과 **미-cross-tab**; 정직한 매장-취급은 여전히 selStrPkupStck 빈 `data[]`이 결정, 카탈로그 플래그 아님) — 되돌림 자명. 무-날조·6상태·판정 로직·UX 카피·관측 화이트리스트 **전부 불변**(입력 파싱만 확장). 리뷰: 정확성 "Ready=Yes"(Critical/Important 0), 테스트-무결성 "With additions"(cross-group 커버리지 반영). 게이트: unit **286**·tsc·biome clean, 시크릿 무유출. **M3/M5는 그대로 이연**(search.ts enc-key 커플링·name-기반 캐시키 — 유출/무해). 근거 = `functions/_lib/daisoUpstream.ts`·`functions/api/{search,availability}.ts`.

> **✅ 바코드 스캔 진입(2026-07-25, owner 승인 — 설계 `docs/superpowers/specs/2026-07-25-barcode-scan-design.md`, 5-태스크 순차 SDD)**: 검색바의 기존 `바코드 스캔` 버튼(dead stub)을 살려 카메라 디코드 → 기존 `/api/availability` 파이프라인으로 수렴시켰다. 앱 소유 결정은 아래 §B30.

| # | 결정 | 확정 | 근거/검증 |
|---|---|---|---|
| B30-1 | 디코더 스택 | 네이티브 `BarcodeDetector` + 번들 `@zxing/library` 동적 import 폴백 | 외부 CDN 금지; 동적 import라 **엔트리 청크 불변** — 빌드 확인(2026-07-26): entry `index-C3o6y_7m.js` 174.67 kB(gzip 56.54) vs zxing 지연청크 `index-D3Mz4UNV.js` 415.76 kB(gzip 110.22), zxing 내부 심볼은 지연청크에만 존재 |
| B30-2 | 심볼로지 | EAN-13/8 · UPC-A/E · CODE-128/39 · ITF (QR·DataMatrix 제외) | 1D 상품 바코드만; QR 페이로드 미정의 + D082 혼동 회피 |
| B30-3 | 스캔 조회 경로 | 디코드값 = keyword = pdNo로 기존 `/api/availability` 재사용, `/api/search` 미경유 | 정확 식별자라 후보 리스트 무의미 + M2 필터 리스크 + 왕복 1회 절감 |
| B30-4 | 스캔 카피 4종 | 앱 정직 초안(권한·미지원·읽기 실패·힌트) + 스캔 전용 Empty | Bible 침묵 구간, owner 승인(2026-07-25) — **Bible 비준 대기** |
| B30-5 | 뷰파인더 상태 모델 | UI 셸 상태 `scannerOpen`(6상태 불변), 도메인엔 `origin?: 'scan'` 프로버넌스만 | 7번째 상태 신설 금지; provenance는 카피 선택 전용 |
| B30-6 | 바코드 숫자 최근 검색 미기록 | 기록 안 함 | 숫자열은 recognition-over-recall 가치 없음·목록 오염 |
| B30-7 | 물리 바코드 ↔ pdNo 관계 | **미확정 — 심 뒤 격리** | 프로브(2026-07-25, 5요청): SearchGoods doc **74필드에 바코드 필드 0건**, 하위 엔드포인트 유일 키 = `pdNo`. 실 상품 바코드 1개면 1요청으로 판정 가능(§B9 필드검증) |

B30-4는 **Bible 비준 대기** — 앱이 정직 초안으로 4종 카피(권한 거부·미지원·읽기 실패·힌트 + 스캔 전용 Empty)를 채택했고, verbatim 테스트가 잠가두고 있으나 정본은 Bible 확정 시 교체된다. B30-7은 **잔여 리스크** — 물리 상품 포장의 EAN-13 바코드가 daisomall의 `pdNo`와 다르면 스캔 경로는 실사용에서 항상 정직한 Empty로 끝난다(추측 변환 금지, D3); 검증 계약 자체에 역방향 확인 경로가 없어 owner가 실 바코드 1개를 제공해야 해소된다. 추가로 **honesty 분류 정정**(구현 리뷰 반영, 설계 §5): `unsupported`는 "`getUserMedia` API 자체가 없거나 번들 디코더를 로드하지 못한 경우"로만 좁혔다 — 카메라가 다른 앱에 점유되거나 장치가 없는 등 일시적 획득 실패까지 `unsupported`로 접으면 "이 브라우저는 스캔을 못 한다"는 영구적 사실을 날조하게 되므로(Anti-goal 3), 그 외 실패는 전부 `failed`로 분류한다. **실 카메라 경로는 필드 미검증**(§B9 iOS Safari 제약) — DEV/E2E는 무-카메라 mock 스캐너로만 전 플로우를 통과시키며, 실기기 권한·디코드 동작은 미확인이다. **비블로킹 후속(빌드 관측 2026-07-26)**: SW precache가 `globPatterns: ['**/*.{js,css,html,svg,png,woff2}']`이라 zxing 지연청크까지 설치 시 선캐시한다 — **엔트리/초기 로드는 불변**이나 PWA 설치 페이로드는 그만큼 늘어나므로, precache 제외 여부는 별도 패스에서 검토(이번 슬라이스 범위 밖·동작 영향 없음).

> **🔴 런타임 차단 발견(2026-07-23, 로컬 `wrangler pages dev` vs Node dev-proxy 대조) — 아키텍처 결정 필요**: daisomall anti-abuse가 **auth-protected 엔드포인트(`selStrPkupStck`·`selIntPdStDispInfo`)에서 Cloudflare Workers(workerd)의 TLS/HTTP 지문을 403 차단**한다. 진단: 우리 WebCrypto Bearer는 node:crypto와 **바이트 완전 동일**하고 **node에서 200 수락**되나, **동일 로직이 workerd에서 403**; 쿠키·User-Agent·Origin/Referer·`cf-*` 헤더 전부 배제됨(같은 머신/IP). 지문(JA3)은 **런타임(workerd) 속성**이므로 로컬 miniflare와 프로덕션 CF Pages가 동일 → **프로덕션 CF Pages도 차단될 공산이 큼**. 영향: workerd에서 `/api/stores`(무인증)는 OK이나 `/api/availability`(인증)는 502. **(A) 로컬 테스트 수단 = `scripts/dev-proxy.mjs`(`npm run dev:live`)**: 진짜 `functions/`를 **Node 런타임**에서 실행(esbuild 번들, 재구현 아님) → node TLS 수락 → 전체 라이브 플로우 로컬 동작(availability 200 확인). **(B) 프로덕션 확정**: 일회용 CF 배포로 검증(또는 JA3 논리상 skip). **(C) 프로덕션 경로**: 인증 엔드포인트를 **Node 런타임 프록시**(k-skill gpu01 방식)로 — A가 이 런타임을 이미 검증. **공개 배포(B/C)는 ToS/robots 선결.**

**추가 미해결/후속(전체-브랜치 최종 리뷰, 2026-07-22):**

- **restock-무일자 카피(철학→Bible):** `mrkGdsYn:'Y'`인데 `lchDay:null`인 입고예정 행에서 `formatLchDay`가 이제 `''` 반환(→ NaN 누출 제거, 커밋 `a8da068`). **✅ 사용자 지시로 정직 해소(커밋 `21a210a`)**: 날짜 없으면 `'재입고 예정이지만 입고일은 아직 미정이에요.'`(날짜 날조 없음). Bible-owned 카피 string이므로 **정본 문구는 Bible ratification 대기**.
- **/api/* 오픈 릴레이:** `access-control-allow-origin:'*'` + origin 제한/레이트리밋 없음. **✅ 사용자 종결**: `PRE_AUTH_ENC_KEY`는 공개 벤더 상수 → 노출 무관, allowlist/rate-limit **불필요**. (별개로 프록시 남용 자체가 우려되면 배포 시 재검토 가능.)
- **스테일 주석:** `src/ui/AvailabilitySurface.tsx` 어댑터-배선 주석. **✅ 정리 완료(커밋 `f9ee11e`)** — 컴포지션 기반(prod=live/dev=mock) 정확히 기술.
- **툴체인 결정(앱 소유):** 플랜 verbatim 코드가 설치된 TS 5.9.3에서 `iv:Uint8Array` → `Uint8Array<ArrayBuffer>` 협소화 필요(커밋 `c7cd306`, 동작 동일). 앱 소유 구현 결정.

**제품/UX 갭 & 제안 (2026-07-23, 로컬 라이브 테스트 중 owner 발견 — 철학/플로우 → Bible 라우팅):**

- **① 상품 후보 disambiguation 미구현 (Canon 정의됨, live-data 범위서 deferred):** `/api/availability`가 키워드 → `SearchGoods` **최상위 1건(`docs[0]`)만** 골라 재고 확인 → 여러 상품이 매칭되는 키워드(예: "밀폐용기")에서 **나머지 후보는 표시/선택 불가**. Canon(`increment-0-1-normative-brief.md §130` / spec `CandidateList(AI)`)은 **AI 해석 Medium 확신도 → 후보 최대 3("이걸 찾으시나요?")** + **`직접 검색 결과 보기` 오버라이드(항상 노출·즉시·영구)** 로 해소하도록 정의하나 **둘 다 미구현**(fallback-first 원칙상 리터럴 top-match만 먼저 구축, AI/후보/오버라이드 deferred). 백엔드는 이미 대비됨 — `storeStockRepository`가 `{strCd,keyword,pdNo}` 전송 + 프록시 `body.pdNo ?? product.pdNo` → **UI 후보 리스트 + 오버라이드만 추가하면** "후보 선택 → 그 pdNo 재조회" 성립. **정직성 갭**: 여러 매칭 중 고른 상품을 THE 답처럼 표기하며 모호성을 미노출(Canon의 후보/오버라이드가 바로 이 방지 장치). → **AI/후보 UX·카피=Bible 정의; 구현 우선순위·타이밍은 owner 결정.**

- **② "반대형" 플로우 제안 — 상품 우선 → 어느 매장에 있나 (store-finder) [owner 제안, → Bible RFC 필수]:** 현재는 **store-first**(매장 고정 → 이 상품 여기 있나). owner 제안 = 반대형(상품 → 재고 있는 (근처) 매장 목록). **데이터/인프라 성립**: `selStrPkupStck`가 `[{pdNo,strCd}]` **배치**라 다-매장 일괄 조회 가능 + 매장검색·재고 인프라 존재. **그러나 앱 임의 구현 금지 — 철학/플로우 변경이라 Bible RFC 대상**: (a) 코어 프레이밍이 **"in-aisle, 폰 든 쇼퍼, 이게 여기 지금 있나"** 인데 반대형은 **여행-계획형**으로 재정의; (b) **Anti-goal 2**("대안·근처매장 재고는 **부정 답 이후에만**, 긍정 답 옆에 절대 금지")와 1차-진입으로 직접 충돌; (c) Flow 3(Alternative Discovery)에 "근처 매장 재고"가 이미 있으나 **부정-답 게이트** 뒤. → **Bible에서 "in-aisle 코어 vs store-finder 확장(어느 매장 조회 범위=GPS-근처 vs 전체)"을 RFC로 결정한 뒤 앱이 구현.** (관련 미구현: GPS-근처 실배선.)

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
