#!/bin/bash

# Build and push script for Travel Tracker
set -e

# Change to the root directory where Dockerfile is located
cd "$(dirname "$0")/.."

# Load environment variables from deploy directory
if [ -f deploy/.env ]; then
    set -a
    source deploy/.env
    set +a
fi

# Default values if not set in .env
REGISTRY_HOST=${REGISTRY_HOST:-192.168.1.100}
IMAGE_NAME=${IMAGE_NAME:-travel-tracker}
IMAGE_TAG=${IMAGE_TAG:-latest}
BUILD_RETRIES=${BUILD_RETRIES:-3}
RETRY_DELAY_SECONDS=${RETRY_DELAY_SECONDS:-5}

retry_command() {
    local description="$1"
    shift

    local attempt=1
    while true; do
        echo "$description (attempt $attempt/$BUILD_RETRIES)..."
        if "$@"; then
            return 0
        fi

        if [ "$attempt" -ge "$BUILD_RETRIES" ]; then
            echo "$description failed after $attempt attempts."
            return 1
        fi

        attempt=$((attempt + 1))
        echo "Retrying in ${RETRY_DELAY_SECONDS}s..."
        sleep "$RETRY_DELAY_SECONDS"
    done
}

retry_command "Building Docker image" docker build -t "$IMAGE_NAME:$IMAGE_TAG" .

echo "Tagging image for registry..."
docker tag "$IMAGE_NAME:$IMAGE_TAG" "$REGISTRY_HOST:5010/$IMAGE_NAME:$IMAGE_TAG"

echo "Pushing to registry at $REGISTRY_HOST:5010..."
if ! retry_command "Pushing Docker image" docker push "$REGISTRY_HOST:5010/$IMAGE_NAME:$IMAGE_TAG"; then
    echo "Push failed. If using HTTP registry, configure Docker daemon with:"
    echo "  \"insecure-registries\": [\"$REGISTRY_HOST:5010\"]"
    echo "in /etc/docker/daemon.json or Docker Desktop settings"
    exit 1
fi

echo "Build and push completed successfully!"
echo "Image available at: $REGISTRY_HOST:5010/$IMAGE_NAME:$IMAGE_TAG" 
