#!/bin/sh

# Copyright 2025 The Kubernetes Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

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
