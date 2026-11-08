# DAISO Finder

매장 안에서 자기 폰을 든 쇼퍼가 **"이 상품이 이 매장에 지금 있나 · 어디 있나 · 없으면 뭘 하나"**를 60초 안에 확인하도록 돕는 **Production PWA (React + TypeScript)**.

Product Bible이 정의한 **참조 제품(reference product)**의 구현체입니다. 제품 요구·플로우·안티골·데이터 계약의 정본은 [Product Bible](../product-bible)(read-only 권위)에 있습니다 — 이 저장소는 그것을 구현합니다.

## 코어 플로우 (Bible 정의)

1. **Availability Check** — 이 상품이 이 매장에 지금 있나, 얼마인가.
2. **In-Store Navigation** — 있다면 몇 층 · 어느 구역인가(사이니지 기반 안내).
3. **Alternative Discovery** — 없다면 유사 상품 / 근처 매장이라는 경계 있는 플랜 B. 막다른 길 없음.

## 상태

**Increment 0(PWA 셸 + 데이터 레이어) · Increment 1 Flow 1(Availability Check) · §B47 쇼핑리스트(최근 본·장바구니·공유) 완료.** 실 daisomall 어댑터·바코드 스캔(DataMatrix)·최근 검색·D082 매장 선택·D083 glass·6상태 UI·한/영 카피가 `main`에 머지되어 있습니다. 로컬에서는 `npm run dev:live`로 실 데이터 전체 플로우가 동작합니다.

게이트(2026-11-08, `main` 실측): **vitest 743/743 · tsc clean · biome clean(140 files) · Playwright 36/36 · build 성공**(엔트리 211.30 kB / gzip 68.50 kB, precache 21 entries / 346.28 KiB).

**미완 — 배포 선결**: 프로덕션 런타임이 아직 배포되지 않았습니다. CF Workers는 벤더 핑거프린트 403으로 막혀 Node 프록시 경로를 씁니다(런북: [`docs/deploy/gpu01-node-proxy.md`](docs/deploy/gpu01-node-proxy.md)). 소스는 공개 저장소 [`daiso-junghun-seo/daiso-finder`](https://github.com/daiso-junghun-seo/daiso-finder)에 있고 CI·`main` 보호가 걸려 있습니다. AI 해석 레이어·재입고 구독은 데이터 오너 자료/결정 대기입니다.

- 거버넌스·권위: [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md)
- 현재 상태·다음 작업: [`docs/HANDOFF.md`](docs/HANDOFF.md) · 결정 원장: [`docs/notes/open-questions.md`](docs/notes/open-questions.md)
- 미해결 항목: [`docs/notes/open-questions.md`](docs/notes/open-questions.md) — (A) Bible 에스컬레이션 · (B) 앱-레벨 결정 · (C) 출시-후 가설
- 킥오프 스펙: `../product-bible/docs/superpowers/specs/2026-07-13-daiso-finder-kickoff-and-workspace-design.md`

## 스택

- PWA (React + TypeScript), 서비스워커 오프라인 캐시
- iOS + Android 쇼퍼 폰. 매장 컨텍스트는 **사용자 소유** — 마지막 선택 매장 기본, GPS는 근처 매장 추천만(자동 확정·검색 차단 없음), 매장명·지역명 검색으로 선택/변경 (Bible D082)
- 재고·거래 **읽기 전용** — 변형하지 않음
