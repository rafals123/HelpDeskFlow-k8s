#!/bin/sh
set -eu

NAMESPACE="${DOCKERHUB_NAMESPACE:-dawidrut01}"
VERSION="${IMAGE_VERSION:-v0.1.2}"

inspect_image() {
  image_name="$1"
  image_ref="$NAMESPACE/$image_name:$VERSION"

  echo
  echo "Inspecting $image_ref"
  docker buildx imagetools inspect "$image_ref"
}

inspect_image "helpdeskflow-frontend"
inspect_image "helpdeskflow-api-gateway"
inspect_image "helpdeskflow-auth-service"
inspect_image "helpdeskflow-user-service"
inspect_image "helpdeskflow-ticket-service"
inspect_image "helpdeskflow-notification-service"
