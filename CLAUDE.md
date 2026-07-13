# CLAUDE.md — DAISO Finder

이 저장소는 **DAISO Finder** 구현 저장소입니다. 매장 안에서 자기 폰을 든 쇼퍼가 "이 상품이 이 매장에 지금 있나 / 어디 있나 / 없으면 뭘 하나"를 60초 안에 확인하도록 돕는 **Production PWA (React + TypeScript)**.

> 상위 `c:\Dev\CLAUDE.md`(리테일 시니어 아키텍트 규칙, 한국어 답변, Windows 11, Linux 예시 금지)를 상속합니다. 아래는 이 저장소 고유 규칙입니다.

---

## 1. 권위 — Product Bible이 SSOT

제품 요구·플로우·안티골·UX 카피 규칙·데이터 계약의 **단일 정본(SSOT)은 Product Bible**(`../product-bible`)이며 **read-only**입니다. 이 저장소는 Bible을 **구현**할 뿐, Bible을 수정하지 않습니다.

권위 순서(Bible): `../product-bible/PROJECT_BOOTSTRAP.md` > `../product-bible/00_Foundation/` > 챕터(01~06) > 07·08 프로세스 > 09 참조.

작업 전 반드시 읽을 규범 문서(최소 컨텍스트 셋):

- `../product-bible/06_Product/daiso-companion/INDEX.md` — 제품 개요·안티골·문서 맵
- `../product-bible/06_Product/daiso-companion/Experience/` — 세 코어 플로우 경험 설계
- `../product-bible/06_Product/daiso-companion/Interface/` — 인터페이스 설계(상태·목업)
- `../product-bible/06_Product/daiso-companion/Engineering/data-contract.md` — 관측된 store/stock 데이터 계약(Evidence Level 2)
- `../product-bible/06_Product/daiso-companion/Engineering/` — 플로우별 엔지니어링 요구 계약
- `../product-bible/06_Product/daiso-companion/AI/availability-check.md` — Flow 1 AI 기능 계약
- `../product-bible/AGENTS.md` — Bible 에이전트 진입점·질문 정책

## 2. 질문 정책 (Bible 상속)

- Canon에 답이 있으면 **질문하지 말고 Canon을 따른다.**
- Canon에 없거나 문서 간 모순이면 **중단하고 사용자에게 질문한다.**
- 추측·가정 기반 구현 금지. 스펙 갭을 앱에서 임의로 메우지 않는다.

## 3. 갭 피드백 루프

구현 중 스펙 갭·모순·상위 문서가 침묵한 엔지니어링 질문을 발견하면:

1. 앱 저장소에서 임의 결정으로 진행하지 않는다.
2. Bible에 결정/RFC로 되돌린다(Upward Escalation / Solo Mode, `../product-bible/08_Operations/`).
3. Bible이 결정을 기록한 뒤 앱이 그 결정을 따른다.

앱 수준 결정(스택·빌드도구·모듈 구조·라이브러리)은 이 저장소 자체 결정 기록에 남긴다 — Bible D번호를 소비하지 않는다.

## 4. 스택 & 경계

- **클라이언트**: PWA — React + TypeScript. iOS+Android 쇼퍼 폰 전제. 서비스워커 오프라인 캐시.
- **데이터**: 관측 코어 API `POST mapi.daisomall.co.kr/ms/msg/newIntSelStr` 기준. 미해결 데이터 오너 항목(판매종료 범위·hldyDt·재입고 구독·결손 행·다국어 별칭 등)은 **어댑터 심(seam)** 뒤에 격리.
- **읽기 전용**: 재고·거래를 **변형하지 않는다**(INDEX §7 경계). 결제·체크아웃·재고 변경은 POS 계열의 몫.
- **신선도**: 스탬프 = "우리 관측의 나이"(D061). 캐시 나이가 임계값을 넘을 때만 노후(stale) 프레이밍. 라이브 답은 강등하지 않는다.

## 5. 언어

- **답변**: 한국어.
- **코드·식별자·커밋 메시지**: English.
- **UX 카피**: 한국어. 다국어 규칙(D068/D069) — 매장에서 **매칭해야 하는 토큰**(상품명·층·구역)은 세계가 렌더하는 대로(한국어·숫자) 유지, **이해용**만 사용자 언어로. 번역으로 매칭 토큰을 대체하지 않는다.

## 6. 개발 환경

- Windows 11 / PowerShell. Linux 경로·명령 예시 금지(상위 상속).
- 커밋 전 검증(앱 자체 lint/test)은 Increment 0 설계에서 정의한다.

---

*이 저장소는 Product Bible의 참조 제품(reference product) 구현이다. 킥오프 스펙: `../product-bible/docs/superpowers/specs/2026-07-13-daiso-finder-kickoff-and-workspace-design.md`.*
