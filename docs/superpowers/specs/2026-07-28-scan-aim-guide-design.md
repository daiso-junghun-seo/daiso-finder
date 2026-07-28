# 스캔 조준 가이드 · 계산바코드 안내 설계

> 상태: 오너 승인(2026-07-28). 구현 플랜은 별도 문서.
> 선행: [`2026-07-25-barcode-scan-design.md`](2026-07-25-barcode-scan-design.md) (§B30 결정군), [`2026-07-27-dev-diagnostics-panel-design.md`](2026-07-27-dev-diagnostics-panel-design.md)

---

## 0. 왜 지금

2026-07-28 아이폰(iOS 18.7 / Safari 26.5.2) 실기기 측정에서 `?debug=1` 패널이 다음을 보고했다:

```
해상도: 1920×1080 · frameRate: 30 · facingMode: environment
BarcodeDetector: false · 디코더: zxing · 준비 13ms
경과: 14.1s · 결과: decoded · query: 965923433
/api/availability · 408 · 211ms
```

세 가지가 확정됐다.

1. **카메라 제약 수정은 유효하다.** `{ ideal: 1920/1080 }` 요청이 그대로 수용됐다. 2026-07-27에 미결로 남긴 실측이 닫혔다.
2. **디코딩은 성공했으나 14.1초 걸렸다.** 해상도가 확보된 상태의 14초는 프레이밍 문제를 가리킨다 — 피사체가 화면에서 너무 작았다.
3. **읽은 값은 형식상 정상이다.** 관측 도시어의 실제 `pdNo`는 5·7·9자리이고 9자리 실측 예시(`926940033`)가 있다. `965923433`은 그 계열에 들어맞는다. 답을 못 받은 원인은 408 하나다.

오너가 포장 실물을 확인해 준 사실:

- 계산대가 읽는 코드 영역은 한 덩어리다. 왼쪽은 **"계산" / "바코드"** 가 세로로 쌓인 사각 표식, 오른쪽 흰 카드 위에 **정사각 DataMatrix**. 정사각 코드는 그 덩어리 가로폭의 30% 남짓.
- 포장에는 **880으로 시작하는 1D 바코드도 있으나 사용하지 않는 품번**이다.

현재 앱이 보여주는 유일한 조준 안내는 다음 한 문장이다:

```
상품의 정사각형 코드를 화면 안에 맞춰 주세요.
```

이 문장은 **맞출 프레임을 전제하지만 화면에 프레임이 없고**, 덩어리 안 어디를 봐야 하는지도 말하지 않는다. 쇼퍼의 자연스러운 행동은 눈에 띄는 표식 덩어리 전체를 화면에 채우는 것이고, 그러면 정사각 코드는 화면 폭의 30%만 차지한다. 14.1초는 여기서 나온다.

---

## 1. 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | 1D/EAN-13 디코딩을 **추가하지 않는다** | 880 바코드는 사용하지 않는 품번(오너 확인, 2026-07-28). 도시어 전체에 13자리·880 접두 식별자 **0건**. 기존 §B30-2 유지 |
| D2 | 정사각 **모서리 브래킷** 조준 가이드를 `<video>` 위에 얹는다 | 디코더는 `detect(target.video)`로 화면 전체를 읽는다(ROI 크롭 없음). 닫힌 테두리나 바깥 마스크는 "이 안에만 읽힌다"는 사실이 아닌 인상을 준다 |
| D3 | 가이드는 짧은 변의 약 60%로 **일부러 작게** 잡는다 | 꽉 채우려면 기기를 가까이 대게 되고, 그것이 모듈당 픽셀을 올린다. 인식률이 목적이지 장식이 아니다 |
| D4 | `SCAN_AIM_GUIDE`를 교체하고 **`'계산바코드'` 토큰을 시각적으로 강조**한다 | 오너 요구: "계산바코드를 찍어야 한다는 걸 사용자가 인지 가능해야 한다" |
| D5 | 문구에 **색을 넣지 않는다** | 포장을 한 개만 관측했다. 전 상품 공통이라는 근거가 없는 상태에서 색을 단정하면 그 문구가 곧 거짓 안내가 된다 |
| D6 | 880/줄무늬 바코드를 **명시적으로 경고하지 않는다** (1문장 유지) | 오너 선택. Bible 한국어 UX 가이드 2문장 상한 안에서 유도만으로 처리 |
| D7 | **스캐너 오버레이의 LiveRegion만** 시각적으로 숨긴다 | `AvailabilitySurface`의 LiveRegion은 일부 상태에서 유일한 출처다(§4) |
| D8 | 숨김은 **clip 방식**만 쓴다. `display:none`·`visibility:hidden` 금지 | 두 방식은 접근성 트리에서 노드를 제거해 실제 낭독까지 사라진다 |
| D9 | `dev-proxy.mjs` 핸들러 테이블에 **`/api/search`를 등록**한다 | 클라이언트가 호출하는데 테이블에 없어 `dev:live`에서 404. 실기기 검증 자체를 막고 있다 |

---

## 2. 조준 가이드

### 구조

`<video>`를 위치 기준 래퍼로 감싸고, 그 안에 장식 형제를 둔다. `videoRef`는 **반드시 `<video>`에 남긴다** — 래퍼로 옮기면 스캔이 시작조차 되지 않는다(`ScannerOverlay.tsx:78-81`이 `videoRef.current`가 null이면 조기 return).

```
<section role="dialog">
  <div class="scanner-overlay__header"> … </div>
  <div class="scanner-overlay__viewport">      ← 신규, position: relative
    <video class="scanner-overlay__video" … />  ← ref 유지
    <div class="scanner-overlay__aim" aria-hidden="true">   ← 신규, position: absolute
      <span/> <span/> <span/> <span/>           ← 네 모서리 꺾쇠
    </div>
  </div>
  … 문구 …
</section>
```

- `aria-hidden="true"` — 순수 장식이다. 의미는 문구가 전달한다.
- **알림(권한 거부·미지원·실패)이 뜨면 가이드도 함께 숨긴다.** 카메라가 실패한 상태에서 조준선을 남기는 것은 거짓 안내다.
- `<p>`를 추가하지 않으므로 `ScannerOverlay.test.tsx:122`의 `toHaveLength(1)` 고정은 그대로 통과한다.

### 스타일

- `.scanner-overlay__viewport { position: relative; }` — `<video>`의 `width:100% / max-height:60vh / object-fit:cover`는 건드리지 않는다.
- `.scanner-overlay__aim` — 중앙 정렬, `aspect-ratio: 1`, 짧은 변의 약 60%, `pointer-events: none`.
- 꺾쇠는 각 모서리에 인접한 두 변만 그린다. **채움 없음, 닫힌 테두리 없음, 바깥 딤 없음**(D2).
- `z-index`를 도입하지 않는다. 이 저장소의 스태킹 규약은 순수 DOM 순서이며(`src/styles/**`에 `z-index` 0건), 래퍼 안에서 `<video>`보다 뒤에 오는 것으로 충분하다.
- 조상 `.glass-surface`에 이미 `position: relative`가 있고 `@supports` 블록의 `transform: translateZ(0)`이 스태킹 컨텍스트를 만들어 두었다 — 새 컨테이닝 블록을 만들 필요가 없다.

---

## 3. 문구

### 교체

```diff
- 상품의 정사각형 코드를 화면 안에 맞춰 주세요.
+ '계산바코드' 표시 옆 사각형 코드를 네모 안에 맞춰 주세요.
```

한 문장(Bible 2문장 상한 준수), 기술 용어 없음. `'계산바코드'`는 포장에 인쇄된 문자열 그대로다.

### 거버넌스

- **토큰 자체는 규칙 준수다.** D069는 쇼퍼가 물리 세계와 대조해야 하는 토큰을 세계가 렌더하는 대로 유지하라고 규정한다(*"rendered as the world renders it … never replaced by its translation"*). 포장 표기를 그대로 적는 것은 이 규칙의 **위반이 아니라 이행**이다.
- **문장은 앱 초안이다.** Bible의 Flow 1 카피 표는 final이지만 **뷰파인더 화면 자체를 정의하지 않는다** — 침묵 구간이다. 기존 `SCAN_AIM_GUIDE`(§B30-8)가 정확히 같은 경로로 들어왔다: 앱 정직 초안 → 오너 승인 → `open-questions.md §B`에 **Bible 비준 대기**로 기록 → verbatim 테스트로 고정. 동일하게 처리한다.

### 강조

`'계산바코드'`를 `<strong>`으로 감싼다. 단일 정본을 유지하기 위해 `SCAN_AIM_GUIDE`는 **완성된 한 문장 그대로 두고**, 컴포넌트가 렌더 시점에 토큰으로 분할한다:

```ts
export const SCAN_AIM_GUIDE = "'계산바코드' 표시 옆 사각형 코드를 네모 안에 맞춰 주세요.";
export const SCAN_AIM_GUIDE_TOKEN = "'계산바코드'";
```

토큰을 찾지 못하면 문장을 그대로 렌더한다(분할 실패가 안내를 없애지 않는다).

### 접근성 — 알고 감수하는 비용

이 오버레이는 포커스가 내내 `닫기`에 머물기 때문에 **`aria-describedby`가 안내를 읽어주는 유일한 통로**다. `<strong>` 중첩은 접근성 설명 문자열의 요소 경계에 공백을 끼워 넣는다. 낭독 자체는 문제없지만 **정확 일치 단언은 깨진다.**

대응: 다이얼로그 설명 검증을 정확 일치에서 **핵심 토큰 포함**으로 바꾼다. 이쪽이 오히려 견고하다 — Bible 비준으로 문구가 교체돼도 테스트가 깨지지 않는다.

---

## 4. LiveRegion — 스캐너에 한정

### 문제

`LiveRegion`은 시각적 숨김이 전혀 없는 plain `<div>`다. 스캐너에서 오류가 나면 같은 문장이 `<p>`와 LiveRegion에 **두 번 보인다.**

### 왜 스캐너만인가

호출처는 셋이다.

| 호출처 | 같은 문장이 시각적으로 렌더되는가 | 숨겨도 되는가 |
|---|---|---|
| `ScannerOverlay.tsx:148` | 예 — 바로 위 `<p>` | **예** |
| `AvailabilitySurface.tsx:420` (`RESULTS_NOTICE`) | 예 — `CandidateList.tsx:19` | 예(이번 범위 밖) |
| `AvailabilitySurface.tsx:451` (`announcement`) | **아니오 — 일부 상태에서** | **아니오** |

마지막 항목이 결정적이다. `success` + 비-inStock 4종(`temporarilyOut`·`discontinued`·`notCarried`·`restockArriving`)에서 `copy.ts:163-167`은 `LIVE_FRESHNESS_CAPTION`('방금 확인한 재고예요')을 낭독에 포함하지만, `AnswerCard.tsx:187-199`의 해당 분기는 그 캡션을 렌더하지 않는다. 그대로 숨기면 **시각 사용자가 그 문장을 잃는다.**

이를 해소하려면 캡션을 비-inStock에도 렌더하거나 낭독에서 빼야 하는데, **신선도 표기는 D061 철학 영역**이라 앱이 임의로 결정할 수 없다(CLAUDE.md §3). 따라서 이번 작업은 스캐너만 건드리고, 나머지는 관측 기록으로 남긴다.

### 기법

`clip` 계열(1px 크기 + `clip-path` + `overflow:hidden`)만 쓴다. `display:none`과 `visibility:hidden`은 접근성 트리에서 노드를 제거하므로 **금지**(D8) — 이 규칙이 깨졌는지는 `ScannerOverlay.test.tsx:101`의 `getByRole('status')`가 잡아낸다(기본 `hidden:false`).

저장소에 sr-only 유틸이 없으므로 `layout.css`에 새로 정의한다(전역 로드는 `tokens.css`·`layout.css` 둘뿐).

---

## 5. `dev-proxy` `/api/search` 등록

`buildHandlers()`는 `/api/availability`와 `/api/stores` 둘만 등록한다. 클라이언트는 `/api/search`를 호출한다(`productSearchRepository.ts:15`). `dev:live`에서 이 경로는 프록시 404를 받고, 클라이언트는 `if (!res.ok) return []`로 **조용히 빈 후보 목록**으로 처리한다 — 실패가 눈에 보이지 않는다.

- `functions/api/search.ts`의 `onRequestPost` 시그니처는 나머지 둘과 **바이트 단위로 동일**하다. 한 줄 추가로 끝난다.
- **새 env가 필요 없다.** 프록시는 env 객체 하나를 만들어 모든 핸들러에 그대로 넘기고, `search.ts`는 `cfg.wwwBase`(=`SEARCH_BASE`)만 쓴다. `.dev.vars`에 이미 있다.
- **동작이 달라진다.** 지금은 후보가 항상 비어 있어 키워드 단독 조회로 흘렀다. 등록 후에는 후보 2건 이상인 키워드가 **candidates 상태**를 띄운다. 네트워크 로그만 바뀌는 게 아니다.
- 테이블을 검증하는 테스트가 **없다.** `functions/api/*.ts`(테스트 제외) 전부가 등록돼 있는지 확인하는 테스트를 추가한다 — 네 번째 라우트가 또 누락되는 것을 막는다.
- `docs/deploy/gpu01-node-proxy.md`와 `dev-proxy.mjs` 헤더 주석이 "두 라우트"라고 적고 있다. 함께 고친다.
- gpu01 운영 프로세스가 같은 파일을 쓰므로 동일 누락이 있다. 재배포 필요 항목으로 기록한다.

---

## 6. 테스트 영향

**깨지므로 함께 고칠 것**

| 위치 | 단언 | 조치 |
|---|---|---|
| `copy.test.ts:254` | `expect(SCAN_AIM_GUIDE).toBe('상품의 정사각형 코드를…')` | 새 문장으로 교체 |
| `ScannerOverlay.test.tsx` `getByText(SCAN_AIM_GUIDE)` 3곳 | `getNodeText`가 직속 텍스트 노드만 이어붙임 | 토큰 포함 검증 또는 정규화 매처로 전환 |
| `ScannerOverlay.test.tsx:53-55` | `description: SCAN_AIM_GUIDE` 정확 일치 | 핵심 토큰 포함으로 전환(§3) |

**그대로 통과해야 할 것 — 통과 여부가 곧 안전망**

- `ScannerOverlay.test.tsx:122` `querySelectorAll('p')` 길이 1 — 문단을 늘리지 않았다는 증거
- `ScannerOverlay.test.tsx:101` `getByRole('status')` — clip 방식을 지켰다는 증거(D8)
- `ScannerOverlay.test.tsx:26` `video[aria-hidden]` — 래퍼 추가가 구조를 깨지 않았다는 증거

**새로 추가**

- 조준 가이드가 스캐닝 중 렌더되고 `aria-hidden`이며, 알림 상태에서는 사라진다
- 강조 토큰이 `<strong>`으로 렌더되고, 문단의 텍스트 전체는 `SCAN_AIM_GUIDE`와 동일하다
- 스캐너 LiveRegion이 시각적으로 숨겨졌고 접근성 트리에는 남아 있다
- `buildHandlers()`가 `functions/api/`의 모든 비-테스트 핸들러를 등록한다

---

## 7. 범위 밖

- **1D/880 디코딩** — D1
- **터널 408** — 앱 결함이 아니다. `/api/availability` 핸들러가 낼 수 있는 status는 200/400/502뿐이고 업스트림 상태는 중계되지 않으며, 저장소·`dist/` 어디에도 408이 없고 프록시에 타임아웃이 없다(Node 기본 300s/60s — 211ms에 발화 불가). localtunnel 엣지가 합성한 응답이다. 고칠 코드가 없다 — 터널 경로 교체 사안
- **`AvailabilitySurface`의 LiveRegion 2곳** — §4. `LIVE_FRESHNESS_CAPTION` 문제는 D061 철학 영역
- **`?debug=1` 패널의 `origin: 미보고`** — `UiState`에서 `origin`은 `loading`/`empty`에만 있어 상태가 정착하면 "스캔에서 왔다"는 사실이 사라진다. 별건

---

## 8. 검증

`npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run e2e` 전부 통과.

그리고 **실기기 재측정**이 이 작업의 진짜 수용 기준이다. `npm run dev:live` → `?debug=1` → 계산바코드 스캔 → 패널의 `경과` 값을 14.1초와 대조한다. 가이드와 문구가 프레이밍을 고쳤다면 그 숫자가 내려가야 한다. 내려가지 않으면 이 설계의 전제(§0-2)가 틀린 것이므로, 고쳤다고 적지 말고 측정값을 기록한다.
