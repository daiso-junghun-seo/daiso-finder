# 스캔 조준 가이드 · 계산바코드 안내 설계

> 상태: 오너 승인(2026-07-28). 적대적 스펙 리뷰 반영본(rev 2). 구현 플랜은 별도 문서.
> 선행: [`2026-07-25-barcode-scan-design.md`](2026-07-25-barcode-scan-design.md) (§B30 결정군), [`2026-07-27-dev-diagnostics-panel-design.md`](2026-07-27-dev-diagnostics-panel-design.md)

---

## 0. 왜 지금

2026-07-28 아이폰(iOS 18.7 / Safari 26.5.2, localtunnel 경유) 실기기 측정에서 `?debug=1` 패널이 보고한 값 **발췌**:

```
해상도: 1920×1080 · frameRate: 30 · facingMode: environment
BarcodeDetector: false · 디코더: zxing · 준비 13ms
경과: 14.1s · 결과: decoded · query: 965923433
/api/availability · 408 · 211ms
```

### 확정된 것

1. **카메라 제약 수정은 유효하다.** `{ ideal: 1920/1080 }` 요청이 그대로 수용됐다. 2026-07-27에 미결로 남긴 실측이 닫혔다.
2. **읽은 값은 형식상 정상이다.** 관측 도시어의 실제 `pdNo`는 5·7·9자리이고 9자리 실측 예시(`926940033`)가 있다. `965923433`은 그 계열에 들어맞는다.
3. **답을 못 받은 원인은 408이다.** 앱 결함이 아니다(§7).

### 확정되지 **않은** 것 — `경과: 14.1s`는 디코드 시간이 아니다

`ScannerDiagnostics`(`bus.ts:15-27`)에는 **종료 시각 필드가 없다**. `report.ts:97-98`은 `now - startedAt`을 계산하고, `DiagnosticsBar.tsx:67`의 `const now = Date.now();`는 **매 렌더 재계산**된다. 위 덤프에 이미 `/api/availability · 408`이 들어 있다는 것은 그 보고서가 네트워크 응답 **이후에** 렌더됐다는 뜻이고, 패널을 펼치는 `setExpanded`도 렌더를 유발한다.

따라서 **14.1초 = 디코드 + 조회 왕복 + 테스터가 패널을 열기까지의 시간**, 즉 상한이다. 디코드가 실제로 얼마나 걸렸는지는 **아직 아무도 모른다.**

이 설계의 전제 — "해상도는 확보됐는데 피사체가 프레임에서 너무 작아 디코드가 느리다" — 는 그럴듯하지만 **미검증 가설**이다. 그래서 D10이 필요하다: 측정 수단부터 만들고, 그다음에 고쳤다고 말한다.

### 물리적 사실 (오너 진술, 2026-07-28)

- 계산대가 읽는 코드 영역은 한 덩어리다. 한쪽에 **"계산바코드"** 표기가 있고, 그 옆 흰 카드 위에 **정사각 DataMatrix**가 있다. 정사각 코드는 덩어리 가로폭의 30% 남짓.
- 포장에는 **880으로 시작하는 1D 바코드도 있으나 사용하지 않는 품번**이다.

두 항목 모두 저장소에 다른 근거가 없다 — 오너 진술이 유일한 출처이며, CLAUDE.md §3의 **data-owner 경험적 사실** 경로로 처리한다. D1은 도시어에 13자리·880 접두 식별자가 **0건**이라는 부정적 증거로 보강되지만, 그것이 "사용하지 않는 품번"을 증명하지는 않는다.

### 현재 문구의 결함

```
상품의 정사각형 코드를 화면 안에 맞춰 주세요.
```

맞출 프레임을 전제하지만 **화면에 프레임이 없고**, 덩어리 안 어디를 봐야 하는지도 말하지 않는다.

---

## 1. 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | 1D/EAN-13 디코딩을 **추가하지 않는다** | 880 바코드는 사용하지 않는 품번(오너 진술). 도시어에 13자리·880 접두 식별자 0건. 기존 §B30-2 유지 |
| D2 | 정사각 **모서리 브래킷** 조준 가이드를 얹는다. 바깥 딤 마스크는 **쓰지 않는다** | 마스크는 작은 피사체를 찾는 화면을 실제로 가린다 — 코드를 찾는 동안 주변이 안 보이면 조준이 더 어려워진다. 브래킷은 시야를 가리지 않는 조준 어포던스다 |
| D3 | 가이드는 짧은 변의 **60%**로 잡는다 | 채우려면 기기를 가까이 대게 되고, 그것이 모듈당 픽셀을 올린다. 이 인과가 이 설계의 **핵심 가설**이며 D10으로 검증한다 |
| D4 | `SCAN_AIM_GUIDE`를 교체하고 **`'계산바코드'` 토큰을 시각적으로 강조**한다 | 오너 요구: "계산바코드를 찍어야 한다는 걸 사용자가 인지 가능해야 한다" |
| D5 | 문구에 **색을 넣지 않는다** | 포장을 한 개만 관측했다. 전 상품 공통이라는 근거 없이 색을 단정하면 그 문구가 곧 거짓 안내가 된다 |
| D6 | 880/줄무늬 바코드를 **명시적으로 경고하지 않는다**(1문장 유지) | 오너 선택. Bible 2문장 상한 안에서 유도만으로 처리 |
| D7 | **스캐너 오버레이의 LiveRegion만** 시각적으로 숨긴다 | `AvailabilitySurface`의 것은 일부 상태에서 유일한 출처다(§4) |
| D8 | 숨김은 **clip 방식**만. `display:none`·`visibility:hidden` 금지 | 두 방식은 접근성 트리에서 노드를 제거해 실제 낭독까지 사라진다 |
| D9 | `dev-proxy.mjs`에 **`/api/search`를 등록**한다 | 클라이언트가 호출하는데 테이블에 없어 `dev:live`에서 404, 클라이언트는 이를 빈 후보로 조용히 삼킨다 |
| **D10** | **`ScannerDiagnostics`에 `decodeMs`를 추가**하고 `outcome` 발행 시점에 스탬프한다 | `경과`는 상한일 뿐이다(§0). 이 필드 없이는 D3의 핵심 가설도, 이 작업의 효과도 검증할 수단이 없다 |
| **D11** | `LiveRegion`에 **선택적 `visuallyHidden` prop**을 추가하고 스캐너에서만 켠다 | 후손 선택자(`.scanner-overlay [role=status]`)는 jsdom에서 검증 불가. prop은 className 존재로 단위 테스트가 잠글 수 있다 |

---

## 2. 조준 가이드

### 구조

`<video>`를 위치 기준 래퍼로 감싸고 그 안에 장식 형제를 둔다.

```
<section role="dialog">
  <div class="scanner-overlay__header"> … </div>
  <div class="scanner-overlay__viewport">        ← 신규, position: relative
    <video class="scanner-overlay__video" … />    ← ref 유지
    <div class="scanner-overlay__aim" aria-hidden="true">   ← 신규, position: absolute
      <span/> <span/> <span/> <span/>             ← 네 모서리 꺾쇠
    </div>
  </div>
  … 문구 …
</section>
```

- **`videoRef`는 `<video>`에 남긴다.** 래퍼로 옮기면 `videoRef.current`가 `<div>`가 되어 `ScannerOverlay.tsx:78-79`의 조기 return은 발화하지 않는다 — 대신 `useRef<HTMLVideoElement>` 타입 오류로 빌드가 막히거나, 어댑터가 `<div>`를 비디오로 오인해 다르게 실패한다. 조기 return은 ref를 아예 떼었을 때의 실패 모드다.
- `aria-hidden="true"` — 순수 장식이다. 의미는 문구가 전달한다.
- **알림(권한 거부·미지원·실패)이 뜨면 가이드도 함께 숨긴다.** 카메라가 실패한 상태에서 조준선을 남기는 것은 거짓 안내다.
- `<p>`를 추가하지 않으므로 `ScannerOverlay.test.tsx:122`의 `toHaveLength(1)`은 그대로 통과한다.

### 스타일

- `.scanner-overlay__viewport { position: relative; }` — `<video>`의 `width:100% / max-height:60vh / object-fit:cover`는 건드리지 않는다.
- `.scanner-overlay__aim` — `.scanner-overlay__viewport`의 **짧은 변 기준 60%**, `aspect-ratio: 1`, 중앙 정렬, `pointer-events: none`.
- 꺾쇠는 각 모서리에 인접한 두 변만 그린다. **채움 없음, 닫힌 테두리 없음, 바깥 딤 없음**(D2).
- `z-index`를 도입하지 않는다. 이 저장소에 `z-index` **선언**은 0건이고(주석 언급 2건은 "쓰지 않는다"는 진술) 스태킹 규약은 순수 DOM 순서다 — 래퍼 안에서 `<video>`보다 뒤에 오는 것으로 충분하다.
- 컨테이닝 블록은 새로 만드는 `__viewport`가 제공한다. (`.glass-surface`의 `position: relative`는 **같은 요소**에 걸린 `.scanner-overlay { position: fixed }`(`layout.css:92`)에 덮이므로, 그 요소의 실제 position은 `fixed`다. `fixed`도 컨테이닝 블록이 되지만 가이드는 비디오 박스 기준으로 놓여야 하므로 래퍼가 필요하다.)

### 디코더가 읽는 범위 (D2의 사실 근거)

native 경로는 `detect(target.video)`(`browserScanner.ts:254`), zxing 경로는 `decodeOnceFromStream`이 `videoWidth/videoHeight` 전체를 캔버스에 그린다. **어느 쪽도 ROI를 자르지 않는다.** §0의 아이폰은 `BarcodeDetector: false`였으므로 zxing 경로였다.

또한 `object-fit: cover` 때문에 디코더가 읽는 범위는 **화면에 보이는 범위보다 넓다** — 화면 밖으로 잘린 코드도 읽힌다. 가이드는 조준 보조일 뿐 인식 영역을 정의하지 않는다.

---

## 3. 문구

### 교체

```diff
- 상품의 정사각형 코드를 화면 안에 맞춰 주세요.
+ '계산바코드' 표시 옆 사각형 코드를 네모에 꽉 채워 주세요.
```

한 문장(Bible 2문장 상한 준수), 기술 용어 없음, 해요체. **"꽉 채워"** 는 D3의 메커니즘을 직접 지시한다 — 크게 잡을수록 모듈당 픽셀이 오르므로, 원하는 행동을 에둘러 말하지 않는다.

### 알고 감수하는 것

- **`'계산바코드'` 표기의 출처는 오너 진술이다**(2026-07-28: "실제로 다이소 상품은 '계산바코드'라고 포장지에 있습니다"). 저장소에 이 문자열은 없었다. D069의 매칭 토큰 규칙은 쇼퍼가 물리 세계와 대조해야 하는 토큰을 **세계가 렌더하는 대로 유지**하라고 규정하므로, 오너가 확인한 표기를 그대로 적는 것은 이 규칙의 **위반이 아니라 이행**이다.
- **"옆"은 n=1 관측이다.** D5가 같은 이유로 색을 뺐는데 배치는 남겼다. 차이는: 색은 다른 값이 존재할 수 있는 변수지만, "표기 옆에 코드가 있다"는 계산바코드 영역의 기능적 정의에 가깝다. 그래도 근거의 강도는 색과 다르지 않으므로, **다른 배치의 포장이 발견되면 이 문구는 정정 대상**임을 기록한다.

### 거버넌스

Bible의 Flow 1 카피 표는 final이지만 **뷰파인더 화면 자체를 정의하지 않는다** — 침묵 구간이다. 기존 `SCAN_AIM_GUIDE`(§B30-8)가 정확히 같은 경로로 들어왔다: 앱 정직 초안 → 오너 승인 → `open-questions.md §B`에 **Bible 비준 대기**로 기록 → verbatim 테스트로 고정. 동일하게 처리한다.

### 강조 구현

단일 정본을 유지하기 위해 `SCAN_AIM_GUIDE`는 **완성된 한 문장 그대로** 두고, 컴포넌트가 렌더 시점에 토큰으로 분할한다:

```ts
export const SCAN_AIM_GUIDE = "'계산바코드' 표시 옆 사각형 코드를 네모에 꽉 채워 주세요.";
export const SCAN_AIM_GUIDE_TOKEN = "'계산바코드'";
```

토큰을 찾지 못하면 문장을 그대로 렌더한다 — 분할 실패가 안내를 없애서는 안 된다. **이 폴백에도 테스트를 붙인다.**

### 접근성 — 예상되는 비용

이 오버레이는 포커스가 내내 `닫기`에 머물기 때문에 **`aria-describedby`가 안내를 읽어주는 유일한 통로**다. `<strong>` 중첩이 접근성 설명 문자열의 요소 경계에 공백을 끼워 넣을 것으로 **예상**된다(`dom-accessibility-api` 런타임 동작이므로 실행 전 저장소로는 확인 불가).

대응: 다이얼로그 설명 검증을 정확 일치에서 **핵심 토큰 포함**으로 바꾼다. 이쪽이 견고하다 — Bible 비준으로 문구가 교체돼도 깨지지 않는다. 구현 시 실제 계산된 설명 문자열을 확인하고 결과를 기록한다.

---

## 4. LiveRegion — 스캐너에 한정

### 문제

`LiveRegion`은 시각적 숨김이 없는 plain `<div>`다. 스캐너에서 오류가 나면 같은 문장이 `<p>`와 LiveRegion에 **두 번 보인다.**

### 왜 스캐너만인가

| 호출처 | 같은 문장이 시각적으로 렌더되는가 | 숨겨도 되는가 |
|---|---|---|
| `ScannerOverlay.tsx:148` | 예 — 바로 위 `<p>` | **예** |
| `AvailabilitySurface.tsx:420` (`RESULTS_NOTICE`) | 예 — `CandidateList.tsx:19` | 예(이번 범위 밖) |
| `AvailabilitySurface.tsx:451` (`announcement`) | **아니오 — 일부 상태에서** | **아니오** |

`success` + 비-inStock 4종(`temporarilyOut`·`discontinued`·`notCarried`·`restockArriving`)에서 `copy.ts:163-167`은 `LIVE_FRESHNESS_CAPTION`('방금 확인한 재고예요')을 낭독에 포함하지만 `AnswerCard.tsx:187-201`은 렌더하지 않는다. 숨기면 **시각 사용자가 그 문장을 잃는다.** 해소하려면 캡션을 추가하거나 낭독에서 빼야 하는데 **신선도 표기는 D061 철학 영역**이라 앱이 결정할 수 없다(CLAUDE.md §3).

### 기법과 검증 (D8·D11)

- `LiveRegion`에 선택적 `visuallyHidden` prop을 추가하고 **스캐너 호출처에서만** 켠다.
- `clip` 계열(1px 크기 + `clip-path` + `overflow:hidden`)만 쓴다.
- **검증 수단을 정확히 이해할 것:** Vitest는 plain CSS import를 스텁 처리하므로(`vite.config.ts` `css: { include: [/\.css\?raw$/] }`), jsdom에서 `getComputedStyle`로 숨김을 확인할 수 **없다**. 따라서:
  - `getByRole('status')`는 **"접근성 트리에 남아 있다"만** 증명한다. 잘못된 숨김 기법을 잡아내지 못한다 — 앞선 초안의 이 주장은 틀렸다.
  - `display:none`/`visibility:hidden` 부재와 `clip-path` 존재는 **`import css from './layout.css?raw'` 텍스트 단언**으로 잠근다(`glass.test.ts`의 기존 패턴).
  - prop이 실제로 적용됐는지는 **className 존재**로 단언한다.

---

## 5. `dev-proxy` `/api/search` 등록

`buildHandlers()`는 `/api/availability`와 `/api/stores` 둘만 등록한다. 클라이언트는 `/api/search`를 호출하고(`productSearchRepository.ts:15`), 404를 `if (!res.ok) return []`로 **조용히 빈 후보**로 처리한다.

- **스캔 경로는 이 라우트를 쓰지 않는다.** `runByScan`은 디코드된 값이 이미 정확한 식별자이므로 리터럴 후보 검색을 건너뛴다(`AvailabilitySurface.tsx:219-237`). 따라서 D9는 §8의 실기기 재측정을 막지 않으며, **타이핑 검색 후보 플로우만** 막는다. 앞선 초안의 "실기기 검증 자체를 막고 있다"는 과장이었다.
- `functions/api/search.ts`의 `onRequestPost` 시그니처는 나머지 둘과 문자 단위로 동일하다. 한 줄 추가로 끝난다.
- **새 env가 필요 없다.** 프록시는 env 객체 하나를 모든 핸들러에 넘기고, `search.ts`는 `cfg.wwwBase`(=`SEARCH_BASE`)만 쓴다. `.dev.vars`에 이미 있다.
- **동작이 달라진다.** 지금은 후보가 항상 비어 키워드 단독 조회로 흘렀다. 등록 후에는 후보 2건 이상(`AvailabilitySurface.tsx:163`)인 키워드가 **candidates 상태**를 띄운다.
- **테스트는 소스 텍스트 대조로 작성한다.** `dev-proxy.mjs`는 export가 0개이고 마지막 줄이 `main();`이라 import하는 순간 서버가 기동한다 — `buildHandlers`를 직접 부를 수 없다. 파일을 읽어 핸들러 테이블 리터럴의 키를 뽑고, `functions/api/`의 비-테스트 `.ts` 목록과 대조한다.
- `docs/deploy/gpu01-node-proxy.md:224`가 "two routes"라고 적고 있다. 함께 고친다. (`dev-proxy.mjs` 헤더 주석에는 "두 라우트"라는 표현이 없다 — 대신 `/api/search`가 빠진 열거가 있어 그쪽을 손본다.)
- gpu01 운영 프로세스가 같은 파일을 쓰므로 동일 누락이 있다. 재배포 필요 항목으로 기록한다.

---

## 6. 테스트 영향

**깨지므로 함께 고칠 것**

| 위치 | 단언 | 조치 |
|---|---|---|
| `copy.test.ts:254` | `expect(SCAN_AIM_GUIDE).toBe('상품의 정사각형 코드를…')` | 새 문장으로 교체 |
| `ScannerOverlay.test.tsx` `getByText(SCAN_AIM_GUIDE)` (46·86·123) | `getNodeText`가 직속 텍스트 노드만 이어붙임 | 토큰 포함 또는 `AIM_GUIDE_ID` 기반으로 전환 |
| `ScannerOverlay.test.tsx:53-55` | `description: SCAN_AIM_GUIDE` 정확 일치 | 핵심 토큰 포함으로 전환(§3) |
| `ScannerOverlay.test.tsx:89` | `queryByText(SCAN_AIM_GUIDE)).not.toBeInTheDocument()` | **분할 후에는 가이드가 남아 있어도 통과한다** — 안전망이 조용히 소멸하므로 `AIM_GUIDE_ID` 기반으로 전환 필수 |

**그대로 통과해야 할 것 — 통과 여부가 곧 증거**

- `ScannerOverlay.test.tsx:122` `querySelectorAll('p')` 길이 1 — 문단을 늘리지 않았다
- `ScannerOverlay.test.tsx:101` `getByRole('status')` — LiveRegion이 접근성 트리에 남아 있다 (숨김 기법 자체는 증명하지 못함, §4)
- `ScannerOverlay.test.tsx:26` `video[aria-hidden]` — 래퍼 추가가 구조를 깨지 않았다

**새로 추가**

1. 조준 가이드가 스캐닝 중 렌더되고 `aria-hidden`이며, 알림 상태에서는 사라진다
2. 강조 토큰이 `<strong>`으로 렌더되고, 문단 전체 텍스트는 `SCAN_AIM_GUIDE`와 동일하다
3. 토큰 분할 실패 시 문장을 그대로 렌더한다
4. 스캐너 LiveRegion에 숨김 className이 붙고, `layout.css`에 `display:none`/`visibility:hidden`이 없으며 `clip-path`가 있다(`?raw` 텍스트 단언)
5. 핸들러 테이블이 `functions/api/`의 모든 비-테스트 핸들러를 포함한다(소스 텍스트 대조)
6. `decodeMs`가 `outcome` 발행 시점에 스탬프되고, 미측정 시 `null`로 남는다(D10)

---

## 7. 범위 밖

- **1D/880 디코딩** — D1
- **터널 408** — 앱 결함이 아니다. `/api/availability` 핸들러가 낼 수 있는 status는 200/400/502뿐이고 업스트림 상태는 중계되지 않으며, `src`·`functions`·`scripts`·`dist` 어디에도 408이 없고 프록시에 타임아웃이 없다(Node 기본 300s/60s — 211ms에 발화 불가). **여기까지가 확인된 것이고, 발신 주체가 localtunnel이라는 귀속은 소거법에 의한 추정이다.** 고칠 코드는 없다 — 터널 경로 교체 사안
- **`AvailabilitySurface`의 LiveRegion 2곳** — §4. `LIVE_FRESHNESS_CAPTION` 문제는 D061 철학 영역. 다만 **D9가 이 결함을 새로 노출시킨다**: `/api/search` 등록으로 candidates 상태가 `dev:live`에서 처음 도달 가능해지면 `RESULTS_NOTICE`가 두 번 보인다. 순수 중복이라 정보 손실은 없다
- **`?debug=1` 패널의 `origin: 미보고`** — `UiState`에서 `origin`은 `loading`/`empty`에만 있어 상태가 정착하면 "스캔에서 왔다"는 사실이 사라진다. 별건

---

## 8. 검증

### 게이트

`npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run e2e` 전부 통과.

### 실기기 재측정 — 이 작업의 진짜 수용 기준

D10의 `decodeMs`가 있어야 성립한다. 절차:

1. `HOST=0.0.0.0 npm run dev:live` (기본값은 `127.0.0.1`이라 폰이 접속할 수 없다) 또는 터널 경유
2. 폰에서 `?debug=1`로 접속
3. **먼저 현재 코드로** 계산바코드를 스캔해 `decodeMs`를 기록한다 — 이것이 기준선이다
4. 가이드·문구 적용 후 같은 상품·같은 조명에서 다시 스캔해 `decodeMs`를 기록한다

3번이 없으면 비교 대상이 없다. **`경과: 14.1s`는 기준선이 아니다**(§0).

내려가지 않으면 D3의 가설이 틀린 것이다 — 그때는 고쳤다고 적지 말고 측정값을 그대로 기록하고, 프레이밍이 아닌 다른 원인을 찾는다.
