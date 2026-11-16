# GCP e2-micro — deploy runbook (P4)

> **STATUS: PREP ONLY — NOT DEPLOYED.** 2026-11-16 작성. 호스트는 **GCP Compute Engine
> `e2-micro` Always Free**로 결정했다(집 PC quick tunnel 필드 스모크 완료 후). Oracle과 달리
> 유휴 자원 회수 정책이 없고, 무료 티어에 종료일이 없어 "한 번 세우면 손대지 않는" 운영에 맞는다.
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
2. **90일 안에 유료 결제 계정으로 업그레이드**한다. 체험 계정은 90일이 지나면 닫히고 그 안의
   리소스가 삭제된다. 업그레이드해도 **Always Free 한도 안에서는 청구가 0**이다.
3. 결제 → 예산 및 알림 → **예산 $1, 알림 50/90/100%** 를 만든다. 디스크 타입을 잘못 고르는
   것 같은 실수를 조기에 잡는 용도다.
4. Always Free 한도는 **결제 계정 단위 월 한도**다.

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

1 GB egress는 앱 설치 약 2,500회(precache 396 KiB) 분량이다. 필드 테스트는 수십 MB 수준이라
한도 안에 들어온다. 공개 사용자가 늘면 egress가 첫 과금 지점이 된다.

## 11. 하지 않은 것

- 계정 생성, 결제 수단 등록, 예산 알림, 인스턴스 생성은 콘솔/`gcloud`에서 해야 한다(이 세션은
  GCP 자격증명이 없다).
- 실제 배포·필드 검증은 VM이 생긴 뒤다.
