# Flow 1 Live-Data Wiring — Design Spec (2026-07-22)

> 상태: **설계 승인 완료(2026-07-22, user)**. 구현 미착수 — 다음 세션에서 `writing-plans` → TDD 실행.
> 이 문서는 이번 작업의 앱-레벨 SSOT다. 제품 **철학**의 SSOT는 여전히 Product Bible(read-only).
> 벤더 **데이터 계약·구현·매핑**은 이 저장소가 소유(CLAUDE.md §1/§3, 2026-07-21 거버넌스 조정).

관측/매핑 정본: [`docs/notes/store-api-observations.md`](../../notes/store-api-observations.md).
추적: [`docs/notes/open-questions.md`](../../notes/open-questions.md) · 실행 원장: [`.superpowers/sdd/progress.md`](../../../.superpowers/sdd/progress.md).

---

## 0. 한 줄 요약

mock 뒤에 격리된 Flow 1(Availability Check)을 실 다이소몰 데이터로 배선한다. 헥사고날 심(`StoreStockRepository` B6, `StoreDirectoryPort` B16) 뒤의 mock을 실 어댑터로 교체하고, 인증·팬아웃은 CF Pages Functions 프록시가 서버에서 처리한다. **UI·도메인·reducer·query-runner·캐시는 불변.**

## 1. 목표 & 범위

**목표**: 타이핑 검색 → 실 상품/재고/상태/위치/입고예정 합성 → 6상태 답, 그리고 매장명 검색(D082 시트) 실 데이터.

**In scope (이번 패스)**
- `StoreStockRepository` 실 어댑터: SearchGoods(상품) + selStr(직영/가맹) + selStrPkupStck(재고+상태+입고예정) + selIntPdStDispInfo(위치) 조건부 팬아웃.
- `StoreDirectoryPort` 실 어댑터: selStr 검색모드(매장명→strCd).
- CF Pages Functions 프록시(인증·CORS·오케스트레이션).
- 도메인/포맷 소폭 조정: franchise 판정 정제, 지하층 표기, lchDay 포맷, km→m 유틸(배선은 근처-GPS 패스).

**Out of scope (별도 과제)**
- GPS 근처 매장 실 배선(`GeolocationPort` — selStr 근처모드). km→m 유틸만 준비.
- AI 검색어 해석 레이어(fallback-first), 바코드 스캔 진입, 최근 검색, SLOW 단계적 로딩.
- 재입고 구독(로그인 게이트), 다국어 입력 별칭(A4), PWA 설치 아이콘(B19).

## 2. 승인된 결정 (2026-07-22)

| # | 결정 | 값 |
|---|---|---|
| F-a | 검증 전략 | **헤르메틱만**. 모든 자동 테스트는 fetch/프록시 경계를 mock(녹화 픽스처). CI·테스트에서 라이브 daisomall 호출 없음. 라이브 스모크는 사용자가 수동(`wrangler pages dev`). |
| F-b | 범위 | **가용성 + 매장검색**(위 §1). GPS·AI·바코드 제외. |
| F-c | 6상태 합성 위치 | **클라이언트 매핑**. 프록시=인증·CORS·조건부 팬아웃 + 정규화 raw 레코드 반환. 6상태 분류는 클라 `mapStoreObservation`(TDD 유닛). |
| A-1 | 구식 `newIntSelStr`/`stock.ts` | **제거** + precedence 지식을 `mapStoreObservation`로 이식. (구식 mapi 단일번들 모델·F2 UNVERIFIED, 실 계약과 형태 불일치.) |
| A-2 | km→m | **유틸만 추가(`format.ts`, TDD)**. 표면화 지점(GPS 근처)이 범위 밖이므로 배선은 근처 패스로. |
| A-3 | route-intercept E2E | **포함**(구현 후 검증). preview(prod 빌드=실 어댑터) + Playwright `page.route('**/api/**')` 픽스처. |
| 방법론 | 테스트 | 사용자 선호: "실제 구현 후 테스트로 체크". 태스크 제약 = TDD. → 유닛별 구현 후 즉시 테스트 green + 커밋 전 전체-스위트 게이트로 조화. |

## 3. 아키텍처

경계는 그대로, 심 뒤 mock → 실 어댑터 교체뿐.

```
클라이언트(PWA)                         CF Pages Functions (서버, /api/*)          daisomall 업스트림
────────────────────                   ──────────────────────────────           ──────────────────
StoreStockRepository ─POST /api/availability─▶ 팬아웃 오케스트레이터 ───────▶ SearchGoods · selStr ·
  └ mapStoreObservation ◀─ 정규화 raw 레코드 ─┘   (인증·CORS·조건부 팬아웃·화이트리스트)  selStrPkupStck · selIntPdStDispInfo
StoreDirectoryPort   ─POST /api/stores───────▶ selStr 검색모드 프록시(쿠키) ──────▶ selStr
```

- 클라이언트는 **내부 `/api/*`만** 호출. daisomall 호스트·JWT·AES 키·`X-DM-UID`는 서버에만 존재.
- 프록시는 **화이트리스트 정규화 레코드만** 반환(업스트림 원본 미전달) — 필드-스트립보다 강한 읽기전용 위생.
- 신선도(D061) 불변: 프록시는 `no-store`(무캐시). 관측 나이 스탬프·캐시는 클라 query-runner + IndexedDB가 담당.

### 3.1 팬아웃 시퀀스

```
Client ─{strCd, keyword}→ /api/availability
  1차 웨이브(병렬):
    · SearchGoods(searchTerm=keyword)  → pdNo·pdNm·pdPrc  (0건 → {noMatch:true})
    · selStr detail({inclusiveStrCd:strCd}) → directYn
    · auth/request → JWT+uid → AES → Bearer
  2차 웨이브:
    · 직영(directYn='Y'): selIntPdStDispInfo{pdNo,strCd}(위치) ∥ selStrPkupStck[{pdNo,strCd}](재고+상태+입고예정)
    · 가맹(directYn≠'Y'): selIntPdStDispInfo(위치)만; zoneNo 존재 시에만 selStrPkupStck 추가
  → 정규화 raw 레코드 반환
Client ─ mapStoreObservation → AvailabilityAnswer → query-runner(2s 예산·캐시·신선도) → reducer → UI
```

가맹 재고 조건부는 다이소 `SCR_MSG_0015` 클라이언트 로직과 정합(도시어 §Flow 1 조합).

## 4. 서버 — 프록시 엔드포인트

### 4.1 `POST /api/availability`
- 입력: `{ strCd: string; keyword?: string; pdNo?: string }`.
- 출력: `{ data: RawStoreObservation }` | `{ noMatch: true }`. 헤더: `content-type: application/json`, `access-control-allow-origin: *`, `cache-control: no-store`.
- 실패: 업스트림 도달불가/비-JSON/인증실패(재발급 후에도) → `502 {error:'upstream_unavailable'}` + 동일 CORS/no-store(불투명 CORS 아님 → 클라 FAILURE 경로).
- 병렬성: 1차 웨이브(SearchGoods·selStr detail·auth) 병렬. 가맹은 위치 결과의 zoneNo에 재고 여부가 의존 → 위치 후 조건부 재고(가맹+위치일 때만 3번째 파동).

`RawStoreObservation`(앱 소유 계약):
```ts
interface RawStoreObservation {
  strCd: string;
  pdNo: string;
  productName: string;          // SearchGoods pdNm/exhPdNm
  price: number;                // SearchGoods pdPrc(원, number)
  directYn: string;             // selStr ('Y'=직영)
  stck: string | null;          // selStrPkupStck (미조회 시 null)
  sleStsCd: string | null;      // 매장 판매상태 코드 (미조회 시 null) — 카탈로그 sleStsCd와 별개
  mrkGdsYn: string | null;      // 'Y'=입고예정
  lchDay: string | null;        // 'YYYY-MM-DD' (미조회/미해당 시 null)
  locations: { floor: string; zone: string }[]; // selIntPdStDispInfo data[] (이미 페어링)
}
```

**불변식(중요)**: `stck === null` ⟺ 재고를 **의도적으로 미조회**(가맹 AND 위치없음)일 때만. 직영은 항상 재고 조회 —
조회한 재고 요청이 실패하면 레코드가 아니라 **502**를 반환한다(=`stck:null`인 레코드가 직영에 존재하지 않음).
이 불변식이 있어야 `mapStoreObservation` 규칙5(notCarried: `sleStsCd===null && directYn==='Y'`)가 fetch 실패를
notCarried로 오분류하지 않는다(직영+`stck:null`은 애초에 발생 불가).

### 4.2 `POST /api/stores`
- 입력: `{ query: string }`.
- 출력: `{ stores: { strCd: string; strNm: string }[] }`.
- 업스트림: selStr 검색모드 `{keyword, srchYn:"Y", srchBassPkupStrYn:"Y", geolocationAgrYn:"N", currentPage, pageSize}`. 좌표 optional(이름검색은 좌표 없이 동작 가정 — §12 기록). 인증 불필요(쿠키만).

## 5. 인증 — `functions/_lib/daisoAuth.ts`

k-skill SKILL.md 관측(정본): `selStrPkupStck`·`selIntPdStDispInfo`는 Bearer 필수.
1. `GET /auth/request` → 응답 바디 JWT 평문 + 헤더 `x-dm-uid`(유효 30s).
2. 랜덤 16B IV(`crypto.getRandomValues`) + JWT를 **AES-128-CBC/PKCS7**로 암호화. 키 = 16B ASCII `"PRE_AUTH_ENC_KEY"`(벤더 번들 공개 상수; 회전·위생 위해 **env 바인딩** `PRE_AUTH_ENC_KEY`로 주입, 하드코딩·커밋 금지).
3. `Bearer = base64(IV) + base64(ciphertext)`; 헤더 `Authorization: Bearer <bearer>`, `X-DM-UID: <uid>`.
4. **WebCrypto**(`crypto.subtle`) 사용 — node crypto 불사용(Workers 호환). 테스트 결정성 위해 IV 주입 가능.
5. 401/403 → `/auth/request` 1회 재발급 후 재시도(SKILL.md fallback). 재시도 후에도 실패 → 502.

보안: 실 토큰·uid·키 값은 로그·커밋·클라 번들에 절대 노출 금지. 프록시는 upstream 응답 중 Flow-1 화이트리스트 필드만 추출해 반환.

## 6. 클라이언트 — 어댑터

`src/adapters/daisomall/`:
- `storeStockRepository.ts` — `createDaisoStoreStockRepository({ endpoint='/api/availability', fetchImpl? }): StoreStockRepository`. `{noMatch:true}` → `throw NoCatalogMatchError([])`; `!res.ok` → `throw Error`(FAILURE 경로); else `mapStoreObservation(data)`.
- `mapStoreObservation.ts` — 정규화 레코드 → `AvailabilityAnswer`. 미매칭 → `UnmappableAnswerError`(안전 폴백, 날조 없음).
- `storeDirectory.ts` — `createDaisoStoreDirectory({ endpoint='/api/stores', fetchImpl? }): StoreDirectoryPort` → `StoreContext[]`.
- `rawObservation.ts` — `RawStoreObservation` 타입 + 경량 런타임 검증(JSON 신뢰 금지: 필수 필드·타입 확인, 실패 시 `UnmappableAnswerError`).
- fixtures: 도시어 실 응답 기반 녹화 픽스처(6상태 + noMatch + 직영/가맹 + 지하층 엣지).

### 6.1 `mapStoreObservation` precedence (기존 `mapResponse` 이식 + franchise 정제)

입력 = `RawStoreObservation`. 위→아래 우선순위:
1. `directYn !== 'Y' && locations.length === 0` → **franchiseUndeterminable**(가맹 AND 위치없음 — 오케스트레이션이 재고 미조회).
2. `Number(stck) > 0` → **inStock**(`locations`, `qtyUpperBound=Number(stck)`). qty는 상한(§data-contract §4), 정확수로 표기 금지.
3. 매장 `sleStsCd === '9'` → **discontinued**.
4. `mrkGdsYn === 'Y'` → **restockArriving**(`lchDay` = 포맷된 'M월 D일').
5. `sleStsCd === null && directYn === 'Y'` → **notCarried**(직영 + null 상태 = 미취급).
6. `Number(stck) === 0 && sleStsCd !== null` → **temporarilyOut**(`restockOfferable:true`).
7. else → `UnmappableAnswerError`(안전 폴백; 날조된 Success 금지).

sleStsCd 미해소 코드('9'/null 외)는 의미 미고정 → qty로 폴백(2/6 규칙)해 격리(§12).

## 7. 도메인/포맷 조정 (철학 유지)

- **franchise 정제**: "가맹 AND 위치없음"을 규칙1로 명시. **앱 소유 결정**(상태판정 정제; 무-날조 철학=가맹+무관측=정직한 미확정은 불변 → Bible 에스컬레이션 불필요, CLAUDE.md §3). state-machine·types 불변.
- **지하층**: `format.ts` `formatLocation` — floor가 `'-'` 접두(예 `'-1'`) → `"지하 N층 {zone}번"`(음수 일반화), 양수 → 기존 `"N층 {zone}번"`. 프레젠테이션 전용. D068/D069 매칭토큰: 숫자 유지, "지하"는 이해 프레임.
- **lchDay 포맷**: 업스트림 `'YYYY-MM-DD'` → `'M월 D일'`(다이소 `formatLchDay` 정합). `format.ts`에 `formatLchDay`. mapStoreObservation이 restockArriving 생성 시 적용(도메인 타입은 이미 렌더 문자열 `lchDay: string`).
- **km→m**: `format.ts` `kmToMeters(km: number): number = Math.round(km*1000)`. **배선은 근처-GPS 패스**(현재 표면화 지점 없음; 유틸·테스트만).

## 8. 장애 / 오프라인 / 읽기전용

- **2s 예산**: 클라 query-runner가 `repo.query` vs 2s 타이머 race. 프록시 팬아웃이 느리면 timeout → FAILURE → 캐시/noCache(정직한 강등, 가설 C2). 완화 = 웨이브 병렬화.
- **upstream 실패/비-JSON/인증실패**: 프록시 502 + CORS → 클라 FAILURE 경로(불투명 CORS 아님).
- **noMatch**: SearchGoods 0건 → `{noMatch:true}` → `NoCatalogMatchError` → NO_MATCH → Empty(캐시 미제공 — 성공 쿼리·0결과).
- **신선도/복구**: live 미강등(D061). 캐시는 관측 나이 스탬프. stale-negative → noCache(§A10 임시 게이트, query-cache 유지). 오프라인 = 캐시된 관측만 정직 프레이밍.
- **읽기전용**: 프록시는 read-only 업스트림만(SearchGoods GET, selStr/stck/disp POST 조회, auth GET). 재고·거래 변형 없음. 화이트리스트 반환(몰/커머스 필드 미전달).

## 9. 컴포지션 루트 & env

- `src/adapters/composition.ts`(신규): 프로덕션 어댑터 조립 단일 지점.
  - `import.meta.env.PROD` → 실 `/api` 어댑터(`createDaisoStoreStockRepository`, `createDaisoStoreDirectory`).
  - DEV/test → keyword mock + mock directory(현 동작 유지 → Playwright가 vite dev에 붙어 green, `/api` 미서빙 문제 회피).
- `AvailabilitySurface.tsx`: 인라인 mock 생성(`createKeywordMockRepository`·`createMockStoreDirectory`)을 컴포지션 루트 참조로 교체. `?scenario=` DEV 하네스(F4 가드)·모든 UI·포커스·시트 로직 불변.
- 서버 env: `PRE_AUTH_ENC_KEY`(인증 키) + 업스트림 호스트 base URL 설정값(기본 fapi; 미정합 격리 → 라이브 스모크로 확정). `wrangler.jsonc`/secret으로 주입, 커밋 금지.

## 10. 테스트 (헤르메틱)

- **어댑터 유닛**(vitest): `fetchImpl` 스텁 + 녹화 픽스처 → `mapStoreObservation` 6상태 전 케이스 + noMatch + `!ok` FAILURE + 검증 실패 → Unmappable. `storeDirectory` 매핑·빈쿼리·실패 degrade.
- **프록시 유닛**(vitest, functions/): `globalThis.fetch` 스텁(기존 `stock.test.ts` 관례) → 1차/2차 웨이브 순서·조건부 재고(직영 vs 가맹±zoneNo)·화이트리스트·502·noMatch.
- **daisoAuth 유닛**: IV 주입 결정성 → Bearer 포맷(`base64(IV)+base64(ct)`)·헤더·401/403 재발급.
- **E2E**: 기존 `?scenario=` 6상태 스윕 **불변**(UI 회귀 가드). **신규(A-3)**: preview(prod 빌드=실 어댑터) + `page.route('**/api/**')` 픽스처로 브라우저→/api→매핑→UI 실 파이프라인 헤르메틱 검증.
- **커밋 전 게이트**(B8): `npm run test` · `typecheck`(functions/ 포함) · `lint` · `e2e` 전부 green.

## 11. 파일 변경 맵

**신규**
- `functions/api/availability.ts` (+`.test.ts`)
- `functions/api/stores.ts` (+`.test.ts`)
- `functions/_lib/daisoAuth.ts` (+`.test.ts`)
- `functions/_lib/daisoUpstream.ts` (호스트/엔드포인트 설정 + 타입드 fetch)
- `src/adapters/daisomall/{storeStockRepository,mapStoreObservation,storeDirectory,rawObservation}.ts` (+ tests + fixtures)
- `src/adapters/composition.ts`
- `test/e2e/live-pipeline.spec.ts` (route-intercept)

**수정**
- `src/ui/format.ts` (+`.test.ts`) — 지하층·`formatLchDay`·`kmToMeters`
- `src/ui/AvailabilitySurface.tsx` — 컴포지션 루트 사용(UI 로직 불변)
- `playwright.config.ts` — preview 프로젝트 추가(route-intercept용)
- `wrangler.jsonc` / env — 업스트림 호스트·키 바인딩
- docs: 이 스펙 · `docs/notes/open-questions.md §B`(앱 결정 기록) · `docs/HANDOFF.md` · `.superpowers/sdd/progress.md`

**제거**
- `src/adapters/newIntSelStr/{newIntSelStrAdapter,mapResponse,rawFixtures}.ts` + tests (구식 mapi 모델·F2 UNVERIFIED; precedence는 `mapStoreObservation`로 이식)
- `functions/api/stock.ts` + `stock.test.ts` (mapi pass-through)

## 12. 거버넌스 라우팅 & 미해소 항목 (전부 앱 소유 기록, Bible D-번호 미소비)

구현 시 `docs/notes/open-questions.md §B`에 확정 기록:
- **franchise 정제** = 앱 소유 상태판정 정제(§7). Bible 미에스컬레이션(철학 불변).
- **sleStsCd 매장 코드 열거** 미완 → '9'/null만 의미 고정, 나머지 qty 폴백으로 격리. data-owner 확인 항목.
- **stck 종류**(진열 vs 픽업 예약수) → 심 뒤 격리, 라이브 확인.
- **호스트 정합**(fapi vs www) → env 설정값(기본 fapi), 라이브 스모크로 확정.
- **매장검색 좌표 optional** 가정 → 라이브 확인.
- **지하층 표기**("지하 N층")·**km→m**·**lchDay 포맷** = 앱 소유 포맷 결정.
- **ToS/robots**(§A9-6): 익명이어도 anti-abuse 게이트 관련 → 라이브 호출 정책은 헤르메틱 유지로 회피, 배포 전 확인.

## 13. 검증 포인트 (파리티·철학)

- 9-시나리오 6상태 매핑이 기존 mock 오라클과 정합(precedence 이식 정확성).
- 무-날조: 어떤 미매칭·미확정도 날조된 Success로 새지 않음(Unmappable → 안전 폴백).
- 정직한 분리: 가맹+무위치 = franchiseUndeterminable(추정 금지); 위치 없는 inStock = Partial(locationMissing).
- 신선도: live 답 미강등; stale-negative → noCache.
- 읽기전용: 프록시 화이트리스트, 변형 호출 없음.
- 보안: 키·토큰·uid 클라 번들/커밋 부재(grep 검증).

## 14. 다음 세션 실행 순서

1. `writing-plans`로 이 스펙 → 태스크 분해 구현 플랜(프록시 → 어댑터 → 도메인 조정 → 컴포지션 → E2E) 작성·커밋.
2. 새 브랜치 `feat/flow1-live-data`(main 분기).
3. TDD 실행(유닛별 red→green, 커밋 전 전체 게이트 green). 순서 권장:
   a. `functions/_lib/daisoAuth` + `daisoUpstream`
   b. `functions/api/availability` + `stores`(프록시 유닛)
   c. `src/adapters/daisomall/*`(어댑터 유닛)
   d. `format.ts` 조정 + 구식 어댑터 제거
   e. `composition.ts` + `AvailabilitySurface` 배선
   f. route-intercept E2E + 전체 게이트
4. open-questions §B·progress·HANDOFF 갱신, 완료 후 로컬 머지.
