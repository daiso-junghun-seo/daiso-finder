# HANDOFF — DAISO Finder

> 이 저장소에서 새 세션을 시작하면 **여기부터** 읽는다.

## 현재 상태 (2026-07-13, 갱신)

**킥오프 + 규범 컨텍스트 확보 완료. 구현 코드는 아직 없음.**

준비된 것:
- `CLAUDE.md` — 앱 거버넌스, Product Bible을 read-only 권위로 지목, 질문 정책, 갭 피드백 루프
- `AGENTS.md` — 에이전트 진입점, 작업 유형별 최소 컨텍스트, 구현 순서
- `README.md`, `.gitignore`
- 킥오프 스펙(Bible): `../product-bible/docs/superpowers/specs/2026-07-13-daiso-finder-kickoff-and-workspace-design.md`
- **NEW — [`docs/notes/increment-0-1-normative-brief.md`](notes/increment-0-1-normative-brief.md)**: Bible을 정독·종합한 Increment 0+1 규범 브리핑(구속 제약·데이터 계약·어댑터 심·신선도·Flow 1 6상태·카피/i18n·성능/접근성·결정 상태). **파생 읽기 보조 — 권위는 여전히 Bible.**
- **NEW — [`docs/notes/open-questions.md`](notes/open-questions.md)**: 미해결 항목 추적 — (A) Bible 에스컬레이션 8건, (B) 앱-레벨 결정 9건(제안 포함), (C) 출시-후 검증 가설 6건.

아직 없는 것: 빌드 도구·React 앱·서비스워커·데이터 계층 — 전부 Increment 0의 몫.

**확인된 핵심**:
- Increment 0·1은 **비준 대기 없이 지금 착수 가능**(Flow 1 체인 Review/complete + D059/D061/D068/D069, D078로 Inc 2·3 게이트도 해제).
- **에스컬레이션 필요 갭 1건(A1)**: 앱은 "매장 QR 진입 전제"라 하나 Bible Canon은 geolocation 자동감지+수동 피커만 규정 → 모순. Inc 0 코어는 비블로킹(store-context 파라미터화). 확정은 Bible 세션에서.
- 데이터-오너 미해결 6건은 어댑터 심 뒤 격리(코어 비블로킹).

## 다음 작업 — Increment 0+1 상세 설계 (여기서 재개)

brainstorming → spec → writing-plans 순서로. **규범 컨텍스트는 위 두 notes에 종합됨** — 먼저 그걸 읽고, 정본 필요 시 Bible 원문으로 확인.

1. **앱-레벨 결정 확정**([open-questions.md](notes/open-questions.md) §B): 빌드툴/라우팅/상태/SW/어댑터 심 인터페이스/테스트. 제안 있음, owner 확인 필요.
2. **Bible 에스컬레이션 항목 처리**(§A): A1(진입 메커니즘) 등은 Bible 세션에서 결정 후 따른다 — 앱에서 임의 결정 금지.
3. **설계 스펙 작성** → `docs/superpowers/specs/YYYY-MM-DD-increment-0-1-design.md`, 승인 후 writing-plans.

- **Increment 0 — PWA 골격 + 데이터 계층**: 빌드 도구·라우팅·상태관리 선택, 서비스워커 캐시 전략(=Bible 신선도/노후 모델 매핑, D061), 관측 API `newIntSelStr` 래핑 + 어댑터 심 + mock, 스탬프=관측 시점 나이.
- **Increment 1 — Flow 1 Availability Check**: 첫 수직 슬라이스. 익명·무로그인(Anti-goal 4). 화면 상태 6종(Default/Loading/Empty/Error/Success/Partial).

규범 입력(정본, 필요 시 원문 확인): Bible의 Flow 1 `Experience/availability-check.md`, `Interface/availability-check.md`, `Engineering/availability-check.md`, `AI/availability-check.md`, `Engineering/data-contract.md`.

## 순서 & 종속

- Increment 0·1은 **지금 가능**(Flow 1 체인 완결, 비준 대기 없음).
- Increment 2(Flow 2)는 **D077 비준 후**, Increment 3(Flow 3)은 **D076 비준 후**. 비준 여부는 Bible 세션에서 확인.
- 데이터 오너 협의 6건은 병렬 — 어댑터 심 뒤에서 대기, 코어를 막지 않음.

## 저장소 경계 (중요)

- 제품 요구는 Bible이 SSOT. 여기서 재서술 금지 — 링크/인용.
- 스펙 갭 발견 시 앱에서 임의 결정 금지 → Bible에 결정/RFC로 에스컬레이션한 뒤 따른다.
- Bible 세션과 이 세션을 섞지 않는다. 교차는 읽기로만.

## 연결

- Bible 핸드오프: `../product-bible` 세션 메모리 `handoff.md` (D076·D077 비준 대기, Flow 2 경험 결정 2건, 데이터 오너 협의 6건).
