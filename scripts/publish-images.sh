#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

NAMESPACE="${DOCKERHUB_NAMESPACE:-dawidrut01}"
VERSION="${IMAGE_VERSION:-v0.1.2}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8080/api}"
BUILDER_NAME="${BUILDER_NAME:-helpdeskflow-multiarch}"

ensure_builder() {
  if ! docker buildx inspect "$BUILDER_NAME" >/dev/null 2>&1; then
    docker buildx create --name "$BUILDER_NAME" --driver docker-container --use >/dev/null
  else
    docker buildx use "$BUILDER_NAME" >/dev/null
  fi

  docker buildx inspect "$BUILDER_NAME" --bootstrap >/dev/null
}

build_and_push() {
  image_name="$1"
  dockerfile_path="$2"
  build_arg="${3:-}"

  echo "Publishing $NAMESPACE/$image_name:$VERSION"

  if [ -n "$build_arg" ]; then
    docker buildx build \
      --platform "$PLATFORMS" \
      --sbom=true \
      --provenance=true \
      --build-arg "$build_arg" \
      -t "$NAMESPACE/$image_name:latest" \
      -t "$NAMESPACE/$image_name:$VERSION" \
      -f "$dockerfile_path" \
      . \
      --push
    return
  fi

  docker buildx build \
    --platform "$PLATFORMS" \
    --sbom=true \
    --provenance=true \
    -t "$NAMESPACE/$image_name:latest" \
    -t "$NAMESPACE/$image_name:$VERSION" \
    -f "$dockerfile_path" \
    . \
    --push
}

ensure_builder

build_and_push "helpdeskflow-frontend" "frontend/Dockerfile" "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL"
build_and_push "helpdeskflow-api-gateway" "services/api-gateway/Dockerfile"
build_and_push "helpdeskflow-auth-service" "services/auth-service/Dockerfile"
build_and_push "helpdeskflow-user-service" "services/user-service/Dockerfile"
build_and_push "helpdeskflow-ticket-service" "services/ticket-service/Dockerfile"
build_and_push "helpdeskflow-notification-service" "services/notification-service/Dockerfile"
