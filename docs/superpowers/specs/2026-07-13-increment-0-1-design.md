# Increment 0+1 설계 스펙 — DAISO Finder

> **성격: 앱-레벨 설계 스펙(SSOT 아님).** 제품 요구·플로우·데이터 계약·UX 카피의 **정본은 Product Bible**(`../../../../product-bible`, read-only). 이 문서는 Bible의 Flow 1 계약을 **어떻게 구현할지**(아키텍처·모듈·앱-레벨 결정)만 정의하며, 제품 요구를 재서술하지 않고 **링크·인용**한다. Bible과 충돌하면 무조건 Bible이 이긴다.
>
> 작성: 2026-07-13 · 상태: Draft(사용자 리뷰 대기) · 범위: Increment 0(PWA 셸 + 데이터 레이어) + Increment 1(Flow 1 Availability Check)
>
> 파생 읽기 보조: [`docs/notes/increment-0-1-normative-brief.md`](../../notes/increment-0-1-normative-brief.md) · 미해결 추적: [`docs/notes/open-questions.md`](../../notes/open-questions.md)

---

## 0. 정본 소스 (canon, 원문 확인 완료 2026-07-13)

| 영역 | Bible 문서 | 상태 |
|---|---|---|
| Flow 1 경험 | `../../../../product-bible/06_Product/daiso-companion/Experience/availability-check.md` | Review |
| Flow 1 인터페이스(6상태·최종 카피·D083) | `../../../../product-bible/06_Product/daiso-companion/Interface/availability-check.md` | Review |
| Flow 1 엔지니어링 계약 | `../../../../product-bible/06_Product/daiso-companion/Engineering/availability-check.md` | Draft |
| 데이터 계약(관측) | `../../../../product-bible/06_Product/daiso-companion/Engineering/data-contract.md` | Draft · Evidence L2 |
| Flow 1 AI 계약 | `../../../../product-bible/06_Product/daiso-companion/AI/availability-check.md` | Draft |

권위 순서: PROJECT_BOOTSTRAP > 00_Foundation > 01–05 챕터 > 06_Product. 상태 모델: Canon만 권위, Draft/Review는 비권위(단, 엔지니어링 계약은 Review 게이트가 없어 owner 비준 후 구현 가능 — D059/D076/D077 선례). **Increment 0·1은 비준 대기 없이 착수 가능**(D078로 Inc 2·3 게이트도 해제, 순서 0→1→2→3만 유지).

---

## 1. 범위 & 방식

- **단일 설계 스펙(이 문서) + 2단계 구현 플랜**: 설계는 0+1을 일관되게 본다(데이터 레이어 모양이 Flow 1 소비에 종속되므로 분리 설계 시 반드시 뒤집힘). `writing-plans`에서 구현 플랜만 Inc 0(인프라) → Inc 1(플로우)로 가른다.
- **읽기 전용 경계**(INDEX §7): 재고·거래를 변형하지 않는다. 결제·체크아웃·재고 뮤테이션은 범위 밖.
- **익명·무로그인 첫 답**(Anti-goal 4): 답 이전 로그인/온보딩/게이트 금지. 유일 로그인 벽 = 재입고알림(답-이후 액션).
- **오프라인/약전파 = 1차 설계 대상**(Experience §6): 캐시-서브셋이 오프라인 답 경로. 모든 상태에서 빈 화면 금지.

---

## 2. 확정된 앱-레벨 결정 (open-questions §B — Bible D-번호 미소비)

| # | 결정 | 근거 |
|---|---|---|
| B1 | **빌드툴 = Vite** | SSR 불필요·오프라인 SW 우선. Cloudflare Pages 정적 배포 정합. `.gitignore` Vite/PWA 흔적. |
| B2 | **프레임워크 = React + TypeScript** | 킥오프 확정. |
| B3 | **SW/PWA = vite-plugin-pwa (Workbox)** | 매니페스트·SW 생성·앱셸 precache 자동화. 단 **카탈로그 서브셋 캐시 수명은 Workbox 기본 TTL 미사용** — 신선도 정책(D061)이 지배. |
| B4 | **라우팅 = 라우터 없음, 상태구동** | 단일 표면(Interface §2) — 바뀌는 건 화면이 아니라 위계. 매장 선택은 오버레이/시트. Inc 2·3에서 실제 뷰 전환 필요 시 라우터 도입. |
| B5 | **데이터 레이어 = 신선도-네이티브 커스텀 + UI 스토어 Zustand** | D061을 직구현(라이브답→수신시각 스탬프, 실패→캐시나이 vs 임계값 분기, 자동 리페치 없음). 신선도 정책이 곧 캐시 정책이므로 쿼리 라이브러리의 자동 재검증/TTL이 대부분 금지 → 라이브러리는 존재 이유를 꺼야 함. UI 스토어는 domain reducer를 감싸는 얇은 호스트(Zustand; Context+useReducer 무의존 대안). |
| B6 | **어댑터 심 = 단일 포트 `StoreStockRepository` + 주입 정책** | 관측 계약을 도메인 타입으로 정규화. 6심을 성격별로: 설정값=`DataOwnerPolicy`, 전략=주입 함수, 별개 연산=자신의 작은 포트. §3 "매트릭스 재작성 없이 스위치" 충족, 과추상화 회피. |
| B7 | **테스트 = Vitest + Testing Library + Playwright + TDD** | domain 유닛=Vitest, 컴포넌트=TL, E2E 6상태=Playwright. |
| B8 | **커밋 전 게이트 = ESLint/Biome + tsc + Vitest** | 회귀=버그 원칙(예산·상태 커버리지). |
| **B10** | **호스팅 = Cloudflare Pages(정적 PWA) + Cloudflare Workers(엣지 프록시)** | 무료 티어. DAISO 코어 API는 모바일 내부 API라 브라우저 CORS를 허용하지 않을 가능성이 높음 → 얇은 pass-through 프록시 필요. 이 환경에 Cloudflare 툴링 정합. |

**신규 검증 항목(가설, Inc 0에서 검증)**: DAISO API의 브라우저 CORS 차단 여부 = 프록시 필요성의 근거. 프로덕션 API를 임의로 때리지 않고 data-owner 확인 또는 통제된 테스트로 검증. "직접 호출 가능"에 베팅 시 전면 재작업 리스크가 크므로 기본값은 프록시.

---

## 3. 배포 토폴로지

```text
쇼퍼 폰(브라우저)
   │  정적 자산(HTML/JS/CSS + Service Worker)
   ▼
Cloudflare Pages ── 정적 PWA (Vite + React + TS, vite-plugin-pwa)
   │  POST /api/stock   (동일 출처 → CORS 없음)
   ▼
Cloudflare Pages Function (Workers 런타임) ── dumb pass-through 프록시
   │  POST https://mapi.daisomall.co.kr/ms/msg/newIntSelStr
   ▼
DAISO Core API (newIntSelStr)
```

- **프록시 = 무캐시 relay.** 요청 본문 전달 → 응답 반환 → `Access-Control-Allow-Origin` 부여. **캐싱·비즈니스 로직·재랭킹·민감정보 로깅 없음**(D061 관측 시각 단일-소스 보존, Engineering §8 민감정보 로그 금지). 신선도 스탬프는 **클라이언트가 응답 수신 시각**으로 찍는다 — 엣지 캐시는 관측 시각을 모호하게 만들어 Confidence Theater 위험을 낳으므로 금지.
- **정규화 경계 = 클라이언트 어댑터(단일).** mall 전용 필드(`pkupYn, bassPkupStrYn, pntAcmYn, pntUseYn, intUseYn`)는 클라이언트 어댑터가 **매핑하지 않음** → UI 도달 불가(data-contract §7 "아예 노출 금지"). 프록시에서 방어적 스트립은 선택; 권위 경계는 어댑터 한 곳.

---

## 4. 클라이언트 아키텍처 (Hexagonal-lite — 포트/어댑터)

의존성은 안쪽으로만 흐른다(UI → domain ← adapters). Domain은 프레임워크·네트워크·React를 모른다.

```text
┌── domain (순수, 100% 유닛테스트) ────────────────────────────────┐
│  types.ts        AvailabilityAnswer(discriminated union),        │
│                  StoreContext, Location(floor+zone), Freshness   │
│  state-machine.ts  순수 reducer = Interface §3 전이표            │
│  freshness.ts    classify(observedAt, now, threshold) + 강등     │
│  policy.ts       DataOwnerPolicy(설정값) + 전략 함수 타입        │
│  ports.ts        StoreStockRepository + 서브포트 인터페이스      │
└──────────────────────────────────────────────────────────────────┘
        ▲                                     ▲
┌── adapters ────────────────┐   ┌── infra ─────────────────────────┐
│ newIntSelStr/  실 어댑터   │   │ query-cache.ts  신선도-네이티브   │
│   (프록시 호출+매핑+정책)  │   │   fetch(2s abort)+cache+스탬프    │
│ mock/          픽스처       │   │ cache-storage.ts IndexedDB/Cache  │
│ geolocation/   추천 전용    │   │ store-context.ts 마지막매장 영속  │
│ barcode/       카메라       │   │ sw/  Workbox(앱셸 precache +      │
│ ai/            해석(1s)     │   │      카탈로그 서브셋 = D061 매핑) │
└────────────────────────────┘   └───────────────────────────────────┘
        ▲
┌── ui (React, 라우터 없음, 상태구동) ─────────────────────────────┐
│  AvailabilitySurface  단일 표면 — 현재 AnswerState 렌더          │
│  components/  SearchScanBar(하단도킹) · AnswerCard(변형들) ·     │
│    StoreContextBar · StoreSelectionSheet · CandidateList(AI) ·   │
│    RecentSearches · GlassSurface(D083 프리미티브, 솔리드 폴백)   │
│  store.ts   경량 스토어(Zustand)가 domain reducer 호스팅         │
│  a11y/      polite live region · 포커스 순서 관리                │
└────────────────────────────────────────────────────────────────────┘
```

**핵심 원칙**: 상태머신·신선도·매핑은 전부 domain(순수)에 있어 React 없이 테스트된다. UI 스토어는 domain reducer를 감싸는 얇은 호스트일 뿐.

### 4.1 모듈/폴더 구조

```text
repo/  (기존 CLAUDE.md·AGENTS.md·README.md·docs/ 유지)
  index.html · vite.config.ts · wrangler.jsonc
  functions/api/stock.ts          Cloudflare Pages Function 프록시
  src/
    domain/    types · state-machine · freshness · policy · ports
    adapters/  newIntSelStr/ · mock/ · geolocation/ · barcode/ · ai/
    infra/     query-cache · cache-storage · store-context · sw/
    ui/        AvailabilitySurface · components/ · store · a11y/
    styles/    tokens · glass(솔리드 폴백) · light/dark · reduced-transparency
    main.tsx
  test/  fixtures/(전 상태 페이로드) · e2e/(Playwright 6상태)
```

---

## 5. 데이터 플로우 (라이브 답 + 신선도, D061)

```text
검색 submit
  → ui.store dispatch(SUBMIT) ─ 100ms 내 skeleton(Loading)
  → StoreStockRepository.query(storeCtx, term|pdNo)
      → newIntSelStrAdapter → POST /api/stock  (2s AbortController)
      → 성공: msStrVOList[0] 매핑 → AvailabilityAnswer + observedAt=수신시각
               → cache write(관측 시각 스탬프)
               → domain state-machine(answer) → Success/Partial 변형
      → 실패(timeout|5xx): cache 조회
               → 캐시 나이 ≤ 임계값  → Error(캐시 답 표시 + 스탬프)
               → 캐시 나이 > 임계값  → Partial(stale, 오늘 재고 미확정)
               → 캐시 없음           → Error(재시도 / 직원 문의)
  → ui 렌더 + polite live region(상태줄→가격·위치→신선도→CTA)
```

- **리프레시는 4개 트리거만**: 진입 / 앱 재개 / pull-to-refresh / `다시 확인`. **주기 타이머 절대 없음**(§1.6 다운스트림 계약).
- **카탈로그 서브셋**(SKU당 `identifier · name · price tier · last-known stock flag · floor+zone`): Store Context 확정 후 **백그라운드**로 채움(첫 답 크리티컬 패스 금지). `매장 변경` 시 교체. 캐시 읽기 전용. 수명은 신선도 정책이 지배(독립 TTL 아님, Engineering §4).

---

## 6. 도메인 모델 상세

### 6.1 `AvailabilityAnswer` (discriminated union)

| variant | 필드 | 화면 결과 |
|---|---|---|
| `InStock` | qty 상한, locations[], lowStock? | Success(있어요) — 위치 있으면 |
| `InStock`(위치 없음) | — | **Partial**(위치 없음) |
| `TemporarilyOut` | restockOfferable | Success(품절, +재입고알림) |
| `Discontinued` | — | Success(판매종료) |
| `NotCarried` | — | Success(미취급) |
| `RestockArriving` | lchDay | Success(입고예정) |
| `FranchiseUndeterminable` | — | **Partial**(가맹점) |

### 6.2 상태머신 (Interface §3 전이표 1:1)

순수 reducer. 이벤트: `SUBMIT · RESULT(answer) · FAILURE(cacheState) · SELECT_CANDIDATE · DISMISS_AI · CHANGE_STORE`.

```text
Default  --(submit)---------------------------------→ Loading
Loading  --(in stock, location present)-------------→ Success (in stock)
Loading  --(in stock, no location)------------------→ Partial (location missing)
Loading  --(temporarily out)------------------------→ Success (temporarily out)
Loading  --(discontinued)---------------------------→ Success (discontinued)
Loading  --(not carried)----------------------------→ Success (not carried)
Loading  --(restock pending)------------------------→ Success (arriving ~date)
Loading  --(franchise: undeterminable)--------------→ Partial (franchise)
Loading  --(no catalog match)-----------------------→ Empty
Loading  --(fail, cache ≤ threshold)----------------→ Error (cached answer)
Loading  --(fail, cache > threshold)----------------→ Partial (stale cache)
Loading  --(fail, no cache)-------------------------→ Error (retry / staff)
Any answer --(re-search / scan)---------------------→ Loading
```

- Error 2변형(캐시 임계값 내 / 캐시 없음), Partial 3트리거(가맹 · 위치 없음 · stale), Success 5변형(있어요 + 부정 4).
- **모든 분기가 6상태 중 하나로 착지 — 빈 화면·데드엔드 없음.** 각 답 상태 = 확정 답 + **정확히 하나의 L2 다음-액션**(Interface §7: 위치 보기 / 대안 보기 / 근처 매장 보기 / 재입고 알림 / 다시 확인).

### 6.3 매핑 규칙 (data-contract §4 → domain, Evidence L2)

```text
qty > 0                               → InStock (상한, `재고 N개 이하`)
qty === "0" && sleStsCd !== null       → TemporarilyOut
sleStsCd === "9" && qty < 1            → Discontinued
sleStsCd === null && directYn === "Y"  → NotCarried
directYn === "N" && no zone/stair       → FranchiseUndeterminable → Partial
mrkGdsYn === "Y"                       → RestockArriving (lchDay)
stairNoList[]·zoneNoList[] positional zip → (층,존) 쌍 = index별 페어링(짧은 배열 길이까지); 대표 표시 + 나머지 접힘(다른 위치 N곳 더 ▾)
```

> **정정(Phase 3, 2026-07-15):** 이 규칙은 처음 `×`(교차곱)로 기술되었으나 **문서 오류**다. 실제 매핑(`mapResponse.zipLocations`)은 **positional zip** — `stairNoList[i]`와 `zoneNoList[i]`를 index별로 짝짓고 짧은 배열 길이에서 멈춘다. 오라클 `inStockMultiLocation`(2층·2존)이 이를 강제: 교차곱이면 4쌍, positional zip이면 **2쌍** — 9-시나리오 패리티 테스트가 2쌍을 검증한다. 정본은 `src/adapters/newIntSelStr/mapResponse.ts`.

- 전부 어댑터 **한 모듈**에 캡슐화 → data-owner 교정 시 매핑 한 곳만 바뀜.
- **`sleStsCd` 값 열거 미완(A8)**: 미지값·미예상 조합은 **안전 폴백(Partial 또는 Error)으로 라우팅** — 조작된 Success 절대 금지(읽기 전용 낙관 UI 금지, Engineering §7).
- 위치: `stairNo → ${stairNo}F`(층), `zoneNo → ${zoneNo}번`(존). 원값=표시값, 룩업 테이블 없음. 벤더 그대로 `11층 56번`. 존 이름 없음(D064).

---

## 7. 어댑터 심 — 6개 미해결 데이터-오너 항목 (단일 포트 뒤)

| # | 심 | 형태 | Bible 상태 |
|---|---|---|---|
| 1 | staleness 임계값(cache age) | `DataOwnerPolicy` 설정값 + mock placeholder | A2 대기 |
| 2 | 저재고 컷오프(qty) | `DataOwnerPolicy` 설정값 + mock placeholder | A3 대기 |
| 3 | 판매종료 범위(매장/체인) | 주입 전략 — Flow 3 매트릭스 재작성 없이 스위치 | A7 대기 |
| 4 | 결손/불량 행 | 주입 전략 — 데이터 못 받치는 클레임 렌더 금지 | 대기 |
| 5 | hldyDt 해석 | 주입 전략 — 확인 전 `오늘은 휴무예요` 미출시 | 대기 |
| 6 | 재입고 구독 API | `RestockSubscriptionPort` — post-answer·login, 실패 방향만 고정(답 불변·중복탭 중복구독 금지·실패 평문·재시도) | 대기 |
| + | 검색 별칭(입력측) | `SearchAliasResolverPort` — data-owner 공급 전 null impl(비-Korean 쿼리는 Korean 카탈로그 미도달) | A4 대기 |

**임의 결정 금지**: 위 값·시맨틱은 앱에서 확정하지 않는다. 심 뒤 placeholder + mock으로 코어를 진행하고, data-owner/Bible 결정 후 그 결정을 따른다(CLAUDE.md §3 갭 피드백 루프).

---

## 8. 에러 처리 / 장애 시나리오 (Engineering §5, 의존성별)

```text
Dependency     Timeout   Failure → recovery (state)
-------------  --------  -----------------------------------------------------
Store/stock    2s        캐시 임계값내 Error(스탬프) / 초과 Partial(stale) /
                         무캐시 Error(재시도 + 직원 문의)
Franchise      n/a       Partial (실패 아님 — 설계상 확인 불가; 직원 폴백은 카피)
Geolocation    3s        추천 전용; 마지막 매장 유지, 검색 미게이트, 자동확정 없음
Barcode(cam)   무        권한거부 → 텍스트검색 / 디코드실패 → 카메라 유지 + 힌트
AI 해석        1s        timeout|error|low-conf → literal 무음 강등(에러 미노출)
```

- 모든 실패가 6상태 중 하나로 착지. 빈 화면 금지, 데드엔드 금지.
- **Store Context는 사용자 소유**(D082): geolocation 실패가 검색을 막지 않고 현재 매장을 바꾸지 않는다. 컨텍스트 없을 때(최초 실행)만 매장 검색 표면이 선행.

---

## 9. D083 — Bounded Liquid Glass 프리미티브 (Increment 1)

Canon(Interface §5, D083)이 **재사용 가능한 glass-surface 프리미티브(솔리드 폴백 내장)를 Increment 1에서 구현**하라고 명시.

- **`<GlassSurface>`**: 솔리드가 베이스, glass는 progressive enhancement.
- **대비 보장(비협상, I6)**: glass가 텍스트 뒤에 올 때 대비 보장층(semi-opaque tint/scrim + subtle text drop-shadow)으로 **유효 텍스트 대비 ≥ 4.5:1 양 테마**. glass가 AA 실패의 원인이 되면 안 됨.
- **폴백**: `prefers-reduced-transparency` → 솔리드·불투명·backdrop-filter 없음. 예산 못 지키는 기기 → 솔리드.
- **성능(G3)**: backdrop-filter blur 반경 예산-세이프 캡, 표면당 1레이어, GPU 힌트, 대형 스크롤 리스트 미적용. FCP<1.8s / INP<200ms / tap<100ms 못 지키면 솔리드.
- **적용면**: 하단 검색/스캔 바 · 매장 컨텍스트 바 · 매장 선택 시트 · 스크림 · 카드 보더 · (owner 결정) 답 카드 콘텐츠 뒤.
- **시맨틱 색 불변**: glass는 중립 표면 처리 — 새 상태색 도입 없음. Error 색=시스템 실패 전용, Warning 미사용, Success=✓+선언문.

---

## 10. 성능 예산 · 접근성 골격

- **예산(회귀=버그, Engineering §3)**: FCP<1.8s · LCP<2.5s · INP<200ms · CLS<0.1 · tap<100ms · skeleton<100ms · **submit→first result ≤2s(가설·필드검증)** · 전환 150–300ms(ease-out 진입/ease-in 이탈, reduce-motion 시 즉시 컷) · **캐시-서브 답=네트워크 왕복 0**.
- **WCAG 2.2 AA(Interface §6)**: 터치타깃 ≥44×44pt(권장 48)·간격 ≥8pt · 본문 ≥16px/lh1.5 · 대비 본문 ≥4.5:1·큰텍스트 ≥3:1(라이트·다크) · 200% 스케일 생존 · reduce-motion 존중.
- **포커스 순서**: 매장줄 → 답카드 → CTA → 후보 → 검색바.
- **live region(polite)**: 상태줄 → 가격·위치 → 신선도 → CTA 순.
- **라벨**: 검색 입력 프로그램적 라벨 `상품 검색`(placeholder≠라벨) · 스캔 버튼 `바코드 스캔` · 이미지 alt=상품명 · **상태 색상 단독 전달 금지**(Success ✓+선언문 / Error ⚠+복구문 / Partial 문장구조+웨이트).
- **모니터링(Engineering §8)**: 예산 준수 · Error 진입율 · 캐시 히트율 · staleness 분포 · Success→Partial 강등 빈도. **민감정보(정밀 위치·개인식별자) 로그 금지.**

---

## 11. 테스트 전략 (TDD, fallback-first)

- **domain**(Vitest): 상태머신 전이표 전 행 · 신선도 classify+강등(라이브 미강등 포함) · 매핑 전 조건 + 미지 `sleStsCd` 안전 폴백 · 정책 스위치(임계값/컷오프/판매종료 범위).
- **adapters**(Vitest): 픽스처 대조 매핑(전 상태·변형·stale) · **mall 전용 필드 미노출** 검증 · mock↔실 어댑터 패리티.
- **components**(Testing Library): 6상태·변형 카피/CTA 정확성 · a11y(라벨·live region·색 단독 금지) · **glass 솔리드 폴백**(reduced-transparency).
- **E2E**(Playwright): 6상태 여정 · 매장 선택(D082) · 오프라인/캐시 경로 · **빈 화면 없음** 단언.
- **커밋 전 게이트**: ESLint/Biome + tsc + Vitest.
- **fallback-first**: literal 검색 + barcode 스캔을 **먼저 구축·검증**, AI 해석은 위에 레이어(AI 계약 §3).

---

## 12. Increment 단계 (2단계 구현 플랜 예고)

### Increment 0 — PWA 셸 + 데이터 레이어 (인프라)
- Vite + React + TS 셸, vite-plugin-pwa(앱셸 precache).
- Cloudflare Pages Function/Worker **무캐시 프록시** `/api/stock`.
- domain: `types` · `ports(StoreStockRepository + 서브포트)` · `freshness` · `state-machine` 골격.
- infra: `query-cache`(신선도-네이티브 fetch 2s abort + 스탬프) · `cache-storage`(IndexedDB) · `store-context` 영속 + **D082 geolocation 포트(추천 전용)**.
- adapters: **mock 어댑터**(전 상태 픽스처) 먼저.
- SW: 카탈로그 서브셋 백그라운드 채움 = **D061 신선도 매핑**(Workbox 기본 TTL 미사용).
- `DataOwnerPolicy` 심 + placeholder(임계값·컷오프·판매종료 범위·결손행·hldyDt).
- 성능/a11y 골격 확립 + `<GlassSurface>` 프리미티브 뼈대(솔리드 우선).
- 다운스트림 수용(§1.6): 주기 타이머 금지·도착 비감지·Flow 3 좌표 앵커/판매종료 스위치 수용.
- **CORS/프록시 가설 검증**(신규 항목).

### Increment 1 — Flow 1 Availability Check (첫 수직 슬라이스)
- 6상태 UI + **최종 카피**(Interface §4) + 실 `newIntSelStrAdapter` 매핑.
- 3진입 경로 → 동일 답 카드: 타이핑(→literal) / 바코드·선반라벨 스캔(무타이핑) / 최근 검색.
- **fallback-first**: literal + barcode 먼저 → AI 해석 레이어(1s 타임아웃·무음 literal 폴백·`직접 검색 결과 보기` override 상시·확신도 티어 High>90%/Medium 70–90%/Low<70%/Unknown).
- 매장 선택 시트(D082): 근처 목록(GPS 추천 전용) + 매장명·지역명 검색.
- **D083 glass 마감**(대비 보장 + 폴백).
- 저재고 상한(`재고 N개 이하`) · 복수 위치 접힘 · 재입고알림(post-answer login).
- 익명·무로그인(Anti-goal 4).

---

## 13. 오픈 이슈 (Bible 에스컬레이션 유지 — 앱 임의 결정 금지)

| # | 항목 | 처리 |
|---|---|---|
| A2 | staleness 임계값 | 심 뒤 설정값 + mock; data-owner 확인 후 Bible 기록 |
| A3 | 저재고 컷오프 | 심 뒤 설정값 + mock |
| A4 | 다국어 언어/타이밍/디자인 + 입력측 검색 별칭 | `SearchAliasResolverPort` null impl; Bible 다국어 범위 결정 + data-owner 별칭 공급 대기 |
| A7 | 판매종료 범위(매장/체인) | 주입 전략 스위치; data-owner 확인(Flow 3 게이트) |
| A8 | 데이터 계약 = 단일-샘플 L2 | `sleStsCd` 열거·`curLitd/strLitd` 철자·결손 행·hldyDt 시맨틱 라이브 대조 후 Bible data-contract 갱신 |
| — | hldyDt | 확인 전 `오늘은 휴무예요` 미출시 |
| **NEW** | CORS/프록시 필요성 | **가설** — Inc 0에서 data-owner 확인/통제 테스트로 검증 |
| B9 | iOS Safari PWA 제약 | SW·설치·카메라/바코드·불안정 매장망을 **Inc 0에서 실측**(필드검증); iOS Safari의 카메라·SW 제약이 fallback-first·오프라인 설계에 영향 |

**가설(출시-후 검증, 구현 블로커 아님)**: submit→result ≤2s · AI 순-효용 · 하단 바 아일 유용성 · 존번호 글랜스 가독성 · 30,000+ SKU 리터럴 유사도 품질.

---

## 14. 추적성 (결정 근거)

- 제품 결정 근거: Bible D059(PWA-first) · D061(신선도) · D062(부정답 분할) · D063/D064(위치) · D068/D069(다국어·렌더링) · D071/D072(가맹 둘째 엔딩) · D076/D077/D078(Flow 2·3 게이트) · **D082(Store Context 사용자 소유)** · **D083(Bounded Liquid Glass)**.
- 앱-레벨 결정: 본 문서 §2(B1–B10) — Bible D-번호 미소비, 이 저장소가 자체 기록.
- 이 설계는 Bible을 **구현**할 뿐 수정하지 않는다. 스펙 갭 발견 시 Bible로 상향 에스컬레이션 후 따른다.

---

*이 문서는 DAISO Finder 앱 저장소의 Increment 0+1 설계 스펙이다. 정본은 Product Bible.*
