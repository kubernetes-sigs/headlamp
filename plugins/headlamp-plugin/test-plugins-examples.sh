#!/bin/sh
# A humble test of the plugins/examples

set -e
set -o xtrace

npm run check-dependencies
npm run build
npm run copy-package-lock
npm pack

# Capture the freshly-built tarball path before we cd away so all parallel
# workers can find it without racing on directory state.
TARBALL_NAME="$(ls -t kinvolk-headlamp-plugin-*.tgz 2>/dev/null | head -1)"
if [ -z "$TARBALL_NAME" ] || [ ! -f "$TARBALL_NAME" ]; then
  echo "Error: no kinvolk-headlamp-plugin-*.tgz tarball found after npm pack" >&2
  exit 1
fi
TARBALL="$(pwd)/$TARBALL_NAME"
export TARBALL

# Number of examples to test in parallel. Override with PARALLEL=1 for
# sequential, easier-to-debug runs locally.
PARALLEL="${PARALLEL:-4}"

cd ../examples

# Run the per-example test pipeline in parallel via xargs -P. GNU xargs
# returns exit 123 if any worker fails, which `set -e` then propagates.
ls -d */ | tr -d / | xargs -P "$PARALLEL" -I {} sh -c '
  set -e
  dir="$1"
  cd "$dir"
  echo "=== [$dir] starting ==="
  # First, do a fast clean install of all dependencies from the lockfile.
  npm ci
  # Then override headlamp-plugin with the locally built tarball so we test
  # PR/repo changes that the released registry version might not have.
  # npm ci cannot do this -- it ignores positional package arguments and would
  # silently keep the registry version.
  # --no-save and --no-package-lock keep each example package.json and
  # package-lock.json clean so a subsequent npm ci (locally or in CI) still
  # matches the checked-in lockfile.
  npm install --no-save --no-package-lock "$TARBALL"
  npm run lint
  npm run format
  npm run build
  npm run tsc
  echo "=== [$dir] done ==="
' _ {}
