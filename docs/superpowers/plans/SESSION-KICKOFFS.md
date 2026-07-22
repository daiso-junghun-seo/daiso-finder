# Flow 1 Live-Data — Session Kickoffs (새 세션 진입점)

> **목적**: 실 데이터 배선을 새 세션에서 이어받기 위한 **붙여넣기용 킥오프 프롬프트** 모음.
> 새 세션을 열면 **이 파일만 열어** 해당 세션 블록을 복사해 붙여넣으면 된다.
>
> - 브랜치: `feat/flow1-live-data` (main 분기, 이미 생성됨)
> - 구현 플랜(정본, 실 코드·태스크 분해): [`2026-07-22-flow1-live-data.md`](2026-07-22-flow1-live-data.md)
> - 설계 스펙(앱-레벨 SSOT): [`../specs/2026-07-22-flow1-live-data-design.md`](../specs/2026-07-22-flow1-live-data-design.md)
> - 진행 원장: [`../../../.superpowers/sdd/progress.md`](../../../.superpowers/sdd/progress.md) · 핸드오프: [`../../HANDOFF.md`](../../HANDOFF.md)

## 왜 3개 세션인가

플랜을 한 세션에서 다 실행하면 응답 스톨/컨텍스트 한계 위험이 있어, **세션 간 파일 의존성이 걸치지 않도록** 3개로 나눴다.
각 세션은 **green 게이트 + 커밋**으로 끝나고, 매 경계에서 앱과 기존 테스트가 그대로 통과한다.

| 세션 | 범위 | 산출물 | 게이트 시 앱 상태 |
|---|---|---|---|
| **S1** 서버 프록시 | `functions/**`만 (Tasks 1–4 + setup) | `daisoUpstream`·`daisoAuth`·`/api/availability`·`/api/stores` | src/ 무변경 → 완전 동일 |
| **S2** 클라 어댑터+포맷 | `src/adapters/daisomall/**` + `format.ts` (Tasks 5–9) | 어댑터·매핑(parity oracle)·포맷 유틸 | 미배선 → mock 유지 → green |
| **S3** 컷오버 | 제거+컴포지션+배선+E2E+게이트+문서+머지 (Tasks 10–14) | 실 파이프라인 배선 + main 머지 | 실 어댑터 배선 완료 |

## 공통 규칙 (모든 세션)

- **재개 지점**: 이 문서 → 플랜 → **첫 미체크 `- [ ]`** 에서 이어간다. 완료한 박스는 플랜에서 체크한다.
- **실행 스킬**: `superpowers:subagent-driven-development`(권장 — 태스크당 서브에이전트 + 리뷰, 스톨에 강함) 또는 `superpowers:executing-plans`.
- **커밋 전 게이트(B8)**: `npm run test` · `npm run typecheck` · `npm run lint` · `npm run e2e` 전부 green. 유닛별 red→green.
- **헤르메틱**: 모든 자동 테스트는 fetch/proxy 경계를 mock(녹화 픽스처). **라이브 daisomall 호출 금지.**
- **보안**: 인증 키(`PRE_AUTH_ENC_KEY`)·JWT·`x-dm-uid`·Bearer는 **서버(functions)에만**, env 주입. 하드코딩·커밋·로그·클라 번들 노출 금지. WebCrypto만.
- **불변**: UI/도메인/reducer/query-runner/캐시 로직 불변(헥사고날 심 교체만). 무-날조·정직한 분리·신선도(D061)·읽기전용 준수.
- **거버넌스**: 데이터 계약·구현·매핑 결정은 **앱 소유** → `docs/notes/open-questions.md §B` 기록. **철학이 바뀔 때만** Bible 에스컬레이션.

---

## 🟩 SESSION 1 — 서버 프록시 (Tasks 1–4)

```text
daiso-finder Flow 1 실 데이터 배선 — SESSION 1/3 실행.

브랜치 feat/flow1-live-data 를 체크아웃(이미 존재, main 분기)한 뒤,
플랜 docs/superpowers/plans/2026-07-22-flow1-live-data.md 의 "SESSION 1 — Server proxy layer"
(setup S1 + Tasks 1–4)만 실행한다. superpowers:executing-plans 스킬로 플랜의 첫 미체크 `- [ ]`부터
TDD(유닛별 red→green→commit)로 진행하고, 완료한 박스는 플랜에서 체크한다.

범위/불변:
- 이 세션은 functions/** 만 생성한다. src/ 는 절대 건드리지 않는다(git diff --stat main -- src/ 는 비어야 함).
- 헤르메틱: 모든 테스트는 fetch/proxy 경계를 mock. 라이브 daisomall 호출 금지.
- 보안: 인증 키/JWT/uid/Bearer 는 서버(functions)에만. env(PRE_AUTH_ENC_KEY) 주입, 하드코딩·커밋·로그 금지.
  WebCrypto(crypto.subtle)만 사용.
- 각 태스크 커밋 전 필요한 만큼 npm run test/typecheck 로 확인.

끝: "SESSION 1 EXIT GATE"(npm run test · typecheck · lint · e2e 전부 green, src/ 무변경 확인)를 통과시키고
멈춘다. 다음은 SESSION 2.
```

---

## 🟦 SESSION 2 — 클라 어댑터 + 포맷 (Tasks 5–9)

```text
daiso-finder Flow 1 실 데이터 배선 — SESSION 2/3 실행.

브랜치 feat/flow1-live-data 에서, 플랜 docs/superpowers/plans/2026-07-22-flow1-live-data.md 의
"SESSION 2 — Client adapters + format"(Tasks 5–9)만 실행한다. superpowers:executing-plans 로 플랜의
첫 미체크 `- [ ]`부터 TDD 진행, 완료 박스는 체크. (SESSION 1이 커밋되어 있어야 함.)

범위/불변:
- src/adapters/daisomall/** 신규 + src/ui/format.ts 소폭 수정만. 아직 배선하지 않는다(컴포지션은 SESSION 3).
  → mock 유지 → 앱/E2E 는 그대로 green.
- UI/도메인/reducer/query-runner/캐시 로직 불변(헥사고날 심 교체만).
- Task 7 mapStoreObservation 의 9-시나리오 parity oracle 이 mockAnswers 와 정확히 일치해야 한다(무-날조·정직 분리).
- 헤르메틱: fetchImpl 스텁 + 녹화 픽스처.

끝: "SESSION 2 EXIT GATE"(test·typecheck·lint·e2e green, 어댑터 미배선 확인:
git diff --stat main -- src/ui/AvailabilitySurface.tsx 비어야 함)를 통과시키고 멈춘다. 다음은 SESSION 3.
```

---

## 🟥 SESSION 3 — 컷오버 + 머지 (Tasks 10–14)

```text
daiso-finder Flow 1 실 데이터 배선 — SESSION 3/3 실행(마지막).

브랜치 feat/flow1-live-data 에서, 플랜 docs/superpowers/plans/2026-07-22-flow1-live-data.md 의
"SESSION 3 — Cutover"(Tasks 10–14)를 실행한다. superpowers:executing-plans 로 첫 미체크 `- [ ]`부터
진행, 완료 박스 체크. (SESSION 1·2 커밋되어 있어야 함.)

수행:
- Task 10 구식 제거(newIntSelStr/* + functions/api/stock.ts) — parity 는 이미 mapStoreObservation.test.ts 에 있음.
- Task 11 컴포지션 루트 + AvailabilitySurface 배선(어댑터 스위치 4줄, UI 로직 불변).
- Task 12 route-intercept preview E2E(prod 빌드=실 어댑터 + page.route).
- Task 13 전체 게이트 + 보안 grep(키/uid 가 src·dist 에 없음 확인).
- Task 14 문서(open-questions §B21–B27 · progress · HANDOFF) + superpowers:finishing-a-development-branch 로
  로컬 --no-ff 머지, 머지 후 main 에서 게이트 재실행.

불변: 무-날조·정직 분리·신선도(D061)·읽기전용 준수. 데이터/구현 결정은 앱 소유로 open-questions §B 에 기록
(철학이 바뀌지 않으면 Bible 에스컬레이션 금지).

끝: "SESSION 3 EXIT GATE(project done)" — main green + 시크릿 부재 + 문서 갱신 + 플랜 박스 전부 체크.
```

---

## 진행 체크 (여기에 표시해두면 다음 세션에서 한눈에)

- [ ] SESSION 1 완료 (서버 프록시, EXIT GATE green)
- [ ] SESSION 2 완료 (클라 어댑터+포맷, EXIT GATE green)
- [ ] SESSION 3 완료 (컷오버 + main 머지)
