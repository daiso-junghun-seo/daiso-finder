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

### 열린 Bible 에스컬레이션 (앱에서 임의 결정 금지)

[`docs/notes/open-questions.md`](notes/open-questions.md) §A: A2(staleness 임계값)·A3(저재고 컷오프)·A4(다국어)·A5(직원 데드엔드 텐션)·A6(D062 범위)·A7(판매종료 범위)·A8(데이터 계약 Evidence L2 + `strCd` 요청 키 갭)·A9(매장 검색 소스)·**A10(노후 캐시 부정-관측 카피 — F3 임시 폴백 `noCache`)**. 전부 data-owner/Bible 결정 대기, 심 뒤 격리로 코어 비블로킹.

## 다음 작업 (여기서 재개)

1. **페이즈 게이트 결정** — Phase 6가 로드맵 마지막. 다음은 owner 판단: 잔여 Increment-1 스코프 착수 여부/순서, 또는 실 데이터 배선(A9) 선행.
2. **실 데이터 배선(A9)** 착수 시: Bible 세션에서 매장 검색 data-contract 확정(§A9 후보 증거 = k-skill `daiso-product-search` 관측) → 앱이 소비. **앱에서 임의 결정 금지.**
3. **Bible 에스컬레이션 소비**: A2·A3·A10 등이 Bible에서 결정되면 심/게이트를 그 정책으로 교체.

## 저장소 경계 (중요)

- 제품 요구는 **Product Bible이 SSOT**(read-only). 여기서 재서술 금지 — 링크/인용.
- 스펙 갭 발견 시 앱에서 임의 결정 금지 → **Bible에 결정/RFC로 에스컬레이션**한 뒤 따른다. 앱-레벨 결정만 이 저장소 자체 기록(open-questions §B, Bible D-번호 미소비).
- 재고·거래 **읽기 전용** — 변형 금지(INDEX §7). Bible 세션과 이 세션을 섞지 않는다(교차는 읽기로만).

## 규범 입력 (정본, 필요 시 원문 확인)

- 실행 원장: [`.superpowers/sdd/progress.md`](../.superpowers/sdd/progress.md) — 페이즈별 커밋·리뷰·결정 이력.
- 설계 스펙(앱-레벨): [`docs/superpowers/specs/2026-07-13-increment-0-1-design.md`](superpowers/specs/2026-07-13-increment-0-1-design.md) — 정본은 여전히 Bible.
- Bible Flow 1: `../product-bible/06_Product/daiso-companion/{Experience,Interface,Engineering,AI}/availability-check.md`, `Engineering/data-contract.md`.
