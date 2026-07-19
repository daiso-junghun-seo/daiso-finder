# Open Questions & Decisions — DAISO Finder

> 목적: 구현 중 마주칠 **미해결 항목**을 (A) Bible 에스컬레이션 필요, (B) 앱-레벨 결정, (C) 출시-후 검증 가설로 분리 추적한다.
>
> **철칙**(CLAUDE.md §2·§3): Canon에 답 있으면 따른다. 없거나 모순이면 **중단·질문**. 스펙 갭은 앱에서 임의 결정 금지 → **Bible에 결정/RFC로 에스컬레이션**(Bible 세션에서, 이 세션과 분리) 후 따른다. 앱-레벨 결정만 이 저장소가 자체 기록(Bible D-번호 미소비).
>
> 최종 갱신: 2026-07-19 (Phase 5 착수 — §A9 에스컬레이션, §B15/B16 앱-레벨 결정 추가).

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
| A8 | **데이터 계약 = 단일-샘플 Evidence Level 2** | `sleStsCd` 값 열거 미완, `curLitd`/`strLitd` 철자(경도?) 미확인, 결손 행 처리 미정의, hldyDt 시맨틱 미정의 — 전부 구현 전 확인 필요. | Inc 0/1 데이터 레이어 | 아니오(관측값 mock) | data-owner와 라이브 페이로드 대조 → Bible data-contract 갱신. |
| A9 | **매장 검색/근처 매장 데이터 소스 미관측** | Engineering §5(D082)는 매장명·지역 검색과 거리순 근처 매장 목록을 요구하지만 data-contract에 매장 검색/목록 API가 관측되어 있지 않음(문서화된 것은 상품 스코프 `newIntSelStr`뿐). 관측 증거 후보는 존재(`.claude/skills/k-skill` 번들 `daiso-product-search`가 daisomall `selStr`·`selStrSrchKeyword`·`selStrInfo` 표면 문서화) — Bible 세션에서 data-contract 반영 후에만 앱이 소비. | Inc 1 매장 선택 시트 | 아니오(§B16 심 뒤 mock) | Bible 세션에서 data-contract 갱신(k-skill 관측 + 라이브 검증) → 실 어댑터 배선. |

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
| B14 | D083 glass 토큰(`--surface-solid` 등) 최소 정의 시점 | **Phase 4에서 최소 세트 선정의**, 전체 대비/성능 튜닝은 Phase 6 | `glass.css`가 참조하는 4개 커스텀 프로퍼티가 `tokens.css`에 미정의라 카드가 투명 렌더됨(Phase 2 Minor 발견); D083의 ≥4.5:1 대비 보장은 비협상이라 Phase 4는 라이트/다크 최소 토큰만 공급 | 🔬 Phase 6에서 전체 검증 |
| B15 | UiState 쿼리 보존 형태 | **모든 non-default variant가 `query: string` 보유** | Bible은 "모든 답 상태에서 재검색→Loading"(Interface §3)을 요구하나 `error`/`success`/`partial`이 원 쿼리를 잃어 재시도 배선 불가(Phase 4 발견). reduce가 loading의 query를 RESULT/FAILURE로 스레딩; 재시도=보존 쿼리로 SUBMIT 재디스패치. 순수 앱 내부 타입 결정 | ✅ 확정(Phase 5) |
| B16 | 매장 검색/근처 매장 라이브 데이터 소스 | **UI+포트 심+mock까지 구현, 실 API 배선은 추후 과제** (owner 지시 2026-07-19) | 층/구역 표시·API 호출 구조는 유지(P3/P4 기구축), 매장 검색 실 데이터 소스는 owner가 자료 공유 후 확정(§A9). Phase 5는 `StoreDirectoryPort` 심 뒤 mock 디렉토리로 D082 시트를 완성 — 실 어댑터 교체 시 UI 재작성 없음 | ✅ 확정(Phase 5) |

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
