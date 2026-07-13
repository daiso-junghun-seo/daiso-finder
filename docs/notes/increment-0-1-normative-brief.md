# Increment 0+1 규범 브리핑 (Normative Brief)

> **성격: 파생 읽기 보조 문서 — 권위 아님.** 제품 요구·플로우·데이터 계약의 **정본(SSOT)은 Product Bible**(`../product-bible`, read-only)입니다. 이 문서는 Bible을 병렬 정독해 Increment 0+1 착수에 필요한 컨텍스트를 **링크·인용·종합**한 것일 뿐이며, **Bible과 충돌하면 무조건 Bible이 이깁니다.** 여기 적힌 것을 새 권위로 취급하거나 여기서 스펙을 확장하지 마세요. 갭·모순 발견 시 → [open-questions.md](open-questions.md) 절차.
>
> 생성: 2026-07-13, 8개 병렬 리더가 Bible 규범 문서를 정독 후 종합. 경로는 모두 **저장소 루트 기준 상대경로**.

---

## 0. 규범 소스 맵 (먼저 읽을 것 — 정본)

| 영역 | Bible 문서 | 상태 |
|---|---|---|
| 제품 개요·안티골·문서맵 | `../product-bible/06_Product/daiso-companion/INDEX.md` | 권위 |
| 대상 쇼퍼(페르소나)·가설 | `../product-bible/06_Product/daiso-companion/Human/INDEX.md` | 가설(미검증) |
| Foundation 원칙·규칙·질문정책 | `../product-bible/00_Foundation/` + `../product-bible/PROJECT_BOOTSTRAP.md` | Canon |
| **데이터 계약(관측)** | `../product-bible/06_Product/daiso-companion/Engineering/data-contract.md` | Draft · Evidence Level 2 |
| Flow 1 경험 | `../product-bible/06_Product/daiso-companion/Experience/availability-check.md` | Review |
| Flow 1 인터페이스(6상태·최종 카피) | `../product-bible/06_Product/daiso-companion/Interface/availability-check.md` | Review |
| Flow 1 엔지니어링 계약 | `../product-bible/06_Product/daiso-companion/Engineering/availability-check.md` | Draft(게이트 없음) |
| Flow 1 AI 계약(검색어 해석) | `../product-bible/06_Product/daiso-companion/AI/availability-check.md` | — |
| Flow 2 엔지니어링(Inc 2, 심 참고) | `../product-bible/06_Product/daiso-companion/Engineering/in-store-navigation.md` | Draft · **D078 비준** |
| Flow 3 엔지니어링(Inc 3, 심 참고) | `../product-bible/06_Product/daiso-companion/Engineering/alternative-discovery.md` | Draft · **D078 비준** |
| 킥오프 스펙(차터, 비규범) | `../product-bible/docs/superpowers/specs/2026-07-13-daiso-finder-kickoff-and-workspace-design.md` | 세션 스펙 |

**권위 순서**: PROJECT_BOOTSTRAP > 00_Foundation > 01~05 챕터 > 06_Product. 상위가 하위를 지배하고, 하위는 구체화만 할 뿐 절대 뒤엎지 못함. 상태 모델: **Canon만 권위**, Draft=비권위, Review=아직 비권위, Log=append-only. (엔지니어링 계약은 Review 게이트가 없어 Draft여도 owner 비준 후 구현 가능 — D059/D076/D077 선례.)

---

## 1. 구속 제약 (Binding Constraints) — 협상 불가

1. **읽기 전용**: 재고·거래를 변형하지 않는다. 결제·체크아웃·재고 뮤테이션은 POS 계열의 몫. 경계를 넘는 미래 요구는 확장이 아니라 **새 제품 정의**를 트리거. (INDEX §7)
2. **익명·무로그인 첫 답 (Anti-goal 4)**: 첫 질문은 최초·익명 사용자가 답 가능해야. 답 이전 로그인/온보딩/게이트/인터스티셜/프로모션 **금지**. 유일 로그인 벽 = **재입고알림(답-이후 액션)**.
3. **오프라인/약전파 = 1차 설계 대상** (엣지케이스 아님): 캐시-서브셋이 오프라인 답 경로이자 주 타깃. **모든 상태에서 빈 화면 금지**, 캐시-서브 답은 네트워크 왕복 의존 금지.
4. **낙관적 UI 금지 (이 제품 고유 확장 규칙)**: 가용성은 **보고(report)하되 추정 금지**. 신호 결손 → Partial, 조작된 Success 금지. stale/캐시 답은 항상 라벨. (Canon은 금융·재고-뮤테이션에만 금지하지만, 이 제품은 읽기 전용 가용성 표시까지 확장.)
5. **매칭 토큰 번역·대체 금지 (D069)**: 물리 세계와 MATCH해야 하는 토큰(Korean 상품명, 숫자 층·존)은 세계가 렌더하는 대로 유지. 이해용 텍스트만 사용자 언어. 번역은 **주석(annotate)만, 대체 금지**.
6. **다운스트림 계약 수용 (Inc 0 골격이 미리 지켜야)**: 리프레시는 **절대 주기 타이머 금지** (진입/앱 재개/pull-to-refresh/`못 찾겠어요` 1회만 — D077). **도착 감지는 존재하지 않는 의존성** (실내 측위 없음 — 대기·폴링·추론 금지). Flow 3 결과 **재랭킹 금지** (벤더 매치 순서 + open-before-closed·km 오름차순만 — D076).
7. **저장소·세션 분리 + 참조 전용**: 앱 코드는 Bible에 섞이지 않음. Bible는 read-only 참조로만 소비(**복사 금지** — 드리프트·크로스레포 검증기 무력화). 스펙 갭은 앱에서 임의 패치 금지 → **Bible로 상향 에스컬레이션** 후 따른다.
8. **환경**: Windows 11 / PowerShell. Linux 경로·명령 예시 금지(상위 CLAUDE.md 상속). 답변=한국어, 코드·식별자·커밋=English, UX 카피=한국어.

---

## 2. 데이터 레이어 계약 — `newIntSelStr`

> 정본: [data-contract.md](../product-bible/06_Product/daiso-companion/Engineering/data-contract.md). **Evidence Level 2 = 단일 샘플 관측** (백엔드 계약 미보장). 구현 전 store-operations 데이터 오너와 확인 필수.

- **엔드포인트**: `POST https://mapi.daisomall.co.kr/ms/msg/newIntSelStr` — **3개 코어 플로우 전체의 단일 데이터 소스**.
- **요청 키(관측)**: `keyword, pdNo, curLttd, curLitd, geolocationAgrYn, pkupYn, intCd, pageSize, currentPage` (`curLitd`/`strLitd`는 관측된 철자 그대로 — 경도 추정, 미확인).
- **응답**: `data.msStrVOList[]` — 매칭 매장당 1엔트리, 매장 속성 + 쿼리 상품의 매장별 stock·location 동반.

### 2.1 모델링 필드

| 그룹 | 필드 |
|---|---|
| 매장 신원 | `strCd, strNm, strAddr, strZip, strTno, useYn, status` |
| 영업 | `opngTime, clsngTime, hldyDt` |
| 지리 | `strLttd, strLitd, km` |
| 시설(**존재 플래그만**) | `elvtYn, entrRampYn, parkYn` |
| 유형 | `directYn` (`Y`=직영 / `N`=가맹·유통) |
| 상품-매장 | `pdNo, sleStsCd, qty` |
| 위치 | `stairNoList[]`(층), `zoneNoList[]`(존) |
| 재입고 | `mrkGdsYn, lchDay` |
| mall 전용(**미사용·노출 금지**) | `pkupYn, bassPkupStrYn, pntAcmYn, pntUseYn, intUseYn` |

### 2.2 상태 시맨틱 (필드 → 상태)

| 조건 | 상태 | 카피(정본은 Interface) |
|---|---|---|
| `qty > 0` | in stock (상한) | `재고 {qty}개 이하` |
| `qty==='0' && sleStsCd!==null` | 일시품절 (재입고알림 제공) | `일시품절` |
| `sleStsCd==='9' && qty<1` | 판매종료 | `판매종료` |
| `sleStsCd===null && directYn==='Y'` | 미취급 | `해당 매장 미취급 상품` |
| `directYn==='N' && no zone/stair` | 가맹/유통점 재고 확인 불가 | `가맹/유통점은 재고 확인이 어렵습니다.` |
| `mrkGdsYn==='Y'` | 입고 예정 | `{lchDay} 전후 입고 예정` |

### 2.3 위치 시맨틱

- `stairNo → ${stairNo}F`(층), `zoneNo → ${zoneNo}번`(존). 둘 다 **리스트**로 도착 → 병합 이터레이션 → 한 매장에서 **복수 (floor,zone) 가능**. 룩업 테이블 없음(**원값이 표시값**). 벤더 그대로: `11층 56번`.
- **존 이름 없음**. 매대(shelf-unit) 번호는 별개 시스템·부재·**범위 밖** (D064). 시설은 존재만 (`엘리베이터가 있어요` 허용, `엘리베이터는 저쪽이에요` 금지).

### 2.4 존재하지 않는 것 (모델이 만들어내면 안 됨)

- **stock-update 타임스탬프** (`regDttm/modDttm/lsUpdtDtm`는 null 감사 컬럼 — 실시간 재고 접근 불가) → 그래서 신선도 = "우리 관측의 나이"(§4).
- 존 이름 · 실내 지오메트리(스트리트-레벨 Naver Maps 단일 마커만) · 실시간 보장.

---

## 3. 어댑터 심(Adapter Shim) Seams — 미해결 데이터-오너 항목 격리

> 코어를 **블로킹하지 않음**. 심 뒤에 격리 + mock. 데이터 오너 협의는 병렬. 상세 결정 추적: [open-questions.md](open-questions.md).

1. **판매종료 범위** (매장 vs 체인): Flow 3 discontinued 진입의 Group B(nearby) 발행을 게이트. 심은 **D076 매트릭스 재작성 없이 스위치** 가능해야.
2. **hldyDt**: 형식/시맨틱/오늘-휴무 신뢰도 미정의. 확인 전 `오늘은 휴무예요` 미출시.
3. **재입고 구독 API**: 엔드포인트/타임아웃/idempotency 미관측. 실패 방향만 고정(답 불변, 중복 탭 중복 구독 금지, 실패 평문·재시도). 로그인·답-이후.
4. **결손/불량 행**: 매장 행 미반환·부분 데이터(km/좌표/시간 결손) 처리 미정의. 방향만 고정(데이터가 못 받치는 클레임 렌더 금지).
5. **다국어 검색 별칭**: 데이터 오너가 **입력측 검색 별칭** 공급해야(번역 표시명 아님). data-contract.md엔 언급 자체 없음(스펙 갭). 미공급 시 비-Korean 쿼리가 Korean 카탈로그 도달 못 함.
6. **staleness 임계값**(cache age) + **저재고 컷오프**(qty): 값 미설정. Error↔Partial 경계·저재고 표시 계산에 필요. **심 뒤 설정 가능 값 + mock 플레이스홀더**.

> mall 전용 미사용 필드(`pkupYn` 등)는 심이 아님 — **읽기 경계 밖**, 어댑터 통과 없이 아예 노출 금지.

---

## 4. 신선도 모델 (D061 — RATIFIED)

- 신선도 = **"우리 관측의 나이"**, 매장 재고 카운트의 나이가 **아님**(소스가 후자를 노출 안 함).
- 라이브 답 → 쿼리 시각 스탬프(`방금 확인한 재고예요`). 캐시 답 → 캐시-쓰기 시각(`어제 오후 6시에 확인한 정보예요`).
- **staleness 임계값은 오직 캐시 나이에만 적용 — 라이브 답은 절대 강등 안 함.**
- 요청 실패 시 강등: 캐시 임계값 **이내** → Error(캐시 답 표시) / 임계값 **초과** → Partial(stale: 가격·위치 확정, 오늘 재고 미확정) / 캐시 **없음** → Error(재시도+직원 문의).
- 매장 카운트 시각을 암시하는 스탬프 조작 = **Confidence Theater로 금지**. 캐시 수명은 독립 TTL이 아니라 이 신선도 정책이 지배.
- Flow 3(Inc 3): 스탬프 1개가 화면상 **가장 오래된 관측**을 운반, 어떤 클레임의 신선도도 과장 금지.

---

## 5. Flow 1 — 6개 화면 상태 (Increment 1)

> 정본: [Experience §4](../product-bible/06_Product/daiso-companion/Experience/availability-check.md) + [Interface(최종 카피)](../product-bible/06_Product/daiso-companion/Interface/availability-check.md). **단일 표면 — 화면 네비 없음. 바뀌는 것은 화면이 아니라 위계.** 답 상태에서 답 카드=L1, 검색 바=L4. above-the-fold에 재고+가격+위치 스크롤 없이. 각 답 상태 = 확정 답 + **정확히 하나의 L2 다음-액션**. 데드엔드 금지(Anti-goal 5).

| 상태 | 요지 | 대표 카피/액션 |
|---|---|---|
| **Default** | 검색/스캔 입력 지배 | `이 매장에 있는지 바로 확인해 보세요` · 매장 컨텍스트 줄+`매장 변경` · `최근 검색`. 게이트/프로모션 없음 |
| **Loading** | submit<100ms skeleton 답 카드 | `이 매장 재고를 확인하고 있어요…` · >2s `연결이 느려서…` · 빈 화면/풀스크린 스피너 금지 |
| **Empty** | 카탈로그 매칭 없음(**에러 아님**) | 중립 톤 · 재검색/바코드 스캔/최대 3개 `비슷한 이름:` 교정 |
| **Error** | 요청 실패 | 캐시 있으면 `지금 연결이 원활하지 않아요. 마지막으로 확인된 정보를…`+스탬프 / 없으면 `…다시 시도하거나 매장 직원에게 문의…`+`다시 확인` |
| **Success** | 확정 답 | in stock(`이 매장에 있어요`+가격·위치+`방금 확인한 재고예요`+`위치 보기`) **또는** 4개 부정 답(일시품절→`대안 보기`+`재입고 알림` / 판매종료→`대안 보기` / 미취급→`근처 매장 보기` / 입고예정→`재입고 알림`) — **부정 답도 중립 강조, Error 색 금지** |
| **Partial** | Success 위장 금지 부분 답 | 3 트리거: 가맹점(직원+`근처 매장 보기` 둘째 엔딩 D071/D072) / 위치 없음(직원 문의+`다시 확인`) / stale 캐시(가격·위치 확정·오늘 재고 미확정+`다시 확인`) |

**진입 3경로 → 동일 답 카드**: 타이핑(AI 해석) · 바코드/선반라벨 스캔(무타이핑, 한 손 1차) · 최근 검색 탭. 검색/스캔 바 하단 도킹(썸존). 복수 위치는 `다른 위치 1곳 더 ▾`로 접힘.

**AI = 검색어 해석뿐** (certainty→display, 어미 load-bearing): High>90% 단일 best-match(`이에요/있어요`) / Medium 70–90% `이걸 찾으시나요?` 후보 최대 3(`인 것 같아요`) / Low<70% 리터럴+스캔(`수도 있어요`) / Unknown 직원 문의. **1s 타임아웃, 실패 시 리터럴 검색 무음 강등.** **비-AI 폴백(리터럴 검색+바코드 스캔)을 먼저 구축·검증(fallback-first)**, `직접 검색 결과 보기` 오버라이드는 항상 노출·즉시·영구.

---

## 6. 카피 / i18n 규칙 (D068 / D069)

- **매칭 vs 이해 (D069)**: MATCH 토큰(Korean 상품명, 숫자 층·존)은 세계대로 유지·주석만; 이해 텍스트만 사용자 언어. 예: `리빙 밀폐용기 1.2L`를 번역 문자열로 표시 금지(선반에 그 문자열 없음). 위치는 벤더 그대로 `11층 56번`.
- **다국어(D068)**: shipping 요구이나 **언어/타이밍/디자인 OPEN**. 입력측 검색 별칭 미공급(심). 6개 복구 경로 중 5개가 Korean 직원 종료(사실).
- **Korean UX writing 계약**: 해요체 · answer-first · 헤지 최대 1개(근거 명시) · 기술·비난 어휘 금지. Interface 카피는 **FINAL**.
- **신선도 카피**: 우리 관측 나이만(`방금 확인한 재고예요` / `어제 오후 6시에 확인한 정보예요`). 백엔드 재고-나이 스탬프 금지.
- **qty**: 상한만(`재고 3개 이하`, 저재고 시 `재고 3개 이하 · 방금 확인`), 정확 잔량 금지.
- **Error**: 결과/평이 언어(`지금 연결이 원활하지 않아요…`), 기술 어휘 금지(초안 `매장 네트워크가 불안정해요` 폐기됨).
- **접근성**: 검색 입력 프로그램적 라벨 `상품 검색`(placeholder≠라벨) · 스캔 버튼 `바코드 스캔` · 이미지 alt=상품명 · **상태 색상 단독 전달 금지**(Success ✓+선언문 / Error ⚠+복구문 / Partial 문장구조+웨이트).

---

## 7. 성능 예산 · 접근성 (Flow 1 Engineering 상속)

- **예산(회귀=버그)**: FCP<1.8s · LCP<2.5s · INP<200ms · CLS<0.1 · tap feedback<100ms · skeleton<100ms · submit→first result **≤2s(가설·필드검증)** · 상태 전환 150–300ms(ease-out 진입/ease-in 이탈) · reduce-motion 시 즉시 컷 · **캐시-서브 답=네트워크 왕복 0**.
- **의존성 타임아웃/폴백**: store/stock API 2s→캐시/Partial/Error · store detection(geolocation) 3s→수동 피커(검색 절대 미게이트) · barcode(camera) 무타임아웃→권한거부 시 텍스트검색 · AI 1s→리터럴 무음강등.
- **WCAG 2.2 AA**: 터치타깃≥44×44pt(권장 48)·간격≥8pt · 본문≥16px/lh1.5 · 대비 본문≥4.5:1·큰텍스트≥3:1(라이트·다크) · 200% 스케일 생존 · 최대 2 typeface weight/상태.
- **모니터링**: 예산 준수 · Error 진입율 · 캐시 히트율 · staleness 분포 · Success→Partial 강등 빈도. **민감정보(정밀 위치·개인식별자) 로그 금지.**

---

## 8. Increment 범위

### Increment 0 — PWA 셸 + 데이터 레이어
- PWA 셸 + 서비스워커(모바일 웹/PWA-first, D059) — Native는 배제 아니라 유예.
- SW 오프라인 캐시를 **§4 신선도 모델에 매핑**. 오프라인/약전파 1차 설계 대상.
- `newIntSelStr` 래핑 데이터 레이어 + **어댑터 심(§3) + mock**.
- 캐시 서브셋(SKU당): `identifier, name, price tier, last-known stock flag, floor+zone`. 매장 감지 성공 후 **백그라운드**로 채움(첫 답 크리티컬 패스 금지). `매장 변경` 시 교체. 캐시 읽기 전용.
- 신선도 스탬프 프리미티브(§4). 임계값은 심 뒤 설정값.
- §7 성능 예산 골격 + WCAG 골격 확립.
- **앱-레벨 결정**(빌드툴/라우팅/상태/모듈/라이브러리)은 이 저장소 자체 기록 — Bible D-번호 미소비. → [open-questions.md](open-questions.md) §B.
- 다운스트림 수용(§1.6): 리프레시 주기 타이머 금지, 도착 비감지, Flow 3 좌표 앵커/판매종료 스위치 수용.

### Increment 1 — Flow 1 Availability Check (첫 수직 슬라이스)
- §5 6-상태 + §6 카피 + §7 예산/접근성 구현. 익명·무로그인(Anti-goal 4).
- 상태→브랜치는 §2.2 필드 조건으로. fallback-first(비-AI) 먼저, AI 해석은 위에 레이어.
- Flow 1 체인 이미 Review/complete → **비준 대기 없음, 지금 착수 가능.**

---

## 9. 결정 상태 (Decision Status)

| D | 상태 | 게이트 |
|---|---|---|
| D059 | Draft(게이트 없음) | PWA-first, no-install/no-login 첫 답, SW 캐시, 웹 예산 |
| D060–D064 | 데이터 계약 교정 | 관측 계약·신선도·부정답 분할·위치(층+존)·존번호 서명 |
| **D061** | RATIFIED(07-10) | 신선도 프레이밍 전체(§4) |
| **D068** | RATIFIED(07-10) | 다국어 shipping 요구(언어/타이밍/디자인 OPEN) |
| **D069** | RATIFIED(07-10) | 렌더링 규칙(매칭 토큰·주석만) |
| **D076** | RATIFIED via D078(07-13, Draft 유지) | Flow 3(Inc 3) — Inc 0 심이 매트릭스/좌표앵커 수용 |
| **D077** | RATIFIED via D078(07-13, Draft 유지) | Flow 2(Inc 2) — Inc 0 신선도·리프레시 골격 수용 |
| **D078** | RATIFIED(07-13) | D076/D077 비준, Inc 2·3 구현 허가 |

**결론: Increment 0·1은 비준 대기 없이 지금 착수 가능.** Inc 2는 D077, Inc 3은 D076 게이트였으나 **D078로 둘 다 해제** — 순서(0→1→2→3)만 유지.
