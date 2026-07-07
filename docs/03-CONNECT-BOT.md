# 03. AI봇 연결 (Connect Bot)

봇이 Claude API 와 GitHub 에 접근할 수 있게 자격증명을 발급·등록하는 절차.

[01-INSTALL.md](01-INSTALL.md) §5 에서 참조하는 세부 가이드.

> 🔒 **이 문서에서 다루는 값들 (API key, PAT) 은 시크릿입니다.** AI 채팅창에 절대 붙여넣지 마세요. 오직 wrangler 프롬프트 (터미널 "Enter a secret value:") 또는 본인 메모장에만 저장. 이 문서의 스텝 대부분은 👤 **본인이 직접** 브라우저에서 진행합니다.

---

## 어떤 자격증명이 필요한가 — 모드별

| 모드 | Anthropic 자격 | GitHub 자격 |
|---|---|---|
| **C 모드** (Max 우회, 무료) | **불필요** — PC 의 `claude` CLI 가 본인 Max 로그인으로 처리 | GitHub PAT (정책 read + decisions/feedback write) |
| **A 모드** (유료 API) | Anthropic API key (`sk-ant-...`) | 동일 |

C 모드 추천 ([00-OVERVIEW](00-OVERVIEW.md#두-가지-운영-모드--c-모드-추천) 참고).

---

## 1. GitHub Personal Access Token 발급 (2분) — 👤 본인이 직접

봇이 본인 정책 레포에서 md 읽고, qa/decisions/qa/feedback 에 쓸 권한.

> ⚠️ lunasoft-org 같은 일부 조직은 fine-grained PAT 를 차단. **Classic PAT** 으로 발급합니다.

1. https://github.com/settings/tokens/new (Classic)
2. **Note** (이름): `blumnAI-qa-bot` (또는 팀명 포함)
3. **Expiration**: `1 year` (또는 No expiration)
4. **Select scopes**: **`repo`** 하나만 체크
   - `repo` 클릭하면 하위 5개 (`repo:status`, `repo_deployment`, `public_repo`, `repo:invite`, `security_events`) 자동 체크 — 정상
   - 다른 scope (admin, workflow, gist 등) 모두 체크 해제
5. **Generate token** 클릭
6. `ghp_...` 로 시작하는 토큰 **딱 한 번** 표시됨 → **즉시 메모장에 복사**

> **권한 주의**: `repo` scope 는 본인 접근권 있는 **모든 repo** 의 읽기·쓰기 권한. fine-grained 보다 넓지만 셋업 단순. 토큰 유출 시 즉시 https://github.com/settings/tokens 에서 Delete.

---

## 2. (A 모드만) Anthropic API key 발급 (2분) — 👤 본인이 직접

> C 모드면 이 단계 스킵.

1. https://console.anthropic.com 접속 → 로그인
2. 좌측 메뉴 **API Keys** 클릭
3. **Create Key** → 이름 `blumnAI-qa-bot` → **Create**
4. `sk-ant-...` 로 시작하는 문자열이 **딱 한 번 보임** → 메모장 복사

이 키로 호출되는 비용은 본인이 등록한 카드로 청구. 월 사용량 모니터링:
- https://console.anthropic.com → 좌측 **Usage** 에서 일자별·키별 토큰 사용량 확인 가능
- 한도 설정 권장: 좌측 **Plans & Billing** → **Spending Limit** 으로 월 $50 같은 상한 걸어두기

---

## 3. (C 모드만) Claude Code CLI + Max 로그인 (3분)

> A 모드면 이 단계 스킵.

### 3-1. Claude Code 데스크탑 앱 설치 — 👤 본인이 직접

https://claude.ai/code 에서 본인 OS 용 데스크탑 앱 다운로드 → 설치.

### 3-2. claude CLI 동작 확인 — 🤖 AI 에게 위임

Claude Code 창에:
```
claude --version 실행해서 결과 알려줘. 안 되면 PATH 문제인지 확인해줘.
```

Windows PATH 문제 발생 시 AI 가 `where claude` 로 경로 찾아서 안내.

### 3-3. Max 로그인 확인 — 🤖 AI 에게 위임

```bash
echo "say hello" | claude --print --no-color
```

→ "Hello!" 같은 짧은 응답이 1-3초 안에 오면 정상.

→ 로그인 요청 뜨면 `claude login` 한 번 실행 후 다시.

---

## 4. (C 모드만) cloudflared 설치 (1분) — 🤖 AI 에게 위임 가능

> A 모드면 이 단계 스킵. `start.bat` 가 `cloudflared` 를 호출해서 PC tunnel 띄움.

Windows:
```powershell
winget install --id Cloudflare.cloudflared
```

> ⚠️ winget 은 PATH 등록 안 함. `launcher.js` 가 자동으로 winget 설치 경로를 찾아 실행하므로 PATH 신경 안 써도 됩니다.

확인:
```powershell
winget list cloudflared
```
→ `Cloudflare.cloudflared` 보이면 OK.

`winget` 없으면 https://github.com/cloudflare/cloudflared/releases/latest 에서 `cloudflared-windows-amd64.msi` 다운받아 설치.

---

## 5. wrangler 에 시크릿 등록 (1분) — 👤 본인이 직접 (시크릿 값 붙여넣기)

> 🔒 **AI 에게 시크릿 값을 절대 알려주지 마세요.** wrangler 프롬프트에만 직접 입력. AI 는 명령어 실행만 위임 가능 — 예: `.blumnAI-qa-bot/worker/ 에서 npx wrangler secret put GITHUB_TOKEN 실행해줘. 프롬프트가 뜨면 나한테 알려줘.`

VS Code 터미널에서 본인 레포의 `.blumnAI-qa-bot/worker/` 폴더로:

```bash
cd .blumnAI-qa-bot/worker
```

**C 모드 — GitHub PAT 만**:
```bash
npx wrangler secret put GITHUB_TOKEN
# 프롬프트에 1번에서 받은 ghp_... 토큰 붙여넣기 → Enter
```

**A 모드 — 둘 다**:
```bash
npx wrangler secret put GITHUB_TOKEN
# ghp_... 붙여넣기

npx wrangler secret put ANTHROPIC_API_KEY
# sk-ant-... 붙여넣기
```

등록 확인:
```bash
npx wrangler secret list
```
→ 등록된 secret 목록 출력. `name` 만 보이고 값은 안 나옴(정상 — 값은 Cloudflare 가 암호화 보관).

---

## 6. (C 모드만) PC 부팅 시 자동 실행 (선택, 2분) — 👤 본인이 직접

매번 PC 켤 때마다 `start.bat` 더블 클릭하기 귀찮으면:

### Windows
1. **Win+R** → `shell:startup` → Enter
2. 열린 폴더에 `start.bat` **바로가기** 생성:
   - VS Code 에서 `.blumnAI-qa-bot/local-server/start.bat` 우클릭 → **바로가기 만들기**
   - 만들어진 `start.bat - 바로가기` 를 시작 프로그램 폴더로 드래그
3. 다음 PC 부팅 시 자동으로 콘솔창 뜨면서 서비스 가동

> 보안 정책상 시작 프로그램 차단된 환경이면 **Task Scheduler** 로 등록 가능 (코어 메인테이너에게 별도 가이드 요청).

### macOS / Linux
launchd / systemd 단위로 등록. 기본 가이드는 [README](https://github.com/cloudflare/cloudflared#installation) 참고.

---

## 7. (C 모드만) 일상 운영 주의사항

### PC 끄지 않기

- **절전 모드 진입 → 챗 중단**. 전원 설정에서 "절대 절전 안 함" 으로
- 노트북이면 뚜껑 닫아도 동작하게 설정
- Windows 자동 업데이트 재시작 → `start.bat` 가 시작 프로그램 등록되어 있으면 자동 복구

### URL 이 바뀌었을 때 (대부분 자동 복구)

`start.bat` 재시작될 때마다 `TUNNEL_URL` 을 Worker 에 자동 등록. 수동 개입 불필요.

자동 등록 실패 시 콘솔 마지막 줄:
```
[launcher] wrangler exit 1 — TUNNEL_URL 등록 실패. 수동 등록:
[launcher]   cd .blumnAI-qa-bot/worker && echo https://abc-xyz.trycloudflare.com | npx wrangler secret put TUNNEL_URL
```

→ 그 명령어 복사해서 별도 터미널에서 실행.

### Max 한도 모니터링

- https://claude.ai 우상단 프로필 → **Settings** → **Usage**
- Max 플랜은 5시간 단위 한도. QA 사용량은 매우 적어서 한도 압박 거의 없음

### Anthropic 에서 "automated use" 경고 메일 받으면

C 모드는 Claude Code CLI 안에서만 공식 지원되는 패턴이라 봇 자동화 사용은 정책 회색지대. 만약 경고 받으면:
1. 즉시 C 모드 종료: `npx wrangler secret delete TUNNEL_URL`
2. A 모드로 전환 (5단계의 A 모드 시크릿 등록)
3. 회사 결제 받아서 A 모드 정착

---

## 트러블슈팅

| 증상 | 원인·해결 |
|---|---|
| `claude` 명령어 인식 안 됨 | Claude Code 데스크탑 앱 설치 후 PATH 추가. 또는 `where claude` 경로를 `server.js` 의 `CLAUDE_BIN` 환경변수로 지정 |
| `cloudflared` 명령어 인식 안 됨 | winget 설치 후 새 터미널에서 시도. PATH 갱신 필요할 수 있음 |
| `wrangler login` 브라우저 인증 실패 | 회사 방화벽. 개인 핫스팟으로 재시도 |
| `wrangler secret put` 권한 에러 | `wrangler login` 다시 |
| qa.html "Local server unreachable via tunnel" | PC start.bat 안 켜져 있음. 재실행 |
| 답변 매번 실패 (Anthropic 에러) | C 모드: Max 로그인 만료. `claude login` 다시 / A 모드: API key 만료 또는 한도 초과 |
| 답변 너무 느림 (>30초) | C 모드: claude CLI 콜드 스타트. 두 번째 질문부터는 빨라짐 |
