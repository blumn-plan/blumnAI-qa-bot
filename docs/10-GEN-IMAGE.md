# 10. 🎨 이미지 생성 설정 (Nano Banana / Gemini)

QA봇에 **이미지 생성·수정** 기능을 켭니다. 질문자가 화면 캡처 + "이렇게 바꿔줘" 로 수정 mockup 을 즉시 확인 → 기획자 전달 시 설득력 UP.

> ⚠️ **선택 기능입니다.** 이 문서를 스킵해도 봇의 다른 기능은 모두 정상 동작합니다. 이미지 생성이 필요한 팀만 아래 3단계 진행.

## 어떻게 쓰나 — 사용자 관점

1. 봇 화면 상단 툴바 **[🎨 이미지]** 버튼 클릭
2. 다이얼로그가 열림:
   - "무엇을 그리거나 어떻게 바꿀지" 프롬프트 입력 (필수)
   - 참고 이미지 (선택) — 파일 선택 · Ctrl+V · 드래그로 첨부
3. **[🎨 생성]** 클릭 → 5-15초 후 채팅창에 생성된 이미지 표시
4. 마음에 들면 우클릭 → 이미지 저장 → **[📤 기획전달]** 팝업에 첨부해서 전달

## ⚠️ 한계 — 미리 알아두기

Nano Banana (Gemini 2.5 Flash Image) 는 **자연 이미지 · 새 그림 생성** 은 잘 하지만 **UI mockup 정밀 편집은 아직 부정확**합니다:

- 🔴 한글 텍스트가 이상하게 뭉개짐 (예: "친구 늘리기" → "친구놋리기")
- 🔴 원본 스타일 (색상 · 폰트 · 아이콘) 이 미묘하게 재해석됨
- 🔴 요소 위치 · 크기가 의도와 다를 수 있음
- 🟢 대신 잘 되는 것: 새 mockup 생성 · 색감 변환 · 대략적 레이아웃 스케치

**참고 mockup** 용도로만 활용하세요. 최종 반영은 여전히 Figma / v0 등에서 사람이 그림.

## 셋업 3단계 — 👤 담당자 직접

### 1. Google AI Studio API key 발급 (3분)

1. 브라우저에서 https://aistudio.google.com/app/apikey 접속 → 구글 계정 로그인
2. **[Create API key]** 클릭
3. 새 프로젝트 만들거나 기존 프로젝트 선택 → **[Create API key in existing project]** (또는 새 프로젝트)
4. `AIzaSy...` 로 시작하는 문자열이 표시됨 → **즉시 메모장 복사** (창 닫으면 다시 못 봄)

**💰 무료 tier**: Gemini 2.5 Flash Image 하루 100장 정도까진 무료. 초과 시 이미지 1장당 약 30-50원 (2025 하반기 기준 · 정확 요율은 https://ai.google.dev/pricing 확인).

### 2. Worker 시크릿 등록 (1분)

> 🔒 **AI 채팅창에 절대 붙여넣지 마세요.** wrangler 프롬프트에만 직접 입력.

VS Code 터미널에서 본인 정책 레포의 `.blumnAI-qa-bot/worker/` 폴더로:

```bash
cd .blumnAI-qa-bot/worker
npx wrangler secret put GEMINI_API_KEY
```

프롬프트 뜨면 → 위 1단계에서 복사한 `AIzaSy...` 붙여넣기 → Enter

### 3. Worker 재배포 (30초)

```bash
npx wrangler deploy
```

**확인**: 봇 화면 새로고침 (Ctrl+Shift+R) → 툴바에 [🎨 이미지] 버튼이 활성 상태로 보이면 완료.

## 트러블슈팅

| 증상 | 원인·해결 |
|---|---|
| "GEMINI_API_KEY 미설정" 에러 | 위 §2 시크릿 등록 누락. `npx wrangler secret list` 로 확인 |
| "Gemini 가 이미지를 반환하지 않음 (텍스트만 응답)" | 프롬프트가 너무 추상적. "무엇을 · 어떻게 · 어디에" 구체적으로 재작성 |
| 429 rate limit | 무료 quota 소진. https://aistudio.google.com/app/usage 확인. 한도 upgrade 또는 다음날 재시도 |
| 생성 이미지의 한글이 깨짐 | Nano Banana 한글 렌더 한계. 영어 UI 로 만들거나 텍스트 없는 레이아웃 위주로 프롬프트 |
| 참고 이미지 5MB 초과 | 이미지 축소 (PNG → JPEG 로 저장하거나 캡처 영역 좁히기) |

## 향후 확장 아이디어

- 봇 답변 안에서 **자동 mockup 첨부** — Claude 가 "이 답변에 mockup 이 도움되겠다" 판단 시 tool_use 로 자동 호출
- 여러 후보 이미지 (variations) 표시
- Cloudflare R2 저장 → decision 첨부 시 URL 참조 (base64 대신)

Contribute 는 [CONTRIBUTING.md](../CONTRIBUTING.md) 참고.
