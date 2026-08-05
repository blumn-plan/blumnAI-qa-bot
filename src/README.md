# blumnAI QA Bot · src/ (모노레포)

**사내 배포 스택 (Cloudflare 폐기 · 형태 Y).**

- **`backend/`** — NestJS 10 + Prisma + MySQL 8
- **`frontend/`** — Next.js 16 + TailwindCSS 4 + shadcn/ui

기존 Cloudflare Worker · HTML 코드는 `../bot/`, `../apps/` 에 legacy 로 보존.

배포 · docker 관련 파일은 **레포 루트**에 있음 (`../docker-compose.yml`, `../.env.example`, `../DEPLOY.md`).

---

## 🚀 로컬 실행 (Docker · 레포 루트에서)

```bash
# 1. 환경변수 준비
cp .env.example .env
# .env 편집: MYSQL 비번 · Anthropic Key · GitHub PAT 채우기

# 2. 빌드 + 기동
docker compose up -d --build

# 3. 로그
docker compose logs -f

# 4. 접속
#    프론트: http://localhost:3001
#    백엔드: http://localhost:3000/api/health
```

Prisma 마이그레이션은 backend 컨테이너 시작 시 자동 실행 (`npx prisma migrate deploy`).

---

## 🛠 로컬 개발 (Docker 없이 · 각 서비스 별도)

터미널 3개:

```bash
# 터미널 1 — MySQL 만 컨테이너로
docker compose up -d mysql

# 터미널 2 — 백엔드
cd src/backend
cp .env.example .env.local    # DATABASE_URL=mysql://blumnai:pw@localhost:3306/blumnai_qa
npm install
npx prisma migrate dev
npm run start:dev             # http://localhost:3000

# 터미널 3 — 프론트
cd src/frontend
npm install
npm run dev                   # http://localhost:3001
```

---

## 📁 폴더 구조

```
[repo-root]/
├── docker-compose.yml           ← 로컬 dev
├── docker-compose.prod.yml      ← 사내 서버 배포
├── .env.example
├── build.sh                     ← 로컬 이미지 빌드 + tag
├── DEPLOY.md                    ← 3가지 배포 시나리오
└── src/                         ← ← 여기 (모노레포)
    ├── README.md                ← 이 파일
    ├── backend/                 NestJS + Prisma
    │   ├── src/
    │   │   ├── main.ts
    │   │   ├── app.module.ts
    │   │   ├── health/          ← /api/health (DB 연결 확인 포함)
    │   │   └── prisma/          ← PrismaService
    │   ├── prisma/
    │   │   └── schema.prisma    ← teams · projects (Y1b 부터 members·sessions 추가)
    │   ├── package.json
    │   ├── Dockerfile
    │   └── tsconfig.json
    └── frontend/                Next.js 16 (App Router)
        ├── src/app/             ← page.tsx, layout.tsx
        ├── public/
        ├── package.json
        ├── Dockerfile
        └── next.config.ts       ← output: 'standalone' (Docker 최적)
```

---

## 🗺 Phase Y 로드맵

| Phase | 목표 | 상태 |
|---|---|---|
| **Y1a** | 스캐폴딩 · MySQL 스키마 · /health · /team CRUD | 스캐폴딩·스키마 ✅ · /team CRUD ⏳ |
| **Y1b** | GitHub · Anthropic API 이식 · /list-docs · /doc · /qa · /forward | 대기 |
| **Y1c** | Next.js + shadcn 프론트 이식 (qa-collab.html → 컴포넌트) | 대기 |

상세 설계: [../docs/11-SAAS-TEAM-MODE-DESIGN.md](../docs/11-SAAS-TEAM-MODE-DESIGN.md) (Rev 4 반영됨)
배포: [../DEPLOY.md](../DEPLOY.md)

---

## ⚠️ 사내 배포 시 주의

- MySQL 비번은 강력하게 · Vault 나 K8s Secret 사용 권장
- `ALLOWED_ORIGINS` 는 사내 도메인만 (예: `https://qa-bot.blumn.internal`)
- 정책·화면설계서 GitHub 레포 접근은 사내 서버 고정 IP 가 GitHub org allowlist 에 등록되어 있어야 함 (IT팀 확인)
- 백엔드 시크릿 (`ANTHROPIC_API_KEY`, `GITHUB_TOKEN`) 은 컨테이너 env 로 전달 · 로그에 절대 출력 X
