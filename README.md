# DAISO Finder

매장 안에서 자기 폰을 든 쇼퍼가 **"이 상품이 이 매장에 지금 있나 · 어디 있나 · 없으면 뭘 하나"**를 60초 안에 확인하도록 돕는 **Production PWA (React + TypeScript)**.

Product Bible이 정의한 **참조 제품(reference product)**의 구현체입니다. 제품 요구·플로우·안티골·데이터 계약의 정본은 [Product Bible](../product-bible)(read-only 권위)에 있습니다 — 이 저장소는 그것을 구현합니다.

## 코어 플로우 (Bible 정의)

1. **Availability Check** — 이 상품이 이 매장에 지금 있나, 얼마인가.
2. **In-Store Navigation** — 있다면 몇 층 · 어느 구역인가(사이니지 기반 안내).
3. **Alternative Discovery** — 없다면 유사 상품 / 근처 매장이라는 경계 있는 플랜 B. 막다른 길 없음.

## 상태

**킥오프 — 거버넌스 골격만 준비됨.** 구현 코드 없음. 첫 구현 작업은 Increment 0(PWA 골격 + 데이터 계층)이며, 상세 설계부터 시작합니다.

- 거버넌스·권위: [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md)
- 현재 상태·다음 작업: [`docs/HANDOFF.md`](docs/HANDOFF.md)
- 킥오프 스펙: `../product-bible/docs/superpowers/specs/2026-07-13-daiso-finder-kickoff-and-workspace-design.md`

## 스택

- PWA (React + TypeScript), 서비스워커 오프라인 캐시
- iOS + Android 쇼퍼 폰, 매장 QR 진입 전제
- 재고·거래 **읽기 전용** — 변형하지 않음
