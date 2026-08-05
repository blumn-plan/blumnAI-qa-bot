# 사내 서버 배포 가이드

> **대상**: AWS 사내 서버 · Docker 환경 · devtool-docker.lunacode.dev 관리 UI
> **개발자 확인 필요 항목**은 `⚠️ 확인` 표시

---

## 준비된 자산

| 파일 | 역할 |
|---|---|
| `Dockerfile` (backend / frontend) | 각각 이미지 빌드 정의 |
| `docker-compose.yml` | 로컬 dev 용 (`build:` 사용) |
| `docker-compose.prod.yml` | 사내 프로덕션 (`image:` pull 사용) |
| `build.sh` | 로컬 이미지 빌드 + tag |
| `.env.example` | 시크릿 · config 슬롯 |

---

## 배포 방식 3가지 · 어느 것이든 선택 가능

### 🅰 방식 A — Portainer/UI 에서 Stack 배포 (가장 편함 · 개발자 도움 최소)

**전제**: devtool-docker 가 Portainer 라면 이 방식이 가장 자연스러움.

1. **로컬에서 이미지 빌드**
   ```bash
   cd onprem
   ./build.sh v0.1.0   # tag 지정
   ```
2. **이미지를 사내 registry 로 push** ⚠️ 확인: registry URL 필요
   ```bash
   REGISTRY=registry.lunacode.dev/qa-bot ./build.sh v0.1.0
   docker push registry.lunacode.dev/qa-bot/blumnai-qa-backend:v0.1.0
   docker push registry.lunacode.dev/qa-bot/blumnai-qa-frontend:v0.1.0
   ```
3. **Portainer UI 접속** → Stacks → Add stack
4. `docker-compose.prod.yml` 내용 복사 붙여넣기
5. 환경변수 섹션에 `.env` 값 입력 (Portainer UI 에서 직접 설정)
6. Deploy 클릭 → 자동으로 MySQL 컨테이너 + backend + frontend 기동
7. 로그 탭에서 healthcheck 확인

### 🅱 방식 B — 서버 SSH + docker compose (개발자 정석)

1. **로컬 빌드 + push** (방식 A 1-2 단계 동일)
2. **서버 SSH 접속** ⚠️ 확인: 서버 IP · SSH 접근
3. **파일 배치**
   ```bash
   # 서버에 폴더 생성
   mkdir -p /opt/blumnai-qa
   # 로컬에서 docker-compose.prod.yml, .env 전송
   scp docker-compose.prod.yml .env user@server:/opt/blumnai-qa/
   ```
4. **서버에서 실행**
   ```bash
   cd /opt/blumnai-qa
   IMAGE_TAG=v0.1.0 REGISTRY=registry.lunacode.dev/qa-bot \
     docker compose -f docker-compose.prod.yml up -d
   docker compose -f docker-compose.prod.yml logs -f
   ```

### 🅲 방식 C — 이미지 파일 직접 업로드 (registry 없어도 됨)

registry 접근 안 될 때 fallback.

1. **로컬 빌드 + tar 저장**
   ```bash
   cd onprem
   ./build.sh v0.1.0
   docker save blumnai/blumnai-qa-backend:v0.1.0 | gzip > backend-v0.1.0.tar.gz
   docker save blumnai/blumnai-qa-frontend:v0.1.0 | gzip > frontend-v0.1.0.tar.gz
   ```
2. **서버로 파일 업로드** (SCP · SFTP · devtool-docker UI)
3. **서버에서 로드**
   ```bash
   docker load < backend-v0.1.0.tar.gz
   docker load < frontend-v0.1.0.tar.gz
   docker compose -f docker-compose.prod.yml up -d
   ```

---

## 서버측 사전 준비 ⚠️ 개발자 협조 필요

- [ ] Docker 24+ · Docker Compose v2 설치
- [ ] `/opt/blumnai-qa/` 폴더 생성 · 배포 파일 배치 권한
- [ ] `.env` 파일 배치 (MySQL 비번 · Anthropic Key · GitHub PAT 실값)
- [ ] MySQL 데이터 볼륨 백업 정책
- [ ] 방화벽: frontend 노출 포트 (기본 3001) 만 인바운드 허용
- [ ] 리버스프록시 (Nginx / Traefik) 로 사내 도메인 매핑 (예: `qa-bot.blumn.internal` → localhost:3001)

---

## 환경변수 사전 채우기 (배포 시 반드시)

`onprem/.env` 파일에 다음 값 실제로 채워야 함:

```
MYSQL_ROOT_PASSWORD=       # 강력 랜덤 (32자+)
MYSQL_DATABASE=blumnai_qa
MYSQL_USER=blumnai
MYSQL_PASSWORD=            # 강력 랜덤 (다른 값)
ANTHROPIC_API_KEY=sk-ant-  # Anthropic Console 발급
GITHUB_TOKEN=ghp_          # GitHub Classic PAT (repo scope)
ALLOWED_ORIGINS=https://qa-bot.blumn.internal  # 사내 도메인
NEXT_PUBLIC_API_BASE_URL=https://qa-bot.blumn.internal/api
```

⚠️ 이 파일은 **절대 커밋 X** (`.gitignore` 에 등록됨).

배포 시엔 서버 관리자가 Vault/K8s Secret 로 승격 권장.

---

## 배포 후 검증 체크리스트

- [ ] `docker compose ps` → 3 서비스 모두 `Up (healthy)` 상태
- [ ] `curl https://qa-bot.blumn.internal/api/health` → `status: ok`, `db: ok`
- [ ] 브라우저에서 `https://qa-bot.blumn.internal` 접속 → Next.js 기본 페이지 로드
- [ ] `docker exec blumnai-qa-mysql mysql -u root -p... -e "SHOW TABLES;" blumnai_qa` → `teams`, `projects` 확인
- [ ] GitHub API 호출 테스트 (Phase Y1b 이후): `curl -X POST .../api/team -d '{...}'`

---

## 롤백 절차

문제 발생 시:

```bash
# 이전 tag 로 롤백
IMAGE_TAG=v0.0.9 docker compose -f docker-compose.prod.yml up -d

# 완전 정지 (데이터는 볼륨에 남음)
docker compose -f docker-compose.prod.yml down

# 볼륨까지 삭제 (⚠️ MySQL 데이터 소실)
docker compose -f docker-compose.prod.yml down -v
```

---

## 다음 (실제 배포 착수 전 필요)

1. 개발자에게 §준비된 자산 · §서버측 사전 준비 표를 공유
2. 개발자 답변 받은 후:
   - 실제 registry URL 로 `build.sh` 및 `docker-compose.prod.yml` 값 채우기
   - `.env` 실값 세팅
   - 방식 A/B/C 중 하나 선택 · 실행
3. Phase Y1a D2-D5 는 이 배포 검증 후 진행 (백엔드 로직 이식 · 프론트 이식)
