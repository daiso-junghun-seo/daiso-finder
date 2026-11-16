# Oracle Cloud Always Free — deploy runbook (P4)

> **STATUS: PREP ONLY — NOT DEPLOYED.** 2026-11-16 작성. 집 PC + Cloudflare quick tunnel로 필드
> 스모크를 마친 뒤, 상시 공개용 호스트로 Oracle Always Free를 선택했다. 이 문서는 VM이 생긴 뒤
> `bootstrap.sh` 한 번 + `deploy.sh` 반복으로 끝나는 것을 목표로 한다.
>
> gpu01 런북([`gpu01-node-proxy.md`](gpu01-node-proxy.md))은 폐기된 것이 아니라 **다른 호스트용
> 같은 절차**다. 코드는 동일한 [`scripts/dev-proxy.mjs`](../../scripts/dev-proxy.mjs)를 쓰며 포크는
> 없다. 차이는 세 가지뿐이다: systemd **system** 유닛(root 사용 가능), **Caddy** TLS 종단
> (cloudflared 대신), 호스트명 **sslip.io**(도메인 0원).

## 0. 형태

Shape A — 한 프로세스가 `dist/`(SPA)와 `/api/*`를 같은 오리진에서 서빙한다. 클라이언트는 상대
경로 `/api/*`를 그대로 쓰므로 **앱 코드 변경이 없다**. `ALLOW_ORIGIN`은 비워 둔다.

```
phone ──HTTPS──▶ Caddy :443 ──HTTP──▶ 127.0.0.1:8790 (node scripts/dev-proxy.mjs)
                                        ├─ dist/  (PWA)
                                        └─ /api/* (functions/api/*.ts, esbuild로 런타임 번들)
```

## 1. 계정·리전

1. <https://cloud.oracle.com> 가입. 카드는 **본인 확인용**이며 Always Free 한도 안에서는 과금되지
   않는다(가입 시 $1 임시 승인 후 취소).
2. **홈 리전을 서울(`ap-seoul-1`)로 선택**한다. Always Free 자원은 **홈 리전에서만** 무료이고,
   홈 리전은 가입 후 변경할 수 없다.
3. 콘솔 우상단 프로필 → Tenancy → **Always Free** 표시가 켜져 있는지 확인.

## 2. 인스턴스

Compute → Instances → **Create instance**.

| 항목 | 값 | 비고 |
|---|---|---|
| Name | `daiso-finder-proxy` | |
| Image | Canonical **Ubuntu 24.04** | A1이면 aarch64, E2면 x86_64 |
| Shape | **VM.Standard.A1.Flex**, 2 OCPU / 12 GB | Always Free 한도 4 OCPU/24 GB 안에서 |
| Networking | public subnet, **Assign public IPv4 = Yes** | VCN 신규 생성 가능 |
| SSH key | 공개키 업로드 | `ssh-keygen -t ed25519 -f ~/.ssh/oracle_daiso` |
| Boot volume | 50 GB | 전체 한도 200 GB |

- **A1 용량 부족(`Out of host capacity`)** 이 뜨면: 몇 시간 간격으로 재시도하거나, 즉시
  **VM.Standard.E2.1.Micro**(1/8 OCPU, 1 GB)로 대체한다. E2는 항상 잡히지만 빌드가 느리다
  (부트스트랩이 2 GiB 스왑을 잡아 준다).
- **Reserved public IP**: 인스턴스 상세 → Attached VNICs → VNIC → IPv4 → Edit → **Reserved public
  IP**를 만들거나 선택한다. 예약 IP는 무료이고, 이걸 해야 재부팅 후에도 sslip.io 호스트명이
  유지된다(ephemeral IP는 stop/start 시 바뀔 수 있다).

## 3. 네트워크 — 두 계층 모두 열어야 한다

**(a) VCN Security List** (콘솔): Networking → Virtual Cloud Networks → 해당 VCN → Security Lists →
Default Security List → Add Ingress Rules.

| Source | Protocol | Destination Port |
|---|---|---|
| `0.0.0.0/0` | TCP | 80 |
| `0.0.0.0/0` | TCP | 443 |
| 내 IP/32 | TCP | 22 |

**(b) 호스트 iptables** (VM): Oracle Ubuntu 이미지는 INPUT 끝에 REJECT가 있어 80/443이 막혀 있다.
`bootstrap.sh`가 처리하지만, 수동으로 할 경우:

```bash
sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
sudo sh -c 'iptables-save > /etc/iptables/rules.v4'
```

## 4. 호스트명 — 도메인 없이 0원

`sslip.io`는 `<공인IP를 점 대신 하이픈으로>.sslip.io`를 그 IP로 해석한다. Let's Encrypt HTTP-01이
그대로 통과하므로 **Caddy가 자동으로 인증서를 받는다**.

```
203.0.113.7  →  203-0-113-7.sslip.io
```

도메인이 있으면 그걸 쓰는 게 낫다(동일 절차, `bootstrap.sh`에 인자로 전달). 나중에 바꿀 때는
`bootstrap.sh`를 도메인 인자로 다시 실행하면 Caddyfile만 다시 렌더된다.

## 5. 부트스트랩 (최초 1회)

로컬에서 접속:

```bash
ssh -i ~/.ssh/oracle_daiso ubuntu@<공인IP>
```

VM에서:

```bash
# 저장소를 임시로 받아 스크립트만 실행해도 된다.
git clone https://github.com/daiso-junghun-seo/daiso-finder.git ~/apps/daiso-finder-repo
bash ~/apps/daiso-finder-repo/deploy/oracle/bootstrap.sh
```

도메인을 쓸 경우:

```bash
bash ~/apps/daiso-finder-repo/deploy/oracle/bootstrap.sh daiso.example.com
```

스크립트가 하는 일(멱등):

1. 2 GiB 스왑 (`/swapfile`)
2. 기본 패키지 + **Node 22** (`.nvmrc`와 동일, NodeSource arm64 지원)
3. iptables 80/443 + `iptables-persistent` 저장
4. **Caddy** 설치(apt repo)
5. `~/apps/daiso-finder-repo` 클론 (공개 저장소 — 호스트에 자격증명 없음)
6. `~/apps/daiso-finder-proxy/.env` 생성 (`HOST=127.0.0.1`, `PORT=8790`)
7. `daiso-finder-proxy.service` 설치(root 소유, `ubuntu`로 실행, 홈 읽기 전용 하드닝, `ExecStart`는
   실제 `node` 경로로 렌더)
8. `/etc/caddy/Caddyfile` 렌더 + Caddy 기동
9. 첫 `deploy.sh` 실행 → 로컬 `/health`
10. 공개 `https://<host>/health` 확인

## 6. 업데이트·롤백

```bash
bash ~/apps/daiso-finder-repo/deploy/oracle/deploy.sh
```

- `origin/main`을 fetch → checkout → `npm ci` → `npm run build` → 앱 트리로 rsync →
  `npm ci --omit=dev` → restart → `/health` → `deployed-sha` 기록.
- **테스트는 VM에서 돌리지 않는다.** `main`은 보호되어 있고 CI `gates`가 모든 push를 막는다.
  VM은 빌드·배포만 한다.
- 헬스 체크가 실패하면 `~/apps/daiso-finder-proxy.prev`(직전 런타임 트리)로 **자동 롤백**하고
  종료한다. 수동 롤백:

```bash
rsync -a --delete --exclude node_modules --exclude .env \
  ~/apps/daiso-finder-proxy.prev/ ~/apps/daiso-finder-proxy/
sudo systemctl restart daiso-finder-proxy
```

- E2.1.Micro에서 `npm ci` + `vite build`는 **10~15분** 걸릴 수 있다. A1(2 OCPU)에서는 1~2분.
  빌드 중 OOM이 나면 스왑이 잡혀 있는지 확인한다(`swapon --show`).

## 7. 검증

```bash
# 1) 로컬
curl -fsS http://127.0.0.1:8790/health

# 2) 공개 + TLS
curl -fsS https://<host>/health
curl -fsSI https://<host>/ | head -5

# 3) 실 데이터 (VM에서 실행 — 한글 인코딩 이슈 회피)
curl -fsS -X POST https://<host>/api/stores \
  -H 'content-type: application/json' -d '{"query":"강남"}'
# → rows[0].strCd 를 아래에 사용
curl -fsS -X POST https://<host>/api/availability \
  -H 'content-type: application/json' -d '{"strCd":"<strCd>","keyword":"밀폐용기"}'
```

`/api/availability`가 200이고 `productName`/`stck`가 오면 daisomall 인증 레그까지 통과한 것이다.
502면 upstream, 403이면 인증, 429면 레이트리밋이다.

마지막으로 **폰에서** `https://<host>`를 열고 홈 화면에 설치한 뒤 Flow 1→2→3을 걷는다
(설치 후 탭을 닫았다 다시 열어 SW가 index.html을 갱신하게 한다 — dev 터널에서 겪은 것과 동일).

## 8. 운영

```bash
systemctl status daiso-finder-proxy
journalctl -u daiso-finder-proxy -f          # 요청 로그: 시각·메서드·경로·상태·소요(ms)만
sudo systemctl restart daiso-finder-proxy
sudo systemctl status caddy
sudo journalctl -u caddy -n 50 --no-pager    # 인증서 발급 실패는 여기
```

- **디스크**: `df -h /`. `npm ci`가 반복되면 `~/.npm`이 커진다 → `npm cache clean --force`.
  journal은 `sudo journalctl --vacuum-time=14d`.
- **로그에 비밀 없음**: 프록시는 헤더·쿼리·바디를 남기지 않는다(JWT/Bearer/x-dm-uid 미기록).
- **Caddyfile 변경**: `/etc/caddy/Caddyfile` 직접 수정 대신 `bootstrap.sh`를 다시 실행하거나
  템플릿(`deploy/oracle/Caddyfile.template`)을 고친 뒤 `sudo systemctl reload caddy`.

## 9. 트러블슈팅

| 증상 | 원인/조치 |
|---|---|
| 공개 URL 접속 불가, 로컬 `/health`는 200 | ① Security List 80/443 ② 호스트 iptables ③ `dig +short <host>`가 공인 IP인지 |
| Caddy 인증서 실패 | 80 포트가 막혔거나 DNS가 아직 전파 전. `journalctl -u caddy` 확인 |
| `502 upstream_unavailable` | daisomall 레그 실패. `journalctl -u daiso-finder-proxy`의 `handler_error` 확인 |
| `429 rate_limited` | `/api/*` 120 req/min 버킷. Caddy 뒤에서는 **전역 버킷**이 된다(§10) |
| `npm ci` OOM / 빌드 중 kill | `swapon --show`로 2 GiB 스왑 확인, E2면 A1로 이전 권장 |
| A1 생성 실패 `Out of host capacity` | 시간차 재시도 또는 E2.1.Micro |
| 재부팅 후 호스트명 깨짐 | Reserved public IP 미설정 — §2 |
| 폰에서 예전 UI가 보임 | SW 캐시. 탭 닫고 재실행 또는 사이트 데이터 삭제 |

## 10. 알려진 한계 (공개 확대 전 정리)

1. **레이트리밋 버킷 공유** — `scripts/dev-proxy.mjs`는 `cf-connecting-ip`가 없으면 소켓 주소를
   키로 쓴다. Caddy 뒤에서는 모든 요청이 `127.0.0.1`이라 **전역 120 req/min**이 된다. 필드
   테스트(1~3명)에는 충분하지만, 공개 다중 사용자 전에는 `X-Forwarded-For` 인식(신뢰 프록시
   플래그)을 추가해야 한다.
2. **sslip.io 의존** — 무료 와일드카드 DNS 서드파티다. 장기 운영은 도메인 + Cloudflare Tunnel
   또는 도메인 + Caddy로 교체하는 편이 안전하다(절차는 동일, 호스트명만 변경).
3. **단일 VM** — 이중화 없음. 재부팅/호스트 장애 시 앱이 멈춘다. P4 필드 검증 범위에서는 허용.
4. **Oracle 유휴 자원 회수 정책** — Always Free 인스턴스에 대한 회수 정책이 공지된 적이 있다.
   가입 시 약관/콘솔 공지를 확인하고, 필요하면 외부에서 주기적 `/health` 핑을 둔다.

## 11. 비용

| 항목 | Always Free 한도 |
|---|---|
| A1.Flex | 4 OCPU / 24 GB 합계 |
| E2.1.Micro | 2대 |
| 블록 볼륨 | 200 GB |
| 아웃바운드 | 10 TB/월 |
| 고정 IPv4 | 예약 IP 1개 무료(연결 중) |

이 프록시는 CPU·메모리·디스크 모두 한도 대비 매우 작다. 도메인을 쓰지 않는 한 **0원**이다.
