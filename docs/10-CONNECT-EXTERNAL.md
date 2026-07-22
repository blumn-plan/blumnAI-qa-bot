# 10. 외부 연동 (Jira · Teams) — 옵션

기획자가 **"적용완료"** 처리한 QA 결정을 자동으로 **Jira 티켓 생성** + **Teams 채널 알림** 으로 흘려보내는 절차. 봇이 정책·코드에 답만 하고 끝나지 않고, 실제 작업 티켓 · 팀 커뮤니케이션까지 이어붙여서 **결정 → 실행** 흐름을 매끄럽게 잇습니다.

**대상 독자**: 비개발자(기획자·QA운영자) 도 Claude Code 옆에 두고 프롬프트 하나로 셋업 가능.

**총 소요 시간**: 10-15분 (시크릿 3-4개 등록 + config 편집 + Worker 재배포).

> 🎯 **핵심 UX**: 기획자 모드에서 **[✅ 적용완료]** 를 누르면 —
> ① decision md 상태 변경 + 커밋, ② Jira 티켓 자동 생성, ③ Teams 카드 알림, ④ 리스트 항목 옆 `🎫 XYZ-123 ↗` 링크 표시.
> 실패해도 **적용완료 자체는 성공** — Jira/Teams 실패는 토스트로만 알림 (재실행 시 성공한 것은 skip · 실패한 것만 재시도).

---

## 언제 켜야 하는가

| 상황 | Jira 연동 필요? | Teams 연동 필요? |
|---|---|---|
| 결정 → 별도 이슈 트래커에서 작업 관리 | ✅ | 선택 |
| 채널에 "결정났음" 공지가 잦음 | 선택 | ✅ |
| 봇 결정 파일 (`qa/decisions/`) 만 봐도 충분 | ❌ | ❌ |

**둘 다 독립적으로 켤 수 있어요.** Jira 만 · Teams 만 · 둘 다 · 아무것도 안 — 모두 가능.

---

## ⚡ Quick Start — 마스터 프롬프트

옆에 Claude Code 창을 열고 아래를 붙여넣으세요:

```
우리 팀 blumnAI-qa-bot 에 외부 연동 (Jira · Teams) 을 붙이려 합니다
(docs/10-CONNECT-EXTERNAL.md 참조). 결정 "적용완료" 처리 시 자동으로
Jira 티켓 생성 + Teams 채널 알림 하고 싶어요.

정보:
- 원하는 것: [Jira 만 / Teams 만 / 둘 다]
- Jira base URL (host 만, 프로토콜 없이): (예: blumn.atlassian.net)
- Jira 프로젝트 key: (예: QA)
- Jira issue type: (기본 Task)
- Jira 티켓 title 템플릿: (기본 "[QA 봇] {topic}")
- Jira 기본 labels: (기본 ["qa-bot", "planner-approved"])
- Teams 채널: (예: #기획-QA)

절차 안내해주세요:
1. Atlassian API token 발급 (id.atlassian.com/manage-profile/security/api-tokens)
2. Teams 채널 → Connectors → Incoming Webhook 등록 (URL 발급)
3. wrangler secret 3-4개 등록 (JIRA_BASE_URL/EMAIL/API_TOKEN, TEAMS_WEBHOOK_URL)
4. blumnAI-qa-bot.config.yml 프로젝트 항목에 jira/teams 블록 추가
5. wrangler deploy
6. 검증 절차 (테스트 결정 하나 만들고 [적용완료] 눌러서 티켓·알림 확인)
```

---

## 상세 — Jira 연동

### 1. Atlassian API token 발급

1. https://id.atlassian.com/manage-profile/security/api-tokens 접속
2. **[Create API token]** 클릭 → 이름은 `blumnAI-qa-bot`
3. 발급된 문자열 복사 (한 번만 보이니 즉시 저장 — 채팅창 X · 터미널만 O)

### 2. wrangler secret 등록

```
cd bot/worker
npx wrangler secret put JIRA_BASE_URL     # 예: blumn.atlassian.net (프로토콜 X)
npx wrangler secret put JIRA_EMAIL        # 예: planner@blumn.ai
npx wrangler secret put JIRA_API_TOKEN    # 위에서 발급받은 값 붙여넣기 (터미널만)
```

### 3. `blumnAI-qa-bot.config.yml` 편집

```yaml
projects:
  - id: admin_v1
    label: 어드민 v1
    policies_dir: projects/admin_v1/docs/policies
    storyboards_dir: projects/admin_v1/docs/storyboards
    # 🎫 Jira 연동 — project_key 있어야 발동
    jira:
      project_key: QA                              # 필수
      issue_type: Task                             # 기본 Task
      title_template: "[QA 봇] {topic}"           # placeholders: {topic} {questioner} {docPath}
      default_labels: [qa-bot, planner-approved]  # 기본 ["qa-bot", "planner-approved"]
      assignee_email: planner@blumn.ai            # 선택 — 있으면 accountId lookup 후 assign
```

**title_template placeholders**:
- `{topic}` — decision md 의 H1 (예: "메시지 통계 §4-6 반영")
- `{questioner}` — 협업자 이름 (예: "정상민")
- `{docPath}` — 관련 정책 md 경로 (예: `projects/admin_v1/docs/policies/messages.md`)

### 4. 재배포

```
npx wrangler deploy
```

### 5. 검증

기획자 모드에서 아무 대기 결정 하나 → **[✅ 적용완료]** 클릭 →
- 성공: 토스트에 `🎫 Jira QA-123 생성` · 리스트 항목 옆 `🎫 QA-123 ↗` 링크 표시
- 실패: 토스트에 `⚠️ Jira 실패: <원인>` — 원인 확인 후 재클릭 시 재시도

---

## 상세 — Teams 연동

### 1. Teams Incoming Webhook 발급

1. Teams → 알림 원하는 채널 우클릭 → **Connectors 관리**
2. **Incoming Webhook** 검색 → **[구성]** 클릭
3. 이름 `blumnAI QA Bot` · 아이콘 업로드 (선택) → **[만들기]**
4. 발급된 URL 복사 (한 번만 보임)

### 2. wrangler secret 등록

```
cd bot/worker
npx wrangler secret put TEAMS_WEBHOOK_URL    # 위에서 발급받은 URL 붙여넣기
```

### 3. `blumnAI-qa-bot.config.yml` 편집

```yaml
projects:
  - id: admin_v1
    # ... (jira 블록과 같은 위치)
    teams:
      enabled: true    # false 또는 미설정 시 훅 발동 X
```

### 4. 재배포 + 검증 — Jira 와 동일

### 카드 내용

Teams 채널에 전송되는 카드:

```
✅ QA 봇 적용완료 — <topic>

<합의 요약 (첫 500자)>

▪ 질문자: <이름>
▪ 기획자: <이름>
▪ 관련 문서: <경로>
▪ Jira: [QA-123](https://...)   ← Jira 연동 시에만

[📄 결정 파일 열기] [🎫 Jira 이슈 열기]
```

---

## 🔒 중복 방지 · 재시도

**작동 원리**: 성공한 연동은 결정 md 하단에 HTML 코멘트로 마커를 남깁니다:

```markdown
<!-- jira-issue: QA-123 -->
<!-- teams-notified: 2026-07-22T04:15:00Z -->
```

- **재적용 (실수로 pending → applied 다시 하기 등)**: 마커 있으면 skip → 중복 티켓·중복 알림 X
- **실패한 것만 재시도**: Jira 성공 · Teams 실패 시 → Teams 마커만 없으므로 다음 적용 시 Teams 만 재시도

**마커 강제 리셋** (테스트 목적으로 재발송 원할 시): decision md 하단 코멘트 두 줄 삭제 후 커밋 → 다음 [적용완료] 클릭 시 다시 발송.

---

## 트러블슈팅

| 증상 | 원인 | 조치 |
|---|---|---|
| 토스트 `⚠️ Jira 실패: 401` | JIRA_EMAIL / JIRA_API_TOKEN 잘못됨 | API token 재발급 · wrangler secret 재등록 |
| 토스트 `⚠️ Jira 실패: 404` | JIRA_BASE_URL 오타 or project_key 없음 | host 만 (프로토콜 X) · project_key 대문자 확인 |
| 토스트 `⚠️ Jira 실패: 400 issuetype ...` | `issue_type` 이 해당 프로젝트에 없음 | Jira 프로젝트 설정에서 실제 issue type 이름 확인 (Bug / Story / Task 등) |
| 토스트 `⚠️ Teams 실패: 400` | Webhook URL 오타 · 채널 삭제 | Connectors 재발급 · secret 재등록 |
| 리스트에 🎫 배지 안 뜸 | JIRA_BASE_URL 미설정 → key 만 저장, URL 조합 실패 | JIRA_BASE_URL secret 재확인 |
| assignee 안 붙음 | `assignee_email` 이 Atlassian 계정 이메일과 다름 | Jira 프로필의 이메일 확인 후 config 수정 |
| 적용완료 는 되는데 토스트에 externalSync 관련 문구 X | config 에 jira/teams 블록 없거나 project 매칭 실패 | 결정 md 의 `관련 문서` 경로가 config projects[].policies_dir 아래인지 확인 |

**로그 확인**:
```
cd bot/worker
npx wrangler tail
```
→ `[external-sync] jira failed: ...` 등 상세 원인 확인 가능.

---

## 요율·부하

- **Jira**: 이슈 생성 1건 = REST API 1-2호출 (assignee lookup 포함 시 2), 무료 tier 도 넉넉
- **Teams**: Webhook 1건 = HTTP POST 1회, 완전 무료
- **추가 LLM 호출**: 0 (봇이 이미 만든 decision md 를 그대로 활용)
- **Cloudflare Worker 시간**: 이슈당 200-800ms 추가 (Jira 응답 대기 시간)

---

## 관련 문서

- [04-OPERATE.md](04-OPERATE.md) — 운영 (기획자 모드 사용법)
- [09-SAAS-MODE.md](09-SAAS-MODE.md) — SaaS 모드 (Jira/Teams 시크릿은 SaaS 모드에서도 env 사용 · 헤더 전달 아직 미지원)
