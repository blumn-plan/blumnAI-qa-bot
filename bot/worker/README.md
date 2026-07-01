# planner-qa-bot

heythere_planer 정책·스토리보드 챗 백엔드 (Cloudflare Worker).

## 무엇을 하나

협업자 (QA·개발자) 가 [qa.html](../qa.html) 에서 정책문서·스토리보드를 보며 질문 → Claude API 가 그 문서 컨텍스트로 답변 → 만족 시 `qa/decisions/` 에 합의 md 자동 생성. **GitHub Issues 와 Actions 를 거치지 않음**.

## 아키텍처

```
[협업자] → GitHub Pages: qa.html → Cloudflare Worker (이 디렉토리)
                                       ├─ GET  /list-docs   (정책·스토리보드 목록)
                                       ├─ GET  /doc?path=…  (md 원문)
                                       ├─ POST /qa          (Claude 호출)
                                       └─ POST /forward     (qa/decisions/.md 생성)
```

## 셋업·배포

**[DEPLOY.md](DEPLOY.md) 보세요** — 기획자분 대상 step-by-step.

## 개발자 노트

### 로컬 실행

```bash
cp .dev.vars.example .dev.vars  # secret 채워서 — gitignore 됨
npm run dev                      # localhost:8787
```

### 자주 쓰는 명령어

| 목적 | 명령어 |
|---|---|
| 배포 | `npm run deploy` |
| 실시간 로그 | `npm run tail` |
| Secret 등록 | `npx wrangler secret put <NAME>` |
| Secret 목록 | `npx wrangler secret list` |

### 환경변수

| 이름 | 종류 | 비고 |
|---|---|---|
| `ANTHROPIC_API_KEY` | secret | `wrangler secret put` 으로 등록 |
| `GITHUB_TOKEN` | secret | Contents read/write 권한 PAT |
| `GITHUB_REPO` | var | `wrangler.toml` 에 평문 |
| `ALLOWED_ORIGINS` | var | CORS 허용 origin, 쉼표 구분 |
| `CLAUDE_MODEL` | var | 모델 ID. 기본 `claude-sonnet-4-6` |

### 비용

- Cloudflare Workers: 일 100k 요청까지 무료. QA 사용량 (~수십/일) 으로는 절대 안 닿음.
- Anthropic API: 토큰 단위 과금. 1 질문당 보통 30-60k input tokens (정책 + qa/feedback 동봉) + 1-2k output ≈ $0.15-0.30 (sonnet 기준). 월 100질문 = $15-30 수준.

비용이 부담스러우면 `CLAUDE_MODEL` 을 `claude-haiku-4-5` 로 바꾸면 1/5 가격, 응답 품질 약간 떨어짐.
