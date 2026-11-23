# GCP e2-micro — deploy runbook (P4)

> **STATUS: DEPLOYED — 2026-11-16.** <https://136-118-220-98.sslip.io> 가 떠 있다(커밋
> `d5a5c31`). 호스트는 **GCP Compute Engine `e2-micro` Always Free**. Oracle과 달리 유휴 자원
> 회수 정책이 없고, 무료 티어에 종료일이 없어 "한 번 세우면 손대지 않는" 운영에 맞는다.
> 배포 실측·검증 기록은 §12.
>
> 호스트 조작 스크립트는 Oracle판과 공유한다: [`deploy/node-proxy/`](../../deploy/node-proxy/).
> 코드는 동일한 [`scripts/dev-proxy.mjs`](../../scripts/dev-proxy.mjs)이며 포크는 없다.

## 0. 형태

Shape A — 한 프로세스가 `dist/`(SPA)와 `/api/*`를 같은 오리진에서 서빙한다. 클라이언트는 상대
경로 `/api/*`를 그대로 쓰므로 **앱 코드 변경이 없다**.

```
phone ──HTTPS──▶ Caddy :443 ──HTTP──▶ 127.0.0.1:8790 (node scripts/dev-proxy.mjs)
                                        ├─ dist/  (PWA)
                                        └─ /api/* (functions/api/*.ts, esbuild로 런타임 번들)
```

## 1. 계정·과금 — 여기가 유일한 함정

1. <https://console.cloud.google.com/freetrial> 가입. 카드 등록 + $300/90일 체험 크레딧.
2. **90일 안에 유료 결제 계정으로 업그레이드**한다. 체험 계정은 90일이 지나면 닫히고, 리소스가
   정지된 뒤 **30일 유예** 끝에 영구 삭제된다. 업그레이드해도 **Always Free 한도 안에서는 청구가
   사실상 0**이다 — e2-micro·30 GB·월 1 GB egress는 무료이고, 외부 IPv4는 청구 SKU
   (`C054-7F72-A02E`) 기준 월 721시간까지 0원이라 31일 달의 초과분만 ~154 KRW다(가격 페이지에는
   '1시간'으로 적혀 있어 첫 청구서로 확인). **월 1 GB egress를 넘는 순간이 실제 과금 지점**이고,
   2,000 KRW 킬 스위치는 그때 VM을 멈춘다.
3. Always Free 한도는 **결제 계정 단위 월 한도**다(프로젝트를 늘려도 e2-micro가 늘지 않는다).

### 1.1 과금 킬 스위치 (2026-11-16 구성·검증 완료)

GCP에는 Compute Engine을 대상으로 하는 지출 상한(spend cap)이 **없다**. 예산은 알림만 보낸다.
그래서 **예산 100% 도달 시 결제 계정 연결을 끊는 Cloud Function**을 둔다.

- 프로젝트 `daiso-finder-prod`(번호 `941937888130`), 결제 계정 `01190A-47AC16-CA6D86`(통화 **KRW**).
- 예산: **2,000 KRW/월**, 프로젝트 스코프, 임계 **100%**, `INCLUDE_ALL_CREDITS`.
  무료 티어는 크레딧으로 적용되므로 한도 안에서는 순액이 0이고 예산이 발동하지 않는다.
- 발동하면 프로젝트의 결제가 꺼지고 VM·함수가 멈춘다. **삭제는 없다.** 재개:

```bash
gcloud billing projects link daiso-finder-prod --billing-account=01190A-47AC16-CA6D86
```

- 함수 소스: [`deploy/gcp-killswitch/`](../../deploy/gcp-killswitch/). 서비스 계정에는 결제 계정이
  아니라 **프로젝트에만** `roles/billing.projectManager`를 준다 → 이 프로젝트의 결제만 해제 가능.
- **2026-11-16 검증**: 합성 예산 메시지 발행 → `billingEnabled=false` 확인 → 재연결. 로그:
  `kill switch: billing unlinked from daiso-finder-prod (billingEnabled=false)`.

재현 명령:

```bash
gcloud projects create daiso-finder-prod --name="DAISO Finder"
gcloud billing projects link daiso-finder-prod --billing-account=<BILLING_ACCOUNT>

gcloud services enable compute.googleapis.com cloudfunctions.googleapis.com pubsub.googleapis.com \
  billingbudgets.googleapis.com cloudbilling.googleapis.com cloudbuild.googleapis.com \
  containerregistry.googleapis.com storage.googleapis.com iam.googleapis.com logging.googleapis.com \
  cloudresourcemanager.googleapis.com run.googleapis.com eventarc.googleapis.com \
  --project=daiso-finder-prod

gcloud iam service-accounts create budget-killswitch --project=daiso-finder-prod
gcloud projects add-iam-policy-binding daiso-finder-prod \
  --member="serviceAccount:budget-killswitch@daiso-finder-prod.iam.gserviceaccount.com" \
  --role="roles/billing.projectManager"
gcloud projects add-iam-policy-binding daiso-finder-prod \
  --member="serviceAccount:budget-killswitch@daiso-finder-prod.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer"
gcloud pubsub topics create budget-killswitch --project=daiso-finder-prod

bash deploy/gcp-killswitch/deploy.sh

# Eventarc가 Cloud Run(2nd gen 함수)을 호출할 수 있게. 없으면 401 run.routes.invoke.
gcloud run services add-iam-policy-binding budget-killswitch \
  --project=daiso-finder-prod --region=us-west1 \
  --member="serviceAccount:budget-killswitch@daiso-finder-prod.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

예산은 **REST로 만든다**(`gcloud billing budgets create`는 이 SDK 590.0.0에서 400이 난다 —
`--credit-types-treatment`가 `budgetFilter`가 아니라 최상위로 직렬화된다). 본문의 핵심:

```json
{
  "displayName": "daiso-finder-prod 2000 KRW monthly",
  "budgetFilter": {
    "projects": ["projects/daiso-finder-prod"],
    "creditTypesTreatment": "INCLUDE_ALL_CREDITS",
    "calendarPeriod": "MONTH"
  },
  "amount": { "specifiedAmount": { "units": "2000" } },
  "thresholdRules": [{ "thresholdPercent": 1.0 }],
  "notificationsRule": {
    "pubsubTopic": "projects/daiso-finder-prod/topics/budget-killswitch",
    "schemaVersion": "1.0"
  }
}
```

- `amount.specifiedAmount`에 **USD를 넣으면 `INVALID_ARGUMENT`** — 결제 계정 통화(KRW)만 허용된다.
- 알림 규칙 필드 이름은 `notificationsRule`이다(`allUpdatesRule`은 거부된다).
- 예산을 만들면 Cloud Billing이 토픽에 `billing-budget-alert@system.gserviceaccount.com` /
  `roles/pubsub.publisher`를 자동으로 부여한다. 별도 작업 없음.

> 함수는 `budgetDisplayName`이 위 이름과 **정확히 일치**하고 `alertThresholdExceeded >= 1`일 때만
> 결제를 끊는다. 50% 알림이나 다른 예산 알림으로는 멈추지 않는다.

## 2. 인스턴스

Compute Engine → VM instances → **Create instance**.

| 항목 | 값 | 비고 |
|---|---|---|
| Name | `daiso-finder-proxy` | |
| Region / Zone | **`us-west1-b`** (Oregon) | 무료 리전은 `us-west1`·`us-central1`·`us-east1` 뿐. 한국에서 가장 가까운 곳 |
| Machine type | **`e2-micro`** | 2 vCPU(공유) / 1 GB |
| Boot disk | **Ubuntu 24.04 LTS**, **Standard persistent disk 30 GB** | **Balanced로 두면 과금**된다 |
| Firewall | **Allow HTTP traffic** + **Allow HTTPS traffic** 체크 | 태그 `http-server`/`https-server` 부여 |
| External IP | **Static**(예약) | 재부팅·중지 후에도 sslip.io 호스트명 유지 |
| Preemptible | **끔** | 무료 대상은 non-preemptible만 |

`e2-micro` 무료는 **인스턴스 수가 아니라 시간 기준**이다(월 총 시간 이내). 한 대만 쓰면 된다.

gcloud로 만드는 경우(콘솔 대신):

```bash
gcloud compute addresses create daiso-proxy-ip --region=us-west1
gcloud compute instances create daiso-finder-proxy \
  --zone=us-west1-b --machine-type=e2-micro \
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-standard \
  --tags=http-server,https-server --address=daiso-proxy-ip
```

## 3. 네트워크

- **VPC firewall**: `default-allow-ssh`(22), `default-allow-http`(80), `default-allow-https`(443).
  콘솔 체크박스가 뒤의 두 개를 만들어 준다. 없으면:

```bash
gcloud compute firewall-rules create default-allow-http \
  --allow=tcp:80 --target-tags=http-server --source-ranges=0.0.0.0/0
gcloud compute firewall-rules create default-allow-https \
  --allow=tcp:443 --target-tags=https-server --source-ranges=0.0.0.0/0
```

- GCP Ubuntu 이미지는 호스트 iptables가 비어 있다(차단은 VPC firewall이 담당). `bootstrap.sh`의
  iptables 단계는 멱등이며 여기서는 사실상 no-op이다.
- **고정 IP 주의**: VM을 중지해도 예약 IP를 **해제하지 않으면 미연결 IP로 과금**된다(시간당
  ~$0.01). 오래 멈출 때는 `gcloud compute addresses delete daiso-proxy-ip --region=us-west1`.

## 4. 호스트명 — 도메인 없이 0원

`sslip.io`가 `<공인IP를 점 대신 하이픈으로>.sslip.io`를 그 IP로 해석한다. Let's Encrypt
HTTP-01이 그대로 통과하므로 Caddy가 자동으로 인증서를 받는다. 도메인이 있으면
`bootstrap.sh`에 인자로 넘기면 된다.

## 5. 부트스트랩 (최초 1회)

```bash
# 콘솔의 SSH 버튼 또는:
gcloud compute ssh daiso-finder-proxy --zone=us-west1-b

# VM에서:
git clone https://github.com/daiso-junghun-seo/daiso-finder.git ~/apps/daiso-finder-repo
bash ~/apps/daiso-finder-repo/deploy/node-proxy/bootstrap.sh
```

도메인을 쓸 경우:

```bash
bash ~/apps/daiso-finder-repo/deploy/node-proxy/bootstrap.sh daiso.example.com
```

스크립트가 하는 일(멱등): 2 GiB 스왑 → Node 22 → iptables 80/443 → Caddy → 저장소 클론 →
`.env`(`HOST=127.0.0.1`, `PORT=8790`) → systemd 유닛 → Caddyfile → 첫 배포 → 공개 `/health`.

> e2-micro는 0.25 vCPU 수준이라 `npm ci` + `vite build`가 **10~15분** 걸린다. 스왑 2 GiB가
> OOM을 막는다. A1/Oracle보다 느린 것이 정상이다.

## 6. 업데이트·롤백

```bash
bash ~/apps/daiso-finder-repo/deploy/node-proxy/deploy.sh
```

`origin/main` 빌드 → 런타임 트리 교체 → 재시작 → `/health` → `deployed-sha` 기록. 실패하면
`~/apps/daiso-finder-proxy.prev`로 자동 롤백한다. **테스트는 VM에서 돌리지 않는다** — `main`은
보호되어 있고 CI `gates`가 모든 push를 막는다.

## 7. 검증

```bash
curl -fsS http://127.0.0.1:8790/health
curl -fsS https://<host>/health

curl -fsS -X POST https://<host>/api/stores \
  -H 'content-type: application/json' -d '{"query":"강남"}'
# rows[0].strCd 로:
curl -fsS -X POST https://<host>/api/availability \
  -H 'content-type: application/json' -d '{"strCd":"<strCd>","keyword":"밀폐용기"}'
```

200 + `productName`/`stck`가 오면 daisomall 인증 레그까지 통과다. 502는 upstream, 403은 인증,
429는 레이트리밋. 마지막으로 폰에서 `https://<host>`를 열어 설치하고 Flow 1→2→3을 걷는다.

## 8. 운영

```bash
systemctl status daiso-finder-proxy
journalctl -u daiso-finder-proxy -f
sudo systemctl restart daiso-finder-proxy
sudo journalctl -u caddy -n 50 --no-pager
```

- 디스크: `df -h /` · `npm cache clean --force` · `sudo journalctl --vacuum-time=14d`
- 로그에는 비밀번호·토큰이 없다(프록시는 메서드·경로·상태·소요만 남긴다).
- **자동 업그레이드가 서비스를 재시작한다.** Ubuntu `unattended-upgrades`가 라이브러리(예: `libc6`)를
  올린 뒤 `needrestart`로 서비스를 재기동한다 — 2026-11-16 06:02 UTC 실측, SIGTERM → 즉시 재기동,
  다운타임 1초 미만. 놀랄 일은 아니지만 필드 테스트 중 짧은 끊김이 생길 수 있다.
  `/var/log/unattended-upgrades/unattended-upgrades.log`에서 무엇이 올라갔는지 본다.
- 커널 업그레이드는 재부팅이 필요하고 **자동 재부팅은 꺼져 있다**(`Automatic-Reboot` 주석 처리 =
  기본 false). `sudo reboot`는 직접 한다. 재부팅 뒤에도 서비스는 `enabled`라 자동으로 뜬다.
- 예산 알림 메일이 오면 결제 → 리포트에서 SKU 확인(대개 디스크 타입 또는 egress).

## 9. 이 호스트의 고유 리스크 — 지연

클라이언트의 `/api/availability` 시도 타임아웃은 **1.8초**
(`AVAILABILITY_ATTEMPT_TIMEOUT_MS`, 2초 query-cache 바로 아래). 미국 리전이라 예산은 이렇게 된다:

| 구간 | 예상 |
|---|---|
| 폰(한국) ↔ VM(오리건) | 0.3–0.4 s |
| VM ↔ daisomall(한국) 인증·selStr·병렬 조회 | 0.5–0.7 s |
| **합계** | **0.8–1.1 s** (헤드룸 0.7–1.0 s) |

평시에는 통과하지만 daisomall이 느린 날은 Partial/Error로 강등될 수 있다. 필드에서 타임아웃이
잦으면 서울 리전 호스트로 옮기는 것이 맞다(Cloud Run `min-instances=1`은 유료, 서울 VPS는
월 3~5천원). 정적 자산(precache ~396 KiB) 첫 로드는 1~2초 걸린다.

## 10. 비용

| 항목 | Always Free | 초과 시 |
|---|---|---|
| e2-micro | 월 총 시간 이내 1대 | — |
| Standard persistent disk | 30 GB | ~$0.04/GB·월 |
| Egress (북미 → 전세계, 중국·호주 제외) | **1 GB/월** | ~$0.12/GB |
| 고정 IP | 연결 중 무료 | 미연결 시 ~$0.01/h |
| 예산 알림 | 무료 | — |

1 GB egress는 앱 설치 약 900회(precache 1,134 KiB) 분량이다. 필드 테스트는 수십 MB 수준이라
한도 안에 들어온다. 공개 사용자가 늘면 egress가 첫 과금 지점이 된다.

## 11. 남은 것

- **폰에서의 필드 검증**(Flow 1→2→3). 이 문서는 서버·API까지 확인했고, 매장 안 동작은 아직이다.
- **2027-01-19경 무료 체험 종료 전 유료 결제 계정으로 업그레이드.** 체험 계정이 닫히면 리소스가
  정지되고 30일 유예 뒤 삭제된다. Always Free(e2-micro·30 GB·월 1 GB egress) 안이면 업그레이드 후
  청구는 사실상 0이고, 외부 IPv4도 SKU 기준 월 721시간까지 무료(31일 달 ~154 KRW)다.
  **월 1 GB egress 초과가 첫 과금 지점**이며 2,000 KRW 킬 스위치가 그때 동작한다.
- 공개 사용자가 늘면 `X-Forwarded-For` 인식(§12.3)과 egress 한도(§10)를 먼저 본다.

## 12. 배포 기록 (2026-11-16)

### 12.1 실측

| 항목 | 값 |
|---|---|
| URL | <https://136-118-220-98.sslip.io> |
| VM | `daiso-finder-proxy` · `us-west1-b` · `e2-micro` · 30 GB `pd-standard` |
| 고정 IP | `136.118.220.98` (`daiso-proxy-ip`) |
| 배포 커밋 | `d5a5c31` (부트스트랩) → **최근 갱신 `e3fbaf6` (2026-11-23)** |
| 부트스트랩 소요 | 약 10분 (`npm ci` 2분 + `tsc -b`/`vite build` 5~6분) |
| 공개 `/health` | 200, TLS 포함 0.21 s |
| `POST /api/stores` `{"query":"강남"}` | 200, 10개 매장, **0.149 s** |
| `POST /api/availability` `{"strCd":"11199","keyword":"밀폐용기"}` | 200, `밀폐용기 2.8 L` / 2,000원 / `stck:"0"` / `locations:[{"floor":"-2","zone":"68"}]`, **0.803 s** (웜 0.37 s) |
| `POST /api/alternatives` `{"strCd":"11199","keyword":"밀폐용기","excludePdNo":"1031166"}` | 200, 3행 전부 위치 있음, 첫 호출 **1.94 s** · 웜 **0.50 s** |
| PWA 자산 | `/`·`/manifest.webmanifest`·`/sw.js`·`/icons/icon-192.png`·`/icons/icon-512.png` 모두 200 |

`0.803 s`는 클라이언트 예산 1.8 s 안이다(§9 표의 예상 0.8–1.1 s와 일치). 인증 레그까지 포함한
수치이므로 daisomall이 느린 날만 강등 위험이 있다.

`/api/alternatives`의 첫 호출 1.94 s는 **upstream 인증·TLS가 차가운 상태**의 값이다. 같은 본문을
다시 보내면 0.50 s다. 클라이언트 예산은 `ALT_TIMEOUT_MS = 2000`이고 Flow 3는 항상 Flow 1/2 뒤에
열리므로(둘 다 availability를 먼저 호출한다) 실제 경로는 웜 구간을 탄다. 그래도 앱을 새로 켜고
곧바로 Flow 3로 가는 예외 경로는 예산에 근접하니, 필드에서 Error가 보이면 이 콜드 스타트를 먼저
의심한다.

**같은 날 `e3fbaf6` 재배포**: 델타(`643e547`·`e3fbaf6`)는 **docs-only**여서 빌드 산출물이 `fcfc428`과
바이트 동일했다 — 엔트리 `assets/index-BMQxnTqA.js` **190,910 B**, precache **45 entries / 1,134.40 KiB**,
`/health` 200, `POST /api/availability` 200 **1.54 s**. 재시작 때 `systemd`가 유닛 드리프트
(`NeedDaemonReload=yes`, 디스크 내용은 로드된 설정과 동일)를 경고해 `daemon-reload`로 정리했다.

### 12.2 검증 명령의 함정 — `gcloud compute ssh`가 따옴표를 지운다

Windows에서 `gcloud compute ssh --command="... -d '{\"query\":\"강남\"}'"`로 보내면 plink가 원격
명령의 `"`를 제거해 본문이 `{query:강남}`이 되고, 핸들러가 `bad_request`를 돌려준다. **앱 버그가
아니다.** 본문은 파일로 보내고 `--data-binary @file`로 읽는다:

```bash
# 로컬에서 base64로 만들어 원격에 파일로 떨어뜨린 뒤
echo '<BASE64>' | base64 -d > /tmp/body.json
curl -sS -X POST https://136-118-220-98.sslip.io/api/stores \
  -H 'content-type: application/json' --data-binary @/tmp/body.json
```

같은 이유로 SSH 채널을 통한 한글 stdout은 깨져 보인다(터미널 인코딩). 응답 본문의 정합성은
로컬 PC에서 직접 호출해 확인한다.

### 12.3 알려진 한계

- ~~Caddy 뒤에서 `req.socket.remoteAddress`가 `127.0.0.1`이라 레이트리밋 버킷이 **전역
  120 req/min** 하나로 동작한다.~~ **2026-11-19 코드 수정**: `scripts/client-key.mjs`가
  `cf-connecting-ip` → `x-forwarded-for`의 **마지막 홉**(Caddy가 덧붙인 실제 피어) → 소켓 주소 순으로
  키를 만든다. 첫 홉을 쓰면 클라이언트가 보낸 값으로 버킷을 고를 수 있어 마지막 홉이다.
  **2026-11-23 운영 VM에 배포(`deployed-sha` `fcfc428`)·검증 완료**: 같은 시각 `cf-connecting-ip:
  203.0.113.10`으로 121회 → **400×120 + 429×1**, 다른 키 `.11`·헤더 없음은 400. 전역 버킷이면
  뒤이은 두 요청도 429였어야 한다. 서비스는 `active`, 엔트리는 `assets/index-BMQxnTqA.js`(190,910 B).
- 무료 체험 계정이다. §11의 업그레이드 기한(2027-01-19경)을 넘기면 VM이 정지되고 30일 유예 뒤 삭제된다.
- **2026-11-23 재확인**: 결제 계정 `open`, 프로젝트 `billingEnabled=true`, VM `RUNNING`, 정적 IP
  `IN_USE`, 월 예산 2,000 KRW(100% 도달 시 결제 해제 → VM 정지). 무료 체험 종료 전 업그레이드가
  필요하고, 업그레이드 후 실제 과금은 월 1 GB egress 초과분부터다.
