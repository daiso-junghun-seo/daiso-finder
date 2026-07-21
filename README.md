# DAISO Finder

매장 안에서 자기 폰을 든 쇼퍼가 **"이 상품이 이 매장에 지금 있나 · 어디 있나 · 없으면 뭘 하나"**를 60초 안에 확인하도록 돕는 **Production PWA (React + TypeScript)**.

Product Bible이 정의한 **참조 제품(reference product)**의 구현체입니다. 제품 요구·플로우·안티골·데이터 계약의 정본은 [Product Bible](../product-bible)(read-only 권위)에 있습니다 — 이 저장소는 그것을 구현합니다.

## 코어 플로우 (Bible 정의)

1. **Availability Check** — 이 상품이 이 매장에 지금 있나, 얼마인가.
2. **In-Store Navigation** — 있다면 몇 층 · 어느 구역인가(사이니지 기반 안내).
3. **Alternative Discovery** — 없다면 유사 상품 / 근처 매장이라는 경계 있는 플랜 B. 막다른 길 없음.

## 상태

**Increment 0(PWA 셸 + 신선도-네이티브 데이터 레이어) 완료 · Increment 1 Flow 1(Availability Check) 코어 구축 완료.** 6상태 UI·Bible-ver바팀 카피·D082 매장 선택·D083 glass·타이핑 검색(현재 mock 데이터)·재시도가 `main`에 있습니다(로드맵 Phase 0~6 완료 + 최종 리뷰 통과 후 머지). 실 데이터 배선(A9)·바코드·최근 검색·AI 해석 레이어·재입고 구독·다국어는 데이터 오너 자료/결정 대기로 잔여.

게이트: vitest 191 · tsc · biome · Playwright 14, 전부 green.

- 거버넌스·권위: [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md)
- 현재 상태·다음 작업: [`docs/HANDOFF.md`](docs/HANDOFF.md) · 실행 원장: [`.superpowers/sdd/progress.md`](.superpowers/sdd/progress.md)
- 미해결 항목: [`docs/notes/open-questions.md`](docs/notes/open-questions.md) — (A) Bible 에스컬레이션 · (B) 앱-레벨 결정 · (C) 출시-후 가설
- 킥오프 스펙: `../product-bible/docs/superpowers/specs/2026-07-13-daiso-finder-kickoff-and-workspace-design.md`

## 스택

- PWA (React + TypeScript), 서비스워커 오프라인 캐시
- iOS + Android 쇼퍼 폰. 매장 컨텍스트는 **사용자 소유** — 마지막 선택 매장 기본, GPS는 근처 매장 추천만(자동 확정·검색 차단 없음), 매장명·지역명 검색으로 선택/변경 (Bible D082)
- 재고·거래 **읽기 전용** — 변형하지 않음
