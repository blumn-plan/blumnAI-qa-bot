# 01. 설치 가이드 (Install)

각 서비스 팀이 이 AI QA 봇을 가져다가 본인 서비스 정책과 연결해서 쓰는 step-by-step 절차.

**대상 독자**: 본인이 코딩 안 해본 비개발자(기획자·QA운영자)여도 따라할 수 있게 작성. 막히면 코어 메인테이너에게 캡처 보내주세요.

**총 소요 시간**: 약 20-30분 (Cloudflare/GitHub 처음이면 +10분)

---

## 0. 준비물 체크리스트

| 항목 | 왜 필요한가 | 보유 여부 확인 |
|---|---|---|
| GitHub 계정 (회사용) | 정책 레포 호스팅 + Pages 정적 호스팅 | 회사 GitHub 로그인 가능? |
| **Claude Max 구독** (C 모드) 또는 **Anthropic API key** (A 모드) | AI 답변 엔진 | C 모드면 본인 Max 계정만 있으면 됨 |
| Cloudflare 계정 | Worker (백엔드) 호스팅. 무료, 카드 X | 새로 가입 가능 |
| Node.js 18+ | wrangler / launcher.js 실행 | `node --version` 으로 확인 |
| (C 모드 한정) **PC 1대** | `start.bat` 24/7 가동용. 개인 PC 또는 회사 공용 PC | |

C 모드를 추천합니다 — Max 구독만 있으면 추가 결제 0원. ([00-OVERVIEW](00-OVERVIEW.md#두-가지-운영-모드--c-모드-추천) 비교 참고)

---

## 1. GitHub 에 본인 정책 레포 만들기 (3분)

1. https://github.com/new
2. **Repository name**: 예) `ad-team-policies` (팀 이름 + `-policies` 패턴 권장)
3. **Private** 선택 (사내용)
4. **Add a README** 체크
5. **Create repository** 클릭

생성된 레포 URL 메모. 예: `https://github.com/your-org/ad-team-policies`

---

## 2. 본인 PC 에 레포 clone (2분)

VS Code 또는 터미널에서:

```bash
cd c:/Source         # 또는 본인이 원하는 폴더
git clone https://github.com/your-org/ad-team-policies.git
cd ad-team-policies
```

---

## 3. 코어 코드 사본 깔기 (5분)

> 💡 추후 `npx create-blumnAI-qa-bot` CLI 가 나오면 이 단계가 1줄로 줄어듭니다. 현재는 수동 절차.

> ⚠️ **Windows 사용자 주의**: 아래 `cp -r` 명령어는 cmd/PowerShell 에 없습니다. **Git Bash** (Git for Windows 와 함께 설치됨) 또는 **WSL** 에서 실행하세요. Git Bash 에서는 경로를 `/c/Source/기획/blumnAI-qa-bot/` 형식으로 씁니다 (앞에 슬래시, 드라이브 콜론 없이).

코어 메인테이너에게 받은 코어 레포 (예: `c:/Source/기획/blumnAI-qa-bot/`) 에서 다음 폴더·파일들을 본인 정책 레포로 복사:

```bash
# 본인 정책 레포 루트에서
mkdir -p .blumnAI-qa-bot/apps .blumnAI-qa-bot/worker .blumnAI-qa-bot/local-server

# HTML 사본
cp /path/to/blumnAI-qa-bot/apps/*.html .blumnAI-qa-bot/apps/

# Worker 사본 (Cloudflare 에 배포할 코드)
cp -r /path/to/blumnAI-qa-bot/bot/worker/* .blumnAI-qa-bot/worker/

# (C 모드 한정) Local server 사본
cp -r /path/to/blumnAI-qa-bot/bot/local-server/* .blumnAI-qa-bot/local-server/

# 답변 규칙 placeholder
cp /path/to/blumnAI-qa-bot/examples/sample-policy-repo/.blumnAI-qa-bot/answer-rules.md .blumnAI-qa-bot/

# 컨피그 템플릿
cp /path/to/blumnAI-qa-bot/examples/sample-policy-repo/blumnAI-qa-bot.config.yml ./
```

확인:
```bash
ls -la
# blumnAI-qa-bot.config.yml  ← 여기 있어야
# .blumnAI-qa-bot/           ← 이것도
```

---

## 4. 컨피그 파일 채우기 (5분)

`blumnAI-qa-bot.config.yml` 파일을 VS Code 로 열고 본인 팀 값으로 수정:

```yaml
ui:
  brand_name: "광고팀 QA Bot"        # ← 본인 팀 이름
  team_name: "광고팀"

deployment:
  github_repo: "your-org/ad-team-policies"   # ← 1단계에서 만든 레포
  worker_url: ""                              # ← 5단계에서 채움 (지금은 비워둠)
  pages_url: ""                               # ← 6단계에서 채움

projects:
  - id: ad_v1                                 # ← 본인 팀 식별자 (영문 snake_case)
    label: "광고 운영 어드민"
    policies_dir: "projects/ad_v1/docs/policies"
    storyboards_dir: ""                       # 있으면 채우기
    code_repo: ""                             # 코드 검증할 GitHub 레포 (선택)

storage:
  decisions_dir: "qa/decisions"
  feedback_dir: "qa/feedback"

bot:
  mode: "auto"                                # auto / A / C — auto 추천
  claude_model: "claude-sonnet-4-6"
  answer_rules: ".blumnAI-qa-bot/answer-rules.md"
  system_prompt:
    locale: "ko"
    product_description: "광고 캠페인 운영 어드민"  # ← 봇이 답변 시 product 컨텍스트로 사용

security:
  allowed_origins:
    - "https://your-org.github.io"           # ← 5-6단계 후 Pages URL 자동 포함
```

기본 정책 폴더도 만들기:
```bash
mkdir -p projects/ad_v1/docs/policies qa/decisions qa/feedback
echo "# 샘플 정책 v0.1.0" > projects/ad_v1/docs/policies/샘플_v0.1.0.md
```

---

## 5. Cloudflare Worker 배포 (10분)

### 5-1. Cloudflare 계정 가입
1. https://dash.cloudflare.com/sign-up
2. 이메일 인증 → 비밀번호 설정
3. 카드 등록 화면 → **Skip** / **Maybe later** (Workers 무료 tier 에 카드 불필요)

### 5-2. wrangler CLI 설치 + 로그인

VS Code 터미널에서:
```bash
cd .blumnAI-qa-bot/worker
npm install
npx wrangler login         # 브라우저 인증
```

### 5-3. Worker 시크릿 등록 — 모드별로 다름

**C 모드** (추천, Max 구독 활용):
```bash
# GitHub PAT 만 등록 (Anthropic key 불필요 — launcher.js 가 처리)
npx wrangler secret put GITHUB_TOKEN
# 프롬프트에 GitHub PAT 붙여넣기 (발급 방법은 03-CONNECT-BOT.md)
```

**A 모드** (유료 API):
```bash
npx wrangler secret put ANTHROPIC_API_KEY
# 프롬프트에 sk-ant-... 붙여넣기 (발급 방법은 03-CONNECT-BOT.md)

npx wrangler secret put GITHUB_TOKEN
# 프롬프트에 GitHub PAT 붙여넣기
```

> ⚠️ **`wrangler.toml` 의 `[vars]` 도 본인 레포로 수정 필요** — VS Code 로 `.blumnAI-qa-bot/worker/wrangler.toml` 열고:
> ```toml
> [vars]
> GITHUB_REPO = "your-org/ad-team-policies"           # ← 본인 레포
> ALLOWED_ORIGINS = "https://your-org.github.io"      # ← 본인 Pages URL (6단계 후 확정)
> CLAUDE_MODEL = "claude-sonnet-4-6"
> ```
> secret 가 아니라 평문 vars 이므로 레포에 commit 되어도 OK. Worker 가 어느 GitHub 레포 정책을 읽을지 결정하는 핵심 값.

### 5-4. Worker 배포
```bash
npx wrangler deploy
```

성공 시 출력:
```
✨ Success! Uploaded planner-qa-bot
✨ Published at https://planner-qa-bot.<your-subdomain>.workers.dev
```

이 URL 을 메모 → `blumnAI-qa-bot.config.yml` 의 `deployment.worker_url` 에 채워넣기.

---

## 6. GitHub Pages 활성화 (3분)

협업자·기획자가 브라우저로 접근할 화면(qa-collab.html / qa-planner.html) 호스팅.

1. GitHub 레포 페이지 → **Settings** → **Pages** (좌측 메뉴)
2. **Source**: `Deploy from a branch`
3. **Branch**: `main`, **Folder**: `/ (root)` → **Save**
4. (중요) 레포 루트에 `.nojekyll` 빈 파일 만들기:
   ```bash
   touch .nojekyll
   git add .nojekyll
   git commit -m "disable jekyll for dotfolder support"
   git push
   ```
   → `.blumnAI-qa-bot/` 같은 점-시작 폴더가 Pages 에서 노출되게.

5. 1-2분 후 Pages URL 활성화:
   `https://your-org.github.io/ad-team-policies/`

→ 이 URL 을 `blumnAI-qa-bot.config.yml` 의 `deployment.pages_url` 에 채우기.

---

## 7. (C 모드 한정) PC 에서 launcher 실행 (2분)

> A 모드면 이 단계 스킵.

PC 에서 `.blumnAI-qa-bot/local-server/start.bat` **더블 클릭** (또는 VS Code 터미널에서 실행):

```bash
cd .blumnAI-qa-bot/local-server
.\start.bat
```

성공 시 콘솔에:
```
[server] listening on http://localhost:8788
[tunnel] https://random-words-1234.trycloudflare.com
[launcher] ✨ TUNNEL_URL 등록 완료. qa.html 에서 챗 가능
```

> ⚠️ 이 콘솔창은 닫지 마세요. 닫으면 챗 즉시 중단.

부팅 시 자동 실행 설정은 [03-CONNECT-BOT.md](03-CONNECT-BOT.md#6-c-모드만-pc-부팅-시-자동-실행-선택-2분) 참고.

---

## 8. 컨피그 푸시 + 동작 확인 (2분)

```bash
git add blumnAI-qa-bot.config.yml .blumnAI-qa-bot/
git commit -m "blumnAI-qa-bot 초기 설치"
git push
```

브라우저에서:
```
https://your-org.github.io/ad-team-policies/.blumnAI-qa-bot/apps/qa-collab.html
```

화면이 떠서 좌측에 "광고 운영 어드민" select 가 보이고 정책 목록에 `샘플_v0.1.0.md` 가 보이면 ✅ **설치 완료**.

---

## 9. 다음 단계

- [02-WIRE-POLICIES.md](02-WIRE-POLICIES.md) — 실제 정책 markdown 작성 규약
- [04-OPERATE.md](04-OPERATE.md) — 협업자·기획자 화면 사용법
- 첫 질문 던져보기 → AI 답변 확인 → 동료에게 Pages URL 공유

---

## 트러블슈팅

| 증상 | 원인·해결 |
|---|---|
| qa.html 에서 ⚙️ "설정이 필요합니다" 화면 | `blumnAI-qa-bot.config.yml` 가 레포 루트에 없거나 `worker_url` 미입력. 4-5단계 재확인 |
| "PC 서버가 꺼져 있어요" (C 모드) | `start.bat` 콘솔창이 닫혔거나 PC 절전 중. 7단계 재실행 |
| "Failed to fetch" | Worker URL 오타 또는 CORS. `security.allowed_origins` 가 Pages URL 정확한지 확인 |
| Pages 에서 404 | `.nojekyll` 파일 누락 또는 빌드 대기. 6-1~6-4 재확인, 2-3분 대기 |
| `npx wrangler login` 브라우저 인증 안 됨 | 회사 방화벽 가능성. 개인 핫스팟으로 재시도 |
