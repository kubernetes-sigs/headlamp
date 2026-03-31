#!/usr/bin/env bash
# Build Headlamp image with relative public path for Spectro Cloud foreq (/v1/tenantApps/<hash>/).
# Usage: from repo root: ./scripts/build-spectro-headlamp-image.sh [tag]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${1:-spectro-headlamp:local}"
cd "$ROOT"
docker build -f Dockerfile -t "$TAG" .
