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
- ⚡ **QA봇 캐싱** — Worker 인메모리 캐시 (`fetchTextFileCached` 60s, `fetchDirListingCached` 30s, `codeCache` 60s) + 프론트 세션 캐시 (`docContentCache`, `listDocsCache` 5분). 같은 대화 안 반복 질문 시 GitHub API 호출 대폭 감소. 쓰기 작업 (feedback 저장, decision 생성) 후 관련 캐시 자동 무효화
- 📚 **프로젝트 문서 카탈로그 인젝션** (Approach A · 기본 활성) — 시스템 프롬프트에 프로젝트 안 모든 정책·화면설계서 목록 자동 삽입. 봇이 관련 문서로 사용자를 안내 가능 ("이 케이스는 캠페인_만들기 §2-1 참고"). config `bot.inject_doc_catalog: false` 로 끌 수 있음
- 📖 **전체 문서 인젝션 모드** (Approach B · 옵션) — `bot.include_all_docs: true` 시 프로젝트 전체 정책 본문을 시스템 프롬프트에 삽입. Anthropic prompt caching 활용 (5분 TTL) — 첫 질문만 비용 상승, 이후 캐시 재사용. 200K 자 상한 sanity check 포함. QA봇 답변 근거를 "1개 문서" 에서 "여러 문서 크로스 참조" 로 확장
- 🎯 **📋 변경 제안 블록 시스템 프롬프트 지시 추가** — 정책 변경 필요 시 답변 끝에 6필드 (📌 요청 제목·📄 대상·📍 위치·✏️ 전·✅ 후·💡 근거) 자동 첨부. 프론트가 파싱해서 기획자 전달 팝업 자동 채움
- 🔄 **기획자 전달 팝업 자동 요약 개선** — 📋 블록 있으면 6필드로 구조화된 "## 합의 요약". 블록 없어도 대화 3라운드 기반 fallback ("## 상황 / ## 논의된 내용 / ## 요청 사항") 자동 생성. 라벨을 "핵심 요약 - 목록·기획자 알림에 노출" / "합의 요약 (기획자가 이것만 봐도 판단 가능하게)" 로 명확화
- 🧪 **로컬 dev 미리보기 서버** — `scripts/dev-server.js` (Node http). `node scripts/dev-server.js` 로 UI·팝업·배너 확인용 정적 서버 시작 (`http://localhost:8080/apps/qa-collab.html`)
- 🖼 **기획자 적용 메모에 이미지 첨부** — apply modal 에 [📎 이미지] 버튼 + 붙여넣기/드래그 지원. 첨부 시 `/save-decision-image` 로 `qa/decisions/images/<decision-slug>/` 아래 GitHub 업로드. memo 안 `![alt](url)` 는 `upsertPlannerNote` 가 `<img class="planner-memo-img">` 로 렌더 (안전 URL 화이트리스트). 5MB 개별 상한. qa-collab 에도 동일 이미지 CSS 반영
- 🧹 **팀 하드코딩 제거** — Worker 의 `PROJECT_LABELS` 맵 (`admin_v1`, `backoffice_v2`) 완전 삭제. `DEFAULT_PROJECT_FALLBACK` 을 `defaultProjectFallback(env)` (config 첫 프로젝트 fetch) 로 동적화. HTML title 을 `heythere_planer` → `blumnAI QA Bot` 으로 변경하고 bootstrap 에서 `cfg.ui.brand_name` 이 있으면 그것 우선. `github_repo` fallback 도 `lunasoft-org/heythere_planer` 하드코딩 대신 config 미설정 시 안내 문구로
- 🩺 **`/health?detailed=1` 진단 리포트** — 시크릿 존재 여부 (값 노출 X) · config 파싱 상태 · 프로젝트 목록 · bot 설정 · 캐시 통계. 팀이 세팅 안 되는 이유 원격 진단 가능
- 🛠 **`bot/worker/.dev.vars.example`** — `cp .dev.vars.example .dev.vars` → 값 채우고 `wrangler dev` 로 로컬 워커 개발 가능. 팀 온보딩 도우미
- 🩺 **에러 화면 자동 진단** — qa-collab.html · qa-planner.html 이 bootstrap 실패 시 자동으로 `/health?detailed=1` 을 fetch 해서 체크리스트(✅/❌) 형식의 진단 패널 렌더. 시크릿 · config · 프로젝트 · 캐시 상태 한눈에. 팀 담당자가 F12 안 열어도 원인 파악 가능
- 📭 **정책 md 0개 empty-state CTA** — 프로젝트 select 는 성공했는데 `/list-docs` 가 0개 반환하면 좌측 사이드바에 friendly 안내: 가능 원인 (폴더 비었음 / `policies_dir` 경로 오류 / 파일명 규약 위반) + 🩺 서버 진단 링크
- 🎯 **`friendlyError()` 확장** — Anthropic 401 · rate limit · GitHub 401/404 · CORS · 5xx 등 흔한 실패 패턴을 인식해 사용자 친화 메시지로 변환 (예: "Anthropic API key 만료. IT기획팀 재발급 요청" · "GitHub PAT 만료. Classic PAT 재발급")
- 📄 **03-CONNECT-BOT 에 §🩺 원격 진단** 절 신설 — `/health?detailed=1` 사용법 + curl 예시 + 확장 트러블슈팅 표
- ✋ **스트리밍 답변 취소** — 사용자가 [취소] 누르면 진행 중이던 /qa fetch abort → worker 가 Anthropic API 호출도 함께 abort (토큰 낭비 방지). Worker `askClaude` 에 `clientSignal` 파라미터 추가, 프론트에 [전송] ↔ [취소] 토글 버튼
- 🧪 **Worker 유닛 테스트 도입 (vitest)** — `bot/worker/src/helpers.ts` 에 순수 함수 6개 (`extractProjectFromPath`, `extractSearchKeywords`, `extPathToQualifier`, `escapeHtml`, `escapeRegex`, `renderNoteBodyHtml`) 추출 · `helpers.test.ts` 에 20개 케이스 (XSS 방어 · 이미지 렌더 안전 · 검색 키워드 로직 등). `npm run test` / `npm run check` (tsc + vitest)
- 📭 **qa-planner empty-state** — 전달이력 리스트가 비었을 때 상황별 friendly 안내 (0건 · 검색 결과 없음 · 필터 결과 없음 분리)
- 📄 **02-WIRE-POLICIES 팀-중립화** — `lunasoft-org/heythere_planer` 하드코딩 링크 제거, 팀 자유 규칙 강조
- 📄 **04-OPERATE FAQ** — "왜 대화를 서버-side 에 저장 안 하나" 설계 근거 추가 (프라이버시 · 비용 · 명확한 산출물 원칙)
- 🔍 **사이드바 문서 검색** — 정책·화면설계서 목록 위에 실시간 필터 입력. 대량 문서 (40개+) 팀 대응. 필터링 시 count 표시가 `(3/40)` 형태로 매칭 개수/전체 표시
- 💾 **세션 내보내기** — 툴바에 [💾 내보내기] 버튼. 현재 대화를 markdown 파일로 다운로드 (헤더 + Q/A 라운드 + 적용된 개선 룰). 파일명은 `qa-<타임스탬프>-<문서제목>.md`
- 🔄 **답변 카드 액션** — 각 assistant 답변 hover 시 [🔄 재답변] [📋 복사] 버튼 표시. 재답변은 마지막 사용자 질문을 재실행 (기존 답변 제거, regenerated 태그로 재생성 표시). 복사는 답변 본문을 클립보드에
- 🩺 **정책 md 자동 검증 CLI** — `scripts/check-policies.mjs` 신설. 02-WIRE-POLICIES 규약(파일명·h1·§번호·본문 길이·시각 명세) 을 자동 스캔. exit code 로 CI 통합 가능. 🔵 점검하기 프롬프트가 자동 실행. 문서에 사용 예시 추가
- 🔗 **봇 답변 문서 언급 하이라이트** — 봇 답변 렌더 후 프로젝트 카탈로그 문서 제목·경로 매칭 스캔 → 사이드바 해당 항목에 노란 배지 (`.doc-mentioned`) + 🔗 아이콘 표시. 사용자가 답변에서 언급된 다른 문서로 원클릭 이동 가능
- 📱 **모바일 반응형** — `<= 900px` 에서 사이드바가 hamburger 오버레이 drawer 로 전환 (좌측 슬라이드 인·아웃, backdrop, ESC/외부 클릭 닫기, 문서 선택 시 자동 닫기). 문서·챗은 세로 스택 (문서 45vh + 챗 55vh). `<= 640px` 에서 챗 우선 (문서 35vh + 챗 65vh) + 툴바 wrap
- 🔁 **/qa 자동 재시도** — 전송 실패 시 backoff 500ms → 1500ms 로 최대 3회 시도. 재시도 대상: 408 · 425 · 429 · 500 · 502 · 503 · 504 + 네트워크 오류 (`Failed to fetch`, `NetworkError`). 즉시 실패: 401/403/404 + `AbortError` (사용자 취소). 로딩 placeholder 에 "재시도 중… (N/3)" 상태 표시
- 🔍 **채팅 이미지 lightbox** — 사용자 첨부 · 봇 답변 안 이미지 · 기획자 메모 이미지 모두 클릭 시 전체화면 확대 (기존 `<a target="_blank">` → 직접 img + event delegation). ESC/backdrop/× 로 닫기. hover 시 살짝 확대 + zoom-in 커서로 힌트

## v0.0.0 — 2026-06-30

- 초기 골격 생성 — heythere_planer/qa 에서 코드 fork
- 폴더 구조 확정: `apps/`, `bot/worker/`, `bot/local-server/`, `create/`, `docs/`, `examples/`
- 컨피그 스키마 v1 확정 (`blumnAI-qa-bot.config.yml`)
