# 03. AI봇 연결 (Connect Bot) — A 모드 기준

봇이 Anthropic API 와 GitHub 에 접근할 수 있게 자격증명을 발급·등록하는 절차.

[01-INSTALL.md](01-INSTALL.md) §5 에서 참조하는 세부 가이드.

> 🔒 **이 문서에서 다루는 값들 (API key, PAT) 은 시크릿입니다.** AI 채팅창에 절대 붙여넣지 마세요. 오직 wrangler 프롬프트 (터미널 "Enter a secret value:") 또는 본인 메모장에만 저장. 이 문서의 스텝 대부분은 👤 **본인이 직접** 브라우저에서 진행합니다.

---

## 어떤 자격증명이 필요한가 — A 모드 (기본)

이 문서 §1 · §2 · §5 만 따라오면 됩니다.

| 항목 | 언제 필요 | 문서 §  |
|---|---|---|
| **GitHub PAT** (`ghp_...`) | 봇이 정책 md read + qa/decisions/feedback write | §1 |
| **Anthropic API key** (`sk-ant-...`) | 봇 답변 엔진 (A 모드 = 이 봇의 기본 모드) | §2 |
| wrangler secret 등록 | 위 두 시크릿을 Cloudflare Worker 에 안전 저장 | §5 |

C 모드 (PC Max 우회) 는 특수 상황용이고 상세 절차는 이 문서 하단 [부록 — C 모드 (PC Max 우회, 특수 상황용)](#부록--c-모드-pc-max-우회-특수-상황용) 에 있습니다. 처음 셋업 때는 스킵하세요.

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

## 5. wrangler 에 시크릿 등록 (1분) — 👤 본인이 직접 (시크릿 값 붙여넣기)

> 🔒 **AI 에게 시크릿 값을 절대 알려주지 마세요.** wrangler 프롬프트에만 직접 입력. AI 는 명령어 실행만 위임 가능 — 예: `.blumnAI-qa-bot/worker/ 에서 npx wrangler secret put GITHUB_TOKEN 실행해줘. 프롬프트가 뜨면 나한테 알려줘.`

VS Code 터미널에서 본인 레포의 `.blumnAI-qa-bot/worker/` 폴더로:

```bash
cd .blumnAI-qa-bot/worker

npx wrangler secret put ANTHROPIC_API_KEY
# 프롬프트에 sk-ant-... 붙여넣기 → Enter

npx wrangler secret put GITHUB_TOKEN
# 프롬프트에 ghp_... 붙여넣기 → Enter
```

등록 확인:
```bash
npx wrangler secret list
```
→ 등록된 secret 목록 출력. `name` 만 보이고 값은 안 나옴(정상 — 값은 Cloudflare 가 암호화 보관).

---

## 🩺 원격 진단 — `/health?detailed=1`

셋업 중 뭔가 안 되면 **브라우저를 F5 새로고침** 하세요. qa-collab.html / qa-planner.html 이 자동으로 Worker 의 `/health?detailed=1` 을 호출해서 원인을 체크리스트로 보여줍니다:

- ✅/❌ Anthropic API key 등록 여부
- ✅/❌ GitHub PAT 등록 여부
- ✅/❌ GITHUB_REPO · ALLOWED_ORIGINS 값
- ✅/❌ `config.yml` 파싱 상태 + 프로젝트 목록
- 캐시 통계

직접 curl 로도 확인 가능:
```bash
curl "https://<your-worker>.workers.dev/health?detailed=1" | jq
```

시크릿 **값 자체는 응답에 포함되지 않음** (등록 여부만 boolean 반환) — 안전하게 공유·스크린샷 가능.

---

## 트러블슈팅 — A 모드

| 증상 | 원인·해결 |
|---|---|
| qa.html 진단 화면에 ❌ Anthropic API key | IT기획팀에 재발급 요청 → `wrangler secret put ANTHROPIC_API_KEY` |
| qa.html 진단 화면에 ❌ GitHub PAT | Classic PAT (`repo` scope) 재발급 → `wrangler secret put GITHUB_TOKEN` |
| qa.html 진단 화면에 ❌ config.yml 파싱 | 팀 레포 루트에 `blumnAI-qa-bot.config.yml` 이 있고 YAML 문법 유효한지 확인 |
| `wrangler login` 브라우저 인증 실패 | 회사 방화벽. 개인 핫스팟으로 재시도 |
| `wrangler secret put` 권한 에러 | `wrangler login` 다시 |
| 답변 매번 실패 (401 · invalid_api_key) | API key 만료. `/health?detailed=1` 확인 후 재등록 |
| 답변 매번 실패 (429 · rate_limit) | 호출 한도 초과. https://console.anthropic.com Usage/Billing 확인 |
| CORS 차단 | wrangler.toml 의 `ALLOWED_ORIGINS` 에 페이지 URL 추가 후 재배포 |
| 답변 너무 느림 (>15초) | Anthropic 응답 지연. 지속되면 `claude_model` 을 `claude-haiku-4-5-...` 로 낮춰서 테스트 |
| PAT 이 코드 레포 접근 못함 (코드 검증 켠 팀) | classic PAT 이면 `repo` scope 재확인. fine-grained 이면 코드 레포도 selected repositories 에 추가 |

---

## 부록 — C 모드 (PC Max 우회, 특수 상황용)

> ⚠️ **C 모드는 처음 셋업에서 다루지 않습니다.** 회사에서 Anthropic API 결제 승인을 못 받았거나, 개인 Max 구독으로 우선 가치 검증만 해보고 싶은 특수 상황에서만 검토하세요. 정상 팀 셋업은 A 모드입니다.

C 모드는 본인 PC 의 Claude Code CLI (Max 구독 로그인) 를 tunnel 로 우회 활용해서 Anthropic API 호출을 대체합니다. Anthropic 정책 회색지대라 언제든 막힐 수 있는 리스크가 있고, PC 상시 가동·터널 유지 부담이 있습니다.

<details>
<summary>C 모드 상세 스텝 (Claude CLI 설치 · cloudflared · start.bat · 부팅 자동 실행 · 운영 주의사항) — 펼쳐서 보기</summary>

### C-1. Claude Code CLI 동작 확인

Claude Code 데스크탑 앱 (https://claude.ai/code) 을 이미 설치·로그인한 상태여야 합니다.

Claude Code 창에:
```
claude --version 실행해서 결과 알려줘. 안 되면 PATH 문제인지 확인해줘.
```

Windows PATH 문제 발생 시 AI 가 `where claude` 로 경로 찾아서 안내.

Max 로그인 확인:
```bash
echo "say hello" | claude --print --no-color
```
→ "Hello!" 같은 짧은 응답이 1-3초 안에 오면 정상. 로그인 요청 뜨면 `claude login` 한 번 실행.

### C-2. cloudflared 설치

Windows:
```powershell
winget install --id Cloudflare.cloudflared
```
`winget` 없으면 https://github.com/cloudflare/cloudflared/releases/latest 에서 msi 설치.

### C-3. wrangler 시크릿 — GitHub PAT 만

C 모드는 Anthropic API key 대신 tunnel URL 을 씁니다:
```bash
cd .blumnAI-qa-bot/worker
npx wrangler secret put GITHUB_TOKEN
# ghp_... 붙여넣기
```

Anthropic API key 는 등록하지 않습니다. `start.bat` 가 첫 실행 시 `TUNNEL_URL` 을 자동 등록.

### C-4. PC 부팅 시 자동 실행 (선택)

- **Windows**: Win+R → `shell:startup` → 폴더에 `.blumnAI-qa-bot/local-server/start.bat` 바로가기 드래그
- **macOS / Linux**: launchd / systemd 로 등록

### C-5. 일상 운영 주의사항

- **절전 모드 진입 → 챗 중단**. 전원 설정에서 "절대 절전 안 함"
- **URL 자동 복구**: `start.bat` 재시작 시 `TUNNEL_URL` 을 Worker 에 자동 등록. 실패 시 콘솔 마지막 줄에 수동 등록 명령어 안내됨
- **Max 한도**: https://claude.ai → Settings → Usage. QA 사용량은 매우 적어 압박 거의 없음
- **Anthropic "automated use" 경고 메일**: 즉시 C 모드 종료 (`npx wrangler secret delete TUNNEL_URL`) → A 모드로 전환

### C 모드 전용 트러블슈팅

| 증상 | 원인·해결 |
|---|---|
| `claude` 명령어 인식 안 됨 | Claude Code 데스크탑 앱 설치 후 PATH 추가. 또는 `where claude` 경로를 `server.js` 의 `CLAUDE_BIN` 환경변수로 지정 |
| `cloudflared` 명령어 인식 안 됨 | winget 설치 후 새 터미널에서 시도 |
| qa.html "Local server unreachable via tunnel" | PC start.bat 안 켜져 있음. 재실행 |
| 답변 매번 실패 | Max 로그인 만료. `claude login` 다시 |
| 답변 너무 느림 (>30초) | claude CLI 콜드 스타트. 두 번째 질문부터 빨라짐 |

</details>
