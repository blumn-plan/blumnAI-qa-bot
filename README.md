# blumnAI-qa-bot

정책문서 기반 QA 챗봇 — 사내에서 팀별로 깔아 쓰는 모듈.

> ⚠️ **이 레포는 private 입니다.** 사내 자산이므로 외부 공유 금지.

## 이게 뭐예요

QA/운영자가 정책문서·화면설계서에 대해 질문하면 AI 가 즉시 답변하고, 정책 변경이 필요하면 기획자에게 합의 요청으로 전달되는 시스템입니다. 본인 PC 의 Claude Max 구독을 활용해서 **추가 API 비용 0원**으로 운영 가능 (C 모드).

원본은 헤이데어 기획팀의 `heythere_planer/qa` 에서 fork — 같은 회사 다른 팀도 쉽게 깔아 쓰도록 분리·모듈화한 버전.

## 어디부터 보세요

| 상황 | 문서 |
|---|---|
| 처음 깔려는 분 | [docs/01-INSTALL.md](docs/01-INSTALL.md) |
| 전체 그림 먼저 보고 싶음 | [docs/00-OVERVIEW.md](docs/00-OVERVIEW.md) |
| 정책 markdown 어떻게 써야 봇이 잘 답하나 | [docs/02-WIRE-POLICIES.md](docs/02-WIRE-POLICIES.md) |
| Claude Max / GitHub 연결하기 | [docs/03-CONNECT-BOT.md](docs/03-CONNECT-BOT.md) |
| 매일 운영 (협업자·기획자 사용법) | [docs/04-OPERATE.md](docs/04-OPERATE.md) |
| 코어 버전 올리기 | [docs/05-UPGRADE.md](docs/05-UPGRADE.md) |

## 폴더 구조

```
apps/                — 사용자에게 노출되는 HTML (qa-collab, qa-planner)
bot/worker/          — Cloudflare Worker (Claude 호출 + GitHub 읽기/쓰기)
bot/local-server/    — PC 로컬 서버 (C 모드: Max 구독 우회용)
create/              — npx 스캐폴더 (사용자 레포 init / upgrade)
docs/                — 가이드 문서 6개
examples/            — 샘플 사용자 레포 (테스트·따라하기용)
```

## 라이선스

Lunasoft 내부 자산. 사내 사용에 한함.
