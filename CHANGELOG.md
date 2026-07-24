# Changelog

이 레포는 [SemVer](https://semver.org/lang/ko/) 를 따릅니다. 코어 변경 시 사용자 레포에 영향을 주는 항목은 ⚠ 표시.

## Unreleased

## v0.3.4 — 2026-07-24

**Highlights** — 🪙 이달 누적 뱃지 · 토큰량+단가 표시 + 커스텀 툴팁 · 📄 HTML 목업 저장 실패 케이스 "완성" 프레이밍 재설계 · 🛠 로컬 dev 서버 포트 4000 기본 + 확장자 없는 URL 자동 처리.

- 🪙 **이달 누적 뱃지 · 토큰량+실효 단가 표시 + CSS 커스텀 툴팁** (`apps/qa-collab.html`) — 기존 `🪙 이달: ~₩234 · 12회` 형식이 (a) `~` 접두어가 마이너스로 오독되고 (b) "몇회" 보다 "얼마의 토큰"이 더 유용하다는 피드백. 새 형식 `🪙 이달 12.3K tok · ₩234 · 단가 ₩19/1K` — 토큰량 primary + 총비용 + 실효 단가 (원/1K tok · 캐시 히트율 반영). `formatKrw` 에서 `~` 접두어 제거 (원화 앞 `약` 프리픽스 대신 툴팁으로 예상치 뉘앙스 안내) + 3자리 콤마 자동 (`₩1,234`). 브라우저 기본 `title` 툴팁이 지연·안 뜨는 경우가 있어 **CSS 커스텀 툴팁 (`:hover::after` + `data-tip` attribute)** 로 대체 — hover 즉시 다크 배경 툴팁 렌더 · `white-space: pre-line` 로 breakdown 줄바꿈 정상. `title` 은 접근성(스크린리더) 위해 병기 유지. 툴팁 내용도 재구성: 헤더(월·요청수) → 토큰 breakdown (신규/캐시 읽기/캐시 쓰기/출력 + 총 입력 · 총 토큰) → 비용 (총 비용 · 실효 단가 · 환율) → ※ 서버측 정확 합계는 Anthropic Console
- 📄 **HTML 목업 · GitHub 저장 실패 케이스 "완성" 프레이밍 재설계** (`apps/qa-collab.html`) — 기존 UI 가 "⚠️ Claude 생성 완료 · GitHub 저장 실패" 로 노란 warning + 긴 원인 설명 + 3버튼 (미리보기 · 복사 · 다운로드) + HTML 소스 접힘 이어서 "실패했나?" 오해 유발. 사용자가 [👁️ 임시 미리보기 열기] 눌러야 비로소 정상 완성물 확인. 실제로 Claude 생성물은 완성돼 있으므로 save-fail 도 성공으로 프레이밍: 롤 `📄 HTML 목업 생성 완료 · 저장 실패` → `📄 HTML 목업 완성` · 노란 warning 박스 → 초록 success 박스 (성공 케이스와 시각적 통일) · 헤딩 `⚠️ Claude 생성 완료 · GitHub 저장 실패` → `✅ 목업 완성` · saveError 상세 원인 문구·💾 다운로드 버튼·📄 HTML 소스 details 접힘 전부 제거. 버튼 2개만 유지: **[👁️ 완성본 보기 ↗]** (blob URL 새 탭) + **[📋 HTML 복사]**. 하단 회색 힌트 `N KB · 이 링크는 브라우저 세션 동안만 유지 — 필요하면 새 탭에서 화면 저장 또는 HTML 복사` 로 세션 한정성만 은근히 전달
- 🛠 **로컬 dev 서버 포트 4000 기본 + 확장자 없는 URL 자동 처리** (`scripts/dev-server.js`) — 기존 포트 8080 → **4000** 으로 변경 (사용자 즐겨찾기 고정 요청). 요청 경로에 확장자 없으면 `.html` 붙여 재시도하는 `resolveFile` 로직 추가 → `/apps/qa-collab` · `/apps/qa-collab.html` 둘 다 동작 (즐겨찾기 편의). 시작 로그 문구도 확장자 없는 URL 로 안내

## v0.3.3 — 2026-07-24

**Highlights** — 🪙 이달 누적 토큰·비용 뱃지 (/qa + /gen-html 통합 집계) · 📄 HTML 목업 다이얼로그 파일 픽커 오발동 제거 · 💰 1회당 비용 안내 문구 제거.

- 🪙 **채팅 헤더 · 이달 누적 토큰·비용 뱃지 상시 노출** (`apps/qa-collab.html` · `bot/worker/src/index.ts`) — 매 답변마다 usage NDJSON 이벤트가 도착하면 `addToMonthlyUsage` 로 현재 월 (`YYYY-MM`, 로컬 시간대) 누적치에 반영. 헤더 우측에 `🪙 이달: ₩1,234 · 12회` 표시 (없으면 `🪙 이달 누적: —`). 툴팁으로 신규 입력·캐시 읽기·캐시 쓰기·출력 breakdown + USD·KRW 환산 + 총 요청 수 노출. `localStorage.blumnai-qa-usage-monthly-v1` 에 월별 객체로 저장 (과거 월도 보관, 스페이스 무시). 브라우저별 집계라 다른 PC·브라우저는 별도 카운터 — 툴팁에 명시 (서버측 정확 합계는 Anthropic Console 확인). 요율표·환율은 기존 `computeUsageCost` 재사용. **/qa (제이나미봇 채팅) + /gen-html (📄 HTML 목업) 두 엔드포인트 모두 통합 집계** — 워커 `GenHtmlResponse.usage` 필드 신설 → Anthropic 응답의 usage 를 프론트로 전달 → 저장 성공·실패 어느 쪽이든 누적 반영 (Claude 토큰은 이미 소비됐으므로)
- 📄 **HTML 목업 다이얼로그 · 파일 픽커 오발동 제거** (`apps/qa-collab.html`) — 다이얼로그 안 `<input type="file">` 이 그대로 노출돼 있어서 `<label for>` 클릭·Tab 포커스·paste 이벤트 부작용으로 "내 컴퓨터 선택" 창이 예상 밖으로 튀던 문제. 파일 인풋을 `display:none` 처리 + 상단 힌트에 "**Ctrl+V** 로 붙여넣거나 드래그, 또는 [📎 파일 선택]" 링크만 노출 → 파일 픽커는 명시적으로 "📎 파일 선택" 클릭 시에만 발동. paste·드래그가 primary 방법으로 명확화
- 🧹 **HTML 목업 다이얼로그 · "1회당 약 5-20원" 비용 안내 제거** (`apps/qa-collab.html`) — 이달 누적 뱃지가 헤더에 상시 노출되므로 다이얼로그 하단의 per-run 비용 예상 문구는 중복·소음. 저장 위치 안내만 유지

## v0.3.2 — 2026-07-24

**Highlights** — 🎨 🌐 전체 정책 종합 모드 UX 재설계 (버튼 → 토글 스위치 + 문서목록 명시적 비활성 + 스코프 칩).

- 🎨 **🌐 전체 정책 종합 모드 UX 재설계 — 토글 스위치 + 문서목록 명시적 비활성 + 채팅창 위 스코프 칩** (`apps/qa-collab.html`) — 기존 버튼 UI 가 상태별로 문구가 바뀌어 (OFF: "🌐 전체 정책 종합해서 답변" · ON: "🌐 전체 정책 종합 모드 · 클릭해서 해제") 사용자가 현재 모드를 헷갈리던 문제 정면 해소. **① 토글 스위치** — 지속 라벨 "🌐 전체 정책 종합 모드" + `[OFF]`/`[ON]` 배지 (회색 ↔ 인디고) + iOS 스타일 슬라이드 스위치로 상태 명시. **② 문서 목록 명시적 비활성** — ON 시 정책·화면설계서 리스트 + 검색창을 `.docs-selectable` 로 감싸 `opacity:0.5 · pointer-events:none · grayscale(0.4)` 처리 + 상단에 인디고 dashed 배너 "🌐 종합 모드 활성 중 — 아래 목록의 개별 문서 선택은 비활성화됐습니다" 노출. 개별 문서 클릭 시 종합 모드 자동 해제 부작용 제거 → 상태 변경은 오직 토글 명시적 조작으로만. **③ 채팅 입력창 위 스코프 칩** — 3가지 상태 상시 노출 (`🌐 전체 정책 종합` 인디고 / `📄 <문서명>` 초록 / `⚠️ 스코프 미선택` 호박색). 답변 근거가 뭔지 매 순간 확인 가능. `updateScopeChip` 를 `init`·`setAllDocsMode`·`selectDoc`·`restoreSession` 에서 호출해 모든 진입 지점에서 갱신. 웰컴 힌트의 방법 2 안내 문구도 "버튼 클릭" → "토글 ON" 으로 갱신.

## v0.3.1 — 2026-07-23

**Highlights** — 🚨 업데이트 배너 [나중에] 버튼 제거 (무조건 업데이트 강제) · 🐛 🌐 전체 정책 종합 모드 회피 답변 수정.

- 🚨 **업데이트 배너 [나중에] 버튼 · dismiss localStorage 검사 제거** (`apps/qa-collab.html` · `apps/qa-planner.html`) — 새 버전 배너 우측의 [나중에] 버튼과 관련 클릭 핸들러 · `core-update-dismissed-<ver>` localStorage 검사 로직 삭제. 배너를 닫을 방법이 없어져 봇 관리 담당자가 [🟠 업데이트하기] 프롬프트를 반드시 실행하게 유도. 기존에 dismiss 상태로 저장돼 있던 사용자도 이번 릴리즈부터 배너 재노출.
- 🐛 **🌐 전체 정책 종합 모드에서 "선택된 문서가 없다" 회피 답변 수정** (`bot/worker/src/index.ts`) — `useAllDocs: true` 요청 시에도 volatile 시스템 프롬프트가 `[현재 협업자가 보고 있는 문서] · (선택된 문서 없음) · (문서 내용 없음 — 일반 질문)` 을 항상 출력해서 Claude 가 안정 블록에 실린 전체 정책 번들을 근거로 답변하지 않고 *"지금은 선택된 문서가 없는 상태입니다..."* 라고 회피하던 버그. `SystemPromptParts.useAllDocs` 추가 → 종합 모드일 때는 volatile 블록을 `[🌐 현재 요청 모드 — 전체 정책 종합]` 안내로 대체해 위 [📖 프로젝트 전체 정책 문서 본문] 을 근거로 답변하도록 명시 (+ "'선택된 문서가 없다' 라고 회피하지 말 것" 강제). 프로젝트에 정책 md 가 0건이면 "정책 문서 등록 필요" 로 명확히 안내.

## v0.3.0 — 2026-07-23

**Highlights** — 🎫 Jira/Teams 외부 연동 (적용완료 자동 티켓·채널) · 📄 HTML 목업 생성 (실행 가능한 화면 파일) · 🪙 답변 토큰·비용 배지 · 🔍 코드 참고 진단 배지 · 🌏 한글 → 코드 매칭 강화 · 🩺 정책문서 로드 500 근본 대응 (자동 재시도 + 부분 성공 + 재시도 버튼) · 🧹 Nano Banana 이미지 생성 기능 제거 (HTML 목업으로 대체)

- 🩺 **정책문서 로드 500 에러 근본 대응 — 자동 재시도 · 부분 성공 · 실제 원인 노출 · [🔁 다시 시도] 버튼** (`apps/qa-collab.html` · `bot/worker/src/index.ts`) — "정책문서 로드 실패 HTTP 500" 이 반복 발생하던 3가지 근본 원인 동시 해결. **① 프론트 자동 재시도 (`retryableGet`)** — 지금까지 `/qa` 만 리트라이 있었고 `/list-docs` · `/doc` 은 한 번 실패하면 즉시 사용자 노출. 이제 GitHub 순간 5xx/429/네트워크 오류에 대해 최대 3회 시도 (backoff 500·1200ms). 대부분의 transient 실패는 사용자 눈에 안 보이게 자동 회복. **② 워커 부분 성공 응답** — `/list-docs` 가 policies·storyboards 를 `Promise.allSettled` 로 병렬 fetch → 한쪽만 성공해도 그것부터 렌더 + `warnings[]` 필드로 실패한 쪽만 표시. 둘 다 실패해야 최종 실패. 스토리보드 폴더 트래픽 잠깐 튀어도 정책 목록은 정상 노출. **③ 워커 upstream status 매핑** — 지금까지 GitHub 429/5xx 가 무조건 500 으로 뭉개져서 프론트 retry 로직이 발동 안 됨. 이제 최상위 catch 가 에러 메시지의 `: 429/5XX` 패턴을 파싱해 **502 Bad Gateway** 로 재분류 (upstream 5xx/429 인 경우만) → 프론트 `retryableGet` 이 자동 리트라이 대상으로 인식. **④ 실제 원인 표시** — 프론트가 지금까지 `HTTP 500` 만 throw 했고 워커 응답 body 의 `{ error: "..." }` 를 버렸음. 이제 body 파싱해서 `HTTP 500: fetch dir projects/xxx: 502` 처럼 사용자가 진짜 원인을 볼 수 있게. **⑤ [🔁 다시 시도] 버튼** — 사이드바 정책 목록 실패 시 · 문서 본문 로드 실패 시 각각 재시도 버튼 노출. 문서 캐시는 clear 후 재요청 (실패 상태가 5분 캐시에 눌러붙지 않게).
- 🔁 **📄 HTML 목업 실패 시 [🔁 같은 요청 다시 시도] 버튼 · 524 타임아웃 friendly 안내** (`apps/qa-collab.html`) — Cloudflare 524 (Worker/Claude 응답이 100초 초과 시 엣지가 끊는 origin timeout) 이 발생하면 답변 히스토리에 원본 에러 (`Claude API 524: error code: 524`) 만 보이던 문제 해결. ① `runGenHtml(prompt, dataUrl, mime)` 로 요청 실행부를 추출해 다이얼로그 close 시엔 다이얼로그 입력을, 재시도 시엔 캡처된 원본 payload (프롬프트 + 첨부 이미지 dataUrl · mime) 를 그대로 사용. ② 실패 카드 안에 `🔁 같은 요청 다시 시도` 버튼 노출 → 클릭 즉시 동일 payload 로 재요청 (실패 메시지는 히스토리에 유지). ③ `friendlyError` 에 524 전용 안내 추가 — "Cloudflare 요청 타임아웃 (524) — 프롬프트를 더 짧게·구체적으로 줄여서 [🔁 다시 시도] 해주세요". 다이얼로그 close 시 첨부 프리뷰는 즉시 초기화하되 재시도용 값은 클로저로 유지
- 🎫 **외부 연동 (Jira · Teams) — "적용완료" 시 자동 티켓·채널 알림** (`apps/qa-planner.html` · Worker · `docs/10-CONNECT-EXTERNAL.md`) — 기획자가 결정을 **[✅ 적용완료]** 처리하면 Worker 가 GitHub 커밋 성공 직후 Jira REST v3 로 이슈 생성 (`POST /rest/api/3/issue`, ADF description · assignee lookup 옵션) + Teams Incoming Webhook 으로 MessageCard 전송 (`✅ QA 봇 적용완료 — <topic>` · 질문자/기획자/문서/Jira key + [📄 결정 파일] [🎫 Jira] 액션). fire-and-forget — 실패해도 적용완료 자체는 성공, 원인은 토스트 · wrangler tail 로 확인. **중복 방지**: 성공한 연동은 decision md 하단에 `<!-- jira-issue: XYZ-123 -->` · `<!-- teams-notified: 2026-… -->` 마커로 저장 → 재적용 시 skip · 실패한 것만 재시도. **설정**: env 시크릿 `JIRA_BASE_URL` · `JIRA_EMAIL` · `JIRA_API_TOKEN` · `TEAMS_WEBHOOK_URL` + `config.yml` 의 `projects[].jira.{project_key, issue_type, title_template, default_labels, assignee_email}` · `projects[].teams.{enabled}`. 기획자 리스트에는 Jira key 링크 (`🎫 QA-123 ↗`) 배지가 표시됨.
- 🪙 **답변 하단 사용 토큰·예상 비용 뱃지** (`apps/qa-collab.html` · Worker `/qa`) — Anthropic API 응답에 이미 포함된 `usage` 를 Worker 가 NDJSON `{ type: 'usage' }` 라인으로 전달, 프론트가 요율표 (Opus 4.7 · Sonnet 4.6 · Haiku 4.5) 로 환산해 답변 상단 배지 라인에 `🪙 입력 1.2K (캐시 800) · 출력 340 · ~₩8` 표시. 툴팁으로 breakdown (신규 입력 · 캐시 읽기 · 캐시 쓰기 · 출력) · 요율 · 환율 · 캐시 절감 힌트 노출. 세션 복원 시에도 뱃지 유지 (`state.history.usage/model` 저장). 추가 LLM 호출 0건 — Claude 가 반환하는 값을 그대로 시각화. Worker 는 meta 라인에 `model` 필드 추가로 프론트가 요율 lookup 가능.
- ↩ **📄 HTML 목업 다이얼로그 참고 이미지 첨부 복구** (`apps/qa-collab.html`) — 직전 커밋(5beac4d) 으로 제거됐던 파일 input · 프리뷰 · 이벤트 핸들러 (paste·drag·change·clear) · state (`genHtmlAttachedDataUrl` / `genHtmlAttachedMime`) · payload `attachments` 필드 · `fileToDataUrl` 유틸 전부 원복. Ctrl+V 붙여넣기 · 드래그 · 파일 선택 세 가지 입력 방식 모두 재가동. Worker `/gen-html` 은 이미 attachments 처리 유지 상태였으므로 백엔드 변경 없음.
- 🧹 **📄 HTML 목업 다이얼로그의 참고 이미지 첨부 제거** — 다이얼로그 안의 파일 input · 프리뷰 · 관련 이벤트 핸들러 (paste·drag·change·clear) · state (genHtmlAttachedDataUrl / genHtmlAttachedMime) 모두 삭제. 이제 프롬프트 텍스트만으로 목업 생성. 정책 md · 코드 스니펫 컨텍스트 인젝션은 그대로 유지 → 대부분 케이스에서 충분. Worker `/gen-html` 은 attachments 필드 처리 코드 그대로 유지 (하위 호환용). 관련 유틸 `fileToDataUrl` 도 참조 없음 → 함께 제거.
- 🧹 **🎨 이미지 생성 (Nano Banana) 기능 제거** — 툴바 [🎨] 버튼 · 다이얼로그 · 프론트 핸들러 · Worker `/gen-image` 엔드포인트 · `generateImage` 함수 · `GEMINI_API_KEY`/`GEMINI_MODEL` env 필드 · `X-Bot-Gemini-Key` 헤더 · `docs/10-GEN-IMAGE.md` 전부 삭제. Gemini 이미지 편집이 한글 텍스트·정밀 UI 편집 정밀도 낮아 실전 활용성 부족 → 새로 도입한 [📄 HTML 목업 생성] 이 정책·코드 기반 실행 가능 화면을 정확히 만들어 상위 대체. `friendlyError` 의 Gemini 관련 패턴 · 데모 모드의 `/gen-image` mock 도 함께 정리. GEMINI_API_KEY 시크릿은 wrangler 에 남아있어도 무해 (참조 없음).
- 📄 **HTML 목업 생성 (`/gen-html`) — 실행 가능한 화면 파일 즉시 생성** (`qa-collab.html` · Worker) — 툴바 [📄] 버튼 → 다이얼로그: 프롬프트 + 참고 이미지 (파일·Ctrl+V·드래그) → Worker `/gen-html` 이 Claude Sonnet 4.6 으로 완결된 HTML 문서를 생성해 `qa/mockups/YYYY-MM-DD-<slug>.html` 로 자동 커밋 → 채팅에 "🔗 새 탭에서 열기" 클릭 링크 표시. 기존 문제 (챗에서 HTML 코드 붙여넣기 → 메모장 저장 → 렌더 실패) 를 정면 해소:
  · **max_tokens 16384** 로 대용량 목업도 잘림 방지 (기존 챗 2048 대비 8배)
  · 시스템 프롬프트로 `<!DOCTYPE html>` 로 시작하는 완결 문서만 강제 · markdown fence 자동 stripping
  · Tailwind CSS CDN 기반 (외부 라이브러리 안전성 확보)
  · 정책 md + 코드 스니펫 + 참고 이미지 3중 컨텍스트 인젝션 (`/qa` 파이프라인 재사용)
  · GitHub Pages 가 정적 서빙하므로 클릭 즉시 새 탭에서 화면 확인 (파일 저장·복붙 X)
  · 저장 슬러그 자동 생성 + 충돌 시 -1, -2 suffix
- 🌏 **검색어 우선순위 조정 · 한글 질문 토큰을 상위로** (`bot/worker/src/index.ts`) — 팀이 코드 파일 맨 위에 `// 화면: 메시지 통계` 같은 한글 주석 한 줄만 넣으면 한글 질문이 그대로 코드 매치되는 강력한 패턴이 열림. 워커가 이 흐름을 지원하도록 검색어 통합 순서를 (docSymbols → koreanExpanded → baseKeywords → hint) 에서 (**baseKeywords → docSymbols → koreanExpanded → hint**) 로 변경 — 한글 질문 토큰이 top-4 실제 검색에 반드시 포함됨. 06-CONNECT-CODE.md 에 이 팁 (⭐ 매칭 확률 확 올리는 방법 · 15분 세팅) 정식 문서화
- 📄 **06-CONNECT-CODE.md 실전 노하우 반영** — 상단에 "안 되면 배지 툴팁부터 확인" 강조 배너 · config 예시의 `code_paths` 주석을 "1개만" 로 정정 (GitHub Search 다중 path AND 붕괴 이슈). 헤이데어 실전 세팅에서 축적된 6가지 원인 (path AND · 다중 토큰 AND · 중첩 괄호 422 · OR repo scope 누출 등) 을 한 번에 학습해 타팀 세팅 시 반복 안 하도록 정리
- 🌏 **한글 질문 → 코드 매칭 강화** (`bot/worker/src/helpers.ts` · `index.ts`) — GitHub Search Code API 는 리터럴 매칭이라 한글 질문 (예: "대시보드 필터 초기화 버튼") 이 영문 코드 (`Dashboard`, `Filter`, `reset`, `Button`) 와 매치 안 되던 문제 해결. 3층 검색 파이프라인 도입:
  ① 기본 키워드 (기존 방식) + ② `expandKoreanUiTerms` — 한글 UI 용어 → 영문 심볼 mini 사전 (대시보드→Dashboard, 초기화→reset 등 40+개) + ③ `extractCodeSymbols` — 현재 열린 정책 md 안 인라인 영문 심볼 (백틱 `` `DashboardFilter` ``, PascalCase, camelCase, CONSTANT_CASE) 추출. 매칭 0건이면 자동 fallback 재검색 (심볼·영문만으로 재시도). 배지 진단에 `query` (실제 GitHub Search 쿼리), `totalCount` (Search API total), `attempts` 필드 추가 → 매칭 0건 시 배지 옆에 "GitHub 에서 직접 검색해보기 ↗" 클릭 링크로 인덱싱 여부 즉시 확인 가능
- 🔍 **코드 참고 진단 배지** (`qa-collab.html` · Worker) — 답변마다 상단에 봇이 실제 서비스 코드 스니펫을 참고했는지 시각화. `🔍 <레포명> 코드 N건 참고` (성공, 초록) · `⚠️ 코드 참고 <실패사유>` (실패, 주황) · `📄 정책 문서만 참고` (`code_repo` 미설정, 회색). 실패 시 툴팁으로 원인 힌트 (PAT scope 부족, 검색어 부족, 매칭 0건 등) 및 검색 키워드·레포 표기. Worker `fetchCodeSnippets` 가 `{ snippets, diagnostic }` 반환 형태로 리팩터되고 `/qa` NDJSON meta 라인에 `codeInjection` 필드 실려서 프론트에 전달. 세션 복원 시에도 배지 유지. 배경: 정책 vs 코드 drift 답변이 조용히 실패해도 사용자가 알 수 없어서 "정책만 참고한다" 오해가 반복되던 문제를 정면 해소
- 📄 **06-CONNECT-CODE.md · 07-FIRST-TEST.md 배지 기반 진단으로 개편** — 06 트러블슈팅 표를 "배지 색·문구별" 로 재구조화 (📄 회색 → config 미설정 / ⚠️ 주황 검색실패 → PAT scope / ⚠️ 매칭 0건 → 키워드 / 🔍 초록인데 답에 코드 없음 → answer-rules 강화). 07 시나리오 4 "코드 검증" 정상 답변 형태에 배지 확인 추가. 06 §셋업 검증 신설 + Quick Start 마스터 프롬프트 스텝 7 (배지 확인) 추가. 타부서 셋업 시 성공·실패 판정이 툴팁 하나로 가능해짐

## v0.2.1 — 2026-07-15

**Highlights** — 기획자 모드 질문자 정보 복구 (A 모드 버그 수정) · 사용자 이름 필수화 · 🎨 이미지 생성/수정 (Nano Banana · 옵션) · 🌐 전체 정책 종합 모드 · README/셋업 문서 대폭 개선 · 실제 팀 셋업에서 반복되던 두 걸림돌 (Cloudflare API Token 폼 · 기존 Pages 충돌) 가이드 신설.

- 🎨 **이미지 생성·수정 (Nano Banana = Gemini 2.5 Flash Image · 옵션 기능)** — 툴바 [🎨 이미지] 버튼 → 다이얼로그: 프롬프트 + 참고 이미지 (파일·Ctrl+V·드래그) → Worker `/gen-image` → 채팅에 결과 표시. 질문자가 "이 화면을 이렇게 바꿔줘" 요청 시 수정 mockup 을 즉시 확인해서 기획자 전달 설득력 강화. Worker 에 `GEMINI_API_KEY` 시크릿 필요 (Google AI Studio 무료 발급, 하루 100장 무료 tier). 미설정 시 다른 기능 영향 X. 상세 셋업: [docs/10-GEN-IMAGE.md](docs/10-GEN-IMAGE.md). 한글 텍스트·정밀 UI 편집은 여전히 부정확 — 참고 mockup 용도로 활용 권장. `X-Bot-Gemini-Key` 헤더로 SaaS 모드도 지원. 데모 모드 (`?demo=1`) 는 SVG placeholder 로 UI 흐름 확인 가능

- 🐛 **기획자 모드 질문자 정보 복구 (A 모드)** — Worker `/forward` 가 body.user 를 받았지만 `renderDecisionMarkdown` 에 전달하지 않아 `qa/decisions/*.md` 에 `| 질문자 |` 행이 저장 안 되던 버그. `listDecisions` 는 이미 그 행을 파싱하도록 되어 있어 지금까지 항상 빈 값이 돌아오고 기획자 리스트에 누가 요청했는지 안 보이던 문제. `ForwardRequest.user`, `forwardToDecisions`, `renderDecisionMarkdown` 3곳 수정 + 기획자 리스트 row2 에 `👤 이름` 배지 렌더 (C 모드 `local-server` 는 이미 정상)
- ⚠ **사용자 이름 필수화** (`qa-collab.html`) — 이름 미설정 → `익명` fallback 이 위 질문자 배지 복구 취지를 무력화하므로, 이름 설정을 명시적 필수 게이트로 승격. 초기 진입 시 dialog 자동 오픈 + [취소] 버튼 숨김 + ESC 로도 못 닫음. 어떻게든 닫아도 이름 없으면 즉시 재오픈. [전송] / [📤 기획전달] / [📝 답변 규칙] 3개 액션 모두 진입 시 이름 게이트 (없으면 dialog 재오픈). 상단 표시 '(이름 미설정)' → '이름 설정 필요'
- 🆕 **🌐 전체 정책 종합 모드 (사이드바 버튼)** — 특정 문서 선택 없이 프로젝트 안 모든 정책·화면설계서를 종합해서 답변. 좌측 상단 [🌐 전체 정책 종합해서 답변] 클릭 → 개별 문서 클릭 시 자동 해제. 첫 진입/리셋 시 웰컴 힌트 2박스로 개별/종합 방식 안내. Worker `QARequest.useAllDocs` 우선 → config `bot.include_all_docs` fallback
- 🆕 **planner 데모 모드 (`?demo=1`)** — Worker 없이 4개 샘플 decision (대기 2 · 반영 1 · 보류 1) 으로 planner UI 검증 가능. mock `/list-decisions`, `/doc`, `/save-decision-image`, `/update-decision-status` 등. 상단 보라색 데모 배너 + 비번 게이트 자동 우회. 개발자 로컬 미리보기용
- 📝 **업데이트 배너 문구 명확화** — "Claude Code 에 [🟠 업데이트하기] 붙여넣으면 30초" 가 누구 작업인지 불분명해서 → "**봇 관리 담당자 (기획팀)** 가 Claude Code 에 [🟠 업데이트하기] 프롬프트를 실행하면 30초" 로 통일 (qa-collab · qa-planner 양쪽)
- 📄 **README 상단 흐름 재편** — 설득 → 이해 → 세팅 → 활용 흐름으로 재정렬: 30초 요약 → 🚀 왜 필요한가 (장점 4가지, 상단 승격) → 🏛 이 레포는 뭐고 → 🟢 세팅하기 → 💡 활용 시나리오 8가지 (세팅 뒤로 이동 — 첫 진입 마찰 감소)
- 📄 **§1 미리 준비 4가지 + [!IMPORTANT] callout** — 기존 3가지 (API key · Cloudflare · Node.js) 에 **정책·화면설계서 GitHub 레포 (봇 얹을 홈)** 추가. 없으면 세팅 도중 막히니 사전 필수 항목으로 승격. API key 대기 시간 강조
- 📄 **§2 리프레이밍** — "팀 정보 정리" 가 마치 사전 준비처럼 오해되던 성격을 → "§3 프롬프트에 채워야 할 값들 안내" 로 명확화 + [세팅하기 마스터 프롬프트] 앵커 링크 실제 연결
- 📄 **§3 마스터 프롬프트 접힘 → 기본 펼침** — `<details open>` + 상단 [!TIP] callout 으로 "박스 우상단 📋 복사 아이콘 클릭" 유도. 드래그 없이 GitHub 자동 복사 버튼으로 원클릭 복사 가능
- 📄 **README 한 줄 소개 갱신** — "정책·화면설계서에 대해 물어보면 답해주고" → "정책·화면설계서·**서비스 코드** 기반으로 AI 가 자동응답을 해주고, **개선 필요하면** 기획자에게 자동으로 전달" (능동태 · 서비스 코드 통합 · 에스컬레이션 목적 명시)
- 📄 **`docs/03-CONNECT-BOT.md` §5-옵션 신설** — `wrangler login` 이 회사 방화벽·SSO 로 안 될 때 대안. `dash.cloudflare.com/profile/api-tokens` 의 **"Edit Cloudflare Workers" 템플릿 발급 폼** (Account Resources · Zone Resources) 세팅을 표로 정리. Zone Resources 에 "All zones" 옵션이 없으면 "Include All zones from an account" 로 대체하는 fallback 도 명시. PowerShell/bash 각각 `CLOUDFLARE_API_TOKEN` 환경변수 세팅 예시. 실전 팀에서 반복 발생한 걸림돌 해소
- 📄 **`docs/01-INSTALL.md` §6-variant 신설** — 이미 Vite/Next.js mock demo 등이 Pages 배포 중인 레포에서 §6-1 (Deploy from a branch) 를 그대로 켜면 기존 배포와 충돌하는 문제. 대안 A (기존 deploy 스크립트 5줄 추가 · Recommended) / B (별도 브랜치) / C (별도 레포) 비교 + AI 위임 프롬프트 예시. 트러블슈팅 표에 pointer 추가
- 🎨 **답변 아래 CTA 문구 개선** — "👉 이대로 진행: 📤 기획자에게 전달" 이 다음 액션이 뭔지 불분명 → "개선 필요 시 📤 기획전달 · 추가 질문: 아래 입력창 · 끝났으면: ↻ 새 대화" 로 세 갈래 선택지 명시
- 🩹 **cache flicker 재발 방지** — 개선건/문서 재선택 시 캐시가 있으면 즉시 렌더 (일부 경로에서 여전히 "로딩 중..." 잠깐 노출되던 지점 정리)
- 📄 **README 개선 다수** — 🏛 섹션 3단 그룹핑 (이해/활용/원칙) · 코어 용어 정의 박스 · 관계도 다이어그램 오해 방지 문구 · fork 금지 불릿 강화 · 세팅 프롬프트 앞 "왜/어떻게" 안내 · 업데이트 빈도 현실화 (6개월-1년 → 1주-1달 초기) 등

## v0.2.0 — 2026-07-13

**Highlights** — SaaS 모드 Phase 1 MVP: 팀별 셋업 없이 하나의 URL 에서 wizard 로 3분 셋업 후 즉시 사용.

- 🚀 **SaaS 모드 Phase 1 MVP** — 팀별 Cloudflare Worker 배포 · `.blumnAI-qa-bot/` 복사 · wrangler secret 등록 등 30-60분 셋업 프로세스를 브라우저 wizard 3분으로 대체. 방향 결정: 팀별 결제 · URL 은 `blumnai-qa.ai` 예정
  - Worker: `scopeEnvFromRequest()` 헤더 기반 인증 (`X-Bot-{GitHub-Repo|GitHub-Token|Anthropic-Key}`). `SAAS_MODE=1` 환경변수 시 CORS 무제한 (인증은 헤더로만)
  - Worker: `loadTeamConfig` cache 를 `Map<GITHUB_REPO, ...>` 로 refactor — 다중 팀 격리
  - Frontend: `getConfig()` 가 config.yml 없으면 SaaS 모드로 자동 전환. localStorage 에 저장된 설정 사용 · 없으면 `openSaasWizard()` 자동 실행
  - Frontend: `botFetch()` wrapper — SaaS 모드에서 모든 Worker 요청에 인증 헤더 자동 첨부. 9개 fetch 호출 지점 모두 이관
  - Frontend: 툴바에 [⚙️] 버튼 (SaaS 모드에서만 표시) — wizard 재오프해서 설정 변경
  - **하위 호환**: 기존 팀 모드 (config.yml 있는 배포) 은 아무 영향 없이 그대로 동작
- 📄 **docs/09-SAAS-MODE.md** 신규 — 사용자 관점 · 코어 메인테이너 관점 · 헤더 스펙 · 보안 고려사항 · 향후 로드맵

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
- 🎬 **데모 모드 (`?demo=1`)** — Worker 없이도 UI 전체 검증. mock 응답으로 `/list-projects`, `/list-docs`, `/doc`, `/qa` (NDJSON 스트리밍), `/forward`, `/feedback`, `/save-decision-image` 등 커버. 상단에 보라색 데모 배너 표시. 팀 담당자·개발자가 로컬에서 30초 안에 UI 개선사항 즉시 확인 가능
- 🩺 **CI 워크플로우** (`.github/workflows/ci.yml`) — main push · PR 마다 자동 실행: tsc --noEmit + vitest + HTML 스크립트 파싱 + 정책 md 규약 스캔 (sample-policy-repo 대상)
- 🚀 **Staging 자동 배포** (`.github/workflows/deploy-staging.yml`) — `workflow_dispatch` (수동) + main push (opt-in, `STAGING_AUTO_DEPLOY=1` 변수 시) 로 Cloudflare Worker `blumnai-qa-bot-staging` 자동 배포. 시크릿 6개 미등록 시 자동 skip 으로 안전. `wrangler.toml.template` 에 `[env.staging]` 블록 신설
- 📚 **Sample-policy-repo 확장** — 정책 md 4개 (대시보드 · 캠페인 관리 · 결제포인트 · 알림설정). 실전 감 있는 §번호·시각 명세·버전 이력 표 포함. 모두 정책 스캔 CLI 통과
- 🧹 **wrangler.toml.template 팀 중립화** — `heythere_planer`·`lunasoft-org` 하드코딩 제거하고 `your-org/your-policy-repo` placeholder + `[env.staging]` 스테이징 환경 추가
- 📄 **docs/08-STAGING.md** 신규 — 3가지 개발자 테스트 방법 (데모 모드 · wrangler dev · Actions staging) 상세 가이드 + 개선 흐름 다이어그램 + FAQ
- 🩹 **세팅하기 갭 수정** — `.blumnAI-qa-bot/version` 파일 생성 스텝이 누락되어 있었음 (실전 배포 확인 중 발견 · 404). 01-INSTALL §3 파일 복사 목록에 추가 (5개 → 6개), README 세팅하기 프롬프트 스텝 B 에도 명시 추가, 05-UPGRADE 자동 배너 절에 ⚠️ 경고 박스로 강조, `examples/sample-policy-repo/.blumnAI-qa-bot/version` 샘플 파일 신설 (내용 `v0.1.0`)
- 🎁 **[코어 봇 개선 제안] 버튼 신설** — 툴바에 아이콘-only 버튼 (🎁). 사용자가 이 봇 자체의 기능·버그·UI 개선 아이디어를 즉시 제출 가능. 클릭 시 모달 → 제목·내용 입력 → GitHub Issue 작성 화면이 프리필 상태로 새 탭에서 열림 (팀 브랜드·로컬 코어 버전·페이지 URL·User Agent 자동 첨부). CONTRIBUTING.md 흐름의 UI 진입점. 3가지 피드백 경로 분리 명확화 (📤 팀 정책 · 📝 답변 톤 · 🎁 코어 기능)
- ⚡ **캐시 hit 시 "로딩 중..." 플리커 제거** — 문서 재선택·개선건 재조회 시 캐시가 있으면 즉시 렌더 (예전엔 캐시 있어도 로딩 텍스트 잠깐 노출되어 매번 fetch 하는 것처럼 보임). `isDocCached()` 헬퍼로 캐시 유효성 사전 확인. UX 매끄러움 + 캐시 동작을 시각적으로 확인 가능

## v0.0.0 — 2026-06-30

- 초기 골격 생성 — heythere_planer/qa 에서 코드 fork
- 폴더 구조 확정: `apps/`, `bot/worker/`, `bot/local-server/`, `create/`, `docs/`, `examples/`
- 컨피그 스키마 v1 확정 (`blumnAI-qa-bot.config.yml`)
