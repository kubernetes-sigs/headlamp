set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${1:-spectro-headlamp:local}"
cd "$ROOT"
docker build -f Dockerfile -t "$TAG" .
