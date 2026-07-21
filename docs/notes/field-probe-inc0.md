# Field Probe Notes — Increment 0 (B9 / B11)

> 목적: Increment 0+1 design spec §2 "신규 검증 항목"·§13 B9의 필드 실측 결과를 기록한다.
> 철칙: data-owner 확인 또는 통제된 테스트로만 검증한다. 검증 불가 항목은 **추측하지 않고 OPEN으로 남기며, 기본값(프록시)을 유지**한다.
>
> 실행일: 2026-07-15.

---

## B11 — CORS / 프록시 필요성 (design spec §2 신규 검증 항목, §13 "CORS/프록시 필요성")

**방법**: data-owner 확인은 얻을 수 없었다. 대신 **통제된 테스트**로 검증했다 — 프로덕션 재고/거래를 변형하지 않는 순수 네트워크 관측(OPTIONS 프리플라이트 + 빈 바디 POST 1회)만 수행했고, 실제 매장/상품 조회 페이로드는 보내지 않았다.

**테스트 1 — 브라우저 프리플라이트 시뮬레이션 (임의 오리진)**:
```
OPTIONS https://mapi.daisomall.co.kr/ms/msg/newIntSelStr
Origin: https://example.invalid
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type
```
결과: `403` — 바디 `Invalid CORS request`. `Access-Control-Allow-Origin` 헤더 없음.

**테스트 2 — 몰 자체 오리진으로 재시도**:
```
OPTIONS https://mapi.daisomall.co.kr/ms/msg/newIntSelStr
Origin: https://www.daisomall.co.kr
```
결과: 동일하게 `403 Invalid CORS request`, `Access-Control-Allow-Origin` 헤더 없음.

**테스트 3 — 서버-서버 POST(브라우저 CORS 우회, 인증 없음)**:
```
POST https://mapi.daisomall.co.kr/ms/msg/newIntSelStr  (본문 {}, Origin 헤더 없음)
```
결과: `403` — 바디 `{"success":false,"message":"Unauthorized"}`.

**관측 결론 (CONFIRMED, 가설 아님)**:
- 이 오리진(임의 오리진이든 몰 자체 오리진이든)으로 보낸 프리플라이트가 전부 거부되고 `Access-Control-Allow-Origin`이 응답에 없다 → **PWA 오리진에서 브라우저가 직접 이 엔드포인트를 호출할 수 없다.** CORS 차단이 실측으로 확인됨.
- 추가로 인증 없는 POST는 `Unauthorized`(403)로 거부된다 → CORS를 우회하더라도(서버-서버) **별도 인증/헤더(세션·토큰·앱 시그니처 등 미상)가 필요**하다. 이 인증 메커니즘 자체는 이번 통제 테스트 범위 밖이며 **OPEN**으로 남긴다 — 추측하지 않는다.

**Increment 1에 대한 결론**:
- **프록시(functions/api/stock.ts, 기존 구현) 유지가 확정**된다 — design spec §2/§13의 기본값(프록시)이 그대로 맞다. 클라이언트가 `mapi.daisomall.co.kr`을 직접 호출하는 경로는 채택하지 않는다.
- **신규 OPEN 항목**: 업스트림이 요구하는 인증/헤더 메커니즘이 무엇인지 미상 (data-owner 확인 필요). 현재 프록시는 `content-type: application/json`만 전달하며 이 인증 없이는 실제 조회가 `403 Unauthorized`로 실패할 가능성이 있다 — Increment 1에서 실 어댑터(`newIntSelStr`)를 붙이기 전에 **반드시 data-owner에게 확인**해야 하는 블로커로 에스컬레이션 대상.

---

## B9 — iOS Safari PWA 제약 (design spec §13)

**방법**: 이 작업 환경은 Windows 11 CLI 에이전트 샌드박스이며 **물리 iOS 기기/Safari가 없다** — 설치·SW 캐싱·카메라·불안정망 실측을 이 세션에서 수행할 수 없었다.

**결과: 아직 실행 불가 (OPEN, 추측 없음)**. design spec §13이 요구하는 "Inc 0 실측"은 완료되지 않았다.

**Increment 1에 대한 결론**:
- B9는 여전히 **미해결 블로커**로 남는다 — 실기기 검증 없이 offline/fallback-first 설계를 최종 확정하지 않는다.
- 실기기 확보 시 최소 확인 항목(참고용 체크리스트, 실측 전까지 결론 아님):
  - Service Worker가 iOS Safari의 저장소 정책(장기 미사용 시 캐시 축소) 아래에서도 오프라인 답변 캐시(IndexedDB `daiso-finder`/`answers`)를 유지하는지.
  - 홈 화면에 설치된 standalone PWA에서 카메라/바코드(`getUserMedia`) 권한 요청이 정상 동작하는지 — Flow 3 대안 탐색의 바코드 입력 경로에 영향.
  - 매장 내 불안정 Wi-Fi(고지연·간헐적 단절)에서 `query-cache`의 2초 타임아웃 → 캐시 폴백 경로(§ Partial/Error)가 실제로 체감상 매끄러운지.
- 이 항목들은 실측되기 전까지 전부 **OPEN**이며 앱이 임의로 "동작한다"고 가정하지 않는다.

---

## 요약

| # | 항목 | 상태 | Increment 1 영향 |
|---|---|---|---|
| B11 | CORS/프록시 필요성 | **CONFIRMED** — 직접 호출 불가, 프록시 필요 | 프록시(기존) 유지. 업스트림 인증 메커니즘은 신규 OPEN — data-owner 에스컬레이션 필요 |
| B9 | iOS Safari PWA 제약 | **OPEN** — 실기기 부재로 미실행 | 실기기 검증 전까지 offline/fallback-first 설계 최종 확정 보류 |
