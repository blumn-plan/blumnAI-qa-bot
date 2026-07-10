# Changelog

이 레포는 [SemVer](https://semver.org/lang/ko/) 를 따릅니다. 코어 변경 시 사용자 레포에 영향을 주는 항목은 ⚠ 표시.

## v0.1.0 — 2026-07-09 (in progress)

**Highlights** — 비개발자 온보딩 전면 개선 + 코드 검증 옵션 신설.

- 📄 README '어디부터 보세요' 를 **프롬프트-퍼스트** 로 재구성 — 4가지 상황별 마스터 프롬프트를 붙여넣기만 하면 AI 가 가이드를 대신 읽고 스텝별 안내
- ✅ 시작 전 준비사항 체크리스트 추가 (GitHub / Anthropic 계정 · Cloudflare · Node.js · 팀 정보 3가지)
- ⚠ **기본 모드를 A 모드 (Anthropic API) 로 재설정** — 이전 문서는 C 모드 (PC Max 우회) 를 추천했지만 셋업 복잡도·PC 상시 부담 때문에 A 모드가 정상 팀 셋업. C 모드는 [03-CONNECT-BOT §부록](docs/03-CONNECT-BOT.md#부록--c-모드-pc-max-우회-특수-상황용) 으로 이동
- 🆕 **코드 검증 옵션 추가** — `projects[].code_repo`, `code_paths`, `code_search_hint`, `code_max_snippets`, `code_snippet_lines` 필드로 서비스 코드 레포 연결. Worker 가 GitHub Search 로 관련 스니펫을 fetch 해서 답변에 정책 vs 코드 drift 판정 반영
- 🆕 `docs/06-CONNECT-CODE.md` 신규 — 코드 레포 연결 3-5분 셋업 가이드
- 🆕 `docs/07-FIRST-TEST.md` 신규 — 설치 직후 5개 시나리오 (정책 인용 · 시각 명세 · 화면 drift · 코드 drift · feedback 루프)
- 🆕 `answer-rules.md` 샘플에 §A-2 (정책 vs 화면/코드 drift) · §A-3 (코드 인용 규칙) 추가
- 🧹 `01-INSTALL.md` 를 A 모드 기준으로 축약 (§7 C 모드 launcher 제거)
- 🆕 **Worker 가 팀 `blumnAI-qa-bot.config.yml` 을 실제로 읽음** — 5분 in-memory 캐시. 프로젝트별 `policies_dir` / `storyboards_dir` 을 config 값 우선으로 사용해 팀이 이미 다른 폴더 구조를 쓰고 있어도 파일 이동 없이 override 가능. `/list-projects` 도 config 를 primary source 로 삼고 폴더 스캔은 fallback
- 🏷 **상황 1/2/3/4 라벨 → 동사형**: 🟢 세팅하기 (필수) / 🔵 점검하기 / 🟣 알려주기 / 🟠 업데이트하기 로 개편. README 최상단에 "시간 순서 다이어그램" 추가해서 각 프롬프트가 언제 필요한지 명확화
- 🆕 **🏛 재사용 가능한 코어 mental model 섹션 신설** — 이 레포가 코어이고 각 팀이 복사해서 쓴다는 관계, fork 하지 말라는 원칙, 자동 알림 방식을 README 상단에 배치
- 🆕 **자동 GitHub 스캔 지원** — 세팅하기 프롬프트가 팀 이름만 알아도 시작 가능. `[모름]` 표시된 항목은 AI 가 `gh` CLI 로 조직·레포·정책 폴더를 자동 발견해 확인만 받는 방식
- 🆕 **🔁 표준 협업 사이클 다이어그램** — 04-OPERATE.md 에 협업자↔기획자 반복 사이클 (질문 → 답 → 개선요청/기획자전달 → 프롬프트복사 반영/보류→재작업) 을 한 장의 flow 로 명시. 알려주기 프롬프트가 이 사이클을 기준으로 시뮬레이션 교습
- 🔐 **기획자 모드 비번 → config.yml 로 이동** — `ui.planner_password` 필드 신설. `qa-planner.html` 이 config 값 우선, 없으면 하위 호환 default. 세팅하기 프롬프트가 초기 설치 때 자동으로 팀별 값 채움. 04-OPERATE 에 변경 방법 명시
- 🔔 **코어 업데이트 알림 3가지 방식 신설**:
  - 자동 배너 — `qa-collab.html` / `qa-planner.html` 이 코어 CHANGELOG 를 fetch → 로컬 `.blumnAI-qa-bot/version` 과 비교 → 다르면 상단 노란 배너. dismissKey 로 버전별 dismiss 지원. `deployment.core_repo` 로 fork override 가능
  - GitHub Watch — 팀원별 개별 구독 안내 (05-UPGRADE)
  - Teams / Slack 웹훅 — `.github/workflows/release-notify.yml` 신규. matrix 로 팀별 secret 이름 참조. subscribers 목록에 팀 추가 PR 로 신규 팀 등록
- 🎁 **다중 프로젝트 지원 세팅하기 프롬프트** — 한 팀에 여러 프로젝트 (예: admin_v1 + backoffice_v2) 가 있어도 각 프로젝트별 정책 폴더·화면설계서 폴더·코드 레포를 개별 지정 가능. `[프로젝트 N]` 블록을 필요한 만큼 복사
- 🔐 **원본 코어 방어 강화** — `.github/CODEOWNERS` + `CONTRIBUTING.md` 신설. main 브랜치 보호 (GitHub Settings 에서 활성 필요) 와 함께 파일 유형별 리뷰 요구. 팀 사본의 수정은 원본에 자동으로 흘러가지 않고 반드시 PR + 기획팀 리뷰 필수
- 🧹 `.claude/` 를 `.gitignore` 에 추가 (로컬 Claude Code 설정 미커밋)

## v0.0.0 — 2026-06-30

- 초기 골격 생성 — heythere_planer/qa 에서 코드 fork
- 폴더 구조 확정: `apps/`, `bot/worker/`, `bot/local-server/`, `create/`, `docs/`, `examples/`
- 컨피그 스키마 v1 확정 (`blumnAI-qa-bot.config.yml`)
