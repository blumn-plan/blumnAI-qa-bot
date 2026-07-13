# blumnAI-qa-bot

**정책·화면설계서를 물어보면 AI 가 답해주고, 필요하면 기획자에게 자동 전달하는 사내 QA 챗봇.**

> ⚠️ 사내 자산 · private 레포 · 외부 공유 금지

---

## 목차

- [⚡ 30초 요약](#-30초-요약)
- [🏛 이 레포는 뭐고 어떻게 쓰나](#-이-레포는-뭐고-어떻게-쓰나)
- [🟢 세팅하기 — 처음 깔 때](#-세팅하기--처음-깔-때-필수)
- [필요할 때 쓰는 3가지 프롬프트](#필요할-때-쓰는-3가지-프롬프트)
- [🔎 더 알아보기](#-더-알아보기) (장점·시나리오·한계·문서 목록)

---

## ⚡ 30초 요약

1. QA·개발자가 정책·화면 질문 → 봇이 **관련 §번호·화면 캡처 인용해서** 즉답
2. 답이 이상하면 [📝 답변 규칙] 로 톤 조정, **정책 변경 필요면** [📤 기획전달]
3. 전달된 요청은 기획자 창에서 검토 → **[프롬프트 복사]** 로 클로드코드에 붙여넣으면 정책 md·화면설계서 자동 수정
4. **개발자 리소스 0** — 기획자·QA 만 있으면 셋업부터 운영까지 클로드코드가 다 함

**기본 모드는 A 모드 (Anthropic API 사용, 유료)** — 설치 단순 · PC 상시 가동 X.  
C 모드 (Max 구독 우회, PC 상시 필요) 는 특수용 · [부록](docs/03-CONNECT-BOT.md#부록--c-모드-pc-max-우회-특수-상황용) 참고.

---

## 🏛 이 레포는 뭐고 어떻게 쓰나

**이 레포 (`blumn-plan/blumnAI-qa-bot`)** = 기획팀이 지속 업데이트하는 **재사용 코어 봇**. 각 팀 정책 md 는 없음 (팀 몫).

각 팀은 코어를 **자기 정책 레포 안 `.blumnAI-qa-bot/` 폴더에 통째로 복사**해서 씀. **직접 복사할 필요 X** — 아래 🟢 세팅하기 프롬프트가 자동 처리.

```
[코어 (이 레포)]                    [팀 정책 레포]
blumn-plan/blumnAI-qa-bot   →→→→   blumn/○○-planer
     (봇 파일 통째)                   ├ blumnAI-qa-bot.config.yml   ← 팀 설정
                                     ├ .blumnAI-qa-bot/             ← 코어 사본
                                     ├ (팀 정책 md — 원래 있던 것)
                                     └ qa/                          ← 봇이 자동 생성
```

**기억할 4가지**:

1. ❌ **fork 금지** — 파일 복사 방식이 정답. 복사는 세팅하기 프롬프트가 자동
2. 🔔 **새 버전 나오면 팀 봇 상단에 배너 자동** → 🟠 업데이트하기 프롬프트로 30초 갱신 (팀 정책 파일 절대 안 건드림)
3. 🔄 **팀 정책 변경은 봇 안에서** — 사용자가 [📤 기획전달] 하면 AI 가 정책 md 자동 patch
4. 🎁 **코어 개선 아이디어 있으면 봇 툴바 [🎁] 클릭** → GitHub Issue 자동 생성. 팀 사본 수정은 원본에 안 흘러감 (반드시 PR + 리뷰 · [CONTRIBUTING.md](CONTRIBUTING.md))

자세한 코어-사본 원칙은 [docs/05-UPGRADE.md](docs/05-UPGRADE.md).

---

## 🟢 세팅하기 — 처음 깔 때 (필수)

**클로드코드 옆에 두고 프롬프트 하나만 붙여넣으면 됩니다** (설치 15-30분).

### 1. 미리 준비할 3가지

| # | 항목 | 어떻게 | 소요 |
|---|---|---|---|
| 1 | **Anthropic API key** — 봇 답변 엔진 | IT기획팀 지라 요청 ([C04-3284](https://blumnai.atlassian.net/browse/C04-3284) 양식 참고). ⚠️ Claude Code Max 구독과 별개 | 반나절-1일 대기 |
| 2 | **Cloudflare 계정** — Worker 무료 호스팅 | https://dash.cloudflare.com/sign-up 이메일+비번 가입 → 인증 → 카드 등록은 **Skip** | 3분 (👤 본인) |
| 3 | **Node.js 18+** | 미리 확인 안 해도 OK — AI 가 첫 스텝에 확인 | 없으면 +5분 |

**전체 준비 소요**: 대부분 IT기획팀 응답 대기 시간.

### 2. 팀 정보 정리

프롬프트에 채울 값들. **정확히 몰라도 `[모름]`** 이라고 적으면 AI 가 GitHub 자동 검색해서 확인 요청:

- 팀 이름 (필수)
- GitHub 조직명 (예: `blumn`)
- 정책·화면설계서 레포 (예: `blumn/○○-planer`)
- 프로젝트별 정보 (프로젝트 = 하나의 서비스. 여러 개 가능 예: `admin_v1`, `backoffice_v2`)
  - 프로젝트 ID (영문 소문자)
  - 정책 md 폴더 경로
  - 화면설계서 md 폴더 경로
  - 서비스 코드 레포 (선택)

> 🔒 **시크릿 값 (`ghp_...`, `sk-ant-...`) 은 지금 손에 안 들고 있어도 됨.** 셋업 중 AI 가 발급 화면 안내 → 터미널 프롬프트에만 직접 붙여넣기. **AI 채팅창엔 절대 X.**

### 3. 세팅하기 마스터 프롬프트

<details>
<summary>👇 여기 클릭해서 프롬프트 열기 → Claude Code 에 통째로 붙여넣기</summary>

```
blumnAI-qa-bot 을 우리 팀에 A 모드 (Anthropic API 사용) 로 설치하려 합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[팀 전체 정보]  (팀 이름만 필수. 나머지는 아는 만큼만, 모르면 [모름] 표시)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 팀 이름: [예: 광고팀]
- GitHub 조직명: [예: blumn / 모름]
- 정책·화면설계서가 있는 GitHub 레포: [org/repo / 모름]
- 봇을 얹을 홈 레포: (기본 = 정책 레포와 동일)
- 기획자 모드 비번: [본인이 정할 값, 또는 "랜덤 생성"]
- Anthropic API key: [새로 발급 예정 / 기존 것 재사용 (지정)]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[프로젝트별 정보]
프로젝트 = 하나의 서비스/시스템 단위. 팀에 여러 개 있을 수 있음 (예: admin, backoffice).
프로젝트 개수만큼 아래 블록을 복사해서 채우기. 개수 모르면 전체를 [모름] 으로.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[프로젝트 1]
- 프로젝트 ID (봇 내부 식별자, 영문 소문자): [예: admin_v1 / 모름]
- 정책 md 폴더 경로: [예: projects/admin_v1/docs/policies / 모름]
- 화면설계서 md 폴더 경로: [예: projects/admin_v1/docs/storyboards / 모름]
- 서비스 코드 레포: [org/repo / 모름 / 이 프로젝트 코드 검증 안 함]

[프로젝트 2] ← 필요하면 이 블록을 통째로 복사해서 아래 추가
- 프로젝트 ID:
- 정책 md 폴더:
- 화면설계서 폴더:
- 서비스 코드 레포:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[진행 규칙 — [모름] 항목은 AI 가 GitHub 스캔으로 자동 발견]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. gh auth status 로 GitHub CLI 로그인 확인. 안 되어 있으면
   → 저에게 "터미널에 gh auth login 실행하세요" 안내하고 대기
2. GitHub 조직 [모름] → gh api user/orgs 로 조직 목록 뽑아 확인 요청
3. 정책 레포 [모름] → gh repo list <조직> 에서 이름에 planer/planning/
   docs/policy/plan 들어간 후보 3-5개 뽑아 확인 요청
4. **프로젝트 목록 자동 발견** (다중 프로젝트 지원):
   - 정책 레포 안 `projects/` 폴더가 있으면 그 하위 폴더들이 각 프로젝트 후보
     (예: projects/admin_v1/, projects/backoffice_v2/ → 프로젝트 2개)
   - `projects/` 없으면 docs/ 아래에서 .md 가 많은 폴더 찾기
   - 발견한 프로젝트 목록을 표로 보여주고 "어느 것들 봇에 등록?" 확인
5. 각 프로젝트의 정책·화면 폴더 경로 자동 발견 —
   프로젝트 폴더 안에서 .md 파일 있는 서브폴더 찾음
   (예: projects/admin_v1/docs/policies, projects/admin_v1/docs/storyboards)
6. 코드 레포 [모름] → gh repo list 에서 프로젝트 ID 와 이름 유사한 후보 매칭
   (예: 프로젝트 ID admin_v1 → 이름에 *admin* 들어간 레포)
7. 프로젝트 ID 새로 정할 때는 팀 이름/기능 기반 (영문 소문자) — 저는 확인만
8. 봇 홈 레포는 정책 레포와 동일이 기본 — 별도 원하면 저에게 확인 요청
9. 코드 검색 범위(glob) 는 비워두고 시작. 나중에 답변이 산만하면 그때 좁힘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[가이드]  (AI 가 순서대로 fetch 해서 참고)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- https://github.com/blumn-plan/blumnAI-qa-bot/blob/main/docs/01-INSTALL.md
- https://github.com/blumn-plan/blumnAI-qa-bot/blob/main/docs/06-CONNECT-CODE.md
- https://github.com/blumn-plan/blumnAI-qa-bot/blob/main/docs/07-FIRST-TEST.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[셋업 스텝]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A. 위 자동 발견 절차로 **프로젝트 목록·경로·코드 레포 확정** → 표로 보여주고 최종 확인
B. 홈 레포에 .blumnAI-qa-bot/ + blumnAI-qa-bot.config.yml 얹기
   - config.yml 의 projects[] 배열에 위에서 확정한 **각 프로젝트를 별도 항목으로 등록**
   - 각 항목마다 policies_dir · storyboards_dir · code_repo · code_paths 채우기
     (파일 이동 없이 발견한 실제 경로 그대로 사용)
   - **.blumnAI-qa-bot/version 파일 반드시 생성** — 코어 CHANGELOG.md 최상단 버전
     (예: "v0.1.0") 을 한 줄로 저장. 없으면 자동 업데이트 배너가 조용히 skip 됨.
     샘플: examples/sample-policy-repo/.blumnAI-qa-bot/version
C. **기획자 모드 비번 정하기** — config 의 ui.planner_password 채우기
D. Anthropic API key + GitHub PAT 시크릿 등록
   → 👤 저에게 wrangler 프롬프트에 붙여넣으라고만 안내
E. Cloudflare Worker 배포 + GitHub Pages 활성화 안내
F. 정책 md 사전 스캔 → 프로젝트별 위반 리포트
G. 07-FIRST-TEST 시나리오 실행

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[일반 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 🤖 스텝은 알아서 처리하고 결과 요약해서 보고
- 👤 스텝은 "직접 하실 것" 이라고 명확히 알리고 화면·URL·클릭 위치 안내
- 시크릿 값 (sk-ant-..., ghp_...) 은 절대 저에게 입력받지 말고
  wrangler 프롬프트에만 붙여넣도록 안내
- C 모드 (PC Max 우회) 는 스킵. 물어보지도 마세요
- 매 스텝 종료 후 "다음 스텝으로 진행할까요?" 확인 받고 이어감
```

**두 가지 최소 시나리오**:
- **팀 이름만 알고 시작**: 나머지 다 `[모름]` → AI 가 자동 발견
- **1개 프로젝트만 있는 팀**: `[프로젝트 2]` 블록 삭제

</details>

### 4. 세팅 끝나면 → 팀에 URL 공유

프롬프트가 자동으로 **첫 테스트 5개 시나리오** 까지 진행. 다 통과하면 설치 완료 → 팀 채널에 URL 공유하고 매일 사용 시작. 이후 흐름은 [docs/04-OPERATE.md](docs/04-OPERATE.md).

---

## 필요할 때 쓰는 3가지 프롬프트

| 프롬프트 | 언제 | 얼마나 자주 |
|---|---|---|
| 🔵 점검하기 | 봇 답변이 자꾸 부실할 때 | 필요 시 |
| 🟣 알려주기 | 신규 팀원 온보딩 | 필요 시 |
| 🟠 업데이트하기 | 새 버전 알림 왔을 때 | 6개월-1년 |

<details>
<summary>🔵 점검하기 프롬프트 — 봇 답이 이상해서 정책 정비</summary>

**신호** — 다음 중 하나라도 보이면:
- 봇이 자꾸 "정책 미정의" 라고 답함
- 답변이 두루뭉술
- [📤 기획전달] 버튼을 자주 누르게 됨
- 새 기능 추가됐는데 봇이 그 정책을 아예 몰라봄

```
우리 팀 blumnAI-qa-bot 운영 중인데, 봇 답변이 자꾸 부실합니다.
정책 md 본문 자체에 원인이 있는지 진단하고 정비하고 싶어요.

정보:
- 정책 md 위치: ○○/○○-planer 의 projects/○○_v1/docs/policies
- 최근 문제 있었던 질문/답변 (있으면 더 정확한 진단):
  · Q: "..." → 봇 A: "..." — 여기가 이상함

가이드: https://github.com/blumn-plan/blumnAI-qa-bot/blob/main/docs/02-WIRE-POLICIES.md

절차:
1. 정책 폴더 스캔 후 §본문 구조 규약 위반 파일 리스트업
2. "최근 문제 질문" 있으면, 어떤 정책의 어떤 절이 부실해서 그런 답 나왔는지 매핑
3. 파일별 patch 초안 제시 (수정은 제 승인 후 실행)
4. 정비 완료 후 같은 질문 다시 던져서 답 개선 확인

먼저 스캔 리포트부터 보여주세요.
```

</details>

<details>
<summary>🟣 알려주기 프롬프트 — 신규 팀원 온보딩</summary>

```
우리 팀 blumnAI-qa-bot 설치는 끝났고, 봇 사용법을 배우고 싶습니다.

정보:
- 봇 URL: https://○○.github.io/○○-policies
- 내 역할: 협업자(QA·개발자·운영)  또는  기획자
- (기획자면) 기획자 모드 비밀번호 이미 받아둠: 예/아니오

가이드:
- https://github.com/blumn-plan/blumnAI-qa-bot/blob/main/docs/04-OPERATE.md
- https://github.com/blumn-plan/blumnAI-qa-bot/blob/main/docs/07-FIRST-TEST.md

절차:
1. 표준 협업 사이클 다이어그램 (04-OPERATE §🔁) 붙여넣어서 흐름 설명 → 이해 확인
2. 내 역할에 맞는 URL 알려주기 (협업자 = qa-collab, 기획자 = qa-planner + 비번 안내)
3. 협업자 시점 시뮬레이션 — 봇 창에서 직접 해보라고 지시:
   ① 정책 md 하나 선택
   ② 예시 질문 던지기
   ③ 3가지 버튼 [↻ 새 대화] / [📝 답변 규칙] / [📤 기획전달] 언제 쓰는지 각각 설명
   ④ [📝 답변 규칙] 실제 눌러서 톤 개선 요청 → 재답변 반영 확인
   ⑤ [📤 기획전달] 실제 눌러서 합의문 하나 생성 → 사이드바 대기 상태 확인
4. (기획자면) qa-planner 접속 후:
   ① 대기 항목 선택 → 본문 검토
   ② [📋 프롬프트 복사] → Antigravity 에 붙여넣기 → 정책 자동 patch 지켜보기
   ③ [✅ 적용] 로 종결
   ④ (대비) [🚫 보류] 도 눌러보고 사유 남기기 → 협업자 창에서 초록 배너 확인
5. 마지막 요약 (3줄): 질문→답변→(만족/개선/전달) → 기획자 검토→(반영/보류) → 협업자 알림
```

</details>

<details>
<summary>🟠 업데이트하기 프롬프트 — 새 버전 알림 왔을 때</summary>

**언제** — 봇 화면 상단에 노란 배너가 뜨거나, 코어 메인테이너가 Slack 공지 or SECURITY 표시 릴리즈

```
blumnAI-qa-bot 코어에 새 버전 (v○.○.○) 이 나왔습니다.
우리 팀 레포의 .blumnAI-qa-bot/ 아래를 최신으로 갱신하고 싶어요.

가이드: https://github.com/blumn-plan/blumnAI-qa-bot/blob/main/docs/05-UPGRADE.md

절차:
1. 코어 CHANGELOG.md fetch → "⚠️ BREAKING" 표기 확인
2. Breaking change 있으면 저에게 먼저 알림 (승인 후 진행)
3. 05-UPGRADE 의 §핵심 원칙 표 대로:
   - .blumnAI-qa-bot/apps/, worker/, local-server/, version → 덮어쓰기
   - answer-rules.md, blumnAI-qa-bot.config.yml, projects/, qa/ → 절대 보존
4. Worker 재배포 (wrangler deploy) — 🤖 알아서
5. commit + push 는 저한테 diff 보여준 뒤 승인 요청
```

</details>

---

## 🔎 더 알아보기

<details>
<summary>🚀 왜 이 봇이 필요한가 — 핵심 장점 4가지</summary>

### 1. 커뮤니케이션 비용의 극적 절감
- **논리적 설득 자동화** — QA·개발자와 기획자 간의 불필요한 말싸움이 사라짐. AI 가 변경 전/후·근거·대상 파일 위치까지 정제된 논리로 기획자 설득
- **지라 티켓 작성 생략** — 시스템이 명확한 변경 요청을 `qa/decisions/` 에 md 로 자동 저장

### 2. 기획자 리소스 파괴적 절감
- **복사–붙여넣기–배포** — 기획자가 문서 직접 안 열고, AI 가 만든 프롬프트를 Claude Code 에 붙여넣기만 하면 정책·답변 룰·화면설계서 동시 자동 업데이트
- **빠른 이슈 파악** — 상단 요약본 3초 확인 → 배포

### 3. AI-to-AI 소통으로 왜곡 X
사람 개입 시 발생하는 컨텍스트 오해·휴먼 에러 없음. 답변 AI → 기획단 AI 직접 전달.

### 4. 개발 레이어까지 확장
업데이트 내용이 개발자에게도 프롬프트 형태로 자동 전달 → 코드·환경에 바로 적용 가능. 기획-개발 싱크 완벽.

</details>

<details>
<summary>💡 이렇게 활용하세요 — 실전 시나리오 8가지</summary>

| # | 시나리오 | 질문 예시 | 봇의 대응 |
|---|---|---|---|
| 1 | 정책문서에서 찾기 힘들 때 | "결제 실패 시 재시도 정책 어디?" | 관련 §번호 찾아 답변 · 인용 클릭 시 해당 절 자동 스크롤 |
| 2 | 화면과 정책이 다를 때 | 화면 캡처 + "정책과 실제가 다른데?" | drift 감지 후 판단 + [📤 기획전달] 유도 |
| 3 | 특정 액션·상태 화면 확인 | "반복 무한일 때 발송회차 컬럼 어떻게 보여?" | 정책·storyboard 안 관련 이미지 인용해서 시각 답변 |
| 4 | 화면만 있고 정책 모를 때 | 화면 캡처 + "이 화면 관련 정책?" | vision 으로 화면 이해 → 해당 정책 안내 |
| 5 | 정책 이해 안 될 때 | "이 §3-2 무슨 뜻이야?" → "그럼 이 케이스는?" | 채팅 히스토리 유지 · 반복 문의 OK |
| 6 | 원하는 정책이 없을 때 | "이 케이스 정책이 없는데 어떻게?" | 봇이 초안 제안 → [📤 기획전달] 로 신설 접수 |
| 7 | 버전 이력 추적 | "v0.1.5 → v0.1.6 뭐 바뀌었어?" | 버전 이력 표·변경 위치 색인 활용 요약 |
| 8 | 엣지 케이스 도출 | "놓친 예외 상황 있을까?" | AI 창의성으로 검토 안 된 케이스 제시 |

**부수 효과**:
- **신입 온보딩** — 정책 통독 없이 자유 질문으로 파악
- **답변 스타일 팀 학습** — [📝 답변 규칙] 이 누적 → 팀 톤으로 봇이 진화

</details>

<details>
<summary>⚖️ 한계 · 알아두면 좋은 것</summary>

- **답변 근거는 "선택한 문서 1개" + 프로젝트 문서 목록** — 봇은 현재 선택 문서를 근거로 답하되, 프로젝트 안 다른 문서 목록은 항상 알고 있어서 *"이 케이스는 캠페인 §2-1 참고하세요 (좌측에서 선택)"* 처럼 관련 문서로 안내 가능.  
  여러 문서를 진짜로 종합해서 답하고 싶으면 config 에서 **전체 문서 참고 모드** 를 켤 수 있음 (20문서 이하 팀 추천).

- **코드 검증은 옵션** — 기본 봇은 정책 md 만 봄. `code_repo` 를 config 에 연결하면 봇이 실제 코드도 참고해서 *"정책은 X 인데 코드는 Y"* 같은 판정 가능. 셋업은 [docs/06-CONNECT-CODE.md](docs/06-CONNECT-CODE.md).

- **정책에 없으면 봇도 모름** — 정책이 부실하면 답변도 부실. 초기 세팅 후 [📝 답변 규칙] / [📤 기획전달] 을 쌓아가면서 점진 개선.

</details>

<details>
<summary>📚 문서 인덱스 — 사람이 직접 정독할 필요 X (AI 가 상황별로 알아서 읽음)</summary>

| 문서 | 언제 참조되나 |
|---|---|
| [docs/00-OVERVIEW.md](docs/00-OVERVIEW.md) | 아키텍처·모드 비교 |
| [docs/01-INSTALL.md](docs/01-INSTALL.md) | 8단계 설치 절차 — 🟢 세팅하기 본체 |
| [docs/02-WIRE-POLICIES.md](docs/02-WIRE-POLICIES.md) | 정책 md 작성 규약 — 🔵 점검하기 본체 |
| [docs/03-CONNECT-BOT.md](docs/03-CONNECT-BOT.md) | API key / PAT / wrangler secret |
| [docs/04-OPERATE.md](docs/04-OPERATE.md) | 협업자·기획자 매일 사용법 — 🟣 알려주기 본체 |
| [docs/05-UPGRADE.md](docs/05-UPGRADE.md) | 코어 버전 올리기 — 🟠 업데이트하기 본체 |
| [docs/06-CONNECT-CODE.md](docs/06-CONNECT-CODE.md) | 코드 레포 연결 (옵션) |
| [docs/07-FIRST-TEST.md](docs/07-FIRST-TEST.md) | 첫 테스트 5개 시나리오 |
| [docs/08-STAGING.md](docs/08-STAGING.md) | 개발자 테스트·staging (기여자용) |
| [CHANGELOG.md](CHANGELOG.md) | 버전별 변경사항 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 코어에 개선 반영 (PR) 절차 |

</details>

<details>
<summary>📁 폴더 구조</summary>

```
apps/                — 사용자에게 노출되는 HTML (qa-collab, qa-planner)
bot/worker/          — Cloudflare Worker (Claude 호출 + GitHub 읽기/쓰기)
bot/local-server/    — PC 로컬 서버 (C 모드용)
create/              — npx 스캐폴더 (미래)
docs/                — 가이드 문서
examples/            — 샘플 정책 레포 (테스트·따라하기용)
scripts/             — dev-server · 정책 검증 CLI
.github/workflows/   — CI · staging 배포 · 릴리즈 알림
```

</details>

---

## 라이선스

Lunasoft 내부 자산. 사내 사용에 한함.
