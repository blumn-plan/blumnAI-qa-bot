# 09. SaaS 모드 — 하나의 URL 로 모든 팀이 씀

**팀별 개별 셋업 없이, 브라우저 wizard 로 3분 안에 봇 사용 가능한 SaaS 배포 형태.**

## 대상

- **다른 팀 담당자·기획자**: 자기 팀 정책·코드가 있는데 봇 셋업이 부담스러운 경우
- **코어 메인테이너**: SaaS 배포·운영 방법이 궁금한 경우

---

## 사용자 관점 — 접속 → 3분 셋업 → 즉시 사용

1. **URL 접속** — `https://blumnai-qa.ai` (배포 후 확정)
2. **첫 방문 wizard 자동 실행**:

   | 항목 | 예시 | 필수? |
   |---|---|---|
   | 팀 이름 | 광고팀 | ✅ |
   | 정책 문서 GitHub 레포 | `blumn/ad-team-policies` | ✅ |
   | 정책 폴더 경로 | `docs/policies` | 있으면 |
   | 화면설계서 폴더 | `docs/storyboards` | 선택 |
   | 서비스 코드 레포 | `blumn/ad-admin-frontend` | 선택 |
   | GitHub PAT (`ghp_...`) | — | ✅ (개인 발급) |
   | Anthropic API Key (`sk-ant-...`) | — | ✅ (팀별 결제) |
   | 기획자 모드 비번 | | 선택 |

3. **[💾 저장하고 시작하기]** → 봇 화면 로드 · 즉시 사용

**저장 위치**: 사용자 브라우저 localStorage — 서버에 안 감. 다른 사람과 공유 금지.

**설정 변경**: 봇 툴바 [⚙️] 버튼 → wizard 재실행.

---

## 기존 팀 모드와 뭐가 다른가

| 구분 | 기존 (Team-per-Deploy) | SaaS (지금) |
|---|---|---|
| **접속 URL** | 팀 GitHub Pages URL | 하나의 URL (`blumnai-qa.ai`) |
| **셋업 도구** | Claude Code + 터미널 + wrangler | 브라우저 wizard |
| **팀 레포 수정** | 필요 (`.blumnAI-qa-bot/` 복사) | ❌ 필요 없음 |
| **Cloudflare Worker 배포** | 팀당 1개 | 중앙 1개 (blumn 관리) |
| **API key 등록** | wrangler secret 커맨드 | 브라우저 wizard 입력 |
| **셋업 시간** | 30-60분 | 3분 |
| **자동 업데이트** | 팀별 [🟠 업데이트하기] 프롬프트 | 즉시 반영 (중앙 배포) |
| **저장되는 위치** | wrangler secrets | 사용자 브라우저 localStorage |

---

## 코어 메인테이너 관점 — 배포 방법

SaaS 모드는 기존 팀 모드 Worker 를 그대로 사용하되, 환경변수와 헤더 처리만 다릅니다.

### 1. Worker 배포

```bash
cd bot/worker
cp wrangler.toml.template wrangler.toml
```

`wrangler.toml` 편집:
```toml
name = "blumnai-qa-saas"
main = "src/index.ts"

[vars]
SAAS_MODE = "1"                          # ← 핵심: SaaS 모드 활성
# GITHUB_REPO 는 사용자 헤더로 받으므로 미설정 or 빈 값
# ALLOWED_ORIGINS 는 SaaS 모드에서는 무시됨 (아무 origin 허용)
CLAUDE_MODEL = "claude-sonnet-4-6"
```

시크릿 — SaaS 모드에선 **fallback 용** (사용자가 헤더로 안 보낼 때만 사용). 안 넣어도 됨.

```bash
npx wrangler deploy
# → https://blumnai-qa-saas.<subdomain>.workers.dev
```

### 2. Pages 배포 (프론트엔드)

```bash
# apps/ 폴더를 Cloudflare Pages 또는 GitHub Pages 에 배포
# 커스텀 도메인: qa.blumnai.ai
```

프런트는 SaaS 모드 자동 감지:
- `blumnAI-qa-bot.config.yml` 파일이 없으면 → SaaS 모드
- localStorage 에 저장된 설정 있으면 사용 · 없으면 wizard

### 3. Worker URL 을 프론트에 알려주기

`apps/qa-collab.html` 이 로드된 origin 을 Worker URL 로 사용하므로:
- **같은 도메인 배포** (예: `qa.blumnai.ai` 하나가 HTML + Worker): 자동 동작
- **다른 도메인 배포**: Worker URL 을 fallback 코드에서 하드코딩하거나 build 시 주입 필요

---

## 헤더 스펙 (Worker API)

SaaS 모드에서 Worker 는 다음 요청 헤더로 팀별 인증을 받습니다:

| 헤더 | 값 | 필수? |
|---|---|---|
| `X-Bot-GitHub-Repo` | `org/repo` (팀 정책 레포) | ✅ |
| `X-Bot-GitHub-Token` | `ghp_...` (팀 PAT) | ✅ |
| `X-Bot-Anthropic-Key` | `sk-ant-...` (팀 API key) | ✅ (없으면 Worker env 값 fallback) |

프런트가 자동으로 붙여줌 (`botFetch()` wrapper).

---

## 보안 고려사항

### 프론트 (사용자 관점)

- **PAT · API key 는 localStorage 에만** 저장. 서버 안 감
- HTTPS 필수 (배포 시 확인)
- XSS 방어 — 현 코드는 escapeHtml 다 적용됨
- 여러 사람이 공유하는 PC 에선 사용 후 [⚙️] → 취소 (또는 브라우저 localStorage 지우기)

### 워커 (관리자 관점)

- SaaS 모드에서 아무 origin 허용 → 인증은 헤더로만
- 사용자가 PAT 를 요청 헤더로 보냄 → GitHub 이 자체적으로 접근권 강제
- 사용자 A 가 B 팀 레포에 접근 시도해도 GitHub API 가 401 반환 → 안전
- Anthropic 호출: 사용자 자체 key 사용 → 비용은 각 팀 부담
- **Rate limit 필요** (향후): 한 사용자가 다른 사람의 key 를 도용해 남용 방지

---

## 향후 로드맵

### Phase 2 (예정)
- GitHub OAuth 로그인 → PAT 붙여넣기 없이 자동 인증
- 사용자 세션 서버 측 관리 (encrypted)
- 팀 관리자 대시보드 (사용량 · 인원)

### Phase 3 (아이디어)
- 중앙 API key 옵션 (무료 tier · 팀 등록 X 로 즉시 시연)
- 팀 초대 · 권한 관리
- Anthropic 사용량 통계 · billing

---

## 트러블슈팅

### 봇 접속했더니 wizard 가 안 뜸

- 이미 저장된 설정이 있음. [⚙️] 버튼으로 재설정
- 강제 초기화: F12 → Console → `localStorage.removeItem('blumnai-qa-saas-config-v1')` → 새로고침

### 문서 목록 로드 실패

- Wizard 에서 입력한 정책 레포·PAT 확인
- F12 → Network 탭에서 `/list-docs` 응답 확인
  - `401` → PAT 만료 or 잘못됨 → [⚙️] 로 재입력
  - `404` → 정책 레포 이름 오타 · 폴더 경로 확인

### 답변이 실패

- Anthropic API key 확인 (Console 에서 잔여 크레딧)
- F12 → Network → `/qa` 응답 확인
