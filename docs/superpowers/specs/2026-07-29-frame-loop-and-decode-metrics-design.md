# 프레임 루프 이관 · 디코드 구간 계측 설계 (1단계)

> 상태: 오너 승인(2026-07-29). **rev 2 — 적대적 리뷰 반영**(Critical 3건 + Important 다수). 구현 플랜은 별도 문서.
> 선행: [`2026-07-28-scan-aim-guide-design.md`](2026-07-28-scan-aim-guide-design.md), [`2026-07-25-barcode-scan-design.md`](2026-07-25-barcode-scan-design.md) (§B30 결정군)
> 이것은 **2단계 계획의 1단계**다. 2단계(`zxing-wasm` 이관)는 이 단계의 측정 결과가 정당화할 때만 착수한다.

---

## 0. 왜 지금

2026-07-29 실기기(iPhone iOS 18.7 / Safari 26.5.2, localtunnel HTTPS, 권한 허용, 동일 상품 `965923434`) 측정:

| | 기준선 `3225d7b` | 브랜치 `de5b49a` |
|---|---|---|
| 정의 동일: `scan()` 진입 → outcome | `디코드 6207ms` | `스캔 소요 6675ms` |
| 카메라 승인 | (미분리) | 951ms |
| 디코더 준비 | 9ms | 11ms |

세 가지가 확정됐다.

1. **조준 가이드는 디코드를 앞당기지 않았다**(§B30-13). 부호가 오히려 반대(+468ms)다. n=1씩이라 반증은 아니지만 개선의 증거는 없다.
2. **디코더 로드는 병목이 아니다.** `디코더 준비 11ms` — 이미 캐시돼 있었다.
3. **파이프라인은 실기기에서 완주한다**(`/api/availability 200` → `state: success`). 2026-07-28의 408은 터널이었다.

### 5.7초의 정체 — 아직 모른다

`6675 − 951 − 11 = 5713ms`가 남는다. 이 잔차는 **디코드 루프만이 아니다.** 현 폴백은 `decodeOnceFromStream` → `attachStreamToVideo` → `playVideoOnLoadAsync`를 await하고 그것은 `playing` 이벤트에서만 resolve하는데(`BrowserCodeReader.js:325, 461, 491`), `cameraMs`는 `getUserMedia` resolve에서 끝난다(`browserScanner.ts:122`). 즉 **비디오 워밍업 구간이 어디에도 계상되지 않은 채 잔차에 섞여 있다.** (rev 1은 이 잔차를 "디코드 루프다"라고 단언했다 — §B30-11이 한 번 고친 것과 같은 종류의 오류였다.)

그리고 잔차 안에서 **(a) 한 번의 시도가 느린 것**인지 **(b) 읽힐 때까지 반복한 누적**인지 구분할 수 없다. 패널이 `시도 횟수: 측정 불가 (zxing 내부 루프)`라고 정직하게 말하는 그대로다 — 루프가 `BrowserCodeReader.decodeOnce` 안에 있고(`NotFoundException`마다 `setTimeout(loop, this._timeBetweenDecodingAttempts)`, 기본값 **0ms**), 우리는 그 안을 볼 수 없다.

이 구분이 `zxing-wasm` 이관 여부를 결정한다. 지불액이 작지 않으므로 측정 없이 지불하지 않는다 — 지연청크가 gzip **24.32 kB**(§B30-1 실측)에서 크게 늘어난다(정확한 수치는 §5 참조: 미검증 상류 주장).

### 부품은 있다 — 새 디코더 없이 루프를 가질 수 있다

`@zxing/library` 0.21.3에서 **직접 확인**한 것:

- `BrowserCodeReader.prototype.decodeBitmap(bitmap)` → `this.reader.decode(bitmap, this._hints)` (`:947`) — **1회 시도**, 못 찾으면 throw. public prototype 멤버.
- `HTMLCanvasElementLuminanceSource(canvas, doAutoInvert)` — **캔버스를 직접 받고** `canvas.width/height`로 크기를 얻는다(`:24-29`). `BinaryBitmap`·`HybridBinarizer`도 딥 경로에 존재한다.

**⚠️ rev 1의 전제는 틀렸다.** `createBinaryBitmap`은 캔버스를 받지 **않는다** — 타입이 `HTMLVisualMediaElement = HTMLVideoElement | HTMLImageElement`이고 내부 `drawImageOnCanvas`가 캔버스에 없는 `naturalWidth`를 읽어 아무것도 그리지 못한 뒤, 0×0 캡처 캔버스에서 `NotFoundException`이 아닌 예외를 낸다. 그대로 구현하면 **iOS 스캔이 첫 시도부터 죽고 저장소의 어떤 게이트도 잡지 못한다.** 그래서 비트맵을 직접 조립한다(§3).

---

## 1. 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | 이음매를 스트림 단위에서 **프레임 단위**로 낮춘다 | 지금 구조로는 시도를 셀 수 없다. 프레임 단위면 2단계의 디코더 교체가 함수 하나가 된다 |
| D2 | 이음매의 입력은 **`HTMLCanvasElement`**. zxing 어댑터는 `createBinaryBitmap`을 쓰지 않고 `BinaryBitmap`+`HybridBinarizer`+`HTMLCanvasElementLuminanceSource`로 **직접 조립**한다 | 캔버스가 두 디코더의 공통 화폐다(zxing-wasm은 같은 캔버스의 `getImageData()`를 쓴다). `createBinaryBitmap`은 캔버스를 못 받는다(§0) |
| D2a | 그 세 클래스는 **딥 `esm/…` 경로로만** import한다 | barrel을 쓰면 `sideEffects` 미선언 탓에 트리셰이킹이 안 돼 지연청크가 91.96 kB → 415.76 kB로 돌아간다(`browserScanner.ts:318-321`). §0의 기준선이 1단계 안에서 무효화된다 |
| D2b | `doAutoInvert = false`로 고정하고 그 사실을 기록한다 | 현 경로는 `HTMLVideoElement`일 때만 `true`이고 `FRAME_INDEX`가 static 토글이라 **한 프레임씩 반전 디코드가 섞인다**(`HTMLCanvasElementLuminanceSource.js:38-39`). 캔버스 경로에서는 이것이 사라진다 — "루프만 바뀐다"가 아니라 **디코드 동작 변경**이므로 명시한다 |
| D3 | 루프는 **자기 페이싱** — 이전 시도가 끝난 뒤에만 다음 프레임 | 겹치는 디코드는 큐를 쌓고 계측을 오염시킨다 |
| D4 | 프레임 확보는 `requestAnimationFrame`. 간격은 **프레임 루프 전용 상수**(`FRAME_LOOP_MIN_INTERVAL_MS`)를 새로 둔다. `pollIntervalMs`를 재사용하지 **않는다** | 두 루프는 구조가 다르다: 네이티브는 **고정 주기**(비동기·저비용 `detect`), 새 폴백은 **완료 후 최소 간격**(동기·고비용 디코드). 한 노브로 묶으면 폴백을 낮추는 순간 네이티브가 배수로 늘어난다 — 최적값이 반대 방향이다. (rev 1의 D4는 이를 "같은 페이싱"이라 서술했다) |
| D5 | 스트림 연결은 **기존 `attach()` 헬퍼 재사용** | 지금 네이티브 전용이다. 재사용하면 두 경로가 같은 연결 코드를 쓴다 |
| D6 | 구간을 **전부 분리 계측**한다 — §2 | 이 단계의 산출물 |
| D7 | `nativePolls`를 **`decodeAttempts`로 통합**하고 `측정 불가 (zxing 내부 루프)` 마커를 제거. `UNMEASURED` 상수와 그 테스트도 함께 제거 | 두 경로 모두 시도를 세게 되므로 그 문구가 **더 이상 사실이 아니다** |
| D7a | `decodeBusyMs`·`drawMs`·`loopIdleMs`는 **폴백 전용**. 네이티브 경로에서는 `null`로 남는다 | 네이티브 루프는 이전 `detect()`를 await하지 않는 `setInterval`이라(`browserScanner.ts:258-271`) 시도가 겹친다 — 합이 실시간을 초과할 수 있어 "시도당 비용"이 성립하지 않는다. 한 이름에 두 정의를 담지 않는다 |
| D8 | **디코더는 여전히 `@zxing/library`.** `zxing-wasm`을 설치하지 않는다 | 접근안 A의 전부 |
| D9 | 서비스워커 `globPatterns`·프록시 MIME·CDN 재정의는 **이번 범위 밖** | 전부 wasm 자산이 존재할 때만 의미가 있다 |
| D10 | 브래킷 크롭은 **이번 범위 밖**, 기록만 남긴다 | 제품 결정을 포함한다(§5) |

---

## 2. 계측 — 이 단계의 산출물

```ts
decodeAttempts: number | null;   // 시도 횟수 (두 경로 공통)
decodeBusyMs: number | null;     // 디코드 호출 안에서 보낸 시간 합 (폴백 전용)
drawMs: number | null;           // 프레임을 캔버스에 복사한 시간 합 (폴백 전용)
loopIdleMs: number | null;       // 루프가 의도적으로 잔 시간 + rAF 대기 합 (폴백 전용)
```

`null` 규율은 기존과 동일 — 측정하지 않았으면 `null`, 절대 `0`이 아니다. 패널은 `미보고`로 렌더한다.

### 왜 넷인가 — rev 1의 산식은 결론을 미리 정해놓고 있었다

rev 1은 `스캔 소요 − 카메라 승인 − 디코더 준비 − decodeBusyMs`를 "기다린 시간 = 초점·프레이밍 문제"로 읽었다. 그런데 그 잔차에는 **우리가 의도적으로 잔 시간**(5.7초 루프면 약 28회 × 간격)과 `drawMs`가 들어 있다. 즉 디코더가 아무리 느려도 잔차가 구조적으로 이기고, **결정 규칙이 증거와 무관하게 "wasm 불필요"를 출력**한다. 이 단계의 존재 이유가 그 판정인데 판정 장치가 고장 나 있었다.

네 구간을 각각 재면 남는 잔차가 **작아야 정상**이고, 크다면 그 자체가 "우리가 계상하지 못한 시간이 있다"는 발견이다(비디오 워밍업이 1순위 후보다 — §0).

### 판정 규칙

| 값 | 답하는 질문 | 함의 |
|---|---|---|
| `decodeBusyMs / decodeAttempts` | 시도 1회당 디코드 비용 | 크면 **디코더가 느리다** → 2단계 정당화 |
| `drawMs / decodeAttempts` | 시도당 프레임 복사 비용 | 크면 해상도·크롭 문제 → wasm은 무관 |
| `loopIdleMs` | 우리가 페이싱으로 버린 시간 | 크고 시도가 적으면 **간격이 과하다** → 상수 조정 |
| 잔차 = `스캔 소요 − 카메라 승인 − 디코더 준비 − (busy+draw+idle)` | 계상 못 한 시간 | 크면 비디오 워밍업 등 미계측 구간 존재 |

> **⚠️ 이 표는 틀렸다 — 정정 정본은 `docs/HANDOFF.md` + `open-questions.md §B30-15`(2026-07-30 전체-브랜치 최종 리뷰).** 두 군데가 잘못됐고, 구현은 이 표를 충실히 따랐다.
>
> 1. **잔차 규칙이 워밍업으로는 발화할 수 없다.** 이 규칙은 워밍업이 zxing `playVideoOnLoadAsync` 안에서 **어떤 카운터에도 닿지 않던** 옛 구조를 위해 쓰였다. 새 루프는 rAF 대기를 `videoWidth` 가드 **앞에서** `loopIdleMs`에 누적하므로 워밍업을 **삼킨다** — 잔차는 0 근처로 나오고, 3행의 "`loopIdleMs`가 크고 시도가 적다"는 신호와 워밍업 지배가 **구별되지 않는다**(그리고 그 처방인 간격 축소는 워밍업에 아무 효과가 없다). 수정: `warmupMs` 신설로 분리.
> 2. **`drawMs` 행은 사실상 발화하지 않는다.** `assemble()`이 `decodeFrame` 안에서 돌아 `getImageData`(8.3 MB 리드백) + greyscale + binarize가 전부 `decodeBusyMs`에 들어가고 `drawMs`는 GPU측 `drawImage`만 잰다. 해상도 비례 비용이 "디코더가 느리다 → wasm"으로 읽히는데, **D2가 이미 적어 둔 대로 zxing-wasm은 같은 캔버스를 같은 `getImageData`로 소비하므로 그 비용을 옮기지 않는다.** 수정: `assembleMs` 신설(= `decodeBusyMs`의 부분집합), 디코더 자신의 비용은 `decodeBusyMs − assembleMs`.

**주의:** `decodeBusyMs`는 디코더가 **일한** 시간이지 루프가 **돈** 시간이 아니다. 그리고 동기 디코드가 오래 물면 rAF 자체가 늦게 오므로 `loopIdleMs`와 완전히 독립이 아니다 — 해석 시 이 결합을 잊지 않는다.

### 발행 빈도 — 측정 대상을 교란하지 않는다

**네 값은 루프 종료 시 1회만 발행한다.** 매 시도 발행하면 `commit`이 모든 구독자를 동기 호출하고(`bus.ts:73-83`) 패널이 `buildReport` 전체를 재생성한다(`DiagnosticsBar.tsx:35, 68`). 측정 런은 정확히 `?debug=1` 런이므로, 기준선 4~5회 대비 약 28회 발행은 **비교 조건 자체를 깨뜨린다.** 패널이 실시간으로 이 값을 필요로 하지 않는다.

### 라벨

- `시도 횟수: {n}` (기존 라벨 유지, `측정 불가` 마커만 제거)
- `디코드 점유: {n}ms` / `프레임 복사: {n}ms` / `루프 대기: {n}ms` — `null`이면 `미보고`

---

## 3. 구조

### 이음매

```ts
// 지금 — 디코더가 스트림·연결·루프·재시도를 다 소유한다
export interface FallbackDecoder {
  decode(stream: MediaStream, video: HTMLVideoElement): Promise<string>;
  cancel(): void;
}

// 새로 — 디코더는 프레임 한 장만 본다
export interface FrameDecoder {
  /** 이 프레임에서 읽은 값, 또는 이 프레임엔 없음(null). 재시도 가능한 실패로 throw하지 않는다. */
  decodeFrame(canvas: HTMLCanvasElement): Promise<string | null>;
  dispose(): void;
}
```

### `null` vs throw — 세 예외를 모두 번역한다

zxing은 `NotFoundException` **외에 `ChecksumException`·`FormatException`도 재시도한다**(`BrowserCodeReader.js:813-816`). `DataMatrixReader`가 흐릿한 프레임에서 정확히 던지는 것들이다("`@throws FormatException if a Data Matrix code cannot be decoded` / `@throws ChecksumException if error correction fails`"). rev 1은 `NotFoundException`만 `null`로 봤는데, 그러면 **첫 부분 판독 프레임에서 런이 끝나고** 계측값도 함께 무의미해진다.

판별은 `instanceof`가 아니라 **`getKind()`** 로 한다 — `Exception.prototype.getKind()`가 `constructor.kind`를 반환하고(`Exception.js:30-33`) 세 클래스가 각각 `'NotFoundException'`·`'ChecksumException'`·`'FormatException'`을 갖는다. `browserScanner.test.ts:63-69`가 이미 CJS/ESM 분리로 cross-`instanceof`가 false임을 기록해 두었다.

그 셋이 아닌 예외만 진짜 오류로 남고, 그때 루프는 지금과 같이 `failed`로 끝난다.

### 루프

```
1. attach(video, stream)                                  ← D5, 기존 헬퍼
2. 반복:
     a. abort 확인 → cancelled
     b. rAF + 최소 간격 대기; 그 소요를 loopIdleMs에 누적   ← D4
     c. videoWidth가 0이면 시도로 세지 않고 continue
     d. t=now(); 캔버스에 그린다; drawMs += now()-t
     e. t=now();
        try   { value = await decodeFrame(canvas) }
        finally { decodeBusyMs += now()-t; attempts++ }    ← throw 경로도 계상
     f. abort 재확인 → cancelled                            ← 기존 계약 유지
     g. value면 decoded
3. finally: dispose() — 정확히 한 번 + 네 값 1회 발행
```

**(e)의 `finally`가 중요하다.** rev 1은 `attempts++`를 await 뒤에 뒀는데, 진짜 throw가 나면 그 시도가 카운터에서 빠져 **`failed` 런의 시도 수가 1 적고 그 비용이 사라진다.**

**(f)도 잃으면 안 된다.** 현재 `browserScanner.ts:299`가 디코드 **후** `signal.aborted`를 재확인해 `cancelled`를 반환한다. 없으면 오버레이가 닫힌 뒤 도착한 디코드가 `decoded`로 올라가 availability를 실행한다 — §4의 "`ScanOutcome` 계약 불변"과 모순된다.

**(c)의 스킵**: `videoWidth`가 0인 동안(메타데이터 전) 그릴 수 없다. 세면 시도당 비용이 희석돼 계측이 거짓말을 한다.

### 캔버스 소유

루프가 캔버스 하나를 만들어 재사용하고, `videoWidth`/`videoHeight`가 바뀔 때만 리사이즈한다. 매 프레임 새로 만들면 GC 압력이 된다.

**주입 가능한 draw 단계**: jsdom에는 실제 캔버스가 없다(`getContext`가 `null`, `canvas` 패키지 미설치 — 직접 확인). 루프의 draw를 주입 가능한 함수로 빼면 `FrameDecoder` 더블과 함께 **페이싱·abort·계측 계약을 캔버스 없이 테스트**할 수 있다. 이것이 없으면 루프 전체가 실기기 1회로만 검증된다.

---

## 4. 바뀌지 않는 것

`SCAN_FORMATS = ['data_matrix']` · `getUserMedia`의 `ideal` 1920×1080(`exact`/`min` 금지) · **네이티브 경로의 동작** · `ScanOutcome` 계약 · Zustand 배선 · 모든 UX 문구 · 브래킷 CSS. 1D 디코딩을 추가하지 않는다(880은 미사용 품번, 오너 진술 2026-07-28).

D2b의 `doAutoInvert` 변화는 이 목록의 예외이며 의도적이다.

---

## 5. 범위 밖 — 기록만

- **브래킷 영역 크롭** (D10). 루프가 캔버스에 부분만 그리면 픽셀이 줄고, §B30-10의 정직성 문제가 *경계 주장을 지우는 대신 경계를 진짜로 만드는* 방식으로 해소된다. **다만 이것이 디코딩을 빠르게 한다는 것은 가설이다**(§B30-10의 60% 인과와 같은 성격 — rev 1은 이를 표식 없이 단정했다). 그리고 **상자 밖 코드가 안 읽히게 된다** — 제품 결정이다. 오너가 기록 유지를 지시했다(2026-07-29).
  - **⚠️ 2026-07-30 정정**: 이 항목은 이제 2단계에서 `zxing-wasm`과 **나란히 놓이는 후보**다(HANDOFF 판정 규칙). 크롭이 줄이는 것은 `assembleMs`(`getImageData` 리드백 + greyscale + binarize)이고 **wasm은 그 값을 줄이지 않으므로**, 두 후보는 대체재가 아니라 **다른 구간을 겨누는 서로 다른 레버**다. 그 서열은 새 `assembleMs`로만 관측 가능하며, **수정 전 계측으로는 크롭을 서열화할 수 없었다** — 가설이라는 성격은 그대로다(측정이 지목해야 한다).
- **`zxing-wasm` 이관** — 2단계. 조건 셋(CDN 기본값 재정의 + 테스트 가드 / `globPatterns`에 `wasm` 추가 / 프록시 MIME + SPA 폴백)과 함께 다룬다. **페이로드 배수·기본 힌트 목록은 상류 문서 기반 미검증 주장이며**(패키지 미설치) 2단계 착수 시 실측한다.
- **초점 제약**(advanced constraints), **Web Worker 이관** — 측정이 지목하면.
- **포맷 감지 후 "계산바코드를 스캔해 주세요" 안내** — 오너 아이디어(2026-07-29). `ScanOutcome`·`NativeDetector`·`FrameDecoder` 셋 다 포맷을 싣지 않으므로 별건이다.

---

## 6. 위험

**우리 루프가 zxing 것보다 느릴 수 있다.** zxing은 간격 **0ms**로 쉬지 않고 재시도한다. 대응: 이 위험이 `decodeAttempts`와 `loopIdleMs`로 **보인다.** 값을 미리 추측해 고정하지 않는다.

**iOS Safari 백그라운드 전환.** rAF가 멈추면 런이 settle하지 않고 그 구간이 `loopIdleMs`에 쌓인다. 네이티브의 `setInterval`은 계속 tick하므로 두 경로가 비대칭이다. iOS가 트랙까지 suspend하는지는 저장소로 검증 불가. **측정 절차에 "백그라운드 전환된 런은 비교 제외"를 넣는다**(§B30-11의 프롬프트 규칙과 같은 성격).

**폴백 디코드 경로는 게이트가 잡지 못한다.** 현행 폴백 테스트는 전부 `loadFallbackDecoder`를 주입하고, 실제 리더를 만지는 유일한 테스트(`browserScanner.test.ts:48-75`)는 이름과 `typeof`만 단언한다. e2e는 목 스캐너를 쓴다. 즉 **비트맵 조립이 실제로 되는지는 실기기에서만 확인된다.** 플랜은 이를 명시하고, 최소한 조립 코드가 딥 경로를 쓰는지·`doAutoInvert`가 `false`인지는 단위 테스트로 고정한다.

---

## 7. 검증

`npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run e2e` 전부 통과. **빌드 게이트에 지연청크 크기를 추가한다** — D2a가 지켜졌으면 91.96 kB 부근이어야 하고, 415 kB로 튀면 barrel import가 섞인 것이다.

### 실기기 측정 — 이 단계의 수용 기준

비교 대상은 **`de5b49a`와 코드가 동일한 현 브랜치 상태**(그 위는 docs-only 커밋)와 새 루프. 동일 기기·동일 상품·권한 허용 상태, **각 2회 이상**. 첫 권한 프롬프트 런과 백그라운드 전환된 런은 비교에서 제외.

기록: `스캔 소요` · `카메라 승인` · `디코더 준비` · **`시도 횟수`** · **`디코드 점유`** · **`프레임 복사`** · **`루프 대기`**.

**성공 기준은 "빨라졌다"가 아니다** — 새 루프가 기존과 대등하거나 더 빠르면서, **네 구간이 분리돼 보이는 것**이다. 5.7초가 어디였는지 답이 나오면 이 단계는 성공이다. 느려졌다면 그 사실을 기록하고 간격을 조정한다. 어느 경우든 숫자를 그대로 적는다.
