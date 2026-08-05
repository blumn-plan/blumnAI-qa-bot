# blumnAI QA Bot · 사내 배포 (형태 Y)

**Cloudflare 폐기 · 사내 서버 Docker 배포 전용 스택.**

- 백엔드: NestJS 10 (Node.js 20) + Prisma + MySQL 8
- 프론트: Next.js 16 (App Router) + TailwindCSS 4 + shadcn/ui (Y1c 부터)
- 배포: docker-compose (3 서비스: mysql · backend · frontend)

기존 Cloudflare Worker 기반 코드는 `../bot/`, `../apps/` 에 legacy 로 보존.

---

## 🚀 로컬 실행 (Docker)

```bash
# 1. 환경변수 준비
cd onprem
cp .env.example .env
# .env 편집: MYSQL 비번 · Anthropic Key · GitHub PAT 채우기

# 2. 빌드 + 기동
docker compose up -d --build

# 3. 로그 확인
docker compose logs -f

# 4. 접속
#    프론트: http://localhost:3001
#    백엔드: http://localhost:3000/api/health
```

Prisma 마이그레이션은 backend 컨테이너가 시작할 때 자동 실행됩니다 (`prisma migrate deploy`).

---

## 🛠 로컬 개발 (Docker 없이)

각 서비스를 별도 터미널에서:

```bash
# 터미널 1 — MySQL 만 컨테이너로
cd onprem
docker compose up -d mysql

# 터미널 2 — 백엔드
cd onprem/backend
cp .env.example .env.local   # DATABASE_URL 채우기
npm install
npx prisma migrate dev
npm run start:dev            # http://localhost:3000

# 터미널 3 — 프론트
cd onprem/frontend
npm install
npm run dev                  # http://localhost:3001
```

---

## 📁 폴더 구조

```
onprem/
├── backend/                    NestJS + Prisma
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── health/             ← /api/health (DB 연결 확인 포함)
│   │   └── prisma/             ← PrismaService
│   ├── prisma/
│   │   └── schema.prisma       ← teams · projects (Y1b 에서 members·sessions 추가)
│   ├── package.json
│   ├── Dockerfile
│   └── tsconfig.json
├── frontend/                   Next.js 16
│   ├── src/app/                ← App Router (page.tsx, layout.tsx)
│   ├── public/
│   ├── package.json
│   ├── Dockerfile
│   ├── next.config.ts          ← output: standalone (Docker 최적)
│   └── tailwind.config.ts
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🗺 Phase Y 로드맵

| Phase | 목표 | Y1a 스코프 (지금) |
|---|---|---|
| **Y1a** | 스캐폴딩 · MySQL 스키마 · /team CRUD | ✅ 스캐폴딩 · Prisma schema · health check |
| **Y1b** | GitHub / Anthropic API 이식 · /list-docs, /qa | ⏳ 다음 |
| **Y1c** | 프론트 이식 (shadcn) · 첫 실사용 | ⏳ 다음 |

상세 설계: [../docs/11-SAAS-TEAM-MODE-DESIGN.md](../docs/11-SAAS-TEAM-MODE-DESIGN.md) (Rev 4 곧 반영)

---

## ⚠️ 사내 배포 시 주의

- MySQL 비번은 강력하게 · Vault 나 K8s Secret 사용 권장
- `ALLOWED_ORIGINS` 는 사내 도메인만 (예: `https://qa-bot.blumn.internal`)
- 정책·화면설계서 GitHub 레포 접근은 사내 서버 고정 IP 가 GitHub org allowlist 에 등록되어 있어야 함 (IT팀 확인)
- 백엔드 시크릿 (`ANTHROPIC_API_KEY`, `GITHUB_TOKEN`) 은 컨테이너 env 로 전달 · 로그에 절대 출력 X
