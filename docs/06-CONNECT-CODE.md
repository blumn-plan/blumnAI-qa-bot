# 06. 코드 레포 연결 (Connect Code) — 옵션

봇이 답변할 때 **정책 md 뿐 아니라 실제 서비스 코드 스니펫도 함께 참고** 하도록 코드 레포를 연결하는 절차. 이 기능을 켜면 봇이 *"정책은 X 라고 되어 있는데 실제 코드 `src/foo.ts:42` 는 Y 다"* 같은 **정책 vs 코드 drift** 를 답변 안에서 직접 판정합니다.

**대상 독자**: 비개발자(기획자·QA운영자) 도 Claude Code 옆에 두고 프롬프트 하나로 셋업 가능.

**총 소요 시간**: 3-5분 (config 편집 + Worker 재배포). 시크릿 재발급 불필요.

---

## 언제 필요한가

| 상황 | 코드 연결 필요? |
|---|---|
| 정책 md 만으로 QA 커버 가능 | ❌ 굳이 없어도 됨 |
| "정책상 배너 색이 주황인데 실제 화면은 파란색이래" 같은 drift 자주 발생 | ✅ 켜면 봇이 즉답 |
| 신입 QA 가 정책 → 코드 매핑을 매번 물어봄 | ✅ 봇이 파일 경로·라인까지 제시 |
| 정책·코드 레포가 서로 다른 조직이거나 접근권 없음 | ❌ 켤 수 없음 (PAT 접근권 필요) |

**설치 시 켜지 않아도 나중에 언제든 켤 수 있어요.** 🟢 세팅하기 마스터 프롬프트에서 "코드 검증 붙일 것: 아니오" 로 시작했다면, 이 문서 하나로 나중에 추가 가능.

---

## ⚡ Quick Start — 마스터 프롬프트 하나로

옆에 Claude Code 창을 열고 아래를 붙여넣으세요:

```
우리 팀 blumnAI-qa-bot 에 코드 검증 기능을 붙이려 합니다 (docs/06-CONNECT-CODE.md
참조). 봇이 답변할 때 GitHub 코드 스니펫도 함께 인용해서 정책 vs 코드 drift
판정까지 할 수 있게요.

정보:
- 정책 레포 (봇이 얹혀 있는 홈): ○○/○○-planer
- 서비스 코드 레포: ○○/○○-admin-frontend
- 봇이 특히 관심 가질 코드 경로 glob (비우면 전체):
  · src/pages/**/*.tsx
  · src/components/**/*.tsx
  · src/api/**/*.ts
- (선택) 항상 함께 붙일 검색 힌트: "campaign OR marketing"

절차:
1. 정책 레포 루트의 blumnAI-qa-bot.config.yml 편집:
   - projects[0].code_repo 채우기
   - projects[0].code_paths 채우기
   - projects[0].code_search_hint 채우기 (있으면)
2. GitHub PAT 이 코드 레포에도 접근권 있는지 확인 —
   "저에게 wrangler secret list 결과 알려주세요. 그리고 GitHub 설정에서
   현재 PAT scope 가 코드 레포까지 커버하는지 확인법 알려주세요"
3. answer-rules.md 의 §A-2 (정책 vs 코드 drift) 규칙 확인 — 이미 있는지
4. 변경사항 commit + push
5. .blumnAI-qa-bot/worker/ 에서 wrangler deploy 재실행
6. 첫 검증 질문 던져보기 — 예:
   "○○ 화면의 '저장' 버튼 클릭 시 정책이 뭐고 코드 구현은 어디에 있어?"
7. **답변 상단 배지 확인** — 셋업 성공 판정:
   - 🔍 초록 배지 `<레포명> 코드 N건 참고` = 성공
   - ⚠️ 주황 배지면 마우스 올려서 툴팁 원인 확인 후 조치
     · PAT scope 문제면 GitHub 가서 scope 갱신
     · 매칭 0건이면 질문에 화면명·심볼명 포함해서 재질문
     · docs/06-CONNECT-CODE.md 트러블슈팅 표 참고

규칙:
- 🤖 스텝은 알아서 처리하고 결과 요약해서 보고
- 👤 스텝은 "직접 하실 것" 이라고 명시하고 화면·URL·클릭 위치 안내
- 시크릿 재발급이 필요해도 sk-ant / ghp_ 값을 저에게 절대 입력받지 말고
  wrangler 프롬프트로만 유도
```

---

## 상세 — 무엇이 어떻게 변하나

### 컨피그 (`blumnAI-qa-bot.config.yml`)

`projects[]` 각 항목에 아래 필드를 채웁니다:

```yaml
projects:
  - id: ○○_v1
    label: "○○ 어드민"
    policies_dir: "projects/○○_v1/docs/policies"
    storyboards_dir: "projects/○○_v1/docs/storyboards"

    # ↓ 여기가 코드 연결 부분
    code_repo: "○○/○○-admin-frontend"      # "org/repo" 형식. 봇이 검색할 GitHub 코드 레포.
    code_paths:                             # (선택) 관심 경로 glob. 비우면 레포 전체.
      - "src/pages/**/*.tsx"                #  ["src/**/*.tsx", "src/**/*.ts"] 처럼 여러 개 OK.
      - "src/api/**/*.ts"
    code_search_hint: ""                    # (선택) 매 검색에 함께 붙일 키워드. 예: "campaign OR marketing".
    code_max_snippets: 3                    # (선택) 시스템 프롬프트에 삽입할 파일 개수 상한. 기본 3.
    code_snippet_lines: 120                 # (선택) 각 스니펫 최대 라인 수. 기본 120.
```

### PAT 접근권 확인

봇이 등록해둔 `GITHUB_TOKEN` (`ghp_...`) 이 **코드 레포에도** read 권한이 있어야 합니다.

- `repo` scope 짜리 classic PAT 이면 → 본인 접근권 있는 모든 repo 자동 커버 (별도 조치 X)
- fine-grained PAT 을 쓰고 있다면 → 코드 레포도 selected repositories 에 추가 필요

확인:
```bash
cd .blumnAI-qa-bot/worker
npx wrangler secret list
# GITHUB_TOKEN 이 목록에 있어야 함
```

PAT 자체를 갱신할 필요는 없고, GitHub 쪽 scope 만 맞으면 OK.

### 답변 규칙 (`answer-rules.md`)

`.blumnAI-qa-bot/answer-rules.md` 에 다음 규칙이 있는지 확인:

```markdown
### A-2. drift 경고 — 정책 vs 실제 (화면·코드)

- **정책 ≠ 코드**: `정책상 X 이지만 코드(파일:라인) 는 Y. 정책 또는 코드 수정 필요.` 형식
- 실제 파일 경로·라인 번호를 명시 (예: `src/pages/campaign/List.tsx:42`)
- 어느 쪽이 맞다고 단정하지 말 것

### A-3. 코드 인용 규칙

- 코드 블록은 관련 최소한만 (5-10줄)
- 파일 경로·라인 번호는 항상 함께
- 코드가 없는데 있는 것처럼 인용 금지
```

샘플에는 이미 들어 있어요 — [examples/sample-policy-repo/.blumnAI-qa-bot/answer-rules.md](../examples/sample-policy-repo/.blumnAI-qa-bot/answer-rules.md).

### Worker 재배포

```bash
cd .blumnAI-qa-bot/worker
npx wrangler deploy
```

배포 후 바로 코드 검증이 켜집니다. 프론트 (qa-collab.html) 는 자동으로 `config.yml` 의 `code_repo` 를 읽어서 `/qa` 요청에 함께 실어 보냅니다.

### ✅ 셋업 검증 — 답변 상단 배지로 즉시 확인

봇에 아무 질문 하나 던지면 답변 상단에 배지가 뜹니다:

- 🔍 **초록** `<레포명> 코드 N건 참고` — 정상 작동, 참고된 파일 목록도 함께 표시
- ⚠️ **주황** `코드 참고 <실패사유>` — 마우스 올리면 툴팁으로 원인 힌트 (PAT scope 부족 · 매칭 0건 · 등)
- 📄 **회색** `정책 문서만 참고` — 이 프로젝트는 코드 연결 미설정 (config 안 채웠거나 이 문서 절차 스킵됨)

배지가 진단 첫 단추입니다. 아래 [트러블슈팅](#트러블슈팅) 표는 배지 색·문구별로 정리되어 있어요.

---

## 봇 답변이 어떻게 달라지나

### Before (코드 연결 X)

> **Q**. "캠페인 리스트에서 '삭제' 버튼 누르면 뭐가 되나요?"
>
> **A**. 정책상 소프트 삭제(is_deleted=1) 처리. 사용자에게 확인 다이얼로그 노출. (§3-2 참고)

### After (코드 연결 O)

> **Q**. "캠페인 리스트에서 '삭제' 버튼 누르면 뭐가 되나요?"
>
> **A**. 정책상 소프트 삭제 (§3-2 참고).
>
> ⚠️ **drift**: 실제 코드 `src/pages/campaign/List.tsx:87` 는 확인 다이얼로그 없이 즉시 삭제 API 호출. 정책 또는 코드 보완 필요.

이 drift 답변을 협업자가 [📤 기획자에게 전달] 로 넘기면 → 기획자가 정책·코드 중 어느 쪽을 맞출지 결정.

---

## 비용·성능 영향

| 항목 | 코드 연결 X | 코드 연결 O |
|---|---|---|
| 응답 시간 | 3-5초 | 5-8초 (+GitHub Search 1-2초) |
| Anthropic 토큰 (질문당) | ~3K | ~6-8K (+ 스니펫 인젝션) |
| 월 100질문 비용 | ~$15 | ~$30-40 |
| GitHub API rate limit | 넉넉 (질문당 1-2회) | 사용량 상승 (질문당 3-5회, Search API 는 30 req/min 제한) |

토큰 부담이 걱정되면 `code_max_snippets` 를 1-2, `code_snippet_lines` 를 60-80 으로 낮춰서 시작. 팀 사용량 안정되면 늘리세요.

---

## 트러블슈팅

**먼저 답변 상단 배지 확인 — 배지 색·문구가 원인을 특정해줍니다.**

| 배지 | 원인 | 조치 |
|---|---|---|
| 📄 회색 (`정책 문서만 참고`) | 이 프로젝트의 `code_repo` 미설정 | `config.yml` 의 해당 프로젝트에 `code_repo: "org/repo"` 추가 → Worker 재배포 불필요 (프론트가 실시간 읽음) |
| ⚠️ 주황 `검색 실패` (HTTP 403/404) | `GITHUB_TOKEN` PAT 이 코드 레포 접근권 없음 | Classic PAT (repo scope) 이면 접근권 있는 모든 repo 자동 커버. Fine-grained 이면 코드 레포도 selected repositories 에 추가. PAT 재발급 없이 GitHub 설정에서 scope 만 갱신 |
| ⚠️ 주황 `매칭 0건` | 검색어가 코드 심볼과 매치 안 됨 (한글 질문 → 영문 코드) | 질문에 화면명·컴포넌트명·API 명 (영문) 포함. 반복 문의 화면이면 `code_search_hint` 에 힌트 키워드 (예: `"campaign OR marketing"`) 넣기 |
| ⚠️ 주황 `검색어 부족` | 질문이 너무 짧거나 불용어만 있음 | 더 구체적인 질문 |
| ⚠️ 주황 `fetch 실패` | Search 는 됐는데 파일 본문 fetch 실패 (PAT 검색권만 있고 contents 권한 부족) | PAT scope 재확인 (repo:contents:read 필요) |
| 🔍 초록 이지만 답변에 파일 경로 없음 | 코드는 인용됐지만 Claude 가 답에 안 씀 | `answer-rules.md` §A-3 (코드 인용 규칙) 강화. 재배포 필요 X |

**기타 증상**:

| 증상 | 원인·해결 |
|---|---|
| GitHub Search rate limit 에러 | 30 req/min 초과. 다음 분에 자동 복구. 팀 규모 크면 fine-grained PAT 으로 rate 상향 |
| 봇이 존재하지 않는 파일 경로를 답에 씀 | 시스템 프롬프트 규칙 안 지킴. `answer-rules.md` §A-3 (코드 인용 규칙) 강화. 재배포 필요 X |
| 배지 자체가 안 뜸 (2026-07 이전 세팅) | 코어 봇이 배지 도입 이전 버전. 상단 노란 배너의 [🟠 업데이트하기] 실행 → Worker 재배포 |

---

## 관련 문서

- [02-WIRE-POLICIES.md](02-WIRE-POLICIES.md) — 정책 md 작성 규약 (코드 인용을 잘 받으려면 정책에 §번호·시각 명세 필수)
- [07-FIRST-TEST.md](07-FIRST-TEST.md) — 코드 연결 후 drift 판정 테스트 시나리오
- [examples/sample-policy-repo/blumnAI-qa-bot.config.yml](../examples/sample-policy-repo/blumnAI-qa-bot.config.yml) — 필드 예시
