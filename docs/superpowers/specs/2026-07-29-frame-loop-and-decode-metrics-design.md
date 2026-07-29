# 프레임 루프 이관 · 디코드 구간 계측 설계 (1단계)

> 상태: 오너 승인(2026-07-29). 구현 플랜은 별도 문서.
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
2. **디코더 로드는 병목이 아니다.** `디코더 준비 11ms` — 이미 캐시돼 있었다. 즉 약 5.7초(6675 − 951 − 11)는 **디코드 루프**다.
3. **파이프라인은 실기기에서 완주한다**(`/api/availability 200` → `state: success`). 2026-07-28의 408은 터널이었다.

### 답할 수 없는 질문 — 이 단계의 존재 이유

5.7초가 **(a) 한 번의 시도가 느린 것**인지 **(b) 읽힐 때까지 시도를 반복한 누적**인지 지금은 구분할 수 없다. 패널이 `시도 횟수: 측정 불가 (zxing 내부 루프)`라고 정직하게 말하는 그대로다 — 루프가 `@zxing`의 `BrowserCodeReader.decodeOnce` 안에 있고(`NotFoundException`마다 `setTimeout(loop, this._timeBetweenDecodingAttempts)`, 기본값 **0ms**), 우리는 그 안을 볼 수 없다.

이 구분이 `zxing-wasm` 이관 여부를 **혼자서** 결정한다:

- **(a)라면** 더 빠른 디코더가 답이다 → 2단계 착수.
- **(b)라면** 디코더를 바꿔도 헛돈이다. 초점·프레이밍·조명이 문제다.

그리고 지불액이 작지 않다: 지연청크 **gzip 24 kB → 약 438 kB(약 18배)**, 기본 옵션이 `tryHarder`·`tryRotate`·`tryInvert`·`tryDownscale` **전부 true**("Optimize for accuracy, not speed") — 1920×1080을 메인 스레드에서 그렇게 돌리면 **더 느릴 수도** 있다. 측정 없이 지불하지 않는다.

### 결정적 발견 — 새 디코더 없이 루프를 가질 수 있다

`@zxing/library`가 단일 프레임 API를 **이미 노출한다**:

- `BrowserCodeReader.prototype.createBinaryBitmap(mediaElement)` — 요소를 내부 캔버스에 그려 비트맵 반환
- `BrowserCodeReader.prototype.decodeBitmap(bitmap)` → `this.reader.decode(bitmap, this._hints)` — **1회 시도**, 못 찾으면 throw

zxing의 내부 루프는 정확히 이 둘을 `setTimeout`으로 감싼 것이다. 즉 **같은 부품으로 루프만 다시 조립**하면 되고, 이번 단계에 새 의존성은 없다.

---

## 1. 결정

| # | 결정 | 근거 |
|---|---|---|
| D1 | 이음매를 스트림 단위에서 **프레임 단위**로 낮춘다 | 디코더가 스트림·연결·루프·재시도를 다 갖는 지금 구조로는 시도를 셀 수 없다. 프레임 단위면 2단계의 디코더 교체가 함수 하나가 된다 |
| D2 | 이음매의 입력은 **`HTMLCanvasElement`** | zxing JS는 `createBinaryBitmap(canvas)`, zxing-wasm은 같은 캔버스의 `getImageData()`를 쓴다. 캔버스가 두 디코더의 공통 화폐다. 또한 **브래킷 크롭을 넣을 때 루프만 바꾸면 되고 디코더는 무관**해진다 |
| D3 | 루프는 **자기 페이싱** — 이전 시도가 끝난 뒤에만 다음 프레임 | 겹치는 디코드는 큐를 쌓고 계측을 오염시킨다. 시도당 비용을 재려면 시도가 직렬이어야 한다 |
| D4 | 프레임 확보는 `requestAnimationFrame`, 간격은 **기존 `pollIntervalMs`(기본 200ms) 재사용** | 새 노브를 만들지 않는다. 네이티브 경로가 이미 이 값으로 폴링하므로 두 경로가 같은 페이싱을 갖는다. rAF는 탭이 가려지면 멈춰 백그라운드 CPU도 함께 잡힌다 |
| D5 | 스트림 연결은 **기존 `attach()` 헬퍼 재사용** | 지금 네이티브 경로 전용이다. 재사용하면 두 경로가 같은 연결 코드를 쓰고, 새 코드가 아니다 |
| D6 | **`decodeAttempts`** + **`decodeBusyMs`** 를 진단 버스에 추가 | 이 단계의 산출물. §2에서 상술 |
| D7 | `nativePolls`를 **`decodeAttempts`로 통합**하고 `측정 불가 (zxing 내부 루프)` 마커를 제거 | 두 경로 모두 재게 되므로 그 문구가 **더 이상 사실이 아니다**. 남겨두면 무-날조 위반 |
| D8 | **디코더는 여전히 `@zxing/library`.** `zxing-wasm`을 설치하지 않는다 | 접근안 A의 전부. 두 변화를 섞으면 무엇이 효과였는지 다시 알 수 없다 |
| D9 | 서비스워커 `globPatterns`·프록시 MIME·CDN 재정의는 **이번 범위 밖** | 전부 wasm 자산이 존재할 때만 의미가 있다. 지금 손대면 죽은 설정이 된다 |
| D10 | 브래킷 크롭은 **이번 범위 밖**, 기록만 남긴다 | 제품 결정을 포함한다(§5) |

---

## 2. 계측 — 이 단계의 산출물

```ts
decodeAttempts: number | null;   // 시도 횟수 (두 경로 공통)
decodeBusyMs: number | null;     // 디코드 호출 안에서 보낸 시간의 합
```

`null` 규율은 기존과 동일하다 — 측정하지 않았으면 `null`, 절대 `0`이 아니다. 패널은 `미보고`로 렌더한다.

이 둘이 5.7초를 가른다:

| 계산 | 답하는 질문 |
|---|---|
| `decodeBusyMs / decodeAttempts` | **시도 1회당 비용** — 디코더가 느린가? |
| `스캔 소요 − 카메라 승인 − 디코더 준비 − decodeBusyMs` | **기다린 시간** — 초점·프레이밍이 문제인가? |

전자가 지배적이면 2단계(wasm)가 정당화된다. 후자가 지배적이면 **wasm은 돈만 쓰고 효과가 없다** — 그때는 초점 제약(원 요청 3의 advanced constraints)이나 크롭이 답이다.

**중요:** `decodeBusyMs`는 디코더가 **일한** 시간이지 루프가 **돈** 시간이 아니다. 둘의 차이가 곧 대기 시간이므로, 라벨이 이 구분을 흐리면 안 된다.

---

## 3. 구조

### 이음매

```ts
// 지금 — 디코더가 전부 소유한다
export interface FallbackDecoder {
  decode(stream: MediaStream, video: HTMLVideoElement): Promise<string>;
  cancel(): void;
}

// 새로 — 디코더는 프레임 한 장만 본다
export interface FrameDecoder {
  /** 이 프레임에서 읽은 값, 또는 이 프레임엔 없음(null). throw하지 않는다. */
  decodeFrame(canvas: HTMLCanvasElement): Promise<string | null>;
  dispose(): void;
}
```

`null`과 throw의 구분이 계약이다. zxing의 `NotFoundException`은 **정상적인 "이 프레임엔 없음"** 이고 실패가 아니다 — 어댑터가 이를 `null`로 번역한다. 진짜 오류만 throw로 남고, 그때 루프는 지금과 같이 `failed`로 끝난다.

### 루프

```
1. attach(video, stream)                     ← D5, 기존 헬퍼
2. 반복:
     a. abort 확인 → cancelled
     b. rAF로 프레임 대기 + 최소 간격(pollMs) 보장   ← D4
     c. video를 캔버스에 그린다
     d. t0 = now(); value = await decodeFrame(canvas); busy += now() - t0; attempts++
     e. publishScanner({ decodeAttempts: attempts, decodeBusyMs: busy })
     f. value면 decoded
3. finally: dispose() — 정확히 한 번                ← 기존 멱등 release 계약 유지
```

`dispose()`가 정확히 한 번만 불리는 것은 기존 테스트가 고정하는 계약이므로 그대로 지킨다.

### 캔버스 소유

루프가 캔버스를 하나 만들어 재사용한다. 매 프레임 새로 만들면 GC 압력이 되고, 크기가 매번 바뀌면 브라우저가 재할당한다. `videoWidth`/`videoHeight`가 바뀔 때만 리사이즈한다.

**`videoWidth`가 0인 동안**(메타데이터 전) 캔버스에 그릴 수 없다. 그 프레임은 시도로 세지 않고 넘긴다 — 세면 시도당 비용이 희석돼 계측이 거짓말을 한다.

---

## 4. 바뀌지 않는 것

`SCAN_FORMATS = ['data_matrix']` · `getUserMedia`의 `ideal` 1920×1080(`exact`/`min` 금지) · 네이티브 경로의 동작 · `ScanOutcome` 계약 · Zustand 배선 · 모든 UX 문구 · 브래킷 CSS. 1D 디코딩을 추가하지 않는다(880은 미사용 품번, 오너 진술 2026-07-28).

---

## 5. 범위 밖 — 기록만

- **브래킷 영역 크롭** (D10). 루프가 캔버스에 부분만 그리면 픽셀이 줄어 디코딩이 빨라지고, §B30-10의 정직성 문제가 *경계 주장을 지우는 대신 경계를 진짜로 만드는* 방식으로 해소된다. **다만 상자 밖 코드가 안 읽히게 된다** — 지금은 화면 밖 코드도 읽히므로 이는 제품 결정이다. 오너가 기록 유지를 지시했다(2026-07-29).
- **`zxing-wasm` 이관** — 2단계. 조건 셋(CDN 기본값 재정의 + 테스트 가드 / `globPatterns`에 `wasm` 추가 / 프록시 MIME + SPA 폴백)과 함께 다룬다.
- **초점 제약**(advanced constraints), **Web Worker 이관** — 측정이 지목하면.
- **포맷 감지 후 "계산바코드를 스캔해 주세요" 안내** — 오너 아이디어(2026-07-29). `ScanOutcome`·`NativeDetector`·`FrameDecoder` 셋 다 포맷을 싣지 않으므로 별건이다.

---

## 6. 위험

**우리 루프가 zxing 것보다 느릴 수 있다.** zxing은 간격 **0ms**로 쉬지 않고 재시도한다. `pollMs`(200ms)로 늦추면 시도 횟수가 줄어 오히려 늦게 잡힐 수 있다. 대응: 이 위험 자체가 `decodeAttempts`로 **보인다**. 측정이 시도 부족을 가리키면 간격을 낮춘다. 값을 미리 추측해 고정하지 않는다.

**`decodeBusyMs`가 메인 스레드 점유의 대리 지표일 뿐이다.** 디코드가 동기적으로 오래 물면 rAF 자체가 늦게 온다. 즉 시도당 비용이 크면 대기 시간도 함께 부풀 수 있고, 두 숫자는 완전히 독립이 아니다. 해석할 때 이 결합을 잊지 않는다.

---

## 7. 검증

`npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run e2e` 전부 통과.

### 실기기 측정 — 이 단계의 수용 기준

비교 대상은 **`3cd5cc5`**(현재 브랜치 팁, zxing 내부 루프)와 새 루프. 동일 기기·동일 상품·권한 허용 상태, **각 2회 이상**. 첫 권한 프롬프트 런은 비교에서 제외(§B30-11).

기록: `스캔 소요` · `카메라 승인` · `디코더 준비` · **`시도 횟수`** · **`디코드 점유`**.

**성공 기준은 "빨라졌다"가 아니다** — 새 루프가 기존과 대등하거나 더 빠르면서, **시도당 비용과 대기 시간이 분리돼 보이는 것**이다. 5.7초가 어느 쪽이었는지 답이 나오면 이 단계는 성공이다. 느려졌다면 그 사실을 기록하고 간격을 조정한다. 어느 경우든 숫자를 그대로 적는다.
