# HANDOFF — DAISO Finder

> 이 저장소에서 새 세션을 시작하면 **여기부터** 읽는다. 실행 원장(정본)은 [`.superpowers/sdd/progress.md`](../.superpowers/sdd/progress.md).

## 현재 상태 (2026-07-25/26)

**Increment 0(PWA 셸) + Flow 1(Availability Check) 코어 + 실 데이터 배선 + 라이브 스모크 검증까지 완료 — 전부 `main`에 로컬 머지(원격 푸시·공개 배포 없음).** 앱은 **로컬에서 실 daisomall 데이터로 전체 플로우가 동작**한다(`npm run dev:live`, dev-proxy). 단 **프로덕션 배포는 런타임 차단 + ToS 게이트로 대기 중**(아래 🔴).

**게이트(main, 바코드 스캔 머지 후 — tip `00d7968`)**: vitest **336/336**, tsc clean, biome clean, Playwright **18/18**(dev 15 + preview 3), build 성공(zxing = 별도 지연청크, 엔트리 174.67 kB에 zxing 없음). src+dist에 시크릿 부재.

**바코드 스캔은 `main`에 ff 병합 완료(2026-07-26, tip `00d7968`, 브랜치 `feat/barcode-scan` 삭제 — 푸시·배포·PR 없음).** **물리 상품 바코드 = `pdNo`는 data-owner 확인으로 해소**(2026-07-26, §B30-7) — 우리 관측이 아니라 data-owner 진술이 근거이며, 구현은 이미 디코드값을 그대로 `keyword=pdNo`로 넘기므로 코드 변경 없음. **DataMatrix 전용 정정(2026-07-26, 별도 `main` 병합 완료, tip `ee211dd` — `main` 병합 완료)**: data-owner가 확인한 물리 실체(포장 = 2D DataMatrix, 페이로드 = `pdNo` 자체 — 근거는 **data-owner 진술**이지 우리 관측이 아니다)를 반영해 심볼로지를 최초 1D 7종에서 **DataMatrix 단독**으로 전환했다 — 같은 포장의 1D 바코드는 `pdNo`가 아닌 별개 번호라 디코드하면 엉뚱한 상품에 응답하므로 배타성은 정확성 요구다(상세는 아래 완료된 것 참조). 브랜치는 사용자 노출 카피 1종(**`SCAN_AIM_GUIDE`** — 뷰파인더 조준 안내)도 함께 싣는다: DataMatrix 전용이라 1D 코드를 겨눈 쇼퍼가 무피드백 상태가 되므로 오버레이가 열리는 즉시 어느 코드를 겨눌지 알린다(§B30-8, Bible 비준 대기). 게이트 unit **346**·e2e **18/18**. **남은 미검증은 실기기 디코드 품질**(§B9): DEV/E2E는 무-카메라 mock 스캐너로만 통과했고, 실제 매장 조명·포커스에서 작고 조밀한 DataMatrix를 카메라가 읽어내는지는 실기기 스캔 1회로만 확인된다.

### 완료된 것 (main, 시간순)
- **Increment 0 + Flow 1 코어(mock)** — 6상태 UI·Bible-verbatim 카피·D082 매장선택·D083 glass·타이핑 검색·재시도. (머지 `c318e8a`)
- **Flow 1 실 데이터 배선**(2026-07-22, 3-세션 TDD + whole-branch 리뷰 통과) — `functions/`(daisoUpstream · daisoAuth WebCrypto Bearer · `/api/availability` 조건부 팬아웃 · `/api/stores`) + `src/adapters/daisomall/`(rawObservation validator · mapStoreObservation 6상태 **parity oracle** · storeStockRepository · storeDirectory) + format(지하/lchDay/km→m) + 컴포지션 루트(`import.meta.env.PROD` 라이브/mock 스위치) + preview route-intercept E2E. 구식 `newIntSelStr/*`+`stock.ts` 제거. (머지 `830b184`) + 정직 restock 카피 `f3c849f`. 앱 결정 = `open-questions.md §B21–B27`.
- **라이브 스모크**(2026-07-22, owner 승인) — 실 daisomall 읽기전용 프로브로 **프록시 계약 end-to-end 확인, 코드 무변경**. 실 enc 키 = **공개 상수 `"PRE_AUTH_ENC_KEY"`**. B27 호스트정합·인증·좌표 optional·selStr `data[]`·지하 위치 확인. (머지 `44022ce`) 정본: `docs/notes/store-api-observations.md §라이브 스모크 검증`.
- **병렬 트랙 3종**(2026-07-23, main tip `18cda38` — 병렬 worktree TDD, 각 태스크 독립 리뷰 Approved):
  - **data-owner 관측** (`8d48c35`): 읽기전용 바운드 프로브(11요청)로 `sleStsCd:"9"`(재고 공존 → 판매종료 후보) + 빈 `data[]`=매장 미취급 **해소**; `stck` 종류는 표본 편향으로 미해소·심 뒤 격리 유지. 정본: `store-api-observations.md §라이브 스모크 검증 II`.
  - **GPS-근처 실배선** (`3ab356f`): `/api/stores` 근처-모드 분기(검색-모드 무변경) + 실 GPS + `createDaisoNearbyFetch`(km→distanceM 어댑터층) + `createGeolocation()` PROD/mock 스위치. **B16 라이브 배선 완료.** GPS는 추천만(전 실패경로 `[]`), `GeolocationPort` 불변.
  - **최근 검색** (`280c96c`): 로컬 `localStorage` 정확-문자열 dedup·MAX_ENTRIES=5·빈목록 캡션미표시·정직 열화. 카피 `"최근 검색"`=Bible 정본. **B28(앱 소유)**.
  - 통합 fast-follow (`18cda38`): 리뷰 findings(nav required·낡은 주석) 반영. 결합 게이트 GREEN: unit **251**·e2e **17**·tsc·biome clean.
- **리터럴 다중후보 + 상품 이미지**(2026-07-23, main tip `e349668` — 4-태스크 순차 SDD + opus 전체-브랜치 리뷰 "Ready:Yes"): user 지적("검색이 상품 1개만·이미지 없음") 해소. **Bible 기설계의 앱 구현**(6상태·판정 로직 불변). `pdImgUrl`→cdn 절대화(프록시)→계약(양쪽 미러)→매퍼→`ProductPhoto`(AnswerCard+후보행 공유, 없으면 렌더 안 함) + 신규 `/api/search`(쿠키-only·B-변형 폴딩) + `candidates` pre-answer 상태 + 검색-우선 `runQuery`(0/1/≥2 분기)·`runByPdNo` + availability **pdNo-identity 버그 수정**. notice=Bible 정본 `검색 결과예요. 바코드를 스캔하면 더 정확해요.`(AI-low; `이걸 찾으시나요?` 미사용=confidence-washing 회피). 앱 결정·후속 = `open-questions §B29`. 커밋 `0706c1b`·`cc76346`·`896f4a8`·`e349668`.
- **후보품질 튜닝(§B29 M1/M2)**(2026-07-24, 코드 `8518337` — owner 승인 M1+M2 둘 다; 병렬 SDD: 정찰 2 + TDD + adversarial 리뷰 2): 공유 판정식 **`isStoreCarryableBaseDoc`**(`MASTER_PD_NO===''` && `onlyOnlYn!=='Y'`)를 `/api/search` foldCandidates(**M2 온라인전용 제외**)와 `/api/availability` pickProductDoc(**M1 취급-base 우선, `docs[0]` 폴백, null 금지**)가 공유 → 두 엔드포인트가 "키워드의 base 상품"에 일관. pdNo-identity(B29) 불변. M2는 근거 취약(§SearchGoods L87 헤지 + §스모크 II 잠재 반증 — 정직한 매장취급은 여전히 selStrPkupStck)이라 **가역적 Hypothesis-class de-noise**로 코멘트 명시. 6상태·카피·화이트리스트 불변. 게이트 unit **286**. 정본 = `open-questions §B29`(✅ M1/M2 해소).

- **바코드 스캔 진입**(2026-07-25/26, **`main` ff 병합 `00d7968`**; 5-태스크 순차 SDD, 설계 `docs/superpowers/specs/2026-07-25-barcode-scan-design.md`): 검색바의 dead-stub `바코드 스캔` 버튼을 살려 카메라 디코드 → **기존 `/api/availability` 재사용**(디코드값 = keyword = pdNo, `/api/search` 미경유). `ScannerPort` 심(`01b4fea`) + 정직 카피 초안·`origin:'scan'` 프로버넌스(`fe65f85`) + 어댑터 수정(`eacf9bc`·`85530ba`: 논-블로킹 attach·정직 실패분류·TDZ) + `ScannerOverlay`(`d1fb4e0`·`3b321d9`) + 표면 배선 `runByScan`·포커스 복귀(`485b382`) + 토큰-가드 테스트(`ff72bcb`). 디코더 = 네이티브 `BarcodeDetector` + 번들 `@zxing/library` **동적 import**(외부 CDN 금지; 엔트리 청크 불변, zxing는 415.76 kB 지연청크). **6상태·판정 로직 불변** — `scannerOpen`은 `sheetOpen`과 같은 UI 셸 상태, `origin`은 카피 선택 전용. **정직성**: `unsupported`는 "`getUserMedia` 부재 또는 번들 디코더 로드 실패"로만 좁힘(카메라 점유·장치 없음은 `failed`). **최종 리뷰 수정 웨이브(2026-07-26)**: ① **Critical — 디코더-우선 순서**(`scan()`이 `getUserMedia`보다 먼저 네이티브/폴백 디코더를 확정; 이전엔 카메라를 켠 뒤 ~415 kB import를 기다려 오버레이를 닫아도 import가 끝날 때까지 카메라가 켜져 있었다 = iOS Safari 경로) ② **Important — 실패 카피 낭독**(`LiveRegion`) ③ `SCAN_FAILED` 문구 정정(카메라 획득 실패에도 뜨므로 `'지금은 스캔할 수 없어요…'`) ④ 폴백 성공 시 `decoder.cancel()`·빈 디코드 거부·DEV mock pdNo 과대매칭 수정. 게이트 unit **336**·e2e **18**·tsc/biome clean. 앱 결정 = `open-questions §B30`. **미결**: 카피 5종 **Bible 비준 대기**(B30-4), 실 카메라 **필드 미검증**(§B9). 물리 바코드↔`pdNo`(B30-7)는 **data-owner 확인으로 해소**(2026-07-26) — 근거는 data-owner 진술이고 계약상 기계 검증 경로는 없다. **DataMatrix 전용 정정**(2026-07-26, `main` 병합 완료 tip `ee211dd` — `main` 병합 완료, 상세는 위 "현재 상태" 참조): `SCAN_FORMATS`를 1D 7종에서 `data_matrix` 단독으로 전환(같은 포장의 1D 바코드는 `pdNo`가 아니라 엉뚱한 상품에 응답하므로 배타성 = 정확성 요구), 네이티브는 `getSupportedFormats()` 확인 후에만 사용, 폴백은 `BrowserDatamatrixCodeReader` 딥 임포트로 교체 — 엔트리 **172.41 kB**, 지연 청크 **415.76 kB → 91.96 kB**(gzip 110.22 → 24.32 kB, −78%). 조준 가이드 카피 **`SCAN_AIM_GUIDE`** 신설(§B30-8, Bible 비준 대기). 게이트 unit **346**(336에서 +10)·e2e **18**(불변)·tsc/biome clean. 남는 §B9 항목은 이제 심볼로지 커버리지가 아니라 **실기기에서의 DataMatrix 디코드 품질**(조명·포커스·작고 조밀한 코드)이다.

### 🔴 런타임 차단 발견 (2026-07-23) — 프로덕션 아키텍처 결정
daisomall anti-abuse가 **auth-protected 엔드포인트(selStrPkupStck·selIntPdStDispInfo)에서 Cloudflare Workers(workerd)의 TLS/HTTP 지문을 403 차단**한다. 우리 WebCrypto Bearer는 정확(node:crypto와 byte-identical, **node에서 200 수락**)하나 **workerd에서 403** — 쿠키·UA·Origin·`cf-*` 헤더 전부 배제(같은 IP). JA3=런타임 속성 → **프로덕션 CF Pages도 차단 공산 큼**. 영향: workerd에서 `/api/stores`(무인증) OK, `/api/availability`(인증) 502.
- **로컬 해결(완료)**: `scripts/dev-proxy.mjs`(`npm run dev:live`, 포트 8790) — 진짜 `functions/`를 **Node 런타임**(esbuild 번들)에서 실행 → node TLS 수락 → **전체 라이브 플로우 로컬 동작**.
- **프로덕션 결정(user, 2026-07-23)**: 경로=**Option C(Node 프록시)**, 호스트=**gpu01 재사용**, B(프로덕션 CF 검증)=skip. **prep 완료(배포 안 함, merge `3a84d32`)**: env-구동 프로덕션 Node 서버(`/health`·CORS-opt·시크릿-free 로그·graceful shutdown) + `docs/deploy/gpu01-node-proxy.md` 런북. 설계 = `docs/superpowers/specs/2026-07-23-runtime-resolution.md`.

### 거버넌스 (2026-07-21) — 데이터 계약·구현은 앱 소유
`CLAUDE.md §1/§3`: **제품 철학**(안티골·플로우·6상태 의미·UX 카피 규칙·정직성)만 Bible SSOT. **벤더 데이터 계약·구현·매핑**은 앱 소유(도시어 + open-questions §B). 라우팅 기준 = "철학이 바뀌는가?".

## 다음 작업 (순서대로 — UI는 마지막)

**원칙(2026-07-23 owner 결정): 기능·데이터·플로우 토대를 굳힌 뒤 UI(마지막 1마일).** 이른 UI는 (a) AI 해석 레이어가 후보 disambiguation을 흡수, (b) 플로우 미확정(반대형 RFC) → rework 위험.

### 🟢 지금 바로 착수 (게이트 무관 — 2026-07-24 owner 선택 = 언블록 슬라이스). **새 세션은 여기부터.**
게이트(ToS·Bible)는 미결. 자율로 가능한 슬라이스, 추천 순서(UI-last 존중 — 기능/백엔드 먼저, 폴리싱 나중):
1. ~~**후보품질 튜닝(§B29 M1/M2)**~~ ✅ **완료(2026-07-24, 코드 `8518337`)** — 공유 `isStoreCarryableBaseDoc`(`MASTER_PD_NO===''` && `onlyOnlYn!=='Y'`)를 `/api/search` foldCandidates(M2 온라인전용 제외)와 `/api/availability` pickProductDoc(M1 취급-base 우선·`docs[0]` 폴백·null 금지)가 공유 → 일관. M2는 owner 승인 가역 Hypothesis-class de-noise. 정본 = `open-questions §B29`(✅ M1/M2 해소).
2. ~~**바코드 스캔 진입**~~ ✅ **완료 + `main` 병합(2026-07-25/26, tip `00d7968`)** — 네이티브 `BarcodeDetector` + 번들 `@zxing/library` 동적 import(외부 CDN 금지), 디코드값 = keyword = pdNo로 **기존 `/api/availability` 재사용**, `scannerOpen`은 UI 셸 상태(6상태 불변). 게이트 unit **336**·e2e **18**. 정본 = `open-questions §B30`. **잔여**: 카피 Bible 비준(B30-4)·실 카메라 필드검증(§B9). 물리 바코드=`pdNo`는 **data-owner 확인으로 해소**(2026-07-26, B30-7). **DataMatrix 전용 정정 대기**(2026-07-26, `main` 병합 완료 tip `ee211dd` — `main` 병합 완료): 게이트 unit **346**·e2e **18/18**, 엔트리 172.41 kB·지연 청크 91.96 kB(정정 전 415.76 kB에서 축소), 조준 가이드 카피 `SCAN_AIM_GUIDE` 포함. 상세 = 위 "현재 상태" 참조.
3. **UI 폴리싱(후보 리스트 + 사진 스타일)** — 방금 배송한 후보/사진은 기능·카피·a11y 완성이나 **CSS 최소(미스타일)**. `.candidate-list`·`.product-photo` + 스캔 뷰파인더 `.scanner-overlay*`(기능·a11y 완성, CSS 최소) 바운드 프레젠테이션 패스(카피 불변). **1·2 완료로 다음 추천 슬라이스.**
4. **PWA 아이콘(§B19)** — 배포 전 자산, 배포가 게이트라 우선순위 낮음.

**아래 게이트별 우선순위(1·2)는 owner court(ToS·Bible)** — 풀리면 그때 착수:

1. **[게이트: owner ToS/robots 검토] 프로덕션 런타임 = 실 서빙** — ToS 통과 시 **gpu01 배포**(런북 `docs/deploy/gpu01-node-proxy.md`대로; C prep·서버·런북 완료). 앱을 "실제"로 만드는 1순위 토대. *(B 프로덕션 CF 확인은 skip 결정 — 필요 시 `wrangler login`+ToS로 일회용 프로브. 거의 확실히 403 예상.)*
   - **배포 전 필수 항목 — 서비스워커가 zxing 지연청크를 프리캐시함**(2026-07-26 최종 리뷰; 청크 크기는 2026-07-26 DataMatrix 전용 정정 `eb55434` 이후 수치로 갱신 — `main` 병합 완료, `main` 병합 완료). `vite.config.ts`의 `workbox.globPatterns`가 `**/*.js`를 포함하므로, 바코드 폴백 디코더 청크(**91.96 kB, gzip 약 24 kB** — 정정 전 415.76 kB/gzip 110 kB에서 −78%로 축소)가 **PWA 설치 시점에 전부 내려간다**. 청크가 줄어든 만큼 우려도 작아졌지만, 이 청크는 네이티브 `BarcodeDetector`가 없는 브라우저(주로 iOS Safari)에서 스캐너를 실제로 연 쇼퍼만 필요로 한다는 점은 그대로다 — 대부분의 Android는 네이티브 경로라 한 번도 쓰지 않는다. **매장에서 모바일 데이터로 설치하는 쇼퍼**가 전제이므로 설치 페이로드에 그대로 두는 것은 정당화되지 않는다. 배포 시 결정 필요: `globPatterns`에서 해당 청크를 제외하고 **런타임 캐싱**으로 돌릴지, 아니면 근거를 남기고 프리캐시를 유지할지. **코드 변경은 이번 웨이브 범위 밖(설계 결정 = 배포 게이트와 함께)** — 우려는 줄었지만 결정 자체는 여전히 배포 게이트에서 내려야 한다. 잊히지 않도록 여기에 고정한다.
2. **[게이트: owner Bible 세션] 플로우 결정** — (a) **반대형 store-finder RFC**(`docs/notes/rfc-reverse-store-finder.md`, gated-extension lean; Anti-goal 2 충돌) 결정, (b) **상품 후보 disambiguation 방식**(AI 해석 레이어 vs 리터럴 후보+`직접 검색 결과 보기` 오버라이드)·카피 확정.
3. **지연 기능층**: ~~GPS-근처 매장 실배선~~(✅ `18cda38`) · ~~최근 검색~~(✅ `18cda38`) · ~~리터럴 다중후보 + 상품 이미지~~(✅ `e349668` — 갭① disambiguation의 **리터럴 레벨 완료**) · **남음** — AI 검색어 해석 레이어(fallback-first 1s·확신도 **자동 티어링**: High/Medium 전환·"이걸 찾으시나요?"·임계값; 갭①의 AI 부분, **`AI/availability-check.md` 계약·임계값=Bible Hypothesis/현장검증**) · ~~바코드 스캔 진입~~(✅ 2026-07-25/26, `main` 병합 `00d7968` → DataMatrix 정정 `6c33189`) · 재입고 구독(로그인 게이트) · 다국어 입력 별칭(A4) · ~~candidate-quality 튜닝(§B29 M1/M2)~~(✅ `8518337`).
4. **미해결 data-owner 항목**(심 뒤 격리): ~~`sleStsCd` 단종 `"9"`~~(✅ 관측) · ~~`selStrPkupStck` 빈 `data[]` 의미~~(✅ =매장 미취급) · **남음** — `sleStsCd` 미취급 `null`(행 부재로 표현되어 미관측) · `stck` 종류(진열 vs 픽업예약, 표본 편향으로 미해소).
5. **UI(마지막 1마일)**: ① 상품 후보 프레젠테이션 + 후보/오버라이드 UX(카피=Bible), 프레젠테이션 폴리싱. **위 1~3이 굳은 뒤.**
6. **배포 전**: PWA 설치 아이콘/자산(§B19, 미구현). *(오픈 릴레이/키 노출은 키가 공개 상수라 user 종결.)*

**재개 규칙(새 세션)**: 이 HANDOFF → **🟢 "지금 바로 착수" 슬라이스 중 다음 추천 = 3번(UI 폴리싱 — 후보 리스트 + 사진 스타일)** (1번 후보품질 튜닝 ✅ 2026-07-24 `8518337`; 2번 바코드 스캔 ✅ 2026-07-25/26 **`main` 병합 완료**(`00d7968`, DataMatrix 정정 `6c33189`)). 스코프 주의 = `.candidate-list`·`.product-photo`(+ 스캔 오버레이 `.scanner-*`)의 **바운드 프레젠테이션 패스, 카피·마크업 시맨틱 불변**. 큰 수(배포·AI 티어링·반대형)는 owner court(ToS·Bible)라 게이트가 풀린 뒤. 병렬 서브에이전트로 최적화하며 진행 가능. 로컬 테스트는 언제든 `npm run dev:live`.

**불변 원칙**: UI/도메인/reducer/query-runner/캐시 불변(헥사고날 심 교체만). 무-날조·정직 분리·신선도(D061)·읽기전용 준수. 키·토큰은 서버에만(커밋/클라 노출 금지). **런타임은 Node(workerd 차단)** — 클라 `/api/*` 계약은 런타임 무관하게 불변.

## 저장소 경계 (중요)

- **제품 철학**은 Product Bible이 SSOT(read-only) — 재서술 금지, 링크/인용. **벤더 데이터 계약·구현은 앱 소유**(도시어 + open-questions §B).
- 철학이 바뀌는 갭만 Bible로 에스컬레이션. 데이터·구현·매핑은 앱이 근거 기록하고 결정(§3 라우팅).
- 재고·거래 **읽기 전용** — 변형 금지(INDEX §7).

## 규범 입력 (정본, 필요 시 원문 확인)

- 실행 원장: [`.superpowers/sdd/progress.md`](../.superpowers/sdd/progress.md) — 커밋·리뷰·결정 이력.
- 실 API 계약·라이브 스모크: [`docs/notes/store-api-observations.md`](notes/store-api-observations.md).
- 앱 결정·미해결·후속: [`docs/notes/open-questions.md`](notes/open-questions.md) (§B 앱 소유, §A Bible, §C 출시-후).
- 바코드 스캔 최종 리뷰 비차단 잔여 5건(2026-07-26): [`docs/notes/open-questions.md` §B30](notes/open-questions.md).
- 런타임 결정: [`docs/superpowers/specs/2026-07-23-runtime-resolution.md`](superpowers/specs/2026-07-23-runtime-resolution.md) + 배포 런북 [`docs/deploy/gpu01-node-proxy.md`](deploy/gpu01-node-proxy.md).
- 반대형 RFC(Bible 계류): [`docs/notes/rfc-reverse-store-finder.md`](notes/rfc-reverse-store-finder.md).
- Flow 1 스펙(앱-레벨): [`docs/superpowers/specs/2026-07-22-flow1-live-data-design.md`](superpowers/specs/2026-07-22-flow1-live-data-design.md). 제품 정본은 Bible: `../product-bible/06_Product/daiso-companion/{Experience,Interface,Engineering,AI}/availability-check.md`.
