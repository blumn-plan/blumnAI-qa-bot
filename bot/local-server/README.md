# planner-qa-local-server

C 모드 (Max OAuth 활용) 용 로컬 HTTP 서버.

## 사용

```bash
# 통합 실행 (server + cloudflared 터널 + wrangler 등록)
node launcher.js

# 또는 Windows
start.bat
```

서버만 단독 실행 (디버깅):

```bash
node server.js
```

## 셋업 가이드

[../DEPLOY-C.md](../DEPLOY-C.md) 참고.

## 환경변수

| 이름 | 기본값 | 비고 |
|---|---|---|
| `PORT` | 8788 | localhost 만 listen |
| `PLANNER_ROOT` | `../..` (auto-detect) | planner 레포 루트 |
| `CLAUDE_BIN` | `claude` | Claude Code CLI 경로. PATH 안 잡혀 있으면 절대경로 지정 |

## 엔드포인트

- `GET /health` — 상태 확인
- `GET /list-docs` — 정책·스토리보드 목록 (로컬 FS read)
- `GET /doc?path=...` — md 본문 (로컬 FS read)
- `POST /qa` — claude CLI spawn → 답변 반환
- `POST /forward` — qa/decisions/ 에 md 작성 + git commit + push

## 보안

- 127.0.0.1 만 listen → 외부 직접 접근 차단
- Cloudflare Tunnel 만이 외부 노출 경로
- 인증 없음 (org private repo + Pages 인증 + Worker proxy 가 1차 방어선)
