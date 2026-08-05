#!/usr/bin/env bash
# blumnAI QA Bot — 로컬 Docker 이미지 빌드 스크립트
#
# 사용:
#   ./build.sh                  # 기본 tag (latest)
#   ./build.sh v0.1.0           # 명시 tag
#   REGISTRY=registry.lunacode.dev/qa-bot ./build.sh v0.1.0  # tag + registry prefix
#
# 산출물:
#   <REGISTRY>/blumnai-qa-backend:<TAG>
#   <REGISTRY>/blumnai-qa-frontend:<TAG>
#
# push 하려면:
#   ./build.sh v0.1.0 && docker push <REGISTRY>/blumnai-qa-backend:v0.1.0 && \
#     docker push <REGISTRY>/blumnai-qa-frontend:v0.1.0

set -euo pipefail

TAG="${1:-latest}"
REGISTRY="${REGISTRY:-blumnai}"

echo "🏗  Building images with tag='$TAG' registry='$REGISTRY'"

# 백엔드
echo "→ backend"
docker build \
  -t "${REGISTRY}/blumnai-qa-backend:${TAG}" \
  -t "${REGISTRY}/blumnai-qa-backend:latest" \
  ./backend

# 프론트
echo "→ frontend"
docker build \
  -t "${REGISTRY}/blumnai-qa-frontend:${TAG}" \
  -t "${REGISTRY}/blumnai-qa-frontend:latest" \
  ./frontend

echo ""
echo "✅ 빌드 완료 · 이미지 목록:"
docker images | grep "${REGISTRY}/blumnai-qa" | head -10

echo ""
echo "📤 다음 단계 (registry 로 push):"
echo "  docker push ${REGISTRY}/blumnai-qa-backend:${TAG}"
echo "  docker push ${REGISTRY}/blumnai-qa-frontend:${TAG}"
echo ""
echo "📦 or 파일로 저장 (tar):"
echo "  docker save ${REGISTRY}/blumnai-qa-backend:${TAG} | gzip > backend-${TAG}.tar.gz"
echo "  docker save ${REGISTRY}/blumnai-qa-frontend:${TAG} | gzip > frontend-${TAG}.tar.gz"
