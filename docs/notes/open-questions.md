# Open Questions & Decisions — DAISO Finder

> 목적: 구현 중 마주칠 **미해결 항목**을 (A) Bible 에스컬레이션 필요, (B) 앱-레벨 결정, (C) 출시-후 검증 가설로 분리 추적한다.
>
> **철칙**(CLAUDE.md §2·§3): Canon에 답 있으면 따른다. 없거나 모순이면 **중단·질문**. 스펙 갭은 앱에서 임의 결정 금지 → **Bible에 결정/RFC로 에스컬레이션**(Bible 세션에서, 이 세션과 분리) 후 따른다. 앱-레벨 결정만 이 저장소가 자체 기록(Bible D-번호 미소비).
>
> 최종 갱신: 2026-07-13 (규범 종합 직후).

---

## A. Bible 에스컬레이션 필요 (앱에서 임의 결정 금지)

이 항목들은 **Bible 세션에서** 결정/RFC로 되돌려야 한다. 여기서 임의로 메우지 않는다.

| # | 항목 | 왜 갭인가 | 영향 Increment | 코어 블로킹? | 액션 |
|---|---|---|---|---|---|
| A1 | **매장 진입 = QR? 자동감지? 피커?** | 앱 README·CLAUDE.md는 "매장 QR 진입 전제"라 하나, Bible Flow 1 Canon(Experience/Interface)은 **geolocation 자동감지(3s) + 수동 `매장 변경` 피커**만 규정. QR 진입 경로는 현 Canon에 **부재** → 모순. | Inc 1 Default 진입 | **아니오**(매장 컨텍스트 파라미터화 가능) | Bible에 진입 메커니즘 확정 요청. 확정 전 Inc 0은 store-context를 주입 가능하게 설계. |
| A2 | **staleness 임계값(cache age)** | 값 미설정. Error↔Partial 강등 경계를 실측하려면 필요. data-owner 협의 대상. | Inc 1 Error/Partial | 아니오(심 뒤 설정값+mock) | data-owner 확인 → Bible에 값 기록. 코어는 설정 가능 값으로 진행. |
| A3 | **저재고 컷오프(qty)** | `재고 N개 이하`가 결정-관련이 되는 qty 미설정. | Inc 1 Success(저재고) | 아니오(심) | data-owner 확인 → Bible 기록. |
| A4 | **다국어 언어/타이밍/디자인 + 입력측 검색 별칭** | D068이 다국어를 shipping 요구로 비준했으나 **언어/타이밍/디자인 OPEN**. data-owner의 **입력측 검색 별칭** 미공급 → 비-Korean 쿼리가 Korean 카탈로그 도달 못 함(리터럴 폴백 실패, AI-only는 05_AI가 금지). | Inc 1 검색 범위 | 부분(Korean 경로는 비블로킹) | Bible에 다국어 범위/타이밍 결정 요청 + data-owner 별칭 협의. |
| A5 | **5/6 복구 경로가 Korean 직원 종료(B7 텐션)** | AI Unknown 리다이렉트·위치 없음 Partial·no-cache Error는 물을 수 없는 쇼퍼(B7)에게 데드엔드 — 플로우가 금지하는 것. Bible가 "기록된 텐션, 둘째 데이터-기반 엔딩 대기"로 이미 인지. | Inc 1 복구 카피 | 아니오 | 신규 갭 아님(기록됨). 둘째 엔딩 확보 시 Bible가 갱신. |
| A6 | **D062 범위 이중성(마이너)** | Engineering 로그는 'qty 상한만', Interface/data-contract 로그는 '4개 부정 답+Partial 재트리거'로 글로스 — 한 D-번호가 두 교정을 묶은 듯. | Inc 1 구현 해석 | 아니오 | Bible에 정확 범위 확인 요청(경미). 구현은 양쪽 다 만족하게. |
| A7 | **판매종료 범위(매장 vs 체인)** | Flow 3(Inc 3) Group B 발행 게이트. 미결 동안 discontinued 진입은 nearby withhold. | Inc 3(선행: Inc 0 심 설계) | 아니오 | Inc 0 심을 **매트릭스 재작성 없이 스위치** 가능하게 설계. data-owner 확인. |
| A8 | **데이터 계약 = 단일-샘플 Evidence Level 2** | `sleStsCd` 값 열거 미완, `curLitd`/`strLitd` 철자(경도?) 미확인, 결손 행 처리 미정의, hldyDt 시맨틱 미정의 — 전부 구현 전 확인 필요. | Inc 0/1 데이터 레이어 | 아니오(관측값 mock) | data-owner와 라이브 페이로드 대조 → Bible data-contract 갱신. |

---

## B. 앱-레벨 결정 (이 저장소가 결정 — Bible D-번호 미소비)

> 아래는 **제안(미승인)**. Increment 0+1 상세 설계에서 owner 확인 후 확정하고 이 표를 갱신한다. 확정 시 각 항목에 근거를 남긴다(추적성).

| # | 결정 | 제안(미승인) | 대안/트레이드오프 | 상태 |
|---|---|---|---|---|
| B1 | 빌드툴/번들러 | **Vite** (`.gitignore`에 이미 Vite/PWA 흔적) | Next.js(SSR 불필요·오프라인 SW 우선이라 과함) | 미승인 |
| B2 | 프레임워크/언어 | **React + TypeScript** (킥오프 확정) | — (확정) | 확정 |
| B3 | 서비스워커/PWA | **vite-plugin-pwa (Workbox)** | 수동 SW(제어↑, 보일러플레이트↑) | 미승인 |
| B4 | 라우팅 | **단일 표면이라 라우터 최소화** or React Router | 플로우 전환은 상태 기반(§단일 표면) | 미승인 |
| B5 | 상태관리 | **경량(Zustand/Context)** — 서버 상태는 별도 | Redux(과함) / TanStack Query(캐시 정책이 신선도 모델과 충돌 소지 — 검토) | 미승인 |
| B6 | 데이터 레이어/어댑터 심 인터페이스 | 관측 계약을 도메인 타입으로 정규화하는 **포트/어댑터** + `newIntSelStr` 어댑터 + mock 어댑터 + 미해결 항목(§3 심) 격리 | — | 미승인 |
| B7 | 테스트/검증 | **Vitest + Testing Library + Playwright** (`.gitignore`에 흔적). TDD(§skill) | — | 미승인 |
| B8 | 커밋 전 검증(lint/test) | ESLint/Biome + tsc + Vitest 게이트 | — | 미승인 |
| B9 | iOS Safari PWA 제약 필드검증 | SW/설치/카메라·바코드/불안정 매장망을 Inc 0에서 실측 | — | 미승인(필드검증 필요) |

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
