# HANDOFF — DAISO Finder

> 이 저장소에서 새 세션을 시작하면 **여기부터** 읽는다.

## 현재 상태 (2026-07-13)

**킥오프 — 거버넌스 골격만 준비됨. 구현 코드 없음.**

준비된 것:
- `CLAUDE.md` — 앱 거버넌스, Product Bible을 read-only 권위로 지목, 질문 정책, 갭 피드백 루프
- `AGENTS.md` — 에이전트 진입점, 작업 유형별 최소 컨텍스트, 구현 순서
- `README.md`, `.gitignore`
- 킥오프 스펙(Bible): `../product-bible/docs/superpowers/specs/2026-07-13-daiso-finder-kickoff-and-workspace-design.md`

아직 없는 것: 빌드 도구·React 앱·서비스워커·데이터 계층 — 전부 Increment 0의 몫.

## 다음 작업 — Increment 0+1 상세 설계

brainstorming → spec → writing-plans 순서로:

- **Increment 0 — PWA 골격 + 데이터 계층**: 빌드 도구(Vite 등)·라우팅·상태관리 선택, 서비스워커 캐시 전략(=Bible 신선도/노후 모델 매핑), 관측 API `newIntSelStr` 래핑 + 어댑터 심 + mock, 스탬프=관측 시점 나이(D061).
- **Increment 1 — Flow 1 Availability Check**: 첫 수직 슬라이스. 익명·무로그인(Anti-goal 4). 화면 상태 6종(Default/Loading/Empty/Error/Success/Partial).

규범 입력(먼저 읽기): Bible의 Flow 1 `Experience/availability-check.md`, `Interface/availability-check.md`, `Engineering/availability-check.md`, `AI/availability-check.md`, `Engineering/data-contract.md`.

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
