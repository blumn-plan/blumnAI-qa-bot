#!/usr/bin/env bash
#
# Rancher v1 서비스를 upgrade -> finishupgrade 로 재배포한다.
#
# 사용법:  rancher-redeploy.sh <스택명> <서비스명>
#   예)    rancher-redeploy.sh blumnai-qa-bot-dev backend
#
# neo-neosign 의 동명 스크립트와 달리 스택명을 먼저 받는다. 이 레포는 dev/prod 스택에
# 같은 이름(frontend/backend/database)의 서비스를 두므로, 서비스명만으로는 대상이
# 유일하게 특정되지 않기 때문이다.
#
# 자격증명은 러너가 올라가 있는 호스트의 /etc/rancher-deploy/creds.env 에서 읽는다.
# GitHub Secrets / Variables 및 이 레포에는 값을 두지 않는다. 담기는 항목:
#   RANCHER_URL         Rancher v1 API 베이스 URL (예: http://172.18.1.110:8080)
#   RANCHER_ACCESS_KEY  Rancher API access key (또는 계정 ID)
#   RANCHER_SECRET_KEY  Rancher API secret key (또는 계정 비밀번호)
#
# 종료 코드:
#   0  재배포 완료 (state=active)
#   1  사전 조건 실패 (자격증명 없음 / 스택·서비스 미발견 / 서비스가 active 아님)
#   2  upgrade 호출 실패 — 컨테이너는 구버전 그대로, 서비스 영향 없음
#   3  upgrade 는 수락됐으나 upgraded 전환 타임아웃 — 사람이 확인해야 함
#   4  finishupgrade 실패 — 서비스가 upgraded 상태로 잔류, 사람이 확인해야 함

set -euo pipefail

STACK_NAME="${1:-}"
SERVICE_NAME="${2:-}"

# upgrade 후 state=upgraded 로 전환될 때까지의 최대 대기(초)
UPGRADED_TIMEOUT="${UPGRADED_TIMEOUT:-300}"
# finishupgrade 가 2xx 를 반환할 때까지의 최대 재시도 시간(초)
FINISH_TIMEOUT="${FINISH_TIMEOUT:-180}"
# state=active 로 안정화될 때까지의 최대 대기(초)
ACTIVE_TIMEOUT="${ACTIVE_TIMEOUT:-120}"
# 폴링 간격(초)
POLL_INTERVAL=5

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

log() { echo "[rancher-redeploy] $*"; }

# GitHub Actions 요약(run 페이지 상단)에 한 줄 기록한다. 로컬 실행 시에는 무시된다.
summary() {
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$*" >> "$GITHUB_STEP_SUMMARY"
  return 0
}

# 실패 사유를 요약에 남기고 지정한 코드로 종료한다.
# $1: 종료 코드, $2: 헤드라인, $3: 조치 안내
die() {
  local code="$1" headline="$2" action="$3"
  log "$headline"
  summary ""
  summary "### ❌ $headline"
  summary ""
  summary "$action"
  exit "$code"
}

if [ -z "$STACK_NAME" ] || [ -z "$SERVICE_NAME" ]; then
  echo "usage: $0 <stack-name> <service-name>" >&2
  exit 1
fi

# --------------------------------------------------------------------------
# 0) 자격증명 로드
#
# 러너 컨테이너에는 자격증명을 두지 않는다. 컨테이너가 재생성되면 소실되기 때문이다.
# 대신 러너가 올라가 있는 호스트의 파일을 마운트한 일회용 컨테이너로 읽어온다.
# (러너에는 /var/run/docker.sock 이 마운트되어 있어 호스트 데몬을 쓸 수 있다.)
#
# 호스트 파일: ${CREDS_DIR}/creds.env — RANCHER_URL / RANCHER_ACCESS_KEY /
# RANCHER_SECRET_KEY 를 KEY=VALUE 로 담는다. GitHub 및 이 레포에는 값을 두지 않는다.
# --------------------------------------------------------------------------
CREDS_DIR="${RANCHER_CREDS_DIR:-/etc/rancher-deploy}"
CREDS_IMAGE="${RANCHER_CREDS_IMAGE:-alpine:3}"

if [ -z "${RANCHER_URL:-}" ]; then
  log "호스트 ${CREDS_DIR}/creds.env 에서 자격증명 로드"
  if ! sudo docker run --rm -v "${CREDS_DIR}:/creds:ro" "$CREDS_IMAGE" \
        cat /creds/creds.env > "$WORKDIR/creds.env" 2>"$WORKDIR/creds.err"; then
    die 1 "호스트에서 Rancher 자격증명을 읽지 못했습니다" \
      "이 job 이 실행된 러너 호스트에 \`${CREDS_DIR}/creds.env\` 가 없습니다. 오류: \`$(head -c 200 "$WORKDIR/creds.err")\`"
  fi
  set -a
  # shellcheck disable=SC1091
  . "$WORKDIR/creds.env"
  set +a
  rm -f "$WORKDIR/creds.env"
fi

for var in RANCHER_URL RANCHER_ACCESS_KEY RANCHER_SECRET_KEY; do
  if [ -z "${!var:-}" ]; then
    die 1 "자격증명 항목 ${var} 가 비어 있습니다" \
      "러너 호스트의 \`${CREDS_DIR}/creds.env\` 에 \`${var}=...\` 줄이 있는지 확인하세요."
  fi
done

# 자격증명이 로그에 노출되더라도 GitHub 가 마스킹하도록 등록한다.
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "::add-mask::${RANCHER_ACCESS_KEY}"
  echo "::add-mask::${RANCHER_SECRET_KEY}"
fi

RANCHER_URL="${RANCHER_URL%/}"
AUTH="${RANCHER_ACCESS_KEY}:${RANCHER_SECRET_KEY}"

# GET 호출. 실패 시 비정상 종료한다.
# $1: /v2-beta 로 시작하는 경로
api_get() {
  curl -sS -f -u "$AUTH" -H 'Accept: application/json' --max-time 30 "${RANCHER_URL}$1"
}

# POST 액션 호출. 응답 본문은 $WORKDIR/action.json 에 쓰고 HTTP 상태코드를 표준출력한다.
# $1: 경로, $2: 요청 본문(없으면 빈 문자열)
api_post() {
  local path="$1" body="${2:-}"
  if [ -n "$body" ]; then
    curl -sS -o "$WORKDIR/action.json" -w '%{http_code}' \
      -u "$AUTH" -X POST -H 'Content-Type: application/json' \
      --max-time 60 -d "$body" "${RANCHER_URL}${path}"
  else
    curl -sS -o "$WORKDIR/action.json" -w '%{http_code}' \
      -u "$AUTH" -X POST -H 'Content-Type: application/json' \
      --max-time 60 "${RANCHER_URL}${path}"
  fi
}

# --------------------------------------------------------------------------
# 1) 대상 탐색 — 프로젝트(환경) 목록을 돌며 스택을 찾고, 그 스택 안에서 서비스를 찾는다.
#    서비스명이 스택마다 중복되므로 반드시 스택으로 한 번 좁힌 뒤 조회한다.
# --------------------------------------------------------------------------
log "스택 '${STACK_NAME}' 의 서비스 '${SERVICE_NAME}' 탐색 중"

PROJECT_ID=""
SERVICE_ID=""
for pid in $(api_get "/v2-beta/projects" | jq -r '.data[].id'); do
  api_get "/v2-beta/projects/${pid}/stacks?name=${STACK_NAME}" > "$WORKDIR/stack.json"
  [ "$(jq '.data | length' "$WORKDIR/stack.json")" -gt 0 ] || continue

  stack_id="$(jq -r '.data[0].id' "$WORKDIR/stack.json")"
  api_get "/v2-beta/projects/${pid}/stacks/${stack_id}/services?name=${SERVICE_NAME}" \
    > "$WORKDIR/found.json"
  if [ "$(jq '.data | length' "$WORKDIR/found.json")" -gt 0 ]; then
    PROJECT_ID="$pid"
    SERVICE_ID="$(jq -r '.data[0].id' "$WORKDIR/found.json")"
    break
  fi
done

if [ -z "$SERVICE_ID" ]; then
  die 1 "Rancher 에서 '${STACK_NAME}/${SERVICE_NAME}' 를 찾지 못했습니다" \
    "스택명 또는 서비스명이 바뀌었을 수 있습니다. Rancher UI 에서 실제 이름을 확인하세요. **이미지 push 는 이미 완료된 상태이므로 컨테이너만 수동으로 재배포하면 됩니다.**"
fi

SERVICE_PATH="/v2-beta/projects/${PROJECT_ID}/services/${SERVICE_ID}"
api_get "$SERVICE_PATH" > "$WORKDIR/svc.json"
CURRENT_STATE="$(jq -r '.state' "$WORKDIR/svc.json")"
IMAGE="$(jq -r '.launchConfig.imageUuid' "$WORKDIR/svc.json")"

log "대상: ${STACK_NAME}/${SERVICE_NAME} (${SERVICE_ID}, project ${PROJECT_ID}) state=${CURRENT_STATE} image=${IMAGE}"

# 최초 배포 시에는 서비스가 inactive 로 만들어져 있다. 이미지가 없어 기동할 수 없던
# 상태이므로, upgrade 대신 activate 로 올려주고 끝낸다.
if [ "$CURRENT_STATE" = "inactive" ]; then
  log "서비스가 inactive — 최초 기동(activate)으로 처리"
  HTTP="$(api_post "${SERVICE_PATH}/?action=activate")"
  if [[ ! "$HTTP" =~ ^2 ]]; then
    log "activate 응답 본문: $(head -c 500 "$WORKDIR/action.json")"
    die 2 "Rancher activate 호출 실패 (HTTP ${HTTP})" \
      "이미지 \`${IMAGE}\` 는 레지스트리에 정상 push 됐습니다. Rancher UI 에서 \`${STACK_NAME}/${SERVICE_NAME}\` 를 수동으로 Activate 하세요."
  fi

  DEADLINE=$(( $(date +%s) + ACTIVE_TIMEOUT ))
  while :; do
    STATE="$(api_get "$SERVICE_PATH" | jq -r '.state')"
    [ "$STATE" = "active" ] && break
    if [ "$(date +%s)" -ge "$DEADLINE" ]; then
      die 3 "activate 후 ${ACTIVE_TIMEOUT}초 내에 active 가 되지 않았습니다 (현재: ${STATE})" \
        "컨테이너가 기동에 실패하고 있을 수 있습니다. Rancher UI 에서 컨테이너 로그를 확인하세요."
    fi
    sleep "$POLL_INTERVAL"
  done

  RUNNING="$(api_get "${SERVICE_PATH}/instances" \
    | jq -r '[.data[] | select(.state == "running") | .name] | join(", ")')"
  log "최초 기동 완료 — running: ${RUNNING}"
  summary ""
  summary "### ✅ Rancher 최초 기동 완료"
  summary ""
  summary "| 항목 | 값 |"
  summary "|---|---|"
  summary "| 대상 | \`${STACK_NAME}/${SERVICE_NAME}\` (\`${SERVICE_ID}\`) |"
  summary "| 이미지 | \`${IMAGE}\` |"
  summary "| 실행 중 컨테이너 | ${RUNNING} |"
  exit 0
fi

# active 가 아니면 이전 배포가 정리되지 않은 것이다. 덮어쓰지 않고 멈춘다.
if [ "$CURRENT_STATE" != "active" ]; then
  die 1 "'${STACK_NAME}/${SERVICE_NAME}' 가 active 가 아닙니다 (현재: ${CURRENT_STATE})" \
    "이전 배포가 정리되지 않은 상태입니다. Rancher UI 에서 **Finish Upgrade** 또는 **Rollback** 으로 \`active\` 로 되돌린 뒤 이 job 을 재실행하세요. **이미지 push 는 완료된 상태입니다.**"
fi

# --------------------------------------------------------------------------
# 2) upgrade — 기존 launchConfig 를 그대로 재사용한다.
#    이미지 태그가 같아도 pull_image=always 라벨 덕분에 새 이미지를 pull 한다.
#    startFirst=false 는 포트 충돌을 막기 위해 필수다.
# --------------------------------------------------------------------------
jq -c '{
  inServiceStrategy: {
    batchSize: 1,
    intervalMillis: 2000,
    startFirst: false,
    launchConfig: .launchConfig,
    secondaryLaunchConfigs: (.secondaryLaunchConfigs // [])
  }
}' "$WORKDIR/svc.json" > "$WORKDIR/upgrade-body.json"

log "upgrade 호출"
HTTP="$(api_post "${SERVICE_PATH}/?action=upgrade" "$(cat "$WORKDIR/upgrade-body.json")")"

if [[ ! "$HTTP" =~ ^2 ]]; then
  log "upgrade 응답 본문: $(head -c 500 "$WORKDIR/action.json")"
  die 2 "Rancher upgrade 호출 실패 (HTTP ${HTTP}) — 컨테이너는 구버전 그대로입니다" \
    "이미지 \`${IMAGE}\` 는 레지스트리에 정상 push 됐고 **실행 중인 서비스는 영향을 받지 않았습니다.** 이 job 만 재실행(\`Re-run failed jobs\`)하면 됩니다."
fi

# --------------------------------------------------------------------------
# 3) state=upgraded 대기
# --------------------------------------------------------------------------
log "state=upgraded 대기 (최대 ${UPGRADED_TIMEOUT}초)"
DEADLINE=$(( $(date +%s) + UPGRADED_TIMEOUT ))
STATE=""
while :; do
  STATE="$(api_get "$SERVICE_PATH" | jq -r '.state')"
  [ "$STATE" = "upgraded" ] && break
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    die 3 "upgrade 후 ${UPGRADED_TIMEOUT}초 내에 upgraded 로 전환되지 않았습니다 (현재: ${STATE})" \
      "**서비스가 중간 상태로 남아 있어 사람의 확인이 필요합니다.** Rancher UI 에서 \`${STACK_NAME}/${SERVICE_NAME}\` 상태를 보고 **Finish Upgrade** 또는 **Rollback** 을 판단하세요. backend 라면 \`prisma migrate deploy\` 가 실패해 기동하지 못했을 수 있으니 컨테이너 로그를 먼저 확인하세요."
  fi
  sleep "$POLL_INTERVAL"
done
log "state=upgraded 도달"

# --------------------------------------------------------------------------
# 4) finishupgrade — 2xx 를 받을 때까지 재시도
# --------------------------------------------------------------------------
log "finishupgrade 호출 (최대 ${FINISH_TIMEOUT}초 재시도)"
DEADLINE=$(( $(date +%s) + FINISH_TIMEOUT ))
while :; do
  HTTP="$(api_post "${SERVICE_PATH}/?action=finishupgrade")"
  [[ "$HTTP" =~ ^2 ]] && break
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    log "finishupgrade 응답 본문: $(head -c 500 "$WORKDIR/action.json")"
    die 4 "finishupgrade 가 ${FINISH_TIMEOUT}초 내에 성공하지 못했습니다 (마지막 HTTP ${HTTP})" \
      "**서비스가 \`upgraded\` 상태로 잔류합니다. 사람의 확인이 필요합니다.** Rancher UI 에서 \`${STACK_NAME}/${SERVICE_NAME}\` 에 **Finish Upgrade** 또는 **Rollback** 을 수동 실행하세요."
  fi
  sleep "$POLL_INTERVAL"
done
log "finishupgrade 수락 (HTTP ${HTTP})"

# --------------------------------------------------------------------------
# 5) state=active 안정화 대기
# --------------------------------------------------------------------------
log "state=active 대기 (최대 ${ACTIVE_TIMEOUT}초)"
DEADLINE=$(( $(date +%s) + ACTIVE_TIMEOUT ))
while :; do
  STATE="$(api_get "$SERVICE_PATH" | jq -r '.state')"
  [ "$STATE" = "active" ] && break
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    die 4 "finishupgrade 후 ${ACTIVE_TIMEOUT}초 내에 active 가 되지 않았습니다 (현재: ${STATE})" \
      "Rancher UI 에서 \`${STACK_NAME}/${SERVICE_NAME}\` 상태를 확인하세요."
  fi
  sleep "$POLL_INTERVAL"
done

# --------------------------------------------------------------------------
# 6) 신규 컨테이너 확인 + 요약
# --------------------------------------------------------------------------
RUNNING="$(api_get "${SERVICE_PATH}/instances" \
  | jq -r '[.data[] | select(.state == "running") | .name] | join(", ")')"

log "재배포 완료 — running: ${RUNNING}"
summary ""
summary "### ✅ Rancher 재배포 완료"
summary ""
summary "| 항목 | 값 |"
summary "|---|---|"
summary "| 대상 | \`${STACK_NAME}/${SERVICE_NAME}\` (\`${SERVICE_ID}\`) |"
summary "| 이미지 | \`${IMAGE}\` |"
summary "| 상태 | \`active\` |"
summary "| 실행 중 컨테이너 | ${RUNNING} |"
