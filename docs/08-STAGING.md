# 08. 개발자 테스트·Staging (Testing & Staging)

코어 봇 (`blumn-plan/blumnAI-qa-bot`) 을 개선할 때 실전 검증할 수 있는 3가지 방법.

**대상**: 코어 메인테이너 · 기여자 (다른 팀 담당자·개발자). 봇을 그냥 쓰는 팀은 이 문서 볼 필요 없음.

---

## 🎬 방법 1 — 데모 모드 (30초 · 로컬)

**가장 빠른 UI 확인 방법.** Worker 없이 mock 데이터로 UI 개선사항 전체를 즉시 시연.

### 사용법

1. 로컬 dev 서버 실행 (프로젝트 루트에서):
   ```bash
   node scripts/dev-server.js
   ```
2. 브라우저에서:
   ```
   http://localhost:8080/apps/qa-collab.html?demo=1
   ```
   → 상단에 보라색 "🎬 데모 모드" 배너 + 완전한 UI

### 확인 가능한 것

- ✅ 정책 문서 리스트 (샘플 4개)
- ✅ 문서 클릭 · 렌더 · § 절 인용
- ✅ 질문 → mock 답변 스트리밍 (📋 변경 제안 블록 자동 포함)
- ✅ 사이드바 검색 필터
- ✅ 답변 카드 [🔄 재답변] · [📋 복사] · [📤 기획자 전달] · [💾 내보내기]
- ✅ 팝업 자동 요약 (6필드)
- ✅ 문서 언급 → 사이드바 노란 배지 하이라이트
- ✅ 이미지 첨부 → lightbox 확대
- ✅ 모바일 반응형 (F12 device toolbar)

### 한계

- 데이터는 하드코딩된 mock 이므로 실전 흐름 (GitHub commit · Anthropic 실호출) 은 안 됨
- **UI 개선 검증에 최적** — 실전 백엔드는 방법 2, 3 참고

---

## 🔧 방법 2 — 로컬 완전 테스트 (`wrangler dev` · 5분)

**Worker 를 로컬에서 실행 + 실제 Anthropic + GitHub API 호출.** 백엔드 로직도 검증하려면 이 방법.

### 사전 조건

- Anthropic API key (`sk-ant-...`) 로컬에 있어야 함 (본인 계정)
- GitHub Classic PAT (`ghp_...`, `repo` scope) 있어야 함
- Staging 데이터 레포 하나 있어야 함 — 예: 본인 계정에 `<username>/blumnAI-qa-bot-test-data` 생성 후 `examples/sample-policy-repo/*` 를 복사·push

### 셋업

```bash
# 1. wrangler dev 설정 파일 준비
cd bot/worker
cp .dev.vars.example .dev.vars

# 2. .dev.vars 편집 — 아래처럼 실제 값으로:
#    ANTHROPIC_API_KEY="sk-ant-..."
#    GITHUB_TOKEN="ghp_..."
#    GITHUB_REPO="<username>/blumnAI-qa-bot-test-data"
#    ALLOWED_ORIGINS="http://localhost:8080"

# 3. wrangler.toml 이 없으면 템플릿 복사
cp wrangler.toml.template wrangler.toml
# (프로덕션 값이 아니라 로컬용이므로 그대로 두면 됨)

# 4. 로컬 Worker 실행
npx wrangler dev
# → http://localhost:8787 에서 대기
```

### 로컬 config 편집

프로젝트 루트 `blumnAI-qa-bot.config.yml` 의 `worker_url` 이 이미 `http://localhost:8787` 로 되어 있으니 그대로 두면 됨. 다른 곳 가리키고 있으면 수정.

### 실행

```bash
# 다른 터미널에서 dev-server 시작
node scripts/dev-server.js
```

브라우저에서 `http://localhost:8080/apps/qa-collab.html` → **완전 동작** (문서 목록 로드 · 실제 Anthropic 답변 · 실제 GitHub commit).

### 주의

- `wrangler dev` 는 실제 Anthropic API 를 씀 → 토큰 비용 발생 (소액)
- `wrangler dev` 는 실제 GitHub 에 write 함 → staging 데이터 레포에 실제 commit 남음. 개인 레포·팀 밖 레포 권장

---

## 🚀 방법 3 — Staging 자동 배포 (GitHub Actions)

**main 브랜치 push 시 자동으로 Cloudflare Worker 배포 + Pages 갱신.** 다른 팀 리뷰어가 URL 하나로 확인 가능.

### 사전 준비 (한 번만)

1. **Cloudflare 계정에 staging Worker 슬롯**:
   - Cloudflare Dashboard → Workers → `blumnai-qa-bot-staging` 미리 생성 (또는 첫 배포 시 자동 생성)

2. **Staging 데이터 레포**:
   - `blumn-plan/blumnAI-qa-bot-staging-data` 새 레포 생성 (private OK)
   - `examples/sample-policy-repo/*` 를 복사해서 push
   - 봇 답변 규칙(`.blumnAI-qa-bot/answer-rules.md`) 포함

3. **GitHub Actions 시크릿 등록** (`blumn-plan/blumnAI-qa-bot` Settings → Secrets and variables → Actions):

   | Secret | 값 |
   |---|---|
   | `CF_API_TOKEN` | Cloudflare API 토큰 (Workers Scripts:Edit 권한, https://dash.cloudflare.com/profile/api-tokens 발급) |
   | `CF_ACCOUNT_ID` | Cloudflare Account ID (Dashboard 우측 사이드바) |
   | `STG_ANTHROPIC_API_KEY` | staging 전용 Anthropic API key (별도 spending limit 걸어두기 권장) |
   | `STG_GITHUB_TOKEN` | Staging 데이터 레포 접근 가능한 PAT |
   | `STG_GITHUB_REPO` | `blumn-plan/blumnAI-qa-bot-staging-data` |
   | `STG_ALLOWED_ORIGINS` | `https://blumn-plan.github.io` (Pages URL) |

4. **자동 배포 activate** (선택):
   - Settings → Secrets and variables → Actions → Variables tab
   - `STAGING_AUTO_DEPLOY = 1` 등록 → main push 시 자동 배포
   - 미등록 시 수동 트리거만 동작 (Actions → Deploy Staging → Run workflow)

### 사용

**자동**: main 에 push → 5분 뒤 https://blumnai-qa-bot-staging.<subdomain>.workers.dev/health 확인

**수동**: GitHub → Actions 탭 → "Deploy Staging" → **Run workflow** 클릭 → 로그 확인

### Pages 세팅

Actions 로는 Worker 만 배포됨. 프론트 (HTML) 는 GitHub Pages 활성 필요:
- `blumn-plan/blumnAI-qa-bot` Settings → Pages
- Source: `main` branch, folder `/apps`
- URL 활성 후 5-10분 뒤:
  ```
  https://blumn-plan.github.io/blumnAI-qa-bot/apps/qa-collab.html
  ```

이 페이지의 `blumnAI-qa-bot.config.yml` (root) 은 `worker_url` 을 staging Worker URL 로 가리켜야 함.

---

## 🔄 개선 흐름 (권장)

```
1. 아이디어·버그 발견 (사용 중 or PR 리뷰 중)
       ↓
2. 메인 레포에 Issue 열기 (아이디어 공유)
       ↓
3. 브랜치 생성 → 개선 구현 → 로컬 테스트
       │
       ├─ 방법 1 (데모 모드) : UI 검증
       ├─ 방법 2 (wrangler dev) : 백엔드 검증
       ↓
4. PR 열기 → CI 자동 실행 (tsc · vitest · HTML 파싱 · 정책 스캔)
       ↓
5. 리뷰 승인 → main 머지 → Actions 가 staging 배포
       ↓
6. 다른 팀 리뷰어가 staging URL 로 확인
       ↓
7. 다음 릴리즈 태그 push → 자동 배너 → 각 팀 pull
```

## ❓ FAQ

### Q. 왜 헤이데어 (실전 정책 있는 팀) 에서 개발하고 메인에 push 하지 않나요?

**A**. 헤이데어 파일 트리는 안전하지만 (자동 필터), 콘텐츠 안에 `admin_v1` · `lunasoft-org` 같은 팀 하드코딩이 실수로 섞일 위험이 있어요. 방법 1-3 을 쓰면 헤이데어 정책 안 건드리고도 실전 검증 가능.

### Q. `staging-data` 레포는 왜 필요한가요?

**A**. Worker 는 `GITHUB_REPO` 시크릿 하나만 봐서 그 레포 root 에서 `blumnAI-qa-bot.config.yml` 을 찾음. 코어 레포 root 에는 이 파일이 없어서 (gitignored — 로컬 dev 전용) 별도 데이터 레포가 필요.

### Q. Actions 배포가 실패해요.

**A**. Actions 탭 → 실패한 workflow → 로그 확인. 흔한 원인:
- `CF_API_TOKEN` 권한 부족 (Workers Scripts:Edit 필요)
- `STG_GITHUB_REPO` 가 존재하지 않음
- `wrangler.toml` 에 `[env.staging]` 섹션 누락 (`bot/worker/wrangler.toml.template` 참고)
