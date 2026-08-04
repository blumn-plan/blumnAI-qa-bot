# 11. SaaS 팀 모드 설계서 (Phase 1)

> **Status**: 🚨 **Revision 4 착수 (2026-08-04) — Cloudflare 폐기 · 사내 배포 전환**
> **작성일**: 2026-08-04
> **대상 독자**: 기획자(=솔로 구현자, 클로드코드 활용)
> **관련 문서**: [09-SAAS-MODE.md](09-SAAS-MODE.md) (현재 개인 모드), [00-OVERVIEW.md](00-OVERVIEW.md), [../onprem/README.md](../onprem/README.md) (Rev 4 실제 코드)
>
> **버전 이력**:
> - Revision 1 (초안): 기본안 8개 · 개발자 팀 전제
> - Revision 2: 기획자 결정 · 개발자 팀 전제 · 7-8주
> - Revision 3: 솔로 바이브코딩 감안 재조정 · 3-4주 · Phase 1a/1b/1c 분할
> - **Revision 4 (현재)**: 🚨 IT 답변으로 Cloudflare 방향 폐기. 사내 배포 (형태 Y) 로 전환. Phase 1a D1-D4 코드 (`caf20b9`) 는 legacy 로 보존.

---

## 🚨 Revision 4 — 아키텍처 전환 (2026-08-04)

### 배경

IT 팀 최종 답변으로 Cloudflare 방향 모두 폐기 확정:
1. GitHub IP allowlist 켜짐 · GitHub App 우회도 불가
2. Cloudflare IP 대역 등록 요청 → **"Cloudflare 전체 IP 허용 불가"** 답변 (2026-08-04)
3. Rev 3 의 Cloudflare Worker 기반 SaaS 모델은 사내 GitHub 레포에 접근 불가

### 형태 Y — 완전 사내 배포

Cloudflare 폐기 · 사내 서버에 Docker 배포. 사내 IP 는 이미 GitHub allowlist 에 있음 → IP 문제 원천 해소.

```
[사내 브라우저] → [사내 서버 Docker 컨테이너] → [GitHub · Anthropic]
                    ├─ Next.js (프론트)
                    ├─ NestJS (API)
                    └─ MySQL (팀 config)
```

### 스택 (Rev 4 확정)

| 레이어 | 스택 | 이유 |
|---|---|---|
| 프론트 | **Next.js 16** (App Router) + **TailwindCSS 4** + **shadcn/ui** | 현대 React 표준 · shadcn 완성도 |
| 백엔드 | **NestJS 10** (Node.js 20) | 구조화된 API · DI · 파이프 · Prisma 궁합 |
| DB | **MySQL 8** + **Prisma** ORM | 관계형 · 마이그레이션 자동 · 팀·프로젝트·멤버 정규화 |
| 배포 | **docker-compose** (mysql + backend + frontend) | 사내 서버 하나에 3 컨테이너 |
| 시크릿 | **.env** 파일 (배포 시 Vault/K8s Secret 로 승격) | 단순 · Docker 표준 |

### Rev 3 → Rev 4 매핑

| Rev 3 자산 | Rev 4 대응 |
|---|---|
| Cloudflare Worker (`bot/worker/`) | NestJS 앱 (`onprem/backend/`) 으로 이식 |
| KV `TEAM_CONFIG` | MySQL `teams` · `projects` 테이블 |
| 단일 HTML (`apps/qa-collab.html`) | Next.js 컴포넌트 (`onprem/frontend/src/app/`) |
| `X-Bot-Team-Slug` 헤더 | URL path 또는 session 기반 |
| Cloudflare Pages | Docker Nginx / Next standalone |

### Phase Y 로드맵 (Rev 4)

| Phase | 목표 | 소요 |
|---|---|---|
| **Y1a** (지금) | 스캐폴딩 · docker-compose · MySQL 스키마 · /health · /team CRUD | 3-5일 |
| **Y1b** | GitHub API + Anthropic API 이식 · /list-docs · /doc · /qa · /forward | 4-6일 |
| **Y1c** | Next.js 컴포넌트 (shadcn) 로 프론트 이식 · 첫 실사용 | 5-7일 |

### Rev 3 § 5-14 의 처리

이 문서 §5 이하 (아키텍처 · 데이터모델 · API · UI · 보안 · 롤아웃) 는 **Rev 3 (Cloudflare 시대)** 기준. Rev 4 재작성 대신 **참고용 보존** — 결정 배경·논리 흐름은 유효하고, 재구현 시 스택만 치환하면 됨 (예: KV 스키마 § 6.1 → Prisma schema 로 매핑, Worker /team API § 8 → NestJS controller 로 매핑).

Rev 4 실제 구현 상태는 [../onprem/README.md](../onprem/README.md) 참고.

---

---

## 📌 결정 확정 요약 (2026-08-04 · **Revision 3 · 솔로 바이브코딩 감안**)

| 항목 | 확정값 | Rev2 대비 변경 |
|---|---|---|
| ① 팀원 자격 판정 | **명시 초대 (마스터가 봇에서 GitHub username 등록)** | 유지 |
| ② GitHub write 열쇠 | **마스터 PAT + 만료 D-30 배너** | 🔄 GitHub App 에서 회귀 · JWT/private key 등 솔로 바이브 난이도 상 |
| ③ Anthropic rate limit | **팀원 1인당 50회/일** | 유지 |
| ④ 팀 슬러그 규칙 | **`{org}-{repo}` 자동 파생** | 유지 |
| ⑤ 마스터 정체·이양 | **최초 생성자 고정, 이양은 문서화된 KV 스크립트로 수동 대응** | 🔄 이양 UI 제거 · 필요 시 나중에 추가 |
| O2 OAuth 스코프 | **`read:user read:org` 만** | 유지 (PAT 는 마스터가 별도 입력) |
| O3 자격 캐시 시간 | **1시간** | 유지 |
| O6 팀당 프로젝트 수 | **Phase 1 부터 여러 프로젝트 지원** | 유지 |

### ⏱ 일정 (Revision 3)

당초 Rev2 = 7-8주 → **Rev3 = 3-4주** (Phase 1a/1b/1c 분할 · 각 단계마다 배포 가능). 상세 §13 참고.

### 🎯 Revision 3 핵심 원칙

1. **솔로 바이브코딩 난이도 최소화** — GitHub App · 마스터 이양 UI 처럼 문서 부족·엣지케이스 많은 부분은 회피
2. **매 단계 배포 가능** — 도중에 멈춰도 뭔가는 남음. Phase 1a 만 나와도 지금 하네스 충돌 해결
3. **진짜 요구사항은 유지** — 명시 초대 · 다중 프로젝트 · 팀 공유는 절대 안 뺌
4. **바이브 함정 우회** — 클로드코드가 잘 도와주는 영역 (OAuth · KV · 표준 CRUD) 위주로 스코프 조정

---

## 🚨 IT 팀 답변 · IP allowlist 상태 (2026-08-04)

Cloudflare Worker → GitHub API 접근 관련 IT 팀 답변:

| # | 항목 | IT 답변 | 의미 |
|---|---|---|---|
| 1 | 조직 GitHub IP 허용목록 | ☑ **켜짐** | Worker (CF IP) 는 기본적으로 GitHub 접근 불가 |
| 2 | GitHub App 우회 옵션 | ❌ **우회 안 됨** (`Enable IP allow list configuration for installed GitHub Apps` = ☑ 체크됨) | GitHub App 도 IP 검사받음 · **App 카드 사망** |
| 3 | Cloudflare IP 대역 등록 승인 | ⏳ **요청 중** | 승인 or 거부 대기 |

### 판정: 남은 시나리오 2가지

**시나리오 A (IT 가 CF IP 등록 승인)**:
- 지금 Rev 3 (Worker 전담) 그대로 진행
- Phase 1a → 1b → 1c 순서

**시나리오 B (IT 가 CF IP 등록 거부)**:
- **하이브리드 아키텍처로 전환** 필수 (§5.2 참고 · 신규 추가 필요)
- 브라우저가 GitHub read 직접 · Worker 는 Anthropic 만
- 쓰기: 마스터는 브라우저 직접, 팀원은 Worker (retry 로 커버)
- Phase 1b 착수 시 결정 (지금 Rev 3 대비 UI/코드 큰 변경)

### Phase 1a 는 두 시나리오 모두 안전

Phase 1a (KV 이동) 는 GitHub 호출 패턴 안 바꿈 → **IT 답변과 무관하게 지금 착수 가능**.
Phase 1b 착수 전에 IT 답변 확정 필요.

---

## 목차

1. [배경 · 문제 정의](#1-배경--문제-정의)
2. [요구사항](#2-요구사항)
3. [비목표 (Phase 1 에서 안 함)](#3-비목표-phase-1-에서-안-함)
4. [핵심 설계 결정 5가지](#4-핵심-설계-결정-5가지--변경-가능)
5. [아키텍처 개요](#5-아키텍처-개요)
6. [데이터 모델 (Cloudflare KV)](#6-데이터-모델-cloudflare-kv)
7. [GitHub OAuth 흐름](#7-github-oauth-흐름)
8. [Worker API 엔드포인트](#8-worker-api-엔드포인트)
9. [UI 흐름](#9-ui-흐름)
10. [보안 · 위협 모델](#10-보안--위협-모델)
11. [마이그레이션 · 하위 호환](#11-마이그레이션--하위-호환)
12. [오픈 이슈](#12-오픈-이슈)
13. [롤아웃 · 테스트 계획](#13-롤아웃--테스트-계획)
14. [Phase 2+ 예고](#14-phase-2-예고)

---

## 1. 배경 · 문제 정의

### 현재 상태 (09-SAAS-MODE.md)

- **개인 모드**만 존재: 사용자가 브라우저 wizard 로 GitHub PAT · Anthropic Key 를 입력 → `localStorage` 에 저장
- 저장은 브라우저별·기기별로 격리 → **팀 공유 불가**
- N명 팀 = wizard N번 반복 + PAT N개 발급 부담

### 실제로 부딪힌 문제

1. **팀 확장 불가**: 팀원 추가마다 세팅 반복. "봇 URL 공유만 하면 됨" 이 아님.
2. **세팅 통제 불가**: 아무나 wizard 열 수 있음. 실수·오세팅 위험. 마스터·팀원 역할 구분 없음.
3. **변경 반영 불가**: 마스터가 정책 폴더 경로를 바꿔도 다른 팀원 브라우저는 그대로.
4. **바이브 설치 하네스 충돌**의 대안으로 SaaS 를 도입하려 해도, 현재는 사실상 "혼자 쓰는 도구" 라 팀 대체가 안 됨.

### Phase 1 목표

**마스터 1명이 세팅 → 팀원은 GitHub 로그인만으로 자동 진입 → 마스터만 세팅 수정 가능**.

---

## 2. 요구사항

### 기능

| ID | 요구사항 | 우선순위 |
|---|---|---|
| F1 | 마스터가 팀 config (레포·경로·Anthropic key) 서버측에 저장 | P0 |
| F2 | 팀원은 GitHub OAuth 로그인만으로 팀에 자동 진입 | P0 |
| F3 | 마스터만 세팅 화면 접근 가능, 팀원은 조회만 | P0 |
| F4 | 팀원 자격 = "정책 레포 read 권한 있는 GitHub 사용자" (자동 판정) | P0 |
| F5 | 여러 팀에 속한 사용자는 로그인 후 팀 선택 | P1 |
| F6 | 마스터가 명시적으로 팀원 화이트리스트 좁힘 (선택) | P2 |
| F7 | 사용량 rate limit (팀원 1인당) | P1 |

### 비기능

- **보안**: Anthropic key · GitHub PAT 는 서버측 암호화 저장. 응답에 절대 노출 X.
- **비용**: 팀당 월 $5 미만 추가 인프라 비용 (Cloudflare KV free tier 안).
- **하위 호환**: 기존 개인 모드 사용자 영향 X. 두 모드 공존.
- **레이턴시**: 로그인 후 봇 로드까지 3초 이하.

---

## 3. 비목표 (Phase 1 에서 안 함) · Revision 3

- ❌ **GitHub App** — Rev2 에서 승격했다가 Rev3 에서 회귀. 마스터 PAT + D-30 배너로 대체. GitHub App 은 Phase 4
- ❌ **마스터 이양 UI** — Rev2 에서 승격했다가 Rev3 에서 회귀. KV 수동 스크립트로 대체. UI 는 Phase 2
- ❌ 공동 마스터 (masters 배열) — Phase 1 은 마스터 1인
- ❌ 팀 삭제 UI (수동 KV 삭제로 대응)
- ❌ 사용량 대시보드 (rate limit + 80% 경고 배너만)
- ❌ 감사 로그 조회 UI (KV 에 기록만)
- ❌ 월 예산 상한 UI (rate limit 이 사실상의 상한)
- ❌ 팀 초대 이메일 발송 (마스터가 봇에서 GitHub username 직접 입력)
- ❌ SSO (Okta, SAML 등)
- ✅ **Phase 1 유지 기능** (Rev3): 팀 공유 config · GitHub OAuth · 명시 초대 · 다중 프로젝트 · rate limit · PAT 만료 배너

---

## 4. 핵심 설계 결정 5가지 — **✅ 전체 확정 (2026-08-04)**

원래 리뷰용이었으나 기획자와 논의 후 8개 모두 확정. 각 결정의 근거·대안·탈출구는 유지 (Phase 2 재검토 시 참고용).

### 결정 1 — 팀원 자격 판정: **명시 초대 (마스터 수동 등록)** ✅ 확정 (Revision 2)

- **채택**: 마스터가 봇 UI 에서 GitHub username 을 명시적으로 팀원 리스트에 추가. `TEAM_CONFIG.members[]` 배열에 저장. 팀원 로그인 시 login 이 이 배열에 있는지로 자격 판정
- **확정 배경 (2026-08-04)**: 기획자 확인 — 정책 레포 read 권한이 `@blumn/planners` 같은 넓은 GitHub team 에 부여되어 있어 자동 판정 시 원치 않은 사용자 접근 발생. 안전을 위해 명시 초대 채택
- **부가 판정 (선택)**: 마스터가 팀원 초대할 때 "이 사용자가 정책 레포 read 권한 있는지 자동 검증" (`GET /repos/{repo}` with user token) → 없으면 경고 표시. 초대 자체는 허용 (마스터 override 가능)
- **팀원 역할**: `role: "master" | "member"` 필드. 마스터만 팀원 초대·제거·설정 변경 가능
- **대안 (기각)**: 자동 판정 (Revision 1 채택안) → GitHub team 범위가 QA봇 팀 범위보다 넓어 부적합
- **UI 필요**: 팀원 초대 (username 입력), 팀원 리스트 조회, 팀원 제거, role 변경 (마스터 이양)
- **예상 개발**: +2일

### 결정 2 — GitHub 쓰기 권한: **마스터 PAT + 만료 D-30 배너** ✅ 확정 (Revision 3)

- **채택**: 마스터가 setup 시 PAT 를 입력 → KV 에 AES-GCM 암호화 저장. 팀원 write 액션(기획전달, feedback)은 마스터 PAT 로 실행
- **확정 배경 (2026-08-04)**:
  - Rev2 에서 GitHub App 승격 결정 → Rev3 에서 회귀
  - 이유: 솔로 바이브코딩 시 GitHub App 은 JWT 서명 · installation flow · private key 관리 등이 얽혀 첫 시도에 성공 확률 낮음. 클로드코드 도움을 받아도 디버그 시간이 개발 시간의 몇 배가 될 수 있음
  - 대신 PAT 만료를 UX 로 커버 (D-30 배너 + 재입력 흐름)
- **PAT 만료 대응 (Rev3 핵심)**:
  - Worker 가 매일 1회 (또는 첫 요청 시) `GET /user` 호출로 PAT 만료일 확인
  - `TEAM_CONFIG.master_pat_expires_at` 필드에 저장
  - 만료 30일 전부터 마스터 접속 시 배너: "GitHub PAT 가 30일 후 만료됩니다. [재발급하고 붙이기]"
  - 만료 시 팀원 write 액션에 명확한 에러: "마스터 PAT 만료. 마스터에게 알려주세요"
- **커밋 attribution**: commit author = 마스터 계정, commit body 에 `요청자: @{username}` 명시
- **미래 마이그레이션 (Phase 4)**: GitHub App 으로 전환 시 마스터가 setup 다시 → App 설치. KV 스키마에 `github_app_installation_id` 필드 미리 준비 (지금은 null)
- **예상 개발**: PAT 저장·복호화·만료 체크·배너 = 약 3일 (Phase 1c 에 포함)

### 결정 3 — Anthropic 비용: **팀 공용 key + 팀원 1인당 rate limit** ✅ 확정 (Revision 2)

- **채택**: 팀 config 에 Anthropic key 1개. 사용은 **팀원 1인당 하루 50회** (기본값, 마스터가 팀 설정에서 조정 가능)
- **이유**: 팀원마다 개인 key 발급 불가능. 결제는 팀 단위가 자연스러움
- **확정 배경 (2026-08-04)**: 기획자 결정 — 20회는 부족. 50회로 시작. 카드 비용은 20회 대비 2.5배
- **비용 예시**: 팀원 10명 · 50회/일 · 30일 · 평균 2K input + 500 output token · Sonnet 4.6 기준
  - 월 최대 사용량 = 15,000 요청
  - 예상 월 비용 = 약 $50-100 (팀당)
- **월 예산 상한**: Phase 1 스코프 밖. 대신 rate limit 이 사실상의 상한 역할 (50회 × 인원 × 30일). 월 예산 상한 UI 는 Phase 3
- **사용량 기록**: `USAGE_LOG` KV 에 append (팀 · 사용자 · 타임스탬프 · 토큰 수). 조회 UI 는 Phase 3
- **경고 배너 (Phase 1 포함 추천)**: 팀원의 오늘 사용량이 rate limit 의 80% 초과 시 UI 배너로 경고

### 결정 4 — 팀 슬러그: **`{org}-{repo}` 자동 파생** ✅ 확정

- **채택**: `blumn/ad-team-policies` → 팀 슬러그 `blumn-ad-team-policies`. 1 레포 = 1 팀
- **이유**: 사용자가 팀 이름을 짓거나 기억할 필요 X. URL 로 팀 진입도 가능 (`/?team=blumn-ad-team-policies`)
- **표시 이름**: 마스터가 `team_name` 필드에 자유 표기 (예: "광고팀") → UI 는 이걸 노출, 내부는 슬러그로 참조
- **대안 (기각)**: 마스터가 자유 팀 이름 → 슬러그 중복·오탈자 관리 필요
- **한 레포 여러 팀 필요 시**: 이 요구사항 나오면 재설계 (현재 없음)

### 결정 5 — 마스터 정체·이양: **최초 생성자 고정 · 이양은 KV 수동 스크립트** ✅ 확정 (Revision 3)

- **채택**: 팀 최초 생성자가 마스터. `TEAM_CONFIG.master_github_login` 에 고정. 이양이 필요하면 문서화된 CLI 스크립트로 KV 직접 수정
- **확정 배경 (2026-08-04)**:
  - Rev2 에서 이양 UI 승격 → Rev3 에서 회귀
  - 이유: 솔로 바이브코딩 시 UI 자체는 어렵지 않지만, 이양 시 세션 무효화 · 진행 중 작업 처리 · rollback 경로 등 엣지케이스가 많음. 실제 이양 빈도가 낮은 것 대비 구현 비용 큼
  - 대신 CLI 스크립트로 대체 — 마스터 퇴사 등 이양 필요 상황에 실행 (연 1-2회 예상)
- **이양 CLI 스크립트** (Phase 1c 에 포함):
  - `scripts/transfer-master.mjs <team_slug> <new_master_login>`
  - 실행 조건: 코어 메인테이너 or 팀 마스터 (Wrangler 로 인증)
  - 동작: KV 에서 `TEAM_CONFIG` 읽기 → `master_github_login` 교체 → members 배열의 role 스왑 → 저장
  - README 에 사용법 명시
- **공동 마스터·정식 이양 UI**: Phase 2
- **예상 개발**: 스크립트 = 반나절 (Phase 1c 에 포함)

---

## 5. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Pages                         │
│  apps/qa-collab.html   ← 기존 개인 모드 wizard 유지          │
│  apps/qa-team.html     ← 신규: GitHub 로그인 진입점          │
│  apps/qa-planner.html  ← 기존 유지                            │
└────────────────────────────┬────────────────────────────────┘
                             │  fetch (with session cookie)
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                Cloudflare Worker (bot/worker/src/index.ts)  │
│                                                              │
│  기존 엔드포인트 (개인 모드 계속 지원):                       │
│    /qa /list-docs /doc /forward /feedback ...                │
│    ↑ X-Bot-* 헤더 있으면 그대로 사용 (개인 모드)               │
│    ↑ 없고 session cookie 있으면 팀 config 조회해서 주입         │
│                                                              │
│  신규 엔드포인트 (Phase 1):                                   │
│    /auth/github/login           ← OAuth 시작                  │
│    /auth/github/callback        ← OAuth 완료 · 세션 발급        │
│    /auth/logout                                              │
│    /me                           ← 현재 사용자 · 소속 팀 목록     │
│    /team                         ← 팀 생성 (POST) · 조회 (GET) │
│    /team/config                  ← 팀 config 수정 (마스터 only)  │
│    /team/members                 ← 팀원 목록 조회               │
│                                                              │
└────────────────────────────┬────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ↓              ↓              ↓
       ┌───────────┐  ┌───────────┐  ┌───────────┐
       │ KV (팀)   │  │ KV (세션)  │  │ KV (사용량) │
       │TEAM_CONFIG│  │USER_SESSION│ │USAGE_LOG  │
       └───────────┘  └───────────┘  └───────────┘
              │              │              │
              ↓              ↓              ↓
       GitHub API      GitHub OAuth    Anthropic API
       (repo read/     (identity)      (팀 key)
        write)
```

**핵심 원리**: 개인 모드(X-Bot-* 헤더)와 팀 모드(session cookie)를 **같은 Worker 에서 병존**. 요청 처리 초입에서 인증 소스만 분기 → 이후 로직 100% 재사용.

---

## 6. 데이터 모델 (Cloudflare KV)

### 6.1 `TEAM_CONFIG`

```
key:    team:{team_slug}
        예) team:blumn-ad-team-policies

value:  {
  "team_slug": "blumn-ad-team-policies",
  "team_name": "광고팀",
  "github_repo": "blumn/ad-team-policies",
  "policies_dir": "docs/policies",
  "storyboards_dir": "docs/storyboards",
  "code_repo": "blumn/ad-admin-frontend",
  "planner_password": "...",
  "master_github_login": "jane",
  "master_pat_encrypted": "<AES-GCM(env.SECRET_KEY, pat)>",
  "anthropic_key_encrypted": "<AES-GCM(env.SECRET_KEY, key)>",
  "member_source": "repo_collaborators",   // 또는 "explicit_list"
  "explicit_members": [],                  // member_source=explicit_list 일 때만
  "rate_limit_per_day": 20,
  "created_at": "2026-08-04T10:00:00Z",
  "updated_at": "2026-08-04T10:00:00Z"
}
```

**암호화**: Web Crypto API `AES-GCM`. `env.SECRET_KEY` 는 Worker secret (`wrangler secret put SECRET_KEY`). 키 회전은 Phase 2.

### 6.2 `USER_SESSION`

```
key:    session:{session_id}    // session_id = crypto.randomUUID()
value:  {
  "github_login": "alice",
  "github_id": 12345,
  "github_access_token_encrypted": "<...>",
  "created_at": "...",
  "expires_at": "..."           // 7일 (rolling)
}
TTL: 7일 (KV expirationTtl)
```

**쿠키**: `bot_session=<session_id>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`

### 6.3 `USAGE_LOG`

```
key:    usage:{team_slug}:{yyyymmdd}:{github_login}
value:  {
  "count": 12,                  // 오늘 사용 횟수
  "tokens_input": 45230,
  "tokens_output": 8910,
  "last_at": "2026-08-04T15:30:00Z"
}
TTL: 90일 (감사·rate limit 용도)
```

**Rate limit 판정**: `/qa` 요청 시 `usage:{team}:{today}:{user}.count >= rate_limit_per_day` → 429 반환.

### 6.4 사용자 → 팀 매핑 (역인덱스)

`GET /me` 응답 속도를 위해 KV에 역인덱스 유지:

```
key:    user_teams:{github_login}
value:  ["blumn-ad-team-policies", "blumn-crm-policies"]
```

팀 생성·삭제·멤버 변경 시 이 인덱스 동기 업데이트. 인덱스가 stale 이어도 실제 접근 시엔 GitHub API 재검증하므로 보안 문제 X (성능 최적화용).

---

## 7. GitHub OAuth 흐름

### 7.1 사전 준비 (1회, 코어 메인테이너)

1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App
2. Application name: `blumnAI QA Bot`
3. Homepage URL: `https://qa.blumnai.ai`
4. Authorization callback URL: `https://qa.blumnai.ai/auth/github/callback`
5. 발급된 `Client ID` · `Client Secret` 을 Worker secret 으로 등록:
   ```
   wrangler secret put GITHUB_OAUTH_CLIENT_ID
   wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
   wrangler secret put SECRET_KEY   # AES-GCM key (32-byte random hex)
   ```

### 7.2 OAuth 스코프

- **팀원**: `read:user`, `read:org` (identity + org membership 확인용)
  - `repo` 도 필요? → **네**, private 정책 레포 접근 판정을 위해. private repo 가 없으면 `public_repo` 로 축소 가능
- **마스터**: 위 + `repo` (반드시. write 액션은 마스터 PAT 로 하지만, setup 시 레포 존재 확인용)

Phase 1 은 스코프를 단순화해서 **팀원·마스터 모두 `read:user read:org repo`** 요청. 축소는 Phase 2 에 최적화.

### 7.3 흐름 (팀원 로그인)

```
브라우저                    Worker                    GitHub
  │                          │                          │
  │  GET /auth/github/login  │                          │
  ├─────────────────────────>│                          │
  │                          │  state = random(32)      │
  │                          │  KV set state:{state}    │
  │  302 → github.com/login  │                          │
  │<─────────────────────────┤                          │
  │                                                     │
  │  GET github.com/login/oauth/authorize?              │
  │      client_id=...&scope=repo,read:org&state=...    │
  ├──────────────────────────────────────────────────────>
  │                                                     │
  │  (사용자 승인)                                        │
  │  302 → qa.blumnai.ai/auth/github/callback?code&state│
  │<──────────────────────────────────────────────────────
  │                          │                          │
  │  GET /auth/github/       │                          │
  │       callback?code=...  │                          │
  ├─────────────────────────>│                          │
  │                          │  state 검증               │
  │                          │  POST access_token 교환   │
  │                          ├─────────────────────────>│
  │                          │<─────────────────────────┤
  │                          │  GET /user               │
  │                          ├─────────────────────────>│
  │                          │<─────────────────────────┤
  │                          │  session 생성 · KV 저장    │
  │                          │  Set-Cookie: bot_session │
  │  302 → /                 │                          │
  │<─────────────────────────┤                          │
```

### 7.4 팀 소속 판정 (로그인 후 매 요청)

`/me` 응답에 소속 팀 목록 반환. 매 요청마다 GitHub API 호출은 비용이 크므로:

- 세션 생성 시 `user_teams:{login}` 인덱스로 후보 팀 목록 조회 (KV read 1회)
- 각 후보 팀에 대해 `GET /repos/{team_repo}` 호출 → 200 이면 소속 확정
- 결과를 세션 (`USER_SESSION.verified_teams`) 에 캐시 (1시간)

**신규 팀 자동 감지**: 사용자가 아직 어느 팀 슬러그도 인덱스에 없어도, `/me` 응답에 "새 팀 참여" 링크 → 마스터가 공유한 팀 슬러그를 붙여넣으면 재검증.

---

## 8. Worker API 엔드포인트

Phase 1 신규 엔드포인트 (기존 `/qa` `/list-docs` 등은 변경 없이 인증 소스만 확장):

| Method | Path | 용도 | 인증 | 응답 |
|---|---|---|---|---|
| GET | `/auth/github/login` | OAuth 시작 | 없음 | 302 GitHub |
| GET | `/auth/github/callback` | OAuth 완료 | state cookie | 302 / + session cookie |
| POST | `/auth/logout` | 로그아웃 | session | 200, cookie 삭제 |
| GET | `/me` | 현재 사용자 · 소속 팀 목록 | session | `{login, teams: [{slug, name, role}]}` |
| POST | `/team` | 팀 생성 | session | `{team_slug}` |
| GET | `/team/{slug}` | 팀 config 조회 (secrets 제외) | session (팀원) | `{team_name, github_repo, ...}` |
| PATCH | `/team/{slug}/config` | 팀 config 수정 | session (마스터) | 200 |
| GET | `/team/{slug}/members` | 팀원 목록 조회 | session (팀원) | `{members: [{login, last_seen, usage_today}]}` |
| POST | `/team/{slug}/leave` | 팀 나가기 (본인만) | session (팀원) | 200 |

**기존 엔드포인트 변경**:

- `/qa`, `/list-docs`, `/doc`, `/forward`, `/feedback` 등:
  - 요청 인증 소스 우선순위: (1) session cookie → 팀 config 로드 (2) X-Bot-* 헤더 → 개인 모드 (기존)
  - `scopeEnvFromRequest()` 함수를 확장: session 있으면 `env.GITHUB_TOKEN` = 팀 config 의 master_pat, `env.ANTHROPIC_API_KEY` = 팀 anthropic_key 로 override
  - Rate limit 체크 추가 (`/qa` 만): `usage:{team}:{today}:{user}.count >= rate_limit_per_day` → 429

---

## 9. UI 흐름

### 9.1 신규 화면: `apps/qa-team.html` (팀 진입점)

```
┌────────────────────────────────────────┐
│  🎯 blumnAI QA Bot                     │
│                                        │
│  팀 계정으로 시작하세요                    │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  [🐙 GitHub 으로 로그인]          │  │
│  └──────────────────────────────────┘  │
│                                        │
│  또는                                    │
│                                        │
│  개인 설정으로 시작 (기존 방식) →         │
│    ↑ apps/qa-collab.html 로 이동         │
│                                        │
└────────────────────────────────────────┘
```

기본 진입 URL 을 `qa-team.html` 로 바꾸고, 개인 모드는 옵션으로.

### 9.2 로그인 후 라우팅

```
GET /me 결과에 따라:

teams.length === 0:
  → "환영합니다. 팀을 만드시겠습니까? 또는 마스터가 공유한 팀 슬러그를 입력하세요"
  → [+ 새 팀 만들기]  →  9.3 팀 생성 wizard
  → [팀 참여]         →  슬러그 입력 → 재검증

teams.length === 1:
  → 자동으로 qa-collab.html?team={slug} 진입
  → 세션 cookie 로 팀 config 자동 로드
  → 좌측 상단에 팀 이름 · 마스터/팀원 뱃지 표시

teams.length > 1:
  → 팀 선택 화면 (카드 리스트)
```

### 9.3 팀 생성 wizard (마스터 전용)

기존 `openSaasWizard()` UI 를 거의 그대로 재사용. 차이:

- **GitHub PAT 입력** → 그대로 (마스터 PAT, 서버 저장)
- **Anthropic Key 입력** → 그대로 (팀 공용, 서버 저장)
- 저장 버튼: `[💾 저장하고 팀 시작]` → `POST /team` → 팀 슬러그 반환 → `qa-collab.html?team={slug}` 로 이동

Preflight 체크 (§10 [11-SAAS-TEAM-MODE-DESIGN.md 이전 답변에서 다룬] 을 함께 붙이면 이상적) — 최소 3가지:
- PAT 유효성 (`GET /user`)
- 레포 접근권 (`GET /repos/{repo}`)
- Anthropic key 유효성 (min `POST /v1/messages`)

### 9.4 팀원 관리 화면 (마스터 전용)

`qa-collab.html` 좌측 상단에 마스터에게만 `[👥 팀원]` 버튼 노출:

```
┌─ 광고팀 팀원 (7명) ────────────────────┐
│                                        │
│ 팀원 자격: [자동 · repo collaborator ▼] │
│                                        │
│ 이름              마지막 접속  오늘 사용   │
│ ─────────────────────────────────────  │
│ @jane (마스터)    방금           12/20   │
│ @alice           2시간 전         3/20   │
│ @bob             어제             0/20   │
│ ...                                    │
│                                        │
│ 팀원 자격을 좁히려면:                     │
│  ↑ 위 드롭다운을 "명시 리스트" 로 변경      │
│                                        │
│ Rate limit: 인당 [20] 회/일  [저장]      │
└────────────────────────────────────────┘
```

### 9.5 팀원 화면 (마스터가 아닌 경우)

- 세팅 wizard · `[⚙️]` 버튼 **숨김**
- `[👥 팀원]` 은 조회만 가능 (rate limit 조정 UI 없음)
- 나머지 봇 UX 는 개인 모드와 동일

---

## 10. 보안 · 위협 모델

### 10.1 위협 목록 · 대응

| # | 위협 | 대응 |
|---|---|---|
| T1 | Anthropic key 유출 (KV 덤프) | AES-GCM 암호화 저장. Worker secret `SECRET_KEY` 없이는 복호화 불가 |
| T2 | 마스터 PAT 유출 (동상) | 동상 |
| T3 | 팀원 아닌 사용자가 팀 API 호출 | 매 요청 session → 팀원 여부 재검증. 캐시 만료 시 GitHub API 재확인 |
| T4 | 다른 팀 config 조회 | `/team/{slug}` 요청마다 요청자 소속 팀에 slug 있는지 확인 |
| T5 | Anthropic 크레딧 소진 공격 (팀원이 봇 남용) | Rate limit 20/day/user. Phase 2 에 월 예산 상한 추가 |
| T6 | CSRF | Session cookie `SameSite=Lax`. 상태 변경 API (`POST/PATCH`) 는 `X-CSRF-Token` 헤더 요구 |
| T7 | 세션 하이재킹 | HttpOnly · Secure · 7일 rolling · 로그아웃 시 KV 즉시 삭제 |
| T8 | 마스터 PAT 만료 → write 액션 무한 실패 | Worker 에서 401 감지 시 마스터에게 알림 (Phase 1: 화면 배너, Phase 3: 이메일) |
| T9 | 팀원이 stale 하게 팀에 남아있음 (퇴사 후) | GitHub 에서 repo access 회수되면 다음 세션 재검증에서 자동 배제. **캐시 기간 (1시간) 동안은 접근 가능** — 허용 |
| T10 | XSS 로 세션 탈취 | 이미 escapeHtml 적용. CSP 헤더 추가 (`script-src 'self'`) |

### 10.2 시크릿 관리

**Worker secrets (wrangler)**:
```
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
SECRET_KEY                # 32-byte hex, AES-GCM 마스터 키
```

**팀 시크릿 (KV, 암호화)**:
- `master_pat_encrypted`
- `anthropic_key_encrypted`

**세션 시크릿 (KV, 암호화)**:
- `github_access_token_encrypted`

**절대 응답에 노출 X**: `/team/{slug}` 응답에서 `*_encrypted` 필드 필터링 필수 (marshalling 유틸에서 강제).

### 10.3 감사 로깅 (Phase 1 은 저장만)

`AUDIT_LOG:{team}:{yyyymm}` 에 append (JSON lines):
```
{ts, action, user, target, result}
```

기록 대상: `team.create`, `config.update`, `member.add`, `member.remove`, `login`, `logout`, `qa.request`, `forward.commit`, `rate_limit.hit`

조회 UI 는 Phase 3.

---

## 11. 마이그레이션 · 하위 호환

### 11.1 기존 개인 모드 사용자

- `apps/qa-collab.html` 유지 · 로직 무변경
- 팀 모드 진입점(`qa-team.html`)은 별도 URL 로 배포 · 두 URL 이 같은 Worker 를 씀
- 개인 모드 사용자는 그대로 사용 가능 · 원하면 팀 모드로 전환

### 11.2 기존 팀 모드 (config.yml 을 팀 레포에 심는 원래 방식)

- 유지 · 무변경. `apps/qa-collab.html:820-829` 의 config.yml 자동 로드 로직 그대로
- 두 팀 모드 (파일 기반 vs SaaS 팀) 는 공존. 코어 메인테이너는 팀에 어느 쪽을 권장할지 문서화

### 11.3 세 모드 우선순위 (요청 처리 시)

```
1. X-Bot-* 헤더 있음                → 개인 SaaS 모드 (기존)
2. session cookie 있고 유효         → 팀 SaaS 모드 (신규 Phase 1)
3. config.yml 이 Pages 로부터 로드됨 → 팀 파일 모드 (기존)
4. 위 모두 없음                      → wizard (개인 모드 기본)
```

우선순위 로직은 `apps/qa-collab.html:818-843` `getConfig()` 를 확장. `bot/worker/src/index.ts:64-75` `scopeEnvFromRequest()` 도 세션 처리 분기 추가.

---

## 12. 오픈 이슈

### ✅ O2 — OAuth 스코프 최소화 (해소 · 2026-08-04)

- **확정**: 팀원·마스터 모두 `read:user read:org` 만 요청. `repo` 는 팀원 OAuth 에서 제외
- **이유**: 팀원 write 는 마스터 PAT 로 처리하므로 팀원 OAuth 에 `repo` 불필요. 팀원이 "이 봇에 문서 수정권까지 주는 건가?" 하고 겁먹지 않도록
- **결과**: private 정책 레포 read 판정은 팀원 OAuth 만으로 가능한지 재검증 필요 → GitHub 은 `read:org` + 사용자가 org member 이면 private repo read API (`GET /repos/{repo}`) 가 동작함. 만약 특정 org 설정에서 이게 안 되면 fallback 으로 `repo` 스코프 추가 요청

### ✅ O3 — 팀원 자격 캐시 시간 (해소 · 2026-08-04)

- **확정**: **1시간**
- **이유**: 퇴사자 접근 lag(최대 1시간) 과 GitHub API rate limit 부담(1시간에 한 번 재검증) 사이 표준 값
- **조정 여지**: 실사용 후 GitHub 5000/hr rate limit 여유 있으면 15분으로 단축 검토

### ✅ O6 — 팀당 여러 프로젝트 (해소 · 2026-08-04 · Revision 2)

- **확정**: **Phase 1 부터 여러 프로젝트 지원**. `TEAM_CONFIG.projects[]` 배열 + 프로젝트 CRUD UI + 프로젝트 선택 UI 모두 Phase 1 포함
- **확정 배경 (2026-08-04)**: 기획자 확인 — 실제 팀 구조가 다중 프로젝트임
  - 예 1: **헤이데어** = admin + backoffice (1 GitHub 레포에 2 프로젝트)
  - 예 2: **해피톡** = AI챗봇 + 채팅상담 (1 GitHub 레포에 2 프로젝트)
  - 팀 = 1 GitHub 레포는 유지 (결정 4 그대로), 그 안에 N 프로젝트
- **프로젝트 스키마** (`TEAM_CONFIG.projects[]` 원소):
  ```
  {
    "id": "admin_v1",                    // 마스터가 지정 (영문 소문자)
    "label": "어드민 v1",                 // UI 표시명
    "policies_dir": "projects/admin_v1/docs/policies",
    "storyboards_dir": "projects/admin_v1/docs/storyboards",
    "code_repo": "blumn/heythere-admin"  // 선택, 프로젝트별 다를 수 있음
  }
  ```
- **프로젝트 관리 UI (마스터 전용)**:
  - 프로젝트 리스트 조회 · 추가 · 편집 · 삭제
  - 프로젝트 추가 시: id · label · policies_dir · storyboards_dir · code_repo 입력. `policies_dir` 경로 자동 검증
- **프로젝트 선택 UI (전체 사용자)**:
  - 봇 화면 좌측 상단에 프로젝트 드롭다운 (프로젝트 1개면 숨김)
  - 선택된 프로젝트의 정책·화면설계서만 좌측 리스트에 노출
- **Rate limit 적용**: 팀 통합 (프로젝트별 X). 팀원 한 명이 어느 프로젝트에서 물어보든 하루 50회 카운트에 합산
- **기존 파일 모드와 관계**: 기존 파일 모드도 `projects[]` 배열 지원 → 스키마 동일 → 파일 모드에서 SaaS 팀 모드로 마이그레이션 시 config.yml 그대로 KV 에 부으면 됨
- **예상 개발**: +5일 (프로젝트 CRUD API · UI · 선택기 · 문서)

---

### 🟡 미결정 (Phase 1 착수 전 코어 메인테이너 판단)

#### O1 — Cloudflare KV vs D1

- **KV**: 간단, 무료 tier 넉넉, eventual consistency (팀 config 변경 반영에 최대 60초)
- **D1** (SQLite): 관계 쿼리 편함 (팀원 → 팀 조인), 강한 일관성, 무료 tier 있음
- **제안**: Phase 1 은 KV (구현 단순). 사용량·감사 로그가 커지면 Phase 3 에 D1 로 이관
- **결정자**: 코어 메인테이너 (기술 세부 · 기획자 개입 불필요)

#### O4 — `/me` 응답에 GitHub 토큰 노출 여부

- 프론트가 GitHub API 를 직접 호출할 일 있으면 필요 (예: 사용자 프로필 사진)
- 노출 X 가 안전 · 필요 시 Worker 프록시로 대응
- **제안**: 노출 X. avatar 는 GitHub CDN 이 public 이므로 login 만 있으면 URL 조립 가능
- **결정자**: 코어 메인테이너 (기술 세부)

#### O5 — 마스터 퇴사 처리 (Phase 1 임시 대응 확정, 정식 UI 는 Phase 2)

- Phase 1: 코어 메인테이너가 KV 직접 수정 (수동)
- Phase 2: 마스터 이양 UI 추가
- **결정 완료**: 결정 5 에 반영됨

---

## 13. 롤아웃 · 테스트 계획

### 13.1 개발 순서 (Phase 1 · 약 3-4주 · Revision 3 · 솔로 바이브코딩)

Phase 1a/1b/1c 세 단계로 분할. **각 단계 종료마다 배포 가능 상태** — 도중 멈춰도 유효한 산출물 남음.

#### 🟢 Phase 1a — 최소 MVP (약 5일, 1주)

**목적**: 지금 localStorage 저장을 서버측(KV)으로 이동. 팀 공유 실현. 로그인·역할 X.

| 일 | 작업 |
|---|---|
| D1 | Cloudflare KV namespace 생성 (`TEAM_CONFIG`) · `wrangler.toml` 바인딩 · 로컬에서 KV read/write 테스트 |
| D2 | Worker 에 `GET/PUT /team/{slug}` 엔드포인트 추가 (인증 없음, URL 슬러그만) · 기존 `/health` 에 KV 상태 표시 |
| D3 | 프론트 (`qa-collab.html`) 의 `getConfig()` 확장: URL 에 `?team={slug}` 있으면 KV 에서 불러오기 (localStorage 대신) |
| D4 | 마스터 wizard 저장 시 KV 에도 저장 (localStorage 는 캐시로만 유지) · 마스터 hardcode: 첫 저장자의 브라우저 = 마스터 |
| D5 | 로컬 통합 테스트 · staging 배포 · 팀 URL 하나 공유해서 동료 접속 테스트 |

**Phase 1a 종료 시점 기능**:
- ✅ 마스터 1명이 wizard 채우면 KV 에 저장
- ✅ 다른 팀원이 URL 접속 → 자동으로 마스터 설정 사용 (localStorage 없이)
- ✅ **지금 하네스 충돌 해결** (레포에 뭘 심을 필요 없음)
- ❌ 로그인 없음 · URL 아는 사람 = 접근 가능 (**사내 전용**)
- ❌ 세팅 수정은 첫 저장자의 그 브라우저에서만

#### 🟡 Phase 1b — GitHub OAuth + 명시 초대 (약 2주)

**목적**: 팀 URL 공유가 아닌 로그인 기반 접근. 마스터·팀원 역할 구분.

| 주 | 작업 |
|---|---|
| **W2 D1-2** | GitHub OAuth App 등록 (Developer settings) · Worker 에 `GITHUB_OAUTH_CLIENT_ID/SECRET` secret · `/auth/github/login` · `/auth/github/callback` |
| **W2 D3-4** | Session KV (`USER_SESSION`) · `bot_session` cookie · `/me` 엔드포인트 · 로그아웃 |
| **W2 D5** | 프론트 `apps/qa-team.html` (로그인 진입점) · 로그인 성공 시 팀 선택/자동 이동 |
| **W3 D1-2** | `TEAM_CONFIG.members[]` 스키마 · 팀원 초대 API (`POST /team/{slug}/members`) · 제거 API |
| **W3 D3** | 팀원 관리 UI (마스터 전용) · [👥 팀원] 버튼 · role gate ([⚙️] 마스터만) |
| **W3 D4-5** | `scopeEnvFromRequest()` 확장 (session → 팀 config 로드) · 통합 테스트 · staging |

**Phase 1b 종료 시점 기능**:
- ✅ GitHub 로그인 필수
- ✅ 마스터가 GitHub username 으로 팀원 명시 초대
- ✅ 마스터만 세팅 수정
- ✅ 팀원은 지정된 팀만 자동 진입 (여러 팀 소속 시 선택)
- ❌ 프로젝트 1개만 (하나의 policies_dir)
- ❌ PAT 만료 대응 없음

#### 🔵 Phase 1c — 다중 프로젝트 + PAT 만료 UX (약 1주)

**목적**: 실제 팀 구조 반영 (다중 프로젝트) · PAT 만료 대비.

| 일 | 작업 |
|---|---|
| D1-2 | `TEAM_CONFIG.projects[]` 스키마 · 프로젝트 CRUD API (`POST/PATCH/DELETE /team/{slug}/projects`) |
| D3 | 프로젝트 CRUD UI (마스터 전용) · 프로젝트 추가 wizard |
| D4 | 프로젝트 선택 드롭다운 UI (좌측 상단, 프로젝트 2개 이상일 때만 노출) · 기존 `/list-docs?project=` 흐름 연동 |
| D5 | PAT 만료 체크 (`GET /user` 결과의 `x-github-scopes` 확인) · `master_pat_expires_at` KV 저장 · D-30 배너 · rate limit 80% 경고 배너 · `scripts/transfer-master.mjs` · staging |

**Phase 1c 종료 시점 기능**:
- ✅ 팀당 여러 프로젝트 관리 (헤이데어 = admin/backoffice 등)
- ✅ 프로젝트 선택 드롭다운
- ✅ Rate limit 50회/일 · 80% 경고
- ✅ PAT 만료 D-30 배너
- ✅ 마스터 이양 CLI 스크립트

### 13.2 테스트 시나리오 (Rev 3)

Phase 1a 종료 시:
- **T1**: 마스터가 wizard 저장 → 다른 브라우저에서 같은 URL 접속 → 봇 즉시 사용
- **T2**: KV 삭제 → 봇에 다시 wizard 뜸

Phase 1b 종료 시:
- **T3**: 팀원 아닌 사용자가 팀 URL 접속 → 로그인 후 "권한 없음" 안내
- **T4**: 마스터가 팀원 초대 → 팀원 재접속 → 자동 진입
- **T5**: 팀원이 [⚙️] 클릭 시도 → 접근 거부

Phase 1c 종료 시:
- **T6**: 마스터가 프로젝트 추가 → 좌측 드롭다운에 노출 → 프로젝트별 정책 리스트 필터링 동작
- **T7**: PAT 만료 D-30 시뮬레이션 → 배너 표시
- **T8**: 팀원 rate limit 40회 도달 → 80% 경고 배너 · 50회 도달 → 429

### 13.3 파일럿 → GA 판정 기준 (Rev 3)

- Phase 1a: 사내 팀 1개, 팀원 3명 이상, 1주일 실사용, 크리티컬 버그 0
- Phase 1b: 위 + 로그인 기반 · 팀원 초대 흐름 검증
- Phase 1c: 위 + 다중 프로젝트 팀 1개 파일럿 (예: 헤이데어)

### 13.2 테스트 시나리오

- **T1 마스터 신규 팀 생성** → 다른 브라우저에서 팀원 로그인 → 봇 즉시 사용
- **T2 팀원 rate limit 도달** → 429 · 다음 날 초기화
- **T3 마스터 PAT 만료** → write 액션 401 → 화면 배너 표시 → 마스터 재입력 → 정상화
- **T4 팀원 GitHub 에서 repo access 회수** → 캐시 만료 후 접근 차단
- **T5 개인 모드 사용자 무영향** — X-Bot-* 헤더 요청이 그대로 동작하는지
- **T6 팀 파일 모드 (config.yml) 무영향** — 기존 배포된 팀 봇이 그대로 동작하는지
- **T7 CSRF** — 다른 origin 에서 `POST /team` 시도 → 거부

### 13.3 파일럿 → GA 판정 기준

- 파일럿 팀 3개 이상, 팀당 팀원 5명 이상 사용 1주
- 심각도 P0/P1 이슈 0건
- 세팅 → 첫 사용까지 소요 시간 마스터 <5분, 팀원 <30초

---

## 13.4 🚀 Phase 1a 착수 체크리스트 (솔로 바이브 · 내일 바로 시작 가능)

**목표**: 5일 안에 "팀 공유되는 봇" 손에 잡기. 지금 하네스 충돌 해결.

### 사전 준비 (착수 전 30분)

- [ ] Cloudflare 대시보드 접속 확인 (이메일·비밀번호)
- [ ] `wrangler` CLI 로그인 상태 확인 (`npx wrangler whoami`)
- [ ] 기존 Worker (`bot/worker/`) 로컬 실행 확인 (`npx wrangler dev`)
- [ ] 기존 봇 URL 이 정상 동작하는지 브라우저에서 확인
- [ ] **VS Code + 클로드코드** 창 준비. 이 문서 §13.1 Phase 1a 표를 열어둠

### D1 — KV 생성 · 바인딩 (하루)

- [ ] `npx wrangler kv namespace create TEAM_CONFIG` 로 namespace 생성 → ID 획득
- [ ] `bot/worker/wrangler.toml` 에 `[[kv_namespaces]] binding = "TEAM_CONFIG", id = "..."` 추가
- [ ] `bot/worker/src/index.ts` 의 `Env` interface 에 `TEAM_CONFIG: KVNamespace` 추가
- [ ] 로컬 (`wrangler dev`) 에서 KV put/get 동작 확인용 임시 코드 삽입 → 확인 후 제거

**클로드코드 프롬프트 예시**:
```
bot/worker/src/index.ts 의 Env interface 에 TEAM_CONFIG: KVNamespace 를
추가해줘. wrangler.toml 도 함께 업데이트해서 kv_namespaces binding 설정.
로컬 wrangler dev 로 put/get 테스트할 수 있게 임시 /kv-test 엔드포인트도
붙여줘 (나중에 제거).
```

### D2 — Worker `/team/{slug}` 엔드포인트 (하루)

- [ ] `GET /team/{slug}` — KV 에서 `TEAM_CONFIG` 읽어 반환 (secrets 는 마스킹)
- [ ] `PUT /team/{slug}` — 요청 body 를 KV 에 저장 (Phase 1a 는 인증 없이, 나중에 붙임)
- [ ] `/health` 응답에 KV 접근 상태 표시
- [ ] 로컬 curl 로 테스트

### D3 — 프론트 `getConfig()` 확장 (하루)

- [ ] `apps/qa-collab.html` 의 [getConfig()](../apps/qa-collab.html#L818) 에 4번째 소스 추가:
  ```
  4. URL 에 ?team={slug} 있으면 → GET /team/{slug} 호출 → KV 값 사용
  ```
- [ ] 우선순위: URL team param > localStorage > config.yml
- [ ] `saasToTeamConfig()` 재사용해서 downstream 100% 호환

### D4 — 마스터 wizard 저장 시 KV 동기화 (하루)

- [ ] [openSaasWizard()](../apps/qa-collab.html#L888) 의 저장 로직에 `PUT /team/{slug}` 추가
- [ ] 슬러그 파생: `github_repo` 를 `-` 로 치환 (`blumn/ad-team-policies` → `blumn-ad-team-policies`)
- [ ] 저장 성공 시 사용자에게 팀 URL 안내 (`https://.../?team=blumn-ad-team-policies`) → "이 링크를 팀원에게 공유하세요"

### D5 — 통합 테스트 · 배포 · 파일럿 (하루)

- [ ] 로컬에서 마스터 wizard → KV 저장 → 다른 브라우저(시크릿 모드)로 팀 URL 접속 → 자동 진입 확인
- [ ] Anthropic key · GitHub PAT 가 응답에 노출 안 되는지 확인 (`/team/{slug}` 응답 검사)
- [ ] `npx wrangler deploy` 로 staging 배포
- [ ] 실제 팀원 1-2명에게 팀 URL 공유 → 접속 · 봇 사용 검증
- [ ] 이슈 발견 시 targeted fix

### 👇 Phase 1a 종료 후 판단

- ✅ 잘 됨 → Phase 1b (OAuth · 명시 초대) 착수
- 🟡 부분적 이슈 → Phase 1a 안정화 며칠 더
- 🔴 큰 문제 → 재검토 (설계 조정 or 도움 요청)

### ⚠ Phase 1a 주의사항 (솔로 바이브 함정 회피)

1. **KV 는 eventual consistency** — put 직후 get 이 최신 값 아닐 수 있음 (최대 60초). 마스터 wizard 저장 직후 화면 리로드 시엔 localStorage 값 우선 사용
2. **secrets 응답 노출 절대 금지** — `/team/{slug}` 응답에서 `anthropic_key`, `github_token` 필드 마스킹. 실수하면 크레딧 유출
3. **CORS 확인** — 새 엔드포인트도 기존 CORS 헤더 적용됐는지 확인 ([bot/worker/src/index.ts:285-305](../bot/worker/src/index.ts#L285-L305))
4. **롤백 준비** — 각 커밋 전 이전 상태로 되돌릴 수 있는지 확인. 기존 개인 모드 완전 무영향 유지가 최우선

---

## 14. Phase 2+ 예고

Phase 1 이 안정화된 후:

- **Phase 2** (팀 관리 성숙): 마스터 이양, 공동 마스터, explicit 팀원 whitelist UI, 팀 삭제 UI
- **Phase 3** (관측성): 사용량 대시보드, 감사 로그 조회 UI, 월 예산 상한, 마스터에게 알림 이메일
- **Phase 4** (인프라 정석화): GitHub App 전환 (마스터 PAT 폐지), SSO (Okta), KV → D1 이관
- **Phase 5** (기능 확장): 팀 간 정책 공유, 팀 템플릿, 셀프 서브 팀 삭제, MSA 팀 (여러 조직 걸친)

---

## 부록 A — 참고 코드 위치

| 대상 | 위치 |
|---|---|
| 개인 SaaS config 로드 | [apps/qa-collab.html:818-843](../apps/qa-collab.html#L818-L843) |
| SaaS wizard UI | [apps/qa-collab.html:885-979](../apps/qa-collab.html#L885-L979) |
| SaaS → team config 변환 | [apps/qa-collab.html:846-863](../apps/qa-collab.html#L846-L863) |
| Worker 인증 헤더 처리 | [bot/worker/src/index.ts:64-75](../bot/worker/src/index.ts#L64-L75) |
| Worker `/health` 진단 | [bot/worker/src/index.ts:320-370](../bot/worker/src/index.ts#L320-L370) |
| CORS · SaaS 감지 | [bot/worker/src/index.ts:285-305](../bot/worker/src/index.ts#L285-L305) |

## 부록 B — 참고 링크

- [GitHub OAuth Apps 문서](https://docs.github.com/en/apps/oauth-apps)
- [Cloudflare Workers KV](https://developers.cloudflare.com/kv/)
- [Web Crypto AES-GCM](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt#aes-gcm)
- [SameSite Cookies (OWASP)](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
