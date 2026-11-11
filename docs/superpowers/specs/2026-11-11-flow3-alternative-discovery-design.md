# Flow 3 — Alternative Discovery 구현 설계 (2026-11-11)

Authority: `product-bible/06_Product/daiso-companion/{Experience,Interface,Engineering}/alternative-discovery.md`
(D070·D072·D073·D074·D076·D078). 이 문서는 계약이 앱에 맡긴 **구현 결정**만 기록한다. 제품 철학·Bible 카피를
새로 만들지 않는다. 계약에 없는 카피가 필요하면 **앱 초안 + 비준 대기**로 표시하고 `open-questions.md`에 올린다.

## 0. 범위 — 이번 릴리스가 실제로 발행하는 것

| 진입 | 계약상 발행 | P3 프로덕션 | 이유 |
|---|---|---|---|
| Flow 1 일시품절 | A(선행) + B | **A만** | nearby live 차단(D3·`hldyDt`) |
| Flow 1 판매종료 | A만 (B withhold) | **A만** | 계약 그대로 |
| Flow 1 미취급 | A + B(선행) | **진입 열지 않음** | 선행 branch가 B인데 B가 withheld — CTA `근처 매장 보기`가 약속과 어긋난다 |
| Flow 1 가맹점 Partial | B만 | **진입 열지 않음** | 발행 가능한 branch가 0 |
| Flow 2 품절 exit | A(선행) + B | **A만** | 데드엔드 해소. B 부재는 D5로 기록 |
| Flow 2 여전히있음 exit | A(선행) + B | **A만** | 위와 동일 |

- **nearby live는 P3에서 배선하지 않는다.** 포트·타입·mock·표면·E2E·axe까지 구현해 데이터가 확정되면
  스위치만 켜면 되게 한다. 차단 사유: `hldyDt` 휴무 의미가 단일 샘플이고, 닫힌 매장을 빼면
  `근처 매장에는 재고가 없어요`가 거짓이 될 수 있다(Bible Engineering §11).
- **미취급·가맹점 CTA는 기존 inert stub을 유지한다.** Bible 카피를 바꾸지 않고, 죽은 약속을 새로 만들지도
  않는다. 임시 형태는 D5(기존 열린 질문)로 에스컬레이션한다.
- **Flow 2 exit는 연다.** CTA 라벨 `대안 보기`는 branch를 약속하지 않으므로, A만 있어도 정직하다.
  exit 본문이 nearby를 언급하는 반쪽 약속은 D5에 함께 기록한다.

### 번들 예산 — P3 예외

- 정본 상한은 **엔트리 ≤220 kB / gzip ≤72 kB** 그대로다. 숫자를 조용히 올리지 않는다.
- P3 머지에 한해 **예외 상한 240 kB / gzip 78 kB**를 기록한다. P2 종료 실측 224.68 / 72.58에서
  표면 1개 + 카피·i18n + 어댑터를 얹을 여유다.
- 근거: 220/72는 Flow 1 단독 시절의 가설 상한이고, Flow 2·3는 라우트 분리 없이 같은 엔트리의 UI-shell
  상태다. 지금 분할하면 Flow 3 진입 `<100ms` skeleton이 청크 요청을 기다리거나, §B47(동결) 카트 묶음을
  건드려야 한다.
- **P4 배포 전** 다음 중 하나를 명시적으로 고른다: ① 220/72로 복귀(분할 지점: 카트·최근본·공유 묶음 —
  탭 시점 로드, cold path 아님) ② 필드 증거와 함께 상한 재비준. 그전까지 예외는 릴리스마다 실측치와 함께
  `HANDOFF.md`에 남긴다.

## 1. 진입과 상태 소유

- Flow 3는 `sheetOpen`·`scannerOpen`·`navigation`과 같은 **UI-shell 상태**다. 7번째 `UiState`도, reducer
  변경도 아니다. 6상태·카피·`?scenario=` 스윕은 그대로다.
- `AvailabilitySurface`가 소유하는 것: `alternative: AlternativeEntry | null`,
  `storeCard: StoreCardEntry | null`, `navigationOrigin: 'flow1' | 'alternative'`.
- **표면 스택**: `storeCard > navigation > alternative > UiState`. Group A 행 탭은 Flow 2를 **alternative
  위에** 얹고, back은 alternative 목록으로 돌아온다. Group B 행 탭은 store card를 alternative 위에 얹는다.
- cold entry(새로고침)에는 원본 상품 맥락이 없다 → Flow 1. 캐시로 대안 화면을 재구성하지 않는다
  (Engineering §5).
- 새 조회·매장 변경은 스택을 전부 버린다. 매장 변경은 새 매장 Default로 착지한다(Flow 2와 동일).

```ts
interface AlternativeEntry {
  store: StoreContext;
  reason: 'temporarilyOut' | 'discontinued' | 'notCarried' | 'franchise' | 'flow2';
  productName: string;
  pdNo?: string;           // exact identity when the lookup retained one
  imageUrl?: string;
  price?: Money;           // context header only; rows carry their own
  keyword: string;         // Group A literal re-search term
  issued: { similar: boolean; nearby: boolean };
  lead: 'similar' | 'nearby';
  origin: 'flow1' | 'flow2';
}
```

- `keyword`: typed 진입은 마지막 제출 키워드, candidate·scan·Flow 2는 **상품명**(pdNo 재검색은 exact
  item만 돌려주므로 유사 상품에 부적합).
- `pdNo`: candidate·scan·Flow 2의 `NavigationTerm`이 보유한 값. typed 답변은 P3에서 답변에 `pdNo`를
  싣는다(§2.4). 없으면 B를 발행하지 않는다 — B는 "같은 pdNo"가 계약이다.
- `issued`: 계약 매트릭스가 정하고, 프로덕션 게이트가 nearby를 withheld로 덮는다. `lead`는 계약 그대로.
- `reason → reason line`은 Interface §4 표를 그대로 쓴다. Flow 2 진입은 `선반에서 찾지 못했어요`.

### back·포커스

| 위치 | back | 포커스 복귀 |
|---|---|---|
| Flow 3 목록 | 진입시킨 화면(Flow 1 답 카드 / Flow 2 exit) | 진입 CTA |
| Flow 3 → Flow 2 | Flow 3 목록 | 탭한 Group A 행 |
| Flow 3 → store card | Flow 3 목록 | 탭한 Group B 행 |
| Flow 2(Flow 1발) | Flow 1 | `위치 보기` |
| Flow 2(Flow 3발) | Flow 3 목록 | 탭한 Group A 행 |

- 행 포커스 복귀는 `data-alt-row="<pdNo|strCd>"` + 복귀 시 `useEffect` 포커스로 구현한다(목록이
  unmount됐다 다시 mount되므로 ref 전달로는 안 된다).
- 진입 포커스는 context header(상품명 + 이유, `tabIndex={-1}`, `aria-labelledby`)다. 읽기 순서의 첫 요소다.
- store card 진입 포커스는 결정문(`강남역점에 있어요 · 1.2km`)이다.

## 2. 데이터

### 2.1 Group A — live (이번 릴리스)

새 프록시 `POST /api/alternatives` (Cloudflare Pages Function + `scripts/dev-proxy.mjs` 핸들러 표 등록).

```text
요청  { strCd: string, keyword: string, excludePdNo?: string }
응답  { rows: RawSimilarRow[], omitted: number }
RawSimilarRow = { pdNo, productName, price, imageUrl|null,
                  qtyUpperBound, locations: [{floor,zone}] }
```

서버 파이프라인(전부 읽기 전용):

1. `SearchGoods(keyword)` — `cntPerPage=30`, 1페이지. `isStoreCarryableBaseDoc`(MASTER_PD_NO 빈 값 &&
   onlyOnlYn≠"Y")로 거른다. Flow 1과 같은 fail-open 규칙.
2. `excludePdNo`와 같은 pdNo 제거. 빈 pdNo·빈 이름 행 제거.
3. `selStrPkupStck` **배치 1회** `[{pdNo, strCd}]` → `Number(stck) > 0`만 남긴다. Flow 1과 동일하게
   `stck>0`이 `sleStsCd`보다 우선한다. vendor 순서 보존, 재정렬 금지.
4. 앞에서부터 최대 **3개**의 `selIntPdStDispInfo`를 병렬 조회. `zoneNo` 빈 행은 위치 없음.
   - 한 후보의 위치 호출 실패 → **그 행만 omit**, 다음 후보로 backfill하지 않는다(질의 상한 유지).
   - 3개 전부 위치 호출 실패 → 502(슬롯 실패). "없다"고 말할 수 없다.
   - 200 + 빈 `data[]` → 위치 없음 → omit.
5. `rows`는 위치가 있는 행만. `omitted` = 재고는 있었지만 게시할 수 없었던 후보 수.

클라이언트 어댑터 `src/adapters/daisomall/alternativeRepository.ts`:

- 응답을 신뢰하지 않는다. 객체·배열·필드 타입을 검증하고, 형식이 깨진 **행**은 omit, payload 자체가
  깨지면 throw(→ 슬롯 실패).
- `rows.length === 0 && omitted === 0` → empty. `rows.length === 0 && omitted > 0` → failed
  (찾았지만 게시할 수 없다 — `이 매장에는 비슷한 상품이 없어요`는 거짓).
- 어댑터는 `SimilarAlternative[]`를 돌려주고, 파이프라인이 완료 시각 `observedAt`을 붙인다.

### 2.2 Group B — port·mock만 (live withheld)

```ts
interface NearbyQuery {
  store: StoreContext;    // anchor: current store
  pdNo: string;
}
interface NearbyAlternative {
  strCd: string; strNm: string; distanceM: number;
  address: string; closingTime: string; // "22:00"
  closedToday: boolean;                 // hldyDt semantics confirmed? until then mock only
  qtyUpperBound: number;
}
```

- live 어댑터는 `selStr` 근처 모드(`keyword:""`, `srchYn:"N"`, `curLttd/curLitd` = 현재 매장 좌표) →
  `directYn==="Y"` → 같은 pdNo 배치 재고 → `qty>0` → `km` 오름차순, open 먼저/closed 나중, ≤3.
  **코드는 작성하되 composition에 등록하지 않는다**(`NEARBY_LIVE = false`).
- 프로덕션 표면은 `nearby: { status: 'withheld' }`를 받는다. withheld 슬롯은 **아무 것도 렌더하지 않는다** —
  empty도 failed도 아니다. 주장하지 않는 것이 계약이다.
- 해제 체크리스트(모두 충족 시 스위치): ① `hldyDt` open/closed 의미를 복수 샘플로 확인 ② 판매종료가
  store-scoped인지 확인(A7) ③ nearby 임계값 확정(§7 열린 항목, 미정이면 공유 6h) ④ 실 좌표/거리 스모크.

### 2.3 서버 실패 매핑

- SearchGoods/stock/전체 위치 실패 → 502. 클라이언트는 2s 타임아웃·비정상 응답·502를 모두 슬롯 `failed`로
  접는다. 성공을 날조하지 않는다.
- 타임아웃은 클라이언트가 소유한다(2s, AbortController). 서버 타임아웃에 의존하지 않는다.

### 2.4 `pdNo` identity

`AvailabilityAnswer`의 모든 kind에 optional `pdNo?: string`을 추가한다. `RawStoreObservation.pdNo`가
이미 있으므로 `mapStoreObservation`이 그대로 싣는다. 이유: B의 "같은 pdNo" 계약, 통짜 캐시 키의 exact
identity. 없으면 B를 발행하지 않는다. Flow 1 판정·카피·6상태는 불변.

## 3. 통짜 캐시와 신선도

- **캐시 단위 = 답 전체**(발행된 두 그룹 + 관측 시각 + 발행 집합). 그룹 하나만 저장·서빙하지 않는다.
- 키: `${strCd}:${pdNo ?? keyword}`. 값에 `issued`를 함께 저장하고, 서빙 시 진입의 `issued`와 **정확히
  일치**할 때만 쓴다. 판매종료(A only) 진입이 A+B 캐시를 받는 일을 막는다.
- 저장: 발행된 모든 슬롯이 `ready|empty`로 끝난 **성공한 답**만. `failed`가 하나라도 있으면 저장하지 않는다.
  저장은 렌더 크리티컬 패스 밖(background)이다.
- 서빙: 발행된 모든 슬롯이 `failed`이고 일치하는 캐시가 있을 때만. 캐시 답은 **항상 Partial** —
  스탬프는 캐시 쓰기 시각이고 `방금`이라고 말하지 않는다. 임계값을 넘으면 stale 문장이 스탬프를 대체한다.
- 한 슬롯만 실패하고 다른 슬롯이 live면 **캐시를 섞지 않는다** — 실패 슬롯 + slot-scoped retry.
- 단일 발행 진입(판매종료)에서 그 하나가 실패하면 "쌍의 실패"로 본다 — 캐시가 있으면 Partial, 없으면 Error.
- TTL 없음. 수명은 신선도 정책이 정한다. 매장 변경 시 스택과 함께 버린다(키 스코프가 이미 분리하지만,
  `CHANGE_STORE`에서 명시적으로 clear).
- **스탬프는 답 전체에 1회**, 화면에 있는 관측 중 **가장 오래된 시각**. live 쌍이면 두 완료 시각의 최소,
  캐시면 쓰기 시각. 모든 발행 슬롯이 settle되기 전에는 스탬프를 **렌더하지 않는다**(조기 스탬프는
  아직 없는 주장을 덮는다).
- 임계값은 Flow 1·2와 공유하는 provisional 6h(`defaultPolicy.stalenessThresholdMs`). nearby 전용
  임계값은 미정 — 정해지기 전까지 공유값(Engineering §7).

## 4. 질의 파이프라인

`src/ui/alternative/alternative-query.ts` — 주입된 repo/clock/signal, 순수.

- 두 질의는 **병렬**, 배리어 없음. 슬롯은 고정 순서(lead 먼저, 그다음 second)로 DOM에 있고, 먼저 답한
  슬롯이 먼저 채워진다. 순서는 답이 와도 바뀌지 않는다.
- 슬롯 결과: `pending | ready(rows) | empty | failed | withheld`.
- 타임아웃 2s. throw·abort·timeout·형식 위반 → `failed`. `finally`에서 타이머 정리.
- 트리거: 진입, app resume(`visibilitychange` → visible), pull-to-refresh, Error `다시 시도`,
  slot-scoped retry, stale `다시 시도`. **주기 타이머 없음.**
- pull·resume 새로고침은 **기존 행을 지우지 않는다.** 성공하면 조용히 교체하고 스탬프를 갱신, 실패하면
  기존 행을 유지한 채 스탬프만 늙힌다. 임계값을 넘으면 stale Partial.
- slot-scoped retry는 **그 슬롯만** 재질의한다. 성공 그룹은 재조회·재렌더하지 않는다.
- Error 재시도는 진입 매트릭스가 발행하는 것을 전부 재질의한다.

## 5. 표면 상태

`src/ui/alternative/AlternativeSurface.tsx` (UI-shell). 6상태 어휘를 재사용하되 reducer는 건드리지 않는다.

### 5.1 슬롯 → 화면

발행 슬롯이 모두 settle된 뒤:

| 조건 | 화면 |
|---|---|
| 하나라도 `ready(rows>0)` | **Default/Partial rows** — 행 + 나머지 슬롯의 empty/failed/withheld 표기 |
| 행 0 + 하나라도 `failed` | **Error** — `대안을 불러오지 못했어요.` + `다시 시도` + `직원에게 문의해 주세요.` |
| 행 0 + (`empty` + `withheld`) | **Empty (degraded)** — empty 슬롯의 한 줄을 L1 문장으로, 사다리에서 mall 제외 |
| 행 0 + 전부 `empty` | **Empty** — 양쪽 발행이면 `이 매장과 근처 매장 모두에서 찾지 못했어요.`, 단일 발행이면 그 슬롯의 empty 문장. mall은 양쪽 발행일 때만 |
| 전부 `withheld` | 도달 불가 — 그 진입 CTA를 열지 않는다 |

- **Loading**: 하나라도 `pending`이면 skeleton. context header는 즉시(데이터 in-hand). 공유 진행 문장은
  pending이 하나라도 있는 동안 1회. 스탬프 없음. 전체 화면 스피너 금지.
- skeleton은 슬롯당 3행 높이를 예약해 두 번째 답이 와도 **이미 렌더된 그룹이 움직이지 않게** 한다.
  그룹 순서·DOM 위치는 고정.
- `ready`인데 0행은 존재하지 않는다(empty로 접는다).
- **Partial a**: empty 슬롯은 한 줄만, 추가 공간을 쓰지 않는다. 이름을 붙이고 조용히 지우지 않는다.
- **Partial b**: failed 슬롯은 실패 문장 + **슬롯 안 retry 텍스트 액션**. 화면 Primary가 아니다.
- **Partial c**: 캐시 답. 스탬프 자리에 상대 시각, 임계값 초과면 stale 문장.
- **Partial d**: closed-today 행은 `오늘은 휴무예요`를 영업시간 자리에, open 뒤로 정렬. open이 3행을
  못 채울 때만 등장. closed만 재고가 있으면 branch는 empty가 아니다.
- **withheld + ready rows**: withheld 슬롯은 렌더하지 않는다. 행이 있는 화면은 그대로 Default.
- **withheld + empty**: 위 표의 degraded Empty. mall을 빼는 이유: mall의 계약 조건은 "이 매장과 근처
  매장 모두에서 불가"인데, withheld는 근처를 확인하지 않았다는 뜻이므로 조건이 성립하지 않는다.
- **failed + empty(행 0)**: Error. `이 매장에는 비슷한 상품이 없어요`라고 말할 수 없고(다른 슬롯을
  확인 못 했으므로), Empty 사다리도 열 수 없다. retry가 실패 슬롯만 재질의해 empty로 끝나면 Empty.
- **캐시 + 양쪽 empty**: Empty 본문/사다리를 렌더하되 스탬프 자리에 캐시 시각(필요 시 stale 문장)을 넣는다.
  mall은 캐시의 `issued`가 양쪽일 때만. 이 조합은 Bible에 레이아웃이 없어 앱 초안으로 기록한다.

### 5.2 store card

- Group B 행 탭 → 이 흐름의 terminal 화면. `강남역점에 있어요 · 1.2km` / 주소 / 영업시간(또는
  `오늘은 휴무예요`) / 답 전체의 스탬프.
- 주소는 지도 앱 handoff. 확인 요청·여행 관측 없음. Success 색 없음.
- back은 목록, 포커스는 탭한 B 행.

### 5.3 접근성

- 읽기 순서 = context header(상품명 → 이유) → lead 그룹 heading → 행 → second 그룹 heading → 행 →
  스탬프 → 사다리. 시각 위계와 정확히 일치.
- 각 행은 `<button>` 하나, `aria-label`은 **행의 결정 전체**를 읽기 순서대로: 상품명·가격·위치(또는
  매장명·거리·영업·재고). 사진 alt는 상품명(계약)이나 버튼 `aria-label`이 이름 계산을 덮는다.
- 모든 터치 타깃 ≥44×44, 간격 ≥8px: 행, slot retry, 사다리 행, `다시 시도`, 주소, back.
- `오늘은 휴무예요`는 텍스트. 색·아이콘 단독 금지.
- 라이브 리전: 진입 시 진행 문장 1회. 슬롯이 settle되면 empty/failed 문장 또는 그룹 heading. 최종
  Empty/Error는 본문 1회. 같은 문자열 중복 낭독 금지.
- 200% 확대에서 행 wrap, heading·스탬프 truncate 금지. reduce-motion이면 전환 즉시 컷.
- axe serious/critical 0 (light/dark).

## 6. 카피

### 6.1 Bible verbatim (새로 추가되는 줄)

| 위치 | 문장 |
|---|---|
| 이유 | `지금은 품절이에요` / `판매가 끝난 상품이에요` / `이 매장에서는 팔지 않는 상품이에요` / `가맹점이라 재고를 확인할 수 없어요` / `선반에서 찾지 못했어요` |
| A heading | `이 매장에 있는 비슷한 상품` |
| B heading | `이 상품이 있는 근처 매장` |
| B 행 | `강남역점 · 1.2km · 오후 10시까지 영업 · 재고 있어요` |
| B 휴무 행 | `강남역점 · 1.2km · 오늘은 휴무예요 · 재고 있어요` |
| Loading | `비슷한 상품과 근처 매장 재고를 확인하고 있어요…` |
| A empty | `이 매장에는 비슷한 상품이 없어요.` |
| B empty | `근처 매장에는 재고가 없어요.` |
| B failed | `근처 매장 재고는 확인하지 못했어요. 다시 시도해 주세요.` |
| stale | `오늘 재고는 확인하지 못했어요 — 어제 오후 6시 기준이에요.` |
| Empty | `이 매장과 근처 매장 모두에서 찾지 못했어요.` |
| 사다리 | `다이소몰에서 주문할 수 있어요.` / `다른 이름으로 다시 검색해 보세요.` / `직원에게 문의해 주세요.` |
| Error | `대안을 불러오지 못했어요.` + `다시 시도` + `직원에게 문의해 주세요.` |
| store card | `강남역점에 있어요 · 1.2km` / 주소 / `오후 10시까지 영업` / `방금 확인한 재고예요` |

- A 행은 `상품명 · 가격 · 11층 56번`, low일 때만 ` · 재고 N개 이하`(Flow 1과 같은 상한 표기).
- 스탬프 `방금 확인한 재고예요`는 Flow 1 `LIVE_FRESHNESS_CAPTION` 재사용. B 행 재고는 숫자가 아니라
  `재고 있어요`(Bible 카피).

### 6.2 앱 소유 초안 (비준 대기)

- **A failed**: `비슷한 상품은 확인하지 못했어요. 다시 시도해 주세요.` — Bible에 A 실패 문장이 없다.
  B failed의 대칭. `open-questions §B50`에 비준 대기로 고정.
- slot retry 라벨: `다시 시도`(Bible Error CTA 재사용).
- 거리: `km>=1` → `1.2km`(소수 1자리), `km<1` → `850m`(정수 m). Bible 예시는 km만 고정.
- 영업시간: `clsngTime "22:00"` → `오후 10시까지 영업`; `closedToday` → `오늘은 휴무예요`.
- 지도 링크 접근 이름: `{주소} — 지도 앱에서 열기`.
- `pdNo` identity·캐시 키·슬롯 모델은 앱 내부 결정(카피 아님).

### 6.3 English twins

D068/D069대로 모든 줄에 en 쌍을 둔다. 상품명·매장명은 한국어 matchable token 그대로, 숫자 표기는 동일.

## 7. 지도 handoff

`mapHref(address, platform)` 순수 함수:

- iOS → `https://maps.apple.com/?q=<encoded>` (universal link, 기본 지도 앱)
- Android → `geo:0,0?q=<encoded>`
- 그 외 → `https://map.kakao.com/link/search/<encoded>` (웹 폴백)
- 실패·href 없음 → 주소는 텍스트로 그대로 보인다. 편의만 잃고 정보는 잃지 않는다(Engineering §6).
- `target="_blank" rel="noopener noreferrer"`. 실기기 필드 검증 항목(D5 아님, 별도 관측).

## 8. Empty 사다리

순서 고정: 재입고 알림 → 다이소몰 → 재검색 → 직원.

- **재입고 알림은 P3에서 렌더하지 않는다.** 구독 API가 미관측(Engineering §11)이고, 데이터가 "제공할 때"
  만 나오는 요소다. Primary 색 예산도 이 동안 비어 있다.
- **다이소몰은 양쪽 branch가 발행되어 둘 다 empty일 때만.** withheld·단일 발행·캐시 issued 불일치에서는
  렌더하지 않는다. `https://www.daisomall.co.kr/`(관측 호스트)로 이동하며 Primary 색을 절대 받지 않는다.
- **재검색**: Flow 1로 돌아가 검색 인풋을 원래 키워드/상품명으로 채우고 포커스한다. 자동 재제출 없음
  (같은 실패를 반복하지 않는다).
- **직원**: 상호작용 없는 텍스트 행. 가짜 링크를 만들지 않는다.
- Empty는 Error가 아니다: Error 색·사과 문구 없음, 중립 스타일.

## 9. 검증

- **단위**
  - 진입 구성 6종(이유·issued·lead·keyword·pdNo), inStock/restockArriving에서는 진입 없음.
  - 어댑터: vendor 순서, qty>0, exclude, ≤3, 위치 없는 행 omit, `omitted>0 && rows=[]` → failed,
    payload 형식 위반 → throw.
  - 캐시: 성공 시 저장, 실패 포함 시 미저장, issued 불일치 거부, 전부 실패 시만 서빙, stale 문장,
    TTL 없음, 매장 변경 clear.
  - 파이프라인: 2s 타임아웃·abort·형식 위반 → failed, slot retry는 그 슬롯만, pull은 발행 전부,
    주기 호출 0(가짜 시계 10분), 스탬프 = 가장 오래된 관측, settle 전 스탬프 없음.
  - 표면: §5.1 표의 각 행, withheld는 아무 것도 렌더하지 않음, degraded Empty는 mall 없음,
    failed+empty → Error, 캐시 both-empty, store card, back 포커스 3종, aria-label, 44px 클래스 가드.
  - 카피: verbatim 잠금 + en 쌍.
- **RTL**: Default(A only / A+B), progressive(A 먼저), A empty, A failed+retry, B closed, Empty,
  degraded Empty, Error, cached partial, store card, back 포커스.
- **E2E** (`test/e2e/alternatives.spec.ts`, DEV 하네스 `?alt=`):
  `default`(A만), `nearby`(A+B, closed 1), `aEmpty`, `aFailed`, `bothEmpty`, `bothFailed`,
  `withheldEmpty`, `slow`(skeleton), `bSlow`(progressive). 진입: Flow 1 일시품절·판매종료, Flow 2
  soldOut·recoveryStill. store card 주소 링크, back 2단, 재검색 handoff.
- **axe**: Default(A), nearby rows, Empty, Error, store card × light/dark.
- **게이트**: tsc clean, biome clean, coverage 임계값 유지(내리지 않음), build ≤240 kB/78 kB(예외),
  Playwright 전건.

## 10. 결정과 에스컬레이션

| ID | 결정 | 근거 |
|---|---|---|
| B50-1 | Flow 3는 UI-shell 스택(`storeCard > navigation > alternative > UiState`), reducer 불변 | 6상태 계약 유지, Flow 2와 같은 패턴 |
| B50-2 | 프로덕션은 A만 발행. 미취급·가맹점 CTA는 inert 유지, Flow 2 exit는 연다 | nearby 데이터 게이트(D3·`hldyDt`)와 CTA 라벨 정합 |
| B50-3 | A = SearchGoods 30 → stock 배치 1회 → 앞 3개 위치 병렬, no backfill | 계약의 vendor 순서·3행 바운드·2s 예산 |
| B50-4 | 통짜 캐시 + issued 일치 + 성공 답만 저장 + 전부 실패 시만 서빙 | Engineering §5·§6, 혼합 live/cache 금지 |
| B50-5 | 스탬프 = 가장 오래된 관측, 모든 발행 슬롯 settle 전에는 미표시 | Engineering §7, 조기 주장 금지 |
| B50-6 | 행 0 + failed = Error, withheld+empty = degraded Empty(mall 제외) | Bible에 없는 조합 — 거짓 empty/mall 주장 회피 |
| B50-7 | A 실패 카피 초안 + slot retry `다시 시도` | B 실패 문장의 대칭, Bible 비준 대기 |
| B50-8 | 재입고 알림은 P3 Empty에서 미렌더 | 구독 API 미관측(Engineering §11), Primary 색 예산 |
| B50-9 | 지도 handoff는 platform-aware `mapHref` + 카카오 웹 폴백 | D066 경계, 실패해도 주소 텍스트 유지 |
| B50-10 | `AvailabilityAnswer`에 optional `pdNo` 추가 | B의 exact identity, 캐시 키 |
| B50-11 | P3 예외 상한 240 kB / gzip 78 kB, 정본 220/72 유지 | §0 참조, P4 전 분할/재비준 |

**Bible 에스컬레이션(열린 질문)**: ① D5 — nearby 부재 시 Flow 2 exit·미취급/가맹점 진입의 임시 형태
(현재: exit는 A만, 두 CTA는 inert) ② A 실패 카피 비준 ③ withheld+empty 열화(단일 branch empty)의 정본
형태 ④ 행 0 + failed/empty 혼합의 Error 판정 ⑤ 캐시 both-empty에서 스탬프 위치 ⑥ nearby 임계값·`hldyDt`
의미(A7/A8, 데이터) ⑦ 지도 handoff 실사용 관측.

## 11. 이번에 하지 않는 것

- nearby live adapter 등록, `hldyDt` 클레임, 닫힌 매장 정렬 프로덕션 노출.
- 재입고 구독 API, 다이소몰 상품 딥링크, Success 연출.
- 유사도 모델·재정렬·추천(Anti-goal 2, Engineering §9).
- 정렬·필터 UI, 3행 초과, 그룹 탭/병합(Interface §2에서 기각).
- §B47 쇼핑리스트 확장(동결).
