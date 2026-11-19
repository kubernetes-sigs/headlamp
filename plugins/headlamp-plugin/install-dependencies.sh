#!/bin/sh
# Installs the dependencies of every plugin folder in the current directory.
#
# The installs run in parallel (INSTALL_JOBS at a time, defaulting to the number of CPUs).
# One folder is installed first so that the parallel installs reuse the npm cache it
# fills instead of all downloading the same packages at once.
set -e

dirs=$(find . -mindepth 1 -maxdepth 1 -type d ! -name '.*' | sort)
if [ -z "$dirs" ]; then
  exit 0
fi

first=$(echo "$dirs" | head -n 1)
echo "Installing dependencies in $first"
(cd "$first" && npm ci --no-audit --no-fund)

parallel_jobs="${INSTALL_JOBS:-$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)}"
echo "Installing the remaining plugin dependencies with up to $parallel_jobs parallel jobs"
echo "$dirs" | tail -n +2 | xargs -P "$parallel_jobs" -I {} sh -c '
  log=$(mktemp)
  if (cd "$1" && npm ci --no-audit --no-fund) >"$log" 2>&1; then
    echo "Installed dependencies in $1"
    rm -f "$log"
  else
    cat "$log"
    rm -f "$log"
    echo "Failed to install dependencies in $1" >&2
    exit 1
  fi
' sh {}
