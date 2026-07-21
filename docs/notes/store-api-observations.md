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
| 매장 | `POST /ms/msg/selStr` | `{"inclusiveStrCd":"10803"}` | 쿠키(Bearer 없음) | 미확보 |
| 인증 | `GET /auth/request` | — | — | 익명 JWT + `x-dm-uid`(30s) — 메커니즘은 k-skill SKILL.md |
| 재고(픽업) | `POST /pd/pdh/selStrPkupStck` | `[{"pdNo","strCd"}]`(배치) | Bearer + X-DM-UID | 미확보(k-skill: `stck` 필드) |
| **위치(진열)** | `POST /pdo/selIntPdStDispInfo` | `{"pdNo","strCd"}` | Bearer + X-DM-UID | ✅ 아래 |

### `selIntPdStDispInfo` 응답 (확보)

요청 `{"pdNo":"1070646","strCd":"10803"}` →

```json
{"message":null,"data":[{"zoneNo":"30","stairNo":"-1","storeErp":"10803"}],"extraData":{},"extraString":null,"returnCode":null,"success":true}
```

제안 매핑(Bible 확정 대상): `stairNo`→`StoreLocation.floor`, `zoneNo`→`StoreLocation.zone`, `storeErp`→`strCd`,
`data[]`→`StoreLocation[]`. **`data[]`가 이미 `{stairNo,zoneNo}` 쌍으로 오므로 newIntSelStr의 positional-zip 불필요**
(엔드포인트마다 위치 형태가 다름 → 어느 게 정본인지 Bible 판단).

## Bible/data-owner가 확정해야 할 미해결 항목

1. **매장 검색(A9) 정본**: `selStr`(fapi, `{inclusiveStrCd}`) vs `selStr*`(k-skill www) vs `FindStoreGoods`(www 통합검색). 응답 스키마로 판별.
2. **6상태 판정 소스**: `sleStsCd`(판매상태)·`directYn`(가맹)·`mrkGdsYn`(입고예정)·`qty`가 fapi 어디서 오는지 미확인. 위 4개 엔드포인트엔 안 보임 → 상품상세 엔드포인트 추정, 응답 필요.
3. **재고 종류**: `selStrPkupStck`=픽업 재고(위치 없음) vs Flow 1이 요구하는 진열 재고. 동일한지 확인.
4. **인증 스코프**: 어느 엔드포인트가 Bearer 필수인지(위치·재고는 필수, 매장 selStr은 쿠키만?).
5. **호스트 정합** + **프록시 설계**: fapi/mapi/www 다중 업스트림, 인증(익명 JWT+AES+uid)은 **서버(CF Worker)에서** 처리, 클라이언트는 내부 `/api/*`만(B10/B11 재검토).
6. **ToS/robots**: 익명이어도 anti-abuse 게이트 우회이므로 이용약관 확인.

## 관측된 실 데이터 엣지 (앱 영향)

- `stairNo:"-1"` = **지하층**. 앱 `formatLocation`의 `${floor}층`이 "-1층"으로 오표기 → 지하 표기 규칙 필요(Bible 카피 확인). A9 배선 시 formatter 수정 대상.
