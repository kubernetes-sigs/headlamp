#!/bin/sh
# A humble test of the plugins/examples

set -e
set -o xtrace

npm run check-dependencies
npm run build
npm run copy-package-lock
npm pack

# Resolve the tarball to an absolute path before cd-ing so parallel workers
# can find it from any cwd.
TARBALL_NAME="$(ls -t kinvolk-headlamp-plugin-*.tgz 2>/dev/null | head -1)"
if [ -z "$TARBALL_NAME" ] || [ ! -f "$TARBALL_NAME" ]; then
  echo "Error: no kinvolk-headlamp-plugin-*.tgz tarball found after npm pack" >&2
  exit 1
fi
TARBALL="$(pwd)/$TARBALL_NAME"
export TARBALL

# Parallelism. Override with PARALLEL=1 for sequential, easier-to-debug runs.
PARALLEL="${PARALLEL:-4}"

cd ../examples

# Build a concurrently invocation: one --names entry and one command per
# example. A POSIX `for dir in */` glob avoids the brittle `ls | tr | xargs`
# pipeline, whose `ls` failure `set -e` would not catch.
names=""
set --
for dir in */; do
  dir=${dir%/}
  # Skip the literal `*/` (no matches) and any stale node_modules tree.
  [ -d "$dir" ] || continue
  [ "$dir" = "node_modules" ] && continue
  names="${names:+$names,}$dir"
  # `npm ci` from the lockfile, then overlay the locally built tarball so we
  # test repo changes the published version may not have. `npm ci` can't do
  # the overlay itself (it ignores positional package args); `--no-save
  # --no-package-lock` keeps the example's package.json / lockfile clean.
  set -- "$@" "cd '$dir' && npm ci && npm install --no-save --no-package-lock \"\$TARBALL\" && npm run lint && npm run format && npm run build && npm run tsc"
done

[ -n "$names" ] || { echo "Error: no example directories found in $(pwd)" >&2; exit 1; }

# Run in parallel via concurrently: colored per-example prefixes, serialized
# line writes, abort siblings on first failure. Pinned via `npx -p` so npm
# caches it without bloating headlamp-plugin's published dependencies.
exec npx --yes -p concurrently@8.2.2 concurrently \
  --max-processes "$PARALLEL" \
  --kill-others-on-fail \
  --names "$names" \
  -- "$@"
