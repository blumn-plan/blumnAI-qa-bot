# 배포 가이드 — planner Q&A 챗

기획자분이 직접 따라하실 수 있도록 step-by-step 으로 정리했습니다. 막히는 부분은 캡처 보내주세요.

> 총 소요 시간: 약 15분. 한 번 셋업하면 이후 코드 변경 시 `npm run deploy` 한 줄만 다시 실행하면 됩니다.

---

## 0. 준비물 체크리스트

이 셋업에 필요한 계정·도구 6가지:

| 항목 | 필요 이유 | 보유 여부 |
|---|---|---|
| Node.js 18+ | 배포 명령어 (`npm`/`wrangler`) 실행 | 코드 작업하시면 보통 깔려 있음 |
| Cloudflare 계정 | Worker (백엔드) 호스팅 | 새로 가입 (무료, 카드 X) |
| Anthropic API key | Claude 호출 | claude.ai 사용 중이면 활용 가능 |
| GitHub PAT (Personal Access Token) | private repo 읽기 + qa/decisions 파일 쓰기 | 새로 발급 |
| GitHub Pages 활성화 | qa.html 호스팅 | Pages Pro 보유하셔서 사용 가능 |
| (선택) Slack/이메일 알림 | qa/decisions 새 파일 알림 | MVP 에선 미사용 |

체크하시고 막히는 항목 있으면 그때 알려주세요. 아래는 0번 가정하고 진행합니다.

---

## 1. Cloudflare 계정 가입 (1분)

1. https://dash.cloudflare.com/sign-up 접속
2. 이메일 입력 → 이메일 인증 → 비밀번호 설정
3. 카드 등록 화면이 나오면 **Skip** / **Maybe later** 클릭 (Workers 무료 tier 에 카드 불필요)

✅ 완료되면 대시보드 (https://dash.cloudflare.com) 가 보입니다.

---

## 2. Anthropic API key 받기 (2분)

기존에 GitHub Actions 에 등록되어 있는 `CLAUDE_CODE_OAUTH_TOKEN` 을 그대로 쓸 수도 있지만, **API 직접 호출용 키가 따로 필요**합니다.

1. https://console.anthropic.com 접속
2. 로그인 (없으면 가입)
3. 좌측 메뉴 **API Keys** 클릭
4. **Create Key** → 이름 `planner-qa-bot` → **Create**
5. `sk-ant-...` 로 시작하는 문자열이 **딱 한 번 보입니다** — 메모장에 복사해두세요.

✅ 키 확보. 이 키는 비밀이라 GitHub 같은 곳에 절대 올리지 마세요.

---

## 3. GitHub Personal Access Token 발급 (2분)

bot 이 정책문서를 읽고, qa/decisions/ 에 새 파일을 만들 수 있어야 합니다.

> lunasoft-org 는 fine-grained PAT 를 차단하고 있어서 **Classic PAT** 으로 발급합니다.

1. https://github.com/settings/tokens/new 접속 (Classic)
2. **Note** (이름): `planner-qa-bot`
3. **Expiration**: `1 year` 선택 (또는 No expiration)
4. **Select scopes** 섹션에서 **`repo`** 체크박스 하나만 클릭
   - `repo` 클릭하면 아래 5개 하위 항목 (`repo:status`, `repo_deployment`, `public_repo`, `repo:invite`, `security_events`) 이 자동으로 모두 체크됨 — 정상
   - 다른 scope (admin, workflow, gist 등) 는 모두 체크 해제
5. 페이지 맨 아래 초록색 **Generate token** 클릭
6. `ghp_...` 로 시작하는 토큰이 **딱 한 번** 표시됨 → **즉시 메모장에 복사**

✅ 토큰 확보. 메모장에 보관.

> **권한 주의**: Classic PAT 의 `repo` scope 는 본인이 접근권 가진 **모든 repo** 의 읽기·쓰기 권한을 줍니다. fine-grained 보다 권한이 넓지만 셋업이 단순. 토큰 유출 시 피해 범위가 넓으니 메모장 외부에 노출 안 되게만 주의하세요. 노출되면 즉시 https://github.com/settings/tokens 에서 Delete.

---

## 4. wrangler CLI 설치 + 로그인 (2분)

VS Code 터미널이나 PowerShell 에서:

```bash
cd c:/Source/기획/heythere_planer/qa-bot
npm install
```

그러면 `wrangler` 가 깔립니다. 이어서:

```bash
npx wrangler login
```

브라우저가 열려 Cloudflare 계정 승인 화면이 나옵니다 → **Allow** 클릭.

✅ 터미널에 `Successfully logged in.` 보이면 OK.

---

## 5. Secret 등록 (2분)

방금 확보한 API key 와 PAT 를 Worker 에 비밀로 저장합니다.

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

→ 프롬프트에 `sk-ant-...` 붙여넣고 Enter.

```bash
npx wrangler secret put GITHUB_TOKEN
```

→ 프롬프트에 `github_pat_...` (또는 `ghp_...`) 붙여넣고 Enter.

✅ 둘 다 `🌀 Creating the secret ... ✨ Success!` 나오면 OK.

---

## 6. Worker 배포 (1분)

```bash
npx wrangler deploy
```

마지막에 이런 줄이 출력됩니다:

```
Published planner-qa-bot
  https://planner-qa-bot.<your-subdomain>.workers.dev
```

이 URL을 **복사해두세요** — 다음 단계에서 씁니다.

테스트:

```bash
curl https://planner-qa-bot.<your-subdomain>.workers.dev/
# {"status":"ok","service":"planner-qa-bot"} 가 나와야 함
```

---

## 7. qa.html 에 Worker URL 적용 (1분)

planner 레포의 [qa.html](../qa.html) 파일을 VS Code 로 열어서 다음 줄을 찾으세요:

```js
const WORKER_URL = '__WORKER_URL__';
```

`__WORKER_URL__` 자리에 6단계에서 복사한 URL 을 붙여넣으세요 (끝에 `/` 없이):

```js
const WORKER_URL = 'https://planner-qa-bot.your-subdomain.workers.dev';
```

저장 → commit & push:

```bash
cd c:/Source/기획/heythere_planer
git add qa.html
git commit -m "feat(qa-bot): qa.html WORKER_URL 적용"
git push
```

---

## 8. GitHub Pages 활성화 (2분)

1. https://github.com/lunasoft-org/heythere_planer/settings/pages 접속
2. **Build and deployment** 섹션:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / **Folder**: `/ (root)` → Save
3. 1-2분 기다리면 같은 페이지 위쪽에 사이트 URL 이 표시됨:
   `https://lunasoft-org.github.io/heythere_planer/`

✅ 사이트 URL 에 `/qa.html` 붙여서 접속:
**`https://lunasoft-org.github.io/heythere_planer/qa.html`**

> private 레포라 처음엔 GitHub 로그인 화면이 뜰 수 있어요. 로그인하면 정상 노출.

---

## 9. 동작 확인 (1분)

위 URL 에 접속해서:

1. 좌측 사이드바에 정책문서 9개 + 화면설계서 7개 목록이 보이나요? → 보이면 ✅
2. `대시보드_v0.1.3` 클릭 → 가운데에 정책 내용이 렌더되나요? → ✅
3. 우측 챗박스에 `필터 초기화 버튼이 없는 이유?` 입력 → 전송 → 답변 오나요? → ✅
4. 답변 받은 후 **📤 기획자에게 전달** 클릭 → 제목·요약 입력 → 생성 → qa/decisions/ 에 새 md 파일 생성 확인 → ✅

---

## 운영 관련 팁

### 로그 보기 (디버깅)

문제 생기면:

```bash
cd qa-bot
npx wrangler tail
```

→ 다른 사용자가 챗을 쓰면 실시간으로 요청·에러가 콘솔에 찍힙니다. Ctrl+C 로 종료.

### Secret 회전 (보안 사고 시)

API key 가 노출됐다 싶으면:

1. console.anthropic.com → API Keys → 해당 키 **Revoke**
2. 새 키 발급
3. `npx wrangler secret put ANTHROPIC_API_KEY` 로 다시 등록

GitHub PAT 도 비슷한 절차로 회전 가능. 즉시 효력 발생.

### 사용량 모니터링

- **Cloudflare**: https://dash.cloudflare.com → Workers & Pages → 사용량 그래프
- **Anthropic**: https://console.anthropic.com → Usage → 일별 토큰 소모

Workers 무료 tier 가 일 10만 요청이라 절대 막힐 일 없고, Claude API 는 토큰당 과금이라 월 사용량만 가끔 확인하면 됩니다.

### 코드 수정 후 재배포

```bash
cd qa-bot
npx wrangler deploy
```

Worker 만 바뀌었으면 위 한 줄로 끝. qa.html 만 바뀌었으면 git push 하면 Pages 가 자동 갱신.

---

## 트러블슈팅

| 증상 | 원인·해결 |
|---|---|
| qa.html 접속 시 사이드바에 "목록 로드 실패" | WORKER_URL 미적용. 7단계 다시. |
| 답변이 항상 실패 | `wrangler tail` 로 로그 확인. 보통 ANTHROPIC_API_KEY 등록 누락 또는 만료. |
| "기획자에게 전달" 시 403/401 | GITHUB_TOKEN 권한 부족. Classic PAT 의 `repo` scope 가 체크되어 있는지 3단계 확인. |
| Pages 접속 시 404 | Pages 활성화 후 1-2분 대기. 그래도 안 되면 `main` 브랜치에 `qa.html` 이 있는지 확인. |
| CORS 오류 | wrangler.toml 의 `ALLOWED_ORIGINS` 가 `https://lunasoft-org.github.io` 인지 확인. 바꿨으면 `wrangler deploy` 재실행. |
| fine-grained PAT 페이지에 "Only select repositories" 옵션 없음 | lunasoft-org 가 fine-grained 차단. Cancel 하고 Classic PAT (위 절차) 로 다시. |

---

문제 있으면 캡처 보내주세요.
