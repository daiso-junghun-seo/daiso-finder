# ROADMAP — DAISO Finder

> 제품 계약의 SSOT는 [`product-bible/06_Product/daiso-companion`](../../product-bible/06_Product/daiso-companion)다. 이 문서는 **앱 저장소의 실행 계획**만 담는다 — 새 제품 스펙을 발명하지 않는다. 결정 원장은 [`notes/open-questions.md`](notes/open-questions.md).

## 현재 위치 (2026-11-08)

- Increment 0 + Flow 1 + §B47 쇼핑리스트까지 `main`에 완료, 공개 원격(`daiso-junghun-seo/daiso-finder`)에 push됨.
- 게이트: vitest **743/743**, tsc clean, biome clean(140), Playwright **36/36**, build 성공(211.30 kB / gzip 68.50 kB).
- Flow 2·3는 **D078(2026-07-13)로 계약 비준 완료** — 구현을 막는 것은 코드가 아니라 아래 "결정 필요" 항목이다.
- 남은 가장 큰 위험은 기능이 아니라 **배포·필드 검증의 부재**다.

## 원칙

1. **기능보다 안전망 먼저.** 원격/CI 없이 Flow 2·3를 얹지 않는다.
2. **표면 분해 후 플로우 추가.** `AvailabilitySurface` 821줄에 두 플로우를 더하지 않는다.
3. **비준된 계약만 만든다.** 열린 경험 질문은 Bible로 올리고, 앱에서 메우지 않는다. §B47은 동결.

## 단계

| 단계 | 기간(집중) | 내용 | 종료 조건 | 상태 |
|---|---|---|---|---|
| **P0 안전망** | 1–2일 | 공개 원격, CI(tsc·biome·vitest·build·Playwright), fresh-clone drill, `main` 보호 | 다른 디렉터리 클론에서 전 게이트 green, CI `main` green | 완료 (2026-11-08) |
| **P1 구조 정리** | 3–5일 | `AvailabilitySurface` 분해, `AGENTS.md` D078 정정, coverage 기준선, axe E2E, PWA precache 결정(§B31-7) | 동작 불변, 파일 ≤300줄, 번들 +5% 이내 | 대기 |
| **P2 Flow 2** | 5–7일 | D077: data-in-hand 렌더, refresh 트리거(진입·resume·pull·`못 찾겠어요` 1회), 비블로킹, stale→Partial, stock-gone exit | tap→card <100ms(fetch 0회), 주기 타이머 없음 테스트, 6상태 E2E | 대기 |
| **P3 Flow 3** | 7–10일 | D076: similar 분기 + entry matrix + 3행 바운드 + 단일 스탬프 + 통짜 캐시. nearby는 mock/포트까지 | no-dead-end E2E, mall은 Empty에서만, nearby는 데이터 확정 시 | 대기 |
| **P4 배포·필드** | 2–3일 + 현장 | gpu01 Node 프록시, HTTPS, health/logs, 필드 체크리스트 | 실제 매장 1곳 이상 end-to-end | 대기 |

### P0 체크리스트

- [x] 공개 원격 생성·전환(`daiso-junghun-seo/daiso-finder`) — 무료 플랜에서 보호 기능을 쓰기 위해 공개로 전환(2026-11-08). 비밀키 흔적 없음, `.dev.vars`·터널 스크립트는 미추적.
- [x] CI 워크플로(`.github/workflows/ci.yml`)
- [x] Node 버전 고정(`.nvmrc`)
- [x] 첫 `main` push에서 CI green (run [42485492011](https://github.com/daiso-junghun-seo/daiso-finder/actions/runs/42485492011), 1m52s)
- [x] 빈 디렉터리 fresh clone에서 전 게이트 재현 (typecheck·lint·743 테스트·build·36 e2e green)
- [x] `main` 보호: force-push·삭제 금지, PR에는 `gates` 필수 (직접 push는 허용, `enforce_admins: false`)

### P1 체크리스트

- [ ] `AvailabilitySurface`에서 쿼리/카트/모달 컨트롤러 추출 (동작 변경 0)
- [ ] 렌더 분기를 플로우별 컴포넌트로 분리 (파일 ≤300줄)
- [ ] `AGENTS.md`의 Flow 2/3 "비준 후" → "D078로 비준 완료" 정정
- [ ] `@vitest/coverage-v8` 기준선 측정 후 계층 임계값 고정 (내리지 않음)
- [ ] axe-core를 6상태 × 라이트/다크 E2E에 추가
- [ ] PWA precache 범위 결정(§B31-7)과 근거 기록

### P2·P3 체크리스트

- [ ] D077 계약 조항을 테스트 이름으로 1:1 매핑
- [ ] refresh 트리거 4종 + "주기 타이머 없음" 가드
- [ ] stock-gone exit가 실제 관측 상태를 Flow 3 entry matrix로 넘김
- [ ] D076 entry matrix(franchise=nearby only, discontinued=similar only) 테스트
- [ ] similar 3행 바운드·단일 스탬프·통짜 캐시·슬롯 재시도
- [ ] mall last resort는 Empty ladder에서만 (엔지니어링 보장 + 테스트)

## 결정 필요 (코드 아님)

| # | 결정 | 막는 것 | 다음 행동 |
|---|---|---|---|
| D1 | 원격 공개 범위·호스트 | — | **완료: 공개 GitHub (2026-11-08 전환, `main` 보호 적용)** |
| D2 | 배포 도메인·포트(gpu01) | P4 | 호스트/프록시 문서 §1–7 실행 |
| D3 | 매장 좌표·매장 스코프 데이터(A8/A9) | Flow 3 nearby, 매장 디렉터리 실데이터 | data-owner 확인 → data-contract 갱신 |
| D4 | Flow 2 열린 경험 질문 2개(도보 중 위치 이동, 품절 외 부정 상태 변화) | P2 엣지 | Bible 에스컬레이션 |
| D5 | nearby 데이터 부재 시 Flow 2 exit의 임시 형태 | P2/P3 릴리스 순서 | Bible 결정 |
| D6 | PWA precache 범위(§B31-7) | P1 | 측정 후 결정 |
| D7 | 툴체인 업그레이드 시점(vite 5→8, vitest 3→5) | 의존성 정리 | CI green 후 별도 브랜치 |

## 지표

- **게이트**: 전 단계 100% green, skip 0.
- **커버리지**: 기준선 측정 후 계층 임계값을 정하고 **내리지 않는다** (권장 시작점: domain 90% / adapters 80% / ui 70%).
- **성능**: Flow 2 tap→card <100ms, Flow 1 submit→first result ≤2s, 엔트리 ≤220 kB(gzip ≤72 kB).
- **접근성**: axe serious/critical 0 (6상태 × 2테마).
- **운영**: CI <10분, flake <2%, 배포 후 health/logs 확인.

## 하지 말 것

- §B47 쇼핑리스트 기능 확장 (동결)
- Flow 3에 AI·추천 추가 (D076 금지)
- CSS 전면 재작성 (측정·가드로 충분)
- `npm audit fix --force` 일괄 (단계별 브랜치)
- 100% 커버리지 집착 (임계값 유지가 목표)
