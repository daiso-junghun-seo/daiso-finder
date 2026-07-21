# Store API Observations — A9/A8 Escalation Input

> **목적**: owner가 제공한 다이소몰 라이브 API 관측을 누적 기록한다. **이건 관측 증거이지 결정이 아니다.**
> 정본 엔드포인트·요청/응답 스키마·인증·프록시 방식은 **Bible 세션에서 data-contract에 기록**된 뒤에만
> 앱이 소비한다(CLAUDE.md §3, open-questions §A9). 여기서 임의 배선하지 않는다.
>
> **보안**: 실제 Bearer 토큰·`x-dm-uid` 값은 여기 기록하지 않는다(민감). 인증은 "Bearer(익명 JWT) + X-DM-UID
> 필요"라는 **구조**만 남긴다. 토큰 발급 메커니즘 상세는 `.claude/skills/k-skill/daiso-product-search/SKILL.md` 참조.

최종 갱신: 2026-07-21 (owner 라이브 캡처).

## 호스트 계열 (미정합 — Bible 판단 필요)

세 계열이 관측됨. 정본 미확정:
- `fapi.daisomall.co.kr` — 앱/모바일 API 호스트. **owner 라이브 캡처 대부분 여기**. 분리된 엔드포인트 + Bearer.
- `mapi.daisomall.co.kr/ms/msg/*` — Bible 관측(`newIntSelStr`, 상품+위치 번들, §data-contract).
- `www.daisomall.co.kr/api/*`, `/ssn/search/*` — k-skill 관측(웹 표면).

## 엔드포인트 인벤토리 (fapi, 2026-07-21 관측)

| 용도 | 메서드·경로 | 요청 바디 | 인증 | 응답 |
|---|---|---|---|---|
| **매장** | `POST /ms/msg/selStr` | `{"inclusiveStrCd":"10803"}` | 쿠키(Bearer 없음) | ✅ 아래 |
| 인증 | `GET /auth/request` | — | — | 익명 JWT + `x-dm-uid`(30s) — 메커니즘은 k-skill SKILL.md |
| **재고+상태** | `POST /pd/pdh/selStrPkupStck` | `[{"pdNo","strCd"}]`(배치) | Bearer + X-DM-UID | ✅ 아래 (`stck`+`sleStsCd`) |
| **위치(진열)** | `POST /pdo/selIntPdStDispInfo` | `{"pdNo","strCd"}` | Bearer + X-DM-UID | ✅ 아래 |

### `selIntPdStDispInfo` 응답 (확보)

요청 `{"pdNo":"1070646","strCd":"10803"}` →

```json
{"message":null,"data":[{"zoneNo":"30","stairNo":"-1","storeErp":"10803"}],"extraData":{},"extraString":null,"returnCode":null,"success":true}
```

제안 매핑(Bible 확정 대상): `stairNo`→`StoreLocation.floor`, `zoneNo`→`StoreLocation.zone`, `storeErp`→`strCd`,
`data[]`→`StoreLocation[]`. **`data[]`가 이미 `{stairNo,zoneNo}` 쌍으로 오므로 newIntSelStr의 positional-zip 불필요**
(엔드포인트마다 위치 형태가 다름 → 어느 게 정본인지 Bible 판단).

### `selStr` 응답 (확보) — 매장 상세

요청 `{"inclusiveStrCd":"10803"}` → `data:[{…}]` (매봉역점). Bible §3 store-identity/hours/geo/facilities/type와 1:1:

```json
{"strCd":"10803","strNm":"매봉역점","strZip":"06297","strAddr":"서울 강남구 남부순환로 2748","strDtlAddr":null,"strTno":"1522-4400","opngTime":"10:00","clsngTime":"22:00","hldyDt":null,"strLttd":37.4866152698895,"strLitd":127.047198914992,"km":"13183.1","directYn":"Y","useYn":"Y","elvtYn":"Y","entrRampYn":"N","parkYn":"Y","pkupYn":"Y"}
```
(전체 필드 중 발췌; `pntAcmYn`·`nmtkYn`·`usimYn` 등 몰/부가 플래그 다수 동반.)

- **`strLttd`=위도(latitude), `strLitd`=경도(longitude)** — 값으로 확정(강남 ≈ 위도 37.5/경도 127.0). **open-questions §A8의 "curLitd/strLitd 철자(경도?) 미확인" 을 관측으로 해소**(Bible 확정 대기).
- **`km`(거리, string)는 요청에 사용자 좌표가 없으면 쓰레기값**(여기 `"13183.1"`). D082 거리순은 요청에 `curLttd/curLitd` 필수(Bible newIntSelStr 요청 키와 정합).
- **`directYn`=`Y`(직영)** — 6상태 `franchiseUndeterminable`(=`N`) 판정 입력. 여기 소스 = `selStr`.
- 매핑: `strCd·strNm`→`StoreContext`, `strLttd/strLitd/km`→거리/근처, `directYn`→franchise 게이트.

### `selStrPkupStck` 응답 (확보) — 재고 + 판매상태

요청 `[{"pdNo":"1070646","strCd":"10803"}]`(배치) →

```json
{"message":"success","data":[{"pdNo":"1070646","strCd":"10803","sleStsCd":"1","stck":"6"}],"success":true}
```

- **`stck`=`"6"`(재고 수량, string)** → Bible §4 `qty` 역할. `qty>0`→inStock.
- **`sleStsCd`=`"1"`(판매상태 코드)** → `"1"`=정상판매로 관측. Bible §4 매핑: `"9"`→discontinued, `null`→(직영 시)notCarried. **전체 코드 열거는 미완**(§A8).
- 이름은 "Pkup(픽업)"이지만 실제로 **매장 재고 + 판매상태**를 반환 — 6상태 핵심 두 입력. 위치는 여기 없음(→ `selIntPdStDispInfo` 별도).
- 배치 in/out: 요청 배열 ↔ 응답 `data[]` 대응.

### `SearchGoods` 응답 (확보) — 상품 검색 / ProductIdentity

호스트 **`www.daisomall.co.kr`**(fapi 아님). `GET /ssn/search/SearchGoods?searchTerm={키워드}&pageNum=1&cntPerPage=30&mallId=MALL_MAIN&…`(쿠키, Bearer 없음). 검색엔진식 응답(Solr류): 상단 `resultSet.result[].groupResult`=패싯, `data.typo-correct-result`=오타교정, `cfRecommendResultSet`=추천. **상품 목록 경로 = `resultSet.result[].resultDocuments[]`.** 문서당 핵심(발췌):

```json
{"pdNo":"19987","pdNm":"웰빙 쉐이크볼 350ml","exhPdNm":"웰빙 쉐이크볼 350ml","pdPrc":"1000","brndNm":"","sleStsCd":"03","soldOutYn":"N","onlyOnlYn":"N","ONL_STCK_QY":"191","exhLargeCtgrNm":"주방용품","MASTER_PD_NO":"","pdImgUrl":"/file/PD/…"}
```

- **ProductIdentity 확보**: `pdNo`·`pdNm`(=`exhPdNm`)·`pdPrc`(가격, string 원). → Engineering §4 catalog-subset 심을 이 응답이 채움.
- **⚠️ `sleStsCd` 이중 의미(중요)**: 여기 SearchGoods는 `"03"`(온라인/카탈로그 판매상태), `selStrPkupStck`는 `"1"`(매장 판매상태) — **코드 체계가 다름**. Bible §4 6상태는 **매장 컨텍스트(selStrPkupStck)** 의 sleStsCd를 써야 함. 두 필드를 혼동 금지 → data-contract에서 명시 분리 필요.
- `onlyOnlYn:"Y"`=온라인 전용(매장 미취급 후보), `soldOutYn`/`ONL_STCK_QY`=**온라인** 품절/재고(매장 재고 아님 — 매장은 selStrPkupStck). `MASTER_PD_NO`≠""인 `B…` 항목은 대량/온라인 변형(base pdNo로 접힘).
- 매핑: `pdNo`→쿼리 키(→ selStrPkupStck/selIntPdStDispInfo), `pdNm`→`productName`, `pdPrc`(number 변환)→`price`. 매장 상태·재고·위치는 별도 엔드포인트에서.

## Bible/data-owner가 확정해야 할 미해결 항목

1. **매장 검색(A9) 정본 — 여전히 열림**: fapi `selStr`은 `{inclusiveStrCd}`(매장 **코드**)로 부르는 **매장 상세**지 이름 검색이 아님. 매장명("매봉역점")→코드(10803) 해석하는 **매장 검색**은 미확보 — `FindStoreGoods`(www 통합검색) 또는 k-skill `selStr*`/`selStrSrchKeyword`(www) 응답 필요.
2. **6상태 판정 소스 — 대부분 해소**: `qty`(=`stck`)+매장 `sleStsCd`←`selStrPkupStck` ✅, `directYn`←`selStr` ✅, 위치←`selIntPdStDispInfo` ✅, **상품명·가격·pdNo←`SearchGoods`** ✅(ProductIdentity). **남은 것**: `mrkGdsYn`/`lchDay`(입고예정) 소스 불명. **`sleStsCd` 코드 체계 확정 필요 — 두 곳에서 다름**: SearchGoods=`"03"`(카탈로그), selStrPkupStck=`"1"`(매장); 6상태는 매장 값 사용. 각 코드 전체 열거는 data-owner.
3. **재고 종류**: `selStrPkupStck`가 `stck`+`sleStsCd`를 함께 반환 → Flow 1 가용성 소스로 성립(이름의 "Pkup"과 달리 매장 재고+판매상태). `stck`이 진열 재고인지 픽업예약 가능수인지만 라이브 확인.
4. **인증 스코프**: 어느 엔드포인트가 Bearer 필수인지(위치·재고는 필수, 매장 selStr은 쿠키만?).
5. **호스트 정합** + **프록시 설계**: fapi/mapi/www 다중 업스트림, 인증(익명 JWT+AES+uid)은 **서버(CF Worker)에서** 처리, 클라이언트는 내부 `/api/*`만(B10/B11 재검토).
6. **ToS/robots**: 익명이어도 anti-abuse 게이트 우회이므로 이용약관 확인.

## 관측된 실 데이터 엣지 (앱 영향)

- `stairNo:"-1"` = **지하층**. 앱 `formatLocation`의 `${floor}층`이 "-1층"으로 오표기 → 지하 표기 규칙 필요(Bible 카피 확인). A9 배선 시 formatter 수정 대상.
