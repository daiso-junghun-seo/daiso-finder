# HANDOFF — DAISO Finder

> 이 저장소에서 새 세션을 시작하면 **여기부터** 읽는다. 실행 원장(정본)은 [`.superpowers/sdd/progress.md`](../.superpowers/sdd/progress.md).

## 현재 상태 (2026-07-21)

**Increment 0(PWA 셸 + 신선도-네이티브 데이터 레이어) 완료. Increment 1 Flow 1(Availability Check) 코어 구축 완료 — 6상태 UI·Bible-ver바팀 카피·D082 매장 선택·D083 glass·타이핑 검색(mock 데이터)·재시도.** 7-페이즈 로드맵(Phase 0~6) 전체 완료, 전체-브랜치 최종 리뷰 + 픽스 패스(F1–F7) 통과 후 **`feat/increment-0-shell` → `main` 로컬 `--no-ff` 머지 완료**(머지 커밋 `c318e8a`). main은 이 머지 전까지 docs-only 관례였다.

**게이트(머지 시점)**: vitest **191/191**(25 파일), tsc clean, biome clean, Playwright **14/14**.

### 구축된 것 (main)

- **툴체인·PWA 셸**: Vite + React 18 + TypeScript(strict, `noUncheckedIndexedAccess`), vite-plugin-pwa(Workbox, `autoUpdate`), Biome, Playwright.
- **Domain 코어**(`src/domain/`): 답 union(6종)·`StoreEvent`/`UiState`·상태머신 reducer·신선도 분류(D061, live 미강등)·가드·`DataOwnerPolicy` 심.
- **데이터 레이어**(`src/infra/`): 신선도-네이티브 `createQueryRunner`(2s 예산 = repo.query vs 거부 타이머 `Promise.race`, cache-on-failure 분류, 캐시 I/O best-effort), IndexedDB 캐시, Store Context 영속.
- **어댑터**(`src/adapters/`): mock repository/fixtures(9 시나리오), 실 `newIntSelStr` 어댑터(mapResponse + positional-zip, **미배선**), mock store directory(B16 심), browser geolocation 심.
- **UI**(`src/ui/`): `AvailabilitySurface`(타이핑 검색·재시도·매장 선택 시트 배선), `AnswerCard`(5개 non-default 상태 렌더), Bible-ver바팀 `copy.ts`, `format.ts`(B12 상대시간), D083 `GlassSurface` + tokens/glass CSS(대비 ≥4.5:1 기계 검증 `contrast.test.ts`), a11y `LiveRegion`, D082 `StoreSelectionSheet`(모달 시맨틱·포커스·inert).
- **엣지**(`functions/api/stock.ts`): Cloudflare 무캐시 pass-through 프록시(B10/B11 가설).
- **E2E**: 6상태 스윕 + 인터랙티브 플로우(Playwright 14).

### 아직 없는 것 (Increment 1 잔여 — owner 입력/결정 대기)

로드맵 Phase가 아니라 **데이터 오너 자료·결정 대기** 항목:

- **실 데이터 배선(A9/B16)**: 타이핑 쿼리의 실 `newIntSelStr` 배선 + 매장 검색/근처 매장 실 어댑터. 현재 mock 심 뒤. 매장 검색 API가 data-contract에 미관측(§A9) — Bible 세션에서 data-contract 반영 후 소비.
- **바코드 스캔 진입** · **최근 검색 진입** · **AI 검색어 해석 레이어**(fallback-first 1s) · **SLOW 단계적 로딩**.
- **재입고 구독**(로그인 게이트) · **다국어 입력 별칭**(A4).
- **PWA 설치 아이콘/자산**(§B19) — 배포 전 필수.

### 거버넌스 조정 (2026-07-21) — 데이터 계약·구현은 앱이 소유

`CLAUDE.md §1/§3` 조정: **제품 철학**(안티골·플로우·6상태 의미·UX 카피 규칙·정직성)만 Bible SSOT. **벤더 데이터 계약·구현·매핑**(daisomall 엔드포인트·스키마·프록시·어댑터·정책값)은 **이 저장소가 소유**하고 자체 기록에 남긴다(Bible 미수정). 라우팅 기준 = "철학이 바뀌는가?". → **실 데이터 배선은 Bible 왕복 없이 이 프로젝트에서 완성한다.**

### 실 데이터 소스 — 리버스 엔지니어링 완료 (도시어가 정본)

[`docs/notes/store-api-observations.md`](notes/store-api-observations.md): Flow 1 실 API를 `fapi.daisomall.co.kr` 분리 엔드포인트로 전부 매핑 — 매장 `selStr`(3-모드) · 재고+상태+입고예정 `selStrPkupStck` · 위치 `selIntPdStDispInfo` · 상품명/가격 `SearchGoods` · 인증 `auth/request`(익명 JWT+AES+uid). 6상태 입력 전부 실 응답 확보. 조합·직영/가맹 규칙 확인.

### 남은 미해결 (data-owner 확인 또는 앱 결정)

- **data-owner 경험적**: `sleStsCd` 코드 열거(매장 `1`/`9`/`null` vs 카탈로그 `02`/`03`), `stck` 종류 — 심 뒤 격리하며 진행.
- **철학(→ Bible)**: A5(직원 데드엔드 텐션)·A10(노후 부정-관측 **카피**)·A4(다국어 범위) 등 UX/제품 결정.
- **앱 소유**: A2(staleness 임계값)·A3(저재고 컷오프) 정책값, A8/A9 데이터 계약, franchiseUndeterminable 판정 정제("가맹 AND 위치없음"), 지하층(`stairNo:-1`) formatter, km→m.

## 다음 작업 (여기서 재개) — 라이브 스모크 + 잔여 후속 (Flow 1 live-data 구현·머지 완료 2026-07-22)

**Flow 1 live-data 배선 구현 완료, `feat/flow1-live-data` → `main` 머지 완료(2026-07-22, 3-세션 TDD 분할: Session 1 서버 프록시 · Session 2 클라 어댑터+포맷 · Session 3 컷오버).** 스펙 정본 = [`docs/superpowers/specs/2026-07-22-flow1-live-data-design.md`](superpowers/specs/2026-07-22-flow1-live-data-design.md), 구현 플랜(전 태스크 체크 완료) = [`docs/superpowers/plans/2026-07-22-flow1-live-data.md`](superpowers/plans/2026-07-22-flow1-live-data.md). 앱 소유 결정 기록 = `docs/notes/open-questions.md` §B21–B27.

**다음 작업(우선순위 순):**

1. **라이브 스모크**(최우선, 배포 전 필수) — 실 `.dev.vars`(`PRE_AUTH_ENC_KEY`/`UPSTREAM_BASE`/`SEARCH_BASE`, `.dev.vars.example` 참고)로 `wrangler pages dev` 실행 → **B27 호스트 정합**(fapi=auth/selStr/stck/disp, www=SearchGoods) 확인. 헤르메틱 테스트는 라이브 daisomall을 호출하지 않으므로 이 확인은 수동으로만 가능.
2. **미해결 data-owner 항목**(§B21–B27 미해결 목록, 심 뒤 격리 유지하며 순차 해소): `sleStsCd` 매장 코드 전체 열거, `stck` 종류(진열 vs 픽업예약), `selStrPkupStck` 빈 `data[]` 의미, `selStr` 상세 응답 래핑, 매장검색 좌표 optional 가정.
3. **범위 밖 패스**(design 승인 시 제외): GPS-근처 매장 실 배선(현재 `kmToMeters` 유틸만 존재), AI 검색어 해석 레이어, 바코드 스캔 진입.
4. **배포 전 항목**: `/api/*` 오픈 릴레이 보안(origin allowlist + rate-limit, §B 후속), PWA 설치 아이콘/자산(§B19, 미구현).

**불변 원칙**: UI/도메인/reducer/query-runner/캐시 불변(헥사고날 심 교체만). 무-날조·정직 분리·신선도(D061)·읽기전용 준수. 키·토큰은 서버에만(커밋/클라 노출 금지).

## 저장소 경계 (중요)

- **제품 철학**은 Product Bible이 SSOT(read-only) — 재서술 금지, 링크/인용. **벤더 데이터 계약·구현은 앱 소유**(도시어 + open-questions §B).
- 철학이 바뀌는 갭만 Bible로 에스컬레이션. 데이터·구현·매핑은 앱이 근거 기록하고 결정(§3 라우팅).
- 재고·거래 **읽기 전용** — 변형 금지(INDEX §7).

## 규범 입력 (정본, 필요 시 원문 확인)

- 실행 원장: [`.superpowers/sdd/progress.md`](../.superpowers/sdd/progress.md) — 페이즈별 커밋·리뷰·결정 이력.
- 설계 스펙(앱-레벨): [`docs/superpowers/specs/2026-07-13-increment-0-1-design.md`](superpowers/specs/2026-07-13-increment-0-1-design.md) — 정본은 여전히 Bible.
- Bible Flow 1: `../product-bible/06_Product/daiso-companion/{Experience,Interface,Engineering,AI}/availability-check.md`, `Engineering/data-contract.md`.
