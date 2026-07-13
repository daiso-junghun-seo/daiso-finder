# HANDOFF — DAISO Finder

> 이 저장소에서 새 세션을 시작하면 **여기부터** 읽는다.

## 현재 상태 (2026-07-13, 갱신)

**킥오프 + 규범 컨텍스트 + Increment 0+1 설계 스펙 승인 완료. 구현 코드는 아직 없음 — 다음 단계는 구현 플랜(writing-plans).**

준비된 것:
- `CLAUDE.md` — 앱 거버넌스, Product Bible을 read-only 권위로 지목, 질문 정책, 갭 피드백 루프
- `AGENTS.md` — 에이전트 진입점, 작업 유형별 최소 컨텍스트, 구현 순서
- `README.md`, `.gitignore`
- 킥오프 스펙(Bible): `../product-bible/docs/superpowers/specs/2026-07-13-daiso-finder-kickoff-and-workspace-design.md`
- [`docs/notes/increment-0-1-normative-brief.md`](notes/increment-0-1-normative-brief.md): Bible을 정독·종합한 Increment 0+1 규범 브리핑. **파생 읽기 보조 — 권위는 여전히 Bible.**
- [`docs/notes/open-questions.md`](notes/open-questions.md): 미해결 항목 추적 — (A) Bible 에스컬레이션, (B) 앱-레벨 결정(**B1–B10 확정, B9·B11 Inc 0 검증**), (C) 출시-후 검증 가설.
- **NEW — [`docs/superpowers/specs/2026-07-13-increment-0-1-design.md`](superpowers/specs/2026-07-13-increment-0-1-design.md)**: **Increment 0+1 설계 스펙(승인 완료)**. 아키텍처(Hexagonal-lite 포트/어댑터)·모듈 구조·신선도 데이터 플로우·도메인 모델(union·상태머신 전이표·매핑)·어댑터 심 6건·에러 처리·D083 glass 프리미티브·성능/접근성·테스트(TDD)·Increment 2단계 경계. **앱-레벨 설계 — 정본은 여전히 Bible.**

확정된 앱-레벨 결정: 호스팅 **Cloudflare Pages + Workers 프록시**, 빌드 **Vite**, SW **vite-plugin-pwa/Workbox**, 라우팅 **없음·상태구동**, 데이터 레이어 **신선도-네이티브 커스텀 + Zustand**, 어댑터 **단일 포트 + 주입 정책**, 테스트 **Vitest + Testing Library + Playwright + TDD**.

아직 없는 것: 빌드 도구·React 앱·서비스워커·데이터 계층 — 전부 Increment 0의 몫. **CORS/프록시 필요성·iOS Safari PWA 제약은 Inc 0에서 실측(가설).**

**확인된 핵심**:
- Increment 0·1은 **비준 대기 없이 지금 착수 가능**(Flow 1 체인 Review/complete + D059/D061/D068/D069, D078로 Inc 2·3 게이트도 해제).
- **해소된 갭(A1) — Bible D082(2026-07-13)**: 매장 진입/Store Context 확정. Store Context는 **사용자 소유** — 마지막 선택 매장 기본, GPS는 근처 매장 추천만(자동 확정·검색 차단 없음), GPS 실패 시 마지막 매장 유지, QR 진입 제거, 항상 표시·변경. Inc 0/1은 이 정책 구현.
- 데이터-오너 미해결 6건은 어댑터 심 뒤 격리(코어 비블로킹).

## 다음 작업 — 구현 플랜(writing-plans) → Increment 0 착수 (여기서 재개)

**설계는 완료·승인됨**([design spec](superpowers/specs/2026-07-13-increment-0-1-design.md)). 남은 것은 `writing-plans`로 **2단계 구현 플랜**(Inc 0 인프라 → Inc 1 플로우)을 뽑고, TDD로 구현하는 것.

1. **`writing-plans`** — 설계 스펙 §12(Increment 단계)를 상세 구현 플랜으로. 2단계(Inc 0 → Inc 1).
2. **구현 코드는 별도 브랜치**에서(main은 docs 전용 관례). TDD(§skill), 커밋 전 게이트 ESLint/Biome + tsc + Vitest.
3. **Bible 에스컬레이션 유지**(§A): A2–A8·hldyDt는 심 뒤 placeholder + mock으로 진행, Bible 세션 결정 후 따른다 — **앱에서 임의 결정 금지**. CORS/프록시·iOS Safari는 Inc 0 실측 가설.

- **Increment 0 — PWA 셸 + 데이터 레이어**: Vite+PWA 셸, Cloudflare 무캐시 프록시, domain(타입/포트/신선도/상태머신) 골격, query-cache(신선도-네이티브), IndexedDB 캐시, Store Context 영속+D082 geolocation 포트, mock 어댑터, SW 카탈로그 서브셋 백그라운드(D061 매핑), DataOwnerPolicy 심+placeholder, 성능/a11y 골격, GlassSurface 뼈대.
- **Increment 1 — Flow 1 Availability Check**: 첫 수직 슬라이스. 6상태 UI+최종 카피, 실 newIntSelStr 매핑, 3진입(타이핑/바코드/최근), fallback-first→AI 레이어(1s), 매장 선택 시트(D082), D083 glass 마감. 익명·무로그인(Anti-goal 4).

규범 입력(정본, 필요 시 원문 확인): Bible의 Flow 1 `Experience/availability-check.md`, `Interface/availability-check.md`, `Engineering/availability-check.md`, `AI/availability-check.md`, `Engineering/data-contract.md`. **설계 스펙은 이들의 구현 매핑 — 정본은 Bible.**

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
