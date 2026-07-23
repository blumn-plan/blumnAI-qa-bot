# 코어 개선 기여 가이드 (Contributing)

이 문서는 **코어 봇 (`blumn-plan/blumnAI-qa-bot`) 에 개선을 제안하고 싶은 팀 담당자용** 입니다. 각 팀이 자기 정책 레포 안에서 봇을 운영하는 방법은 [README](README.md) 와 [docs/](docs/) 참고.

---

## 현재 운영 모델 — 솔로 메인테이너 직접 push

이 레포는 **솔로 메인테이너 (기획팀 1인) 가 main 에 직접 push** 로 운영합니다.

- ✅ 메인테이너 본인은 main 에 바로 커밋 · push 로 반영 (PR · 리뷰 · CODEOWNERS 게이트 없음)
- ✅ **팀 사본 (`.blumnAI-qa-bot/`) 의 수정은 원본에 자동으로 흘러가지 않습니다** — 팀이 자유롭게 수정해도 원본은 안전
- ℹ️ GitHub branch protection 은 비활성 상태 — Claude Code 세션은 "PR 필수" 로 오판하지 말고 그대로 push

> ⚠ 향후 팀이 커지면 branch protection 활성화 + PR flow 로 전환할 수 있습니다. 그 시점엔 이 문서를 갱신합니다.

---

## 외부 담당자가 아이디어를 남기고 싶을 때

메인테이너가 아니거나, 반영 방향에 확신이 없으면 GitHub Issue 를 열어주세요:

- **어떤 문제**: 팀 사용 중 어떤 상황에서 무엇이 부족했는지
- **제안 해결**: 어떻게 고치면 좋을지 (초안·아이디어)
- **영향 범위**: 다른 팀에도 영향 있는지, 팀 별 옵트인이 필요한지

메인테이너가 확인 후 방향 논의 → 직접 반영 또는 PR 로 진행 (외부 기여자면 fork + PR).

---

## 언제 코어에 반영하나

**팀 사본만 고쳐도 되는 경우** (코어 반영 X):
- 팀 정책 md 수정 → 팀 레포에서 처리
- 팀 답변 규칙 (`.blumnAI-qa-bot/answer-rules.md`) 수정 → 팀 레포에서 처리
- `blumnAI-qa-bot.config.yml` 값 조정 → 팀 레포에서 처리
- 팀 자체 workflow · 개선 요청 → 팀 레포에서 처리

**코어 반영 대상**:
- 봇 실행 코드 개선 (`apps/`, `bot/worker/`, `bot/local-server/`)
- 새 기능 추가 (예: 새 UI 요소, 새 엔드포인트, 새 알림 방식)
- 답변 규칙 템플릿 개선 (`examples/sample-policy-repo/.blumnAI-qa-bot/answer-rules.md`)
- 가이드 문서 개선 (`docs/`, `README.md`)
- CI · 릴리즈 워크플로우 개선 (`.github/workflows/`)

---

## 자체 검증 (권장)

메인테이너 · 외부 기여자 모두 반영 전 최소한:

- `bot/worker/` 변경 시 → `cd bot/worker && npx tsc --noEmit && npm test`
- HTML 변경 시 → `apps/*.html` 로컬 확인 or F12 콘솔 에러 없음
- 문서 변경 시 → GitHub 프리뷰로 마크다운 렌더 확인
- 큰 변경 시 → 팀 사본 (예: `heythere_planer/.blumnAI-qa-bot/`) 에서 dogfooding 후 반영

---

## 릴리즈

- 실 코드 변경 → CHANGELOG `## Unreleased` 최상단에 항목 추가
- 릴리즈 시점에 `## Unreleased` → `## vX.Y.Z — YYYY-MM-DD` 이관 + `version` 파일 bump
- push 즉시 각 팀의 상단 update 배너가 자동 감지 (CHANGELOG 최상단 vX.Y.Z 를 비교)
- 필요 시 `gh release create vX.Y.Z` 로 GitHub Release 태그 생성 → `.github/workflows/release-notify.yml` 가 Teams 알림 fire

---

## 도움 요청

- 코어 아키텍처 궁금하면 → [docs/00-OVERVIEW.md](docs/00-OVERVIEW.md)
- Issue 로 아이디어만 남겨도 OK — 메인테이너가 방향 잡고 진행합니다
