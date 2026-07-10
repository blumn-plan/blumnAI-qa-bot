# 01. 설치 가이드 (Install) — A 모드 기준

각 서비스 팀이 이 AI QA 봇을 가져다가 본인 서비스 정책과 연결해서 쓰는 step-by-step 절차.

**대상 독자**: 본인이 코딩 안 해본 비개발자(기획자·QA운영자)여도 따라할 수 있게 작성. **Claude Code 같은 AI 에이전트를 옆에 두고 함께 진행**하도록 설계됨.

**총 소요 시간**: 약 15-25분 (Cloudflare/GitHub 처음이면 +10분)

**기본 모드는 A 모드 (Anthropic API)** — 이 문서는 A 모드 절차만 다룹니다. Max 구독으로 우회하는 C 모드는 특수 상황용이며, 별도로 [03-CONNECT-BOT §부록](03-CONNECT-BOT.md#부록--c-모드-pc-max-우회-특수-상황용) 을 참고하세요.

---

## 🤝 이 가이드를 읽는 법 — AI 와 함께 설치하기

설치는 두 종류의 작업이 섞여 있어요:

- **🤖 AI 에게 위임** — 폴더 만들기, 파일 복사, 컨피그 편집, 명령어 실행 등 (Claude Code 가 다 함)
- **👤 본인이 직접** — 웹 브라우저 접속, 계정 가입, 시크릿 값 발급·붙여넣기 등 (AI 는 할 수 없음)

각 스텝 앞에 이 아이콘이 붙어 있으니, 🤖 표시 스텝은 아래 프롬프트 예시를 그대로 Claude Code 창에 붙여넣으면 됩니다. 👤 표시 스텝은 직접 브라우저 열고 클릭.

> 🔒 **시크릿 값 (API key, PAT) 은 절대 AI 채팅창에 붙여넣지 마세요.** 대화 로그에 남습니다. 오직 wrangler 프롬프트 (터미널에서 "Enter a secret value:") 에만 직접 입력.

---

## ⚡ Quick Start — 마스터 프롬프트 하나로 시작

**옆에 Claude Code 창을 열고 아래 프롬프트를 그대로 붙여넣으세요.** AI 가 이 가이드를 읽고 스텝별로 안내해줍니다:

```
blumnAI-qa-bot 을 우리 팀 정책 레포에 A 모드 (Anthropic API 사용) 로
설치하려 합니다.

정보:
- 팀 이름: ○○팀 (예: 광고팀)
- GitHub 조직명: ○○ (예: blumn-plan)
- 새로 만들 정책 레포 이름: ○○-policies (예: ad-team-policies)
- 프로젝트 ID (봇 안에서 쓸 영문 식별자): ○○_v1 (예: ad_v1)
- (선택) 코드 검증 붙일 것: 예 / 아니오
  · 예 → 코드 레포: ○○/○○-admin-frontend

가이드: https://github.com/blumn-plan/blumnAI-qa-bot/blob/main/docs/01-INSTALL.md

이 가이드의 A 모드 절차만 따라 진행해주세요. 스텝별로:
- 🤖 표시된 항목은 알아서 처리 후 결과 보고
- 👤 표시된 항목은 "직접 하실 것" 이라고 명시하고 화면·URL 안내
- 시크릿 값 (Anthropic API key sk-ant-..., GitHub PAT ghp-...) 은
  절대 저에게 입력받지 말고, wrangler 명령어만 실행하도록 안내해주세요
- C 모드 (PC Max 우회) 스텝은 스킵. 물어보지도 마세요

설치 완료 후 07-FIRST-TEST.md 의 첫 테스트 시나리오까지 이어서 진행.
```

AI 가 아래 §0 준비물부터 순서대로 진행해줍니다.

---

## 0. 준비물 체크리스트

주로 👤 본인이 준비해야 할 것들입니다:

| 항목 | 왜 필요한가 | 담당 |
|---|---|---|
| GitHub 계정 (회사용) | 정책 레포 호스팅 + Pages 정적 호스팅 | 👤 |
| **Anthropic API key** (`sk-ant-...`) | AI 답변 엔진 (A 모드) | 👤 발급 · 회사 카드 결제 등록 |
| Cloudflare 계정 | Worker (백엔드) 호스팅. 무료, 카드 X | 👤 (새로 가입 가능) |
| Node.js 18+ | wrangler 실행 | 🤖 (AI 가 `node --version` 으로 확인. 없으면 설치 안내) |

> 💡 Max 구독으로 우회하는 C 모드는 PC 상시 가동·터널 유지 부담이 있어 이 가이드에서는 다루지 않습니다. 특수 상황용으로 필요하면 [03-CONNECT-BOT §부록](03-CONNECT-BOT.md#부록--c-모드-pc-max-우회-특수-상황용) 참조.

---

## 1. GitHub 에 본인 정책 레포 만들기 (3분)

### 👤 본인이 직접

1. 브라우저에서 https://github.com/new 접속
2. **Repository name**: 예) `ad-team-policies` (팀 이름 + `-policies` 패턴 권장)
3. **Private** 선택 (사내용)
4. **Add a README** 체크
5. **Create repository** 클릭
6. 생성된 URL (예: `https://github.com/your-org/ad-team-policies`) 을 복사해 두기

### 🤖 AI 에게 알려주기

생성 완료 후 Claude Code 창에 한 마디:
```
정책 레포 만들었어. URL: https://github.com/your-org/ad-team-policies
```

---

## 2. 본인 PC 에 레포 clone (2분)

### 🤖 AI 에게 위임

Claude Code 창에:
```
방금 만든 레포 https://github.com/your-org/ad-team-policies 를
c:/Source (또는 원하는 위치) 에 clone 해줘.
```

AI 가 `git clone` 을 실행하고 그 폴더로 이동합니다. 사용자가 직접 명령어를 칠 필요 없음.

### 👤 브라우저 인증 필요 시

private repo 라 인증이 필요하면 AI 가 안내합니다. GitHub CLI (`gh`) 나 SSH 키 셋업 안내를 받아 진행.

---

## 3. 코어 코드 사본 깔기 (5분)

### 🤖 AI 에게 위임 (가장 쉬움)

Claude Code 창에:
```
blumnAI-qa-bot 코어 레포를 c:/Source/blumnAI-qa-bot (또는 다른 위치) 에
clone 해두고, 그 안에서 아래 5개를 우리 정책 레포의 .blumnAI-qa-bot/ 아래로
복사해줘:

- apps/*.html → .blumnAI-qa-bot/apps/
- bot/worker/*  → .blumnAI-qa-bot/worker/
- bot/local-server/* → .blumnAI-qa-bot/local-server/
- examples/sample-policy-repo/.blumnAI-qa-bot/answer-rules.md → .blumnAI-qa-bot/
- examples/sample-policy-repo/blumnAI-qa-bot.config.yml → (정책 레포 최상위)

복사 완료 후 폴더 구조 확인 결과 보여줘.
```

AI 가 자동으로 mkdir + cp 다 처리. 사용자가 직접 손 댈 필요 없음.

### 👤 직접 하고 싶으면 — 3가지 방법

터미널이 낯설거나 AI 없이 하려면 아래 방법 A (파일 탐색기) 를 따라오세요.

> 💡 향후 `npx create-blumnAI-qa-bot` CLI 가 나오면 이 단계가 1줄로 줄어듭니다.

### 방법 A. 파일 탐색기로 복사 (터미널 안 씀)

**준비**: 코어 메인테이너에게서 받은 코어 레포 폴더 (예: `C:\Source\blumnAI-qa-bot\`) 가 본인 PC 어딘가에 있어야 합니다. (GitHub 에서 **"Code → Download ZIP"** 눌러 받은 후 압축 풀어도 됨)

**단계별로 따라오세요**:

#### 3-1. 본인 정책 레포 폴더를 파일 탐색기로 열기

2단계에서 `git clone` 한 폴더. 예: `C:\Source\ad-team-policies\`

#### 3-2. 그 안에 `.blumnAI-qa-bot` 폴더를 새로 만들기

- 폴더 안 빈 곳에서 **우클릭 → 새로 만들기 → 폴더**
- ⚠️ **Windows 는 점(.) 으로 시작하는 이름을 그냥 못 만듭니다.** 이름을 `.blumnAI-qa-bot.` 처럼 **뒤에도 점 하나** 붙여서 입력 → Enter 하면 뒷 점만 자동 사라지고 `.blumnAI-qa-bot` 폴더 생성됨
- Mac 은 그냥 `.blumnAI-qa-bot` 그대로 만들면 됨

#### 3-3. 그 폴더 안에 서브폴더 3개 만들기

`.blumnAI-qa-bot` 폴더로 들어가서 안에 이 3개 폴더 만들기:
- `apps`
- `worker`
- `local-server`

#### 3-4. 코어 레포에서 5가지 항목을 각각 복사

파일 탐색기 창을 **두 개 열어서** (왼쪽=코어 레포, 오른쪽=본인 정책 레포) 아래 표 대로 복사·붙여넣기:

| 코어 레포에서 무엇을 (Ctrl+C) | 본인 정책 레포 어디로 (Ctrl+V) |
|---|---|
| `apps/qa-collab.html`, `apps/qa-planner.html` **파일 2개** | `.blumnAI-qa-bot/apps/` 안 |
| `bot/worker/` 폴더 안의 **모든 파일·폴더 통째로** | `.blumnAI-qa-bot/worker/` 안 |
| `bot/local-server/` 폴더 안의 **모든 파일·폴더 통째로** | `.blumnAI-qa-bot/local-server/` 안 |
| `examples/sample-policy-repo/.blumnAI-qa-bot/answer-rules.md` **파일 1개** | `.blumnAI-qa-bot/` 바로 밑에 |
| `examples/sample-policy-repo/blumnAI-qa-bot.config.yml` **파일 1개** | 본인 정책 레포 **최상위** (`.blumnAI-qa-bot` 옆) |

#### 3-5. 확인

본인 정책 레포 폴더를 열었을 때 이렇게 보여야 합니다:

```
ad-team-policies/                           ← 본인 정책 레포 폴더
├── blumnAI-qa-bot.config.yml               ← 여기 있어야
├── .blumnAI-qa-bot/                        ← 이것도
│   ├── answer-rules.md
│   ├── apps/
│   │   ├── qa-collab.html
│   │   └── qa-planner.html
│   ├── worker/
│   │   └── (여러 파일)
│   └── local-server/
│       └── (여러 파일)
└── README.md                               ← 2단계 clone 때 생긴 것
```

✅ 이렇게 되어 있으면 3단계 완료.

---

### 방법 B. Git Bash 또는 WSL 명령어 (개발자용)

터미널이 익숙한 분은 이 방법이 빠릅니다.

> ⚠️ Windows cmd/PowerShell 에는 `cp -r` 명령어 없음. **Git Bash** (Git for Windows 와 함께 설치됨) 또는 **WSL** 에서 실행. Git Bash 는 경로를 `/c/Source/blumnAI-qa-bot/` 형식으로 씁니다 (앞에 슬래시, 드라이브 콜론 없이).

```bash
# 본인 정책 레포 루트에서
mkdir -p .blumnAI-qa-bot/apps .blumnAI-qa-bot/worker .blumnAI-qa-bot/local-server

# 5가지 복사 (아래 /path/to/... 부분은 본인 PC 의 코어 레포 실제 경로로 바꾸세요)
cp /path/to/blumnAI-qa-bot/apps/*.html .blumnAI-qa-bot/apps/
cp -r /path/to/blumnAI-qa-bot/bot/worker/* .blumnAI-qa-bot/worker/
cp -r /path/to/blumnAI-qa-bot/bot/local-server/* .blumnAI-qa-bot/local-server/
cp /path/to/blumnAI-qa-bot/examples/sample-policy-repo/.blumnAI-qa-bot/answer-rules.md .blumnAI-qa-bot/
cp /path/to/blumnAI-qa-bot/examples/sample-policy-repo/blumnAI-qa-bot.config.yml ./
```

확인:
```bash
ls -la
# blumnAI-qa-bot.config.yml  ← 여기 있어야
# .blumnAI-qa-bot/           ← 이것도
```

---

### 방법 C. 자동 스크립트 (Windows 배치 파일 — 준비 중)

향후 코어 레포에 `create/setup.bat` 자동화 스크립트가 제공될 예정. 그 파일을 본인 정책 레포 폴더에 복사한 뒤 더블 클릭만 하면 위 5가지가 자동 복사됩니다. 현재는 미제공 — 방법 A 또는 B 로 진행하세요.

---

## 4. 컨피그 파일 채우기 (5분)

### 🤖 AI 에게 위임

Claude Code 창에:
```
blumnAI-qa-bot.config.yml 을 우리 팀 정보로 채워줘:
- brand_name: "○○팀 QA Bot"
- team_name: "○○팀"
- github_repo: "your-org/ad-team-policies"
- projects[0].id: "ad_v1"
- projects[0].label: "○○ 운영 어드민"
- product_description: "○○ 캠페인 운영 어드민"

worker_url 과 pages_url 은 아직 비워두고 (5, 6단계 후 채움).

이어서 기본 정책 폴더 (projects/ad_v1/docs/policies) 와 qa/decisions,
qa/feedback 폴더 만들고, 샘플 정책 md 하나 넣어줘.
```

### 참고 — 컨피그 전체 예시

`blumnAI-qa-bot.config.yml` 파일이 이런 형태로 채워집니다:

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

이 단계는 **본인 액션 3개 + AI 위임 2개** 가 섞여 있어요.

### 5-1. Cloudflare 계정 가입 — 👤 본인이 직접

1. 브라우저에서 https://dash.cloudflare.com/sign-up
2. 이메일 인증 → 비밀번호 설정
3. 카드 등록 화면 → **Skip** / **Maybe later** (Workers 무료 tier 에 카드 불필요)

### 5-2. wrangler CLI 로그인 — 👤 브라우저 인증만 직접

Claude Code 에게:
```
.blumnAI-qa-bot/worker/ 에서 npm install 하고 wrangler login 실행해줘.
```

AI 가 실행하면 브라우저에서 Cloudflare 인증 창이 뜹니다. 👤 본인이 "Allow" 클릭.

### 5-3. wrangler.toml 편집 — 🤖 AI 에게 위임

Claude Code 에게:
```
.blumnAI-qa-bot/worker/wrangler.toml 의 [vars] 를 우리 정보로 수정해줘:
- GITHUB_REPO: "your-org/ad-team-policies"
- ALLOWED_ORIGINS: "https://your-org.github.io"  (6단계 후 다시 확인)
- CLAUDE_MODEL: "claude-sonnet-4-6"
```

### 5-4. Worker 시크릿 등록 — 👤 본인이 직접 (시크릿 값 붙여넣기)

> 🔒 **AI 채팅창에 절대 시크릿 값 붙여넣지 마세요.** 아래는 wrangler 프롬프트에만 직접 입력.

A 모드는 시크릿 **2개** 등록해야 합니다:

```bash
cd .blumnAI-qa-bot/worker
npx wrangler secret put ANTHROPIC_API_KEY
```
→ `? Enter a secret value:` 뜨면 👤 본인이 `sk-ant-...` 직접 붙여넣기 → Enter

```bash
npx wrangler secret put GITHUB_TOKEN
```
→ 👤 본인이 `ghp_...` 직접 붙여넣기 → Enter

PAT/API key 발급 방법은 [03-CONNECT-BOT.md](03-CONNECT-BOT.md) §1, §2 참고.

### 5-5. Worker 배포 — 🤖 AI 에게 위임

Claude Code 에게:
```
.blumnAI-qa-bot/worker/ 에서 npx wrangler deploy 실행하고, 배포된 Worker URL 을
blumnAI-qa-bot.config.yml 의 deployment.worker_url 에 채워줘.
```

AI 가 배포 실행 후 URL 을 컨피그에 자동 반영. 성공 시 출력:
```
✨ Success! Uploaded planner-qa-bot
✨ Published at https://planner-qa-bot.<your-subdomain>.workers.dev
```

---

## 6. GitHub Pages 활성화 (3분)

협업자·기획자가 브라우저로 접근할 화면(qa-collab.html / qa-planner.html) 호스팅.

### 6-1. Pages 설정 활성화 — 👤 본인이 직접

1. 브라우저에서 본인 GitHub 레포 페이지 → **Settings** → **Pages** (좌측 메뉴)
2. **Source**: `Deploy from a branch`
3. **Branch**: `main`, **Folder**: `/ (root)` → **Save**

### 6-2. `.nojekyll` 파일 + 커밋 — 🤖 AI 에게 위임

Claude Code 에게:
```
정책 레포 루트에 빈 .nojekyll 파일 만들고 commit + push 해줘.
메시지: "disable jekyll for dotfolder support"
```

→ `.blumnAI-qa-bot/` 같은 점-시작 폴더가 Pages 에서 안 걸리게 하는 필수 처리.

### 6-3. Pages URL 확인 + 컨피그 반영 — 🤖 AI 에게 위임

1-2분 후 Pages URL (예: `https://your-org.github.io/ad-team-policies/`) 이 활성화됩니다. 그 다음:

```
Pages URL 이 이제 활성화됐어. blumnAI-qa-bot.config.yml 의 pages_url 에
그 URL 채우고, wrangler.toml 의 ALLOWED_ORIGINS 도 이 URL 로 갱신 후
wrangler deploy 다시 실행해줘.
```

---

## 7. 컨피그 푸시 + 동작 확인 (2분)

### 7-1. 최종 push — 🤖 AI 에게 위임

Claude Code 에게:
```
blumnAI-qa-bot.config.yml 와 .blumnAI-qa-bot/ 를 stage + commit + push 해줘.
커밋 메시지: "blumnAI-qa-bot 초기 설치"
```

### 7-2. 브라우저에서 최종 확인 — 👤 본인이 직접

브라우저에서:
```
https://your-org.github.io/ad-team-policies/.blumnAI-qa-bot/apps/qa-collab.html
```

화면이 떠서 좌측에 "○○ 운영 어드민" select 가 보이고 정책 목록에 `샘플_v0.1.0.md` 가 보이면 ✅ **설치 완료**.

문제 있으면 F12 (개발자 도구) → Console/Network 탭 캡처를 Claude Code 에게 보여주고 트러블슈팅 요청.

---

## 8. 다음 단계

- [07-FIRST-TEST.md](07-FIRST-TEST.md) — **바로 이어서** 5분 첫 테스트 5개 시나리오 실행 (🟢 세팅하기 마스터 프롬프트에 포함되어 있으면 자동 진행)
- (옵션) [06-CONNECT-CODE.md](06-CONNECT-CODE.md) — 서비스 코드 레포까지 연결해 정책 vs 코드 drift 판정
- [02-WIRE-POLICIES.md](02-WIRE-POLICIES.md) — 실제 정책 markdown 작성 규약
- [04-OPERATE.md](04-OPERATE.md) — 협업자·기획자 화면 사용법 (팀 온보딩 자료로 공유)

---

## 트러블슈팅

| 증상 | 원인·해결 |
|---|---|
| qa.html 에서 ⚙️ "설정이 필요합니다" 화면 | `blumnAI-qa-bot.config.yml` 가 레포 루트에 없거나 `worker_url` 미입력. 4-5단계 재확인 |
| "Failed to fetch" | Worker URL 오타 또는 CORS. `security.allowed_origins` 가 Pages URL 정확한지 확인 |
| Pages 에서 404 | `.nojekyll` 파일 누락 또는 빌드 대기. 6-1~6-3 재확인, 2-3분 대기 |
| `npx wrangler login` 브라우저 인증 안 됨 | 회사 방화벽 가능성. 개인 핫스팟으로 재시도 |
| 답변 매번 실패 (Anthropic 에러) | API key 만료 또는 한도 초과. https://console.anthropic.com Usage/Billing 확인 |
| C 모드 관련 이슈 | 이 가이드는 A 모드 기준. C 모드는 [03-CONNECT-BOT §부록](03-CONNECT-BOT.md#부록--c-모드-pc-max-우회-특수-상황용) |
