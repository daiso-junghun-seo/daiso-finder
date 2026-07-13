# AGENTS.md — DAISO Finder

에이전트 진입점. 이 저장소에서 작업하기 전에 먼저 읽는다.

## 이 저장소는 무엇인가

**DAISO Finder** — 매장 내 쇼퍼용 Production PWA(React + TypeScript). Product Bible이 정의한 **참조 제품(reference product)**의 구현체.

## 권위

- **Product Bible(`../product-bible`)이 SSOT이며 read-only.** 제품 요구·플로우·안티골·데이터 계약은 거기서만 온다. 여기서 재서술하지 말고 링크/인용한다.
- 상세 규칙: `CLAUDE.md`.

## 작업 유형별 최소 컨텍스트

- **플로우 구현**: `../product-bible/06_Product/daiso-companion/`의 해당 플로우 Experience → Interface → Engineering (→ AI가 있으면). + `Engineering/data-contract.md`.
- **데이터 계층**: `Engineering/data-contract.md`(관측 계약, Evidence Level 2) + 해당 플로우 Engineering 계약.
- **화면 상태·카피**: 해당 Interface 문서(상태 6종·목업) + `../product-bible/06_Product/shared/`(UX 라이팅).

## 질문 정책

Canon에 답 있으면 따른다. 없거나 모순이면 **중단·질문**. 스펙 갭은 앱에서 메우지 말고 **Bible에 결정/RFC로 에스컬레이션**한 뒤 따른다.

## 구현 순서 (Increment)

0. PWA 골격 + 데이터 계층(어댑터 심 + mock)
1. Flow 1 Availability Check (체인 완결 — 지금 가능)
2. Flow 2 In-Store Navigation (D077 비준 후)
3. Flow 3 Alternative Discovery (D076 비준 후)

현재 상태·다음 작업: `docs/HANDOFF.md`.
