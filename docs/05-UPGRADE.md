# 05. 업그레이드 (Upgrade)

코어 봇 레포에 새 버전 (`v0.2.0` 등) 이 나왔을 때, 본인 서비스 정책 레포 안의 코어 사본을 최신으로 갱신하는 절차.

---

## 핵심 원칙 — 무엇이 덮어쓰이고 무엇이 보존되나

| 경로 | 업그레이드 시 동작 |
|---|---|
| `.blumnAI-qa-bot/apps/*.html` | **덮어쓰기** (코어 변경 반영) |
| `.blumnAI-qa-bot/worker/` | **덮어쓰기** + 재배포 필요 |
| `.blumnAI-qa-bot/local-server/` | **덮어쓰기** + 재기동 필요 |
| `.blumnAI-qa-bot/version` | **덮어쓰기** (새 버전 기록) |
| `.blumnAI-qa-bot/answer-rules.md` | **유지** (팀 수정본 보존) |
| `blumnAI-qa-bot.config.yml` | **유지** (팀 컨피그 보존) |
| `projects/`, `qa/decisions/`, `qa/feedback/` | **유지** (팀 데이터 보존) |

원칙: **`.blumnAI-qa-bot/` 안은 코어 영역, 그 밖은 팀 영역**.

---

## 절차 — 3가지 방법

### 방법 A. `npx upgrade-blumnAI-qa-bot` (장차 추가 예정)

미구현. 향후:
```bash
cd /path/to/your-policy-repo
npx upgrade-blumnAI-qa-bot
```
→ 자동으로 코어 사본 갱신 + breaking change 알림 + Worker 재배포 안내.

### 방법 B. 수동 갱신 (현재 권장)

VS Code 터미널에서:

```bash
# 본인 정책 레포로
cd /path/to/your-policy-repo

# 코어 갱신본을 받음 (코어 레포가 본인 PC 에 있다고 가정)
cp /path/to/blumnAI-qa-bot/apps/*.html .blumnAI-qa-bot/apps/
cp -r /path/to/blumnAI-qa-bot/bot/worker/* .blumnAI-qa-bot/worker/
cp -r /path/to/blumnAI-qa-bot/bot/local-server/* .blumnAI-qa-bot/local-server/

# (해당 시) Worker 재배포
cd .blumnAI-qa-bot/worker
npm install
npx wrangler deploy

# (C 모드) local-server 재기동
cd ../local-server
# 기존 start.bat 콘솔창 닫고 다시 더블 클릭

# 버전 기록 갱신
cd ../..
echo "v0.2.0" > .blumnAI-qa-bot/version

# 커밋
git add .blumnAI-qa-bot/
git commit -m "blumnAI-qa-bot v0.2.0 으로 업그레이드"
git push
```

### 방법 C. 코어 메인테이너에게 위임

비개발자라 위 절차가 부담스러우면, 코어 메인테이너에게 본인 레포 임시 접근권 부여 + 업그레이드 작업 요청.

---

## Breaking Change 확인 — 업그레이드 전에

코어 레포의 `CHANGELOG.md` 에서 본인 현재 버전 → 새 버전 사이 항목 확인.

`⚠️ BREAKING` 표시 있는 항목은 본인 컨피그·정책 구조에 영향. 다음 항목 추가 작업이 필요할 수 있음:
- `blumnAI-qa-bot.config.yml` 신규 필드 추가
- 정책 markdown 헤더 규칙 변경
- `answer-rules.md` 형식 변경

**Breaking change 가 있으면** 메인테이너가 별도 마이그레이션 가이드를 함께 공지합니다.

---

## 본인 현재 버전 확인

```bash
cat .blumnAI-qa-bot/version
```

또는 브라우저에서 qa-collab.html 열고 F12 → Console → `CONFIG._coreVersion` (v0.2.0 부터 추가 예정).

---

## 롤백 — 새 버전이 잘 안 되면

git history 활용:

```bash
# 최근 업그레이드 커밋 한 칸 뒤로
git log --oneline .blumnAI-qa-bot/  # 마지막 업그레이드 커밋 hash 확인
git revert <hash>
git push
```

Worker 도 이전 버전으로 재배포:
```bash
cd .blumnAI-qa-bot/worker
npx wrangler deploy
```

C 모드 local-server 콘솔창도 재기동.

---

## 자주 묻는 질문

### Q. 업그레이드 후 화면이 깨졌어요

**A**. 보통 원인:
1. **Worker 재배포 누락** — `.blumnAI-qa-bot/worker/` 갱신했으면 반드시 `wrangler deploy`
2. **브라우저 캐시** — 강제 새로고침 (Ctrl+Shift+R)
3. **답변 규칙 형식 변경** — `.blumnAI-qa-bot/answer-rules.md` 가 신버전과 호환되지 않음. CHANGELOG 확인

### Q. 자주 업그레이드 해야 하나요?

**A**. 아니요. 코어가 안정적이면 6개월 한 번 정도로 충분. 단 `⚠️ SECURITY` 표기된 release 는 즉시 적용 권장.

### Q. 우리 팀만 별도 기능을 추가하고 싶어요

**A**. fork 방식은 권장 X (코어 업그레이드 받기 어려워짐). 대신:
- 작은 변경 → `.blumnAI-qa-bot/answer-rules.md` 또는 `blumnAI-qa-bot.config.yml` 로 표현
- 큰 변경 → 코어 메인테이너에게 PR 제안 → 모든 팀이 함께 누릴 수 있게 코어에 반영

---

## CHANGELOG 위치

코어 레포의 [CHANGELOG.md](../CHANGELOG.md) — 버전별 변경사항·breaking change 표기.
