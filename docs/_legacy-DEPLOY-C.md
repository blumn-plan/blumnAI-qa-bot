# C 모드 배포 가이드 — Max OAuth 활용 (PC 24/7 운영)

기존 A 모드 (Anthropic API 직접 결제) 대신 **본인 PC 에서 Claude Code CLI 를 실행**해서 **Max 한도**로 챗 응답하는 모드. 추가 결제 0원이지만 PC 가 항상 켜져 있어야 합니다.

## C 모드 구조

```
qa.html (GitHub Pages, 고정 URL)
  ↓
Cloudflare Worker (proxy 모드 — TUNNEL_URL 이 설정되면 자동 활성화)
  ↓
Cloudflare Quick Tunnel (PC 시작 시 자동 생성, URL 매번 바뀜)
  ↓
PC 의 Node 서버 (localhost:8788)
  ├── /list-docs · /doc → 로컬 FS 직접 read
  ├── /qa → claude CLI spawn (Max OAuth)
  └── /forward → git commit + push (qa/decisions/)
```

URL 이 바뀌는 문제는 시작 스크립트가 자동으로 Worker 의 `TUNNEL_URL` secret 을 갱신해서 해결.

---

## 0. 준비물 체크

- [x] Cloudflare 계정 (이미 있음 — A 모드 셋업할 때)
- [x] wrangler CLI 로그인 완료 (이미 됨)
- [x] Claude Code CLI 설치 + Max 로그인 (`claude` 명령어가 동작해야 함)
- [ ] **cloudflared CLI 설치** (아래 1번)

### Claude Code CLI 확인

VS Code 터미널에서:

```bash
claude --version
```

→ 버전 번호 출력되면 OK. 안 되면 https://claude.ai/code 에서 데스크탑 앱 설치.

추가로 한 번 더:

```bash
echo "say hello" | claude --print --no-color
```

→ "Hello!" 같은 짧은 응답 1초~3초 안에 나오면 정상. 만약 로그인 요청 뜨면 `claude login` 한 번 실행.

---

## 1. cloudflared 설치 (1분)

VS Code 터미널 (PowerShell) 에서:

```powershell
winget install --id Cloudflare.cloudflared
```

> ⚠️ **winget 은 cloudflared 를 PATH 에 자동 등록 안 함**. 그래도 launcher.js 가 자동으로 winget 설치 경로를 찾아서 실행하니까 PATH 신경 안 쓰셔도 됩니다.

설치 확인 (옵션 — launcher.js 가 자동 처리하지만 미리 확인하고 싶으면):

```powershell
winget list cloudflared
```

→ 항목에 `Cloudflare.cloudflared` 가 나오면 설치 완료. (`cloudflared --version` 은 PATH 미등록이라 안 됨 — 정상)

`winget` 가 없는 환경이면 https://github.com/cloudflare/cloudflared/releases/latest 에서 `cloudflared-windows-amd64.msi` 다운받아 설치.

---

## 2. start.bat 한 번 실행 (1분)

VS Code 파일 탐색기에서:

`qa/bot/local-server/start.bat` **더블 클릭**

또는 터미널에서:

```powershell
cd c:/Source/기획/heythere_planer/qa/bot/local-server
.\start.bat
```

성공 시 콘솔 창에 다음과 같이 출력됩니다:

```
[server] listening on http://localhost:8788
[tunnel] Your quick Tunnel has been created!
[tunnel] https://random-words-1234.trycloudflare.com
[launcher] Tunnel URL detected: https://random-words-1234.trycloudflare.com
[launcher] Registering TUNNEL_URL with Worker
[wrangler] ✨ Success! Uploaded secret TUNNEL_URL
[launcher] ✨ TUNNEL_URL 등록 완료. qa.html 에서 챗 가능
```

✅ `✨ Success!` + `✨ TUNNEL_URL 등록 완료` 줄까지 나오면 끝.

> ⚠️ **이 콘솔 창은 닫지 마세요.** 닫으면 챗 서비스가 즉시 중단됩니다. PC 켜둬도 이 창이 꺼지면 동작 안 함.

---

## 3. 동작 확인 (1분)

브라우저에서 https://verbose-chainsaw-2qw8p2w.pages.github.io/qa.html 열어서:

1. 좌측 정책문서 클릭 → 가운데에 마크다운 렌더 (전과 동일)
2. 우측 챗박스에 시범 질문 (예: `대시보드 v0.1.3 §2 알림 정책 요약해줘`)
3. 5~15초 대기 → 답변 표시
4. 콘솔 창에 다음 같은 로그가 찍힘:
   ```
   [server] [2026-06-01T...] POST /qa
   ```

답변이 정상 도착하면 **C 모드 동작 중**. Max 한도 차감, 추가 결제 0원.

---

## 4. PC 부팅 시 자동 실행 (선택, 2분)

매번 PC 켤 때마다 start.bat 더블 클릭하기 귀찮으면 Windows 시작 프로그램에 추가:

1. **Win+R** → `shell:startup` → Enter
2. 열린 폴더에 `start.bat` **바로가기** 생성:
   - VS Code 에서 `qa/bot/local-server/start.bat` 우클릭 → **바로가기 만들기**
   - 만들어진 `start.bat - 바로가기` 를 위 시작 프로그램 폴더로 드래그
3. 다음번 PC 부팅 시 자동으로 콘솔 창이 뜨면서 서비스 가동

> 보안 정책상 시작 프로그램 차단된 환경이면 Task Scheduler 로 등록 (사용자 요청 시 별도 가이드).

---

## 5. 일상 운영

### PC 끄지 않기

- **절전 모드 진입 → 챗 중단**. 전원 설정에서 "절대 절전 안 함" 으로 변경 권장
- 노트북이면 뚜껑 닫아도 동작하게 설정
- Windows 자동 업데이트 재시작 → start.bat 가 시작 프로그램에 등록되어 있으면 자동 복구

### URL 이 바뀌었을 때 (대부분 자동 복구)

start.bat 가 재시작될 때마다 TUNNEL_URL 을 Worker 에 자동 등록. 수동 개입 필요 없음.

만약 자동 등록 실패하면 콘솔에 마지막 줄이 다음과 같이 나옴:

```
[launcher] wrangler exit 1 — TUNNEL_URL 등록 실패. 수동 등록:
[launcher]   cd qa-bot && echo https://abc-xyz.trycloudflare.com | npx wrangler secret put TUNNEL_URL
```

→ 그 명령어 그대로 복사해서 별도 터미널에서 실행하면 됩니다.

### Max 한도 모니터링

- https://claude.ai 우상단 프로필 → Settings → Usage
- Max 플랜은 5시간 단위 한도. 챗 QA 사용량은 매우 적어서 한도 압박 거의 없을 것

---

## 6. A 모드로 전환 (회사 결제 받은 후)

C 모드 끝내고 A 모드 (Anthropic API 직접) 로 돌아가려면:

```bash
cd qa-bot
npx wrangler secret delete TUNNEL_URL
```

→ Worker 가 자동으로 A 모드로 복귀 (Anthropic API 호출). PC 의 start.bat 콘솔 창 닫아도 OK.

다시 C 모드 가려면 PC 에서 `start.bat` 실행하면 됩니다 (Worker 가 TUNNEL_URL 감지하면 다시 proxy 모드).

---

## 7. 트러블슈팅

| 증상 | 원인·해결 |
|---|---|
| qa.html 에서 "Local server unreachable via tunnel" | PC start.bat 안 켜져 있음. start.bat 재실행. |
| 답변 매번 실패 (Anthropic 에러) | Max 로그인 만료. `claude login` 다시. |
| `claude` 명령어 인식 안 됨 | Claude Code 데스크탑 앱 설치 후 PATH 추가. 또는 `where claude` 로 경로 찾아 `qa/bot/local-server` 의 server.js 안 `CLAUDE_BIN` 환경변수로 지정. |
| `cloudflared` 명령어 인식 안 됨 | winget 설치 후 새 터미널에서 시도. PATH 갱신 필요할 수 있음. |
| 콘솔에 wrangler 권한 에러 | `wrangler login` 다시. |
| 답변 너무 느림 (>30초) | claude CLI 콜드 스타트. 두 번째 질문부터는 빨라짐. |
| Anthropic 에서 "automated use" 경고 메일 | C 모드 즉시 종료 (`npx wrangler secret delete TUNNEL_URL`), A 모드로 전환. 그 사이 정책 변경 가능성. |

---

## 8. 비교 — A 모드 vs C 모드

| | A 모드 | C 모드 (현재) |
|---|---|---|
| 결제 | API 크레딧 ($5/2개월) | Max 한도 ($0 추가) |
| PC 의존성 | 없음 (Worker 가 다 처리) | PC 24/7 필요 |
| 응답 속도 | 3-5초 | 8-15초 (claude CLI 오버헤드) |
| 가용성 | 99.99% (Cloudflare) | PC 가용성에 비례 (절전·재부팅 시 중단) |
| 다른 PC 에서 QA 가능? | 예 (Pages URL 누구나 접근) | 예 (Pages URL 누구나 접근). 본인 PC 만 항상 켜져 있으면 됨 |
| 미래 위험 | 없음 | Anthropic 정책 변경 시 막힐 수 있음 |

C 모드는 **A 모드 결제 승인 받기 전 임시 운영** 목적에 적합. 가치 입증되면 회사 결제로 A 전환.
