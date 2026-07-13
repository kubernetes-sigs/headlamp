#!/bin/bash
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

# Validate that the workflow runs used to produce release artifacts were
# executed from the same commit as the release tag.
#
# Release integrity depends on this check: if an artifact was built from a
# different commit than the one tagged for release, it cannot be trusted as
# the canonical release binary.  Catching the mismatch here prevents
# accidentally publishing artifacts built from an unrelated or unreviewed
# commit.
#
# Usage:
#   GH_TOKEN=<token> ./validate-run-shas.sh <release_name> <repo> <run_ids>
#
#   release_name  - Release version, e.g. "0.9.0" or "v0.9.0"
#   repo          - GitHub repository in "owner/name" format
#   run_ids       - Comma-separated list of workflow run IDs to validate
#
# Exit codes:
#   0 - All run SHAs match the release tag SHA
#   1 - Validation failed (tag not found, SHA mismatch, or empty run SHA)
#
# Environment variables:
#   GH_TOKEN or GITHUB_TOKEN  - Required. GitHub token with 'actions: read' permission.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set -euo pipefail
fi

# ---------------------------------------------------------------------------
# resolve_tag
#
# Resolves the git tag name for a given release name. Tries the name as-is
# first; if that tag does not exist locally, tries the alternate form by
# adding a "v" prefix or stripping a leading "v".
#
# Args:
#   $1 - release_name (e.g. "0.9.0")
#
# Outputs (stdout):
#   The resolved tag name, e.g. "0.9.0" or "v0.9.0"
#
# Returns:
#   0 on success, 1 if neither tag variant exists.
# ---------------------------------------------------------------------------
resolve_tag() {
  local release_name="$1"
  local tag_name

  if git rev-parse "refs/tags/$release_name" >/dev/null 2>&1; then
    echo "$release_name"
    return 0
  fi

  # Then try the alternate form (with or without a leading "v").
  if [[ "$release_name" == v* ]]; then
    tag_name="${release_name#v}"
  else
    tag_name="v$release_name"
  fi

  if git rev-parse "refs/tags/$tag_name" >/dev/null 2>&1; then
    echo "$tag_name"
    return 0
  fi

  echo "Error: Tag '$release_name' or '$tag_name' not found." >&2
  return 1
}

# ---------------------------------------------------------------------------
# get_tag_sha
#
# Returns the commit SHA that a given tag points to.
#
# Args:
#   $1 - tag_name (e.g. "v0.9.0")
#
# Outputs (stdout):
#   The full 40-character commit SHA.
# ---------------------------------------------------------------------------
get_tag_sha() {
  local tag_name="$1"
  git rev-list -n 1 "refs/tags/$tag_name^{commit}"
}

# ---------------------------------------------------------------------------
# get_run_sha
#
# Queries the GitHub API for the head commit SHA of a workflow run.
#
# Args:
#   $1 - run_id   (numeric GitHub Actions run ID)
#   $2 - repo     (owner/name, e.g. "kubernetes-sigs/headlamp")
#
# Outputs (stdout):
#   The full 40-character head commit SHA of the run.
# ---------------------------------------------------------------------------
get_run_sha() {
  local run_id="$1"
  local repo="$2"
  gh run view "$run_id" --repo "$repo" --json headSha -q .headSha
}

# ---------------------------------------------------------------------------
# validate_runs
#
# Validates that every workflow run in a comma-separated list was executed
# from the same commit as the release tag.
#
# Args:
#   $1 - expected_sha  (commit SHA the tag resolves to)
#   $2 - tag_name      (for diagnostic output only)
#   $3 - repo          (owner/name)
#   $4 - run_ids       (comma-separated list of run IDs)
#
# Returns:
#   0 if all non-empty run IDs match, 1 on any mismatch or empty SHA.
# ---------------------------------------------------------------------------
validate_runs() {
  local expected_sha="$1"
  local tag_name="$2"
  local repo="$3"
  local run_ids_csv="$4"

  local cleaned_run_ids="${run_ids_csv//[[:space:],]/}"
  if [ -z "$cleaned_run_ids" ]; then
    echo "Error: No workflow run IDs provided." >&2
    return 1
  fi

  echo "Expected release SHA: $expected_sha (from tag $tag_name)"

  local -a run_ids
  IFS=',' read -ra run_ids <<< "$run_ids_csv"

  for run_id in "${run_ids[@]}"; do
    # Trim surrounding whitespace
    run_id="${run_id#"${run_id%%[![:space:]]*}"}"
    run_id="${run_id%"${run_id##*[![:space:]]}"}"

    if [ -z "$run_id" ]; then
      continue
    fi

    if [[ ! "$run_id" =~ ^[0-9]+$ ]]; then
      echo "Error: Invalid workflow run ID '$run_id' (expected a numeric Actions run ID)." >&2
      return 1
    fi
    local run_sha
    if ! run_sha=$(get_run_sha "$run_id" "$repo"); then
      echo "Error: Failed to query SHA for workflow run ID $run_id." >&2
      return 1
    fi
    if [ -z "$run_sha" ]; then
      echo "Error: Could not determine SHA for workflow run ID $run_id." >&2
      return 1
    fi

    echo "Run ID: $run_id"
    echo "Run SHA: $run_sha"

    if [ "$expected_sha" != "$run_sha" ]; then
      echo "Error: Workflow run SHA mismatch!" >&2
      echo "  Run ID:      $run_id" >&2
      echo "  Run SHA:     $run_sha" >&2
      echo "  Expected:    $expected_sha (from tag $tag_name)" >&2
      return 1
    fi
  done

  return 0
}

# ---------------------------------------------------------------------------
# main
#
# Entry point.  Fetches tags, resolves the release tag, then validates every
# provided workflow run ID against the tag's commit SHA.
# ---------------------------------------------------------------------------
main() {
  local release_name="${1:-}"
  local repo="${2:-}"
  local run_ids="${3:-}"

  if [ -z "$release_name" ] || [ -z "$repo" ] || [ -z "$run_ids" ]; then
    echo "Usage: $0 <release_name> <repo> <run_ids>" >&2
    echo "  release_name  e.g. 0.9.0 or v0.9.0" >&2
    echo "  repo          e.g. kubernetes-sigs/headlamp" >&2
    echo "  run_ids       comma-separated workflow run IDs" >&2
    exit 1
  fi

  # Ensure GitHub auth is available for gh CLI.
  # GitHub CLI supports both GH_TOKEN and GITHUB_TOKEN.
  local gh_token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  if [ -z "$gh_token" ]; then
    echo "Error: GH_TOKEN or GITHUB_TOKEN is required for GitHub CLI authentication." >&2
    exit 1
  fi
  export GH_TOKEN="$gh_token"

  # Ensure tags are available locally before resolving
  git fetch --tags --force origin

  local tag_name
  tag_name=$(resolve_tag "$release_name") || exit 1

  local expected_sha
  if ! expected_sha=$(get_tag_sha "$tag_name"); then
    echo "Error: Failed to determine SHA for tag '$tag_name'." >&2
    exit 1
  fi
  if [ -z "$expected_sha" ]; then
    echo "Error: Could not determine SHA for tag '$tag_name'." >&2
    exit 1
  fi
 
  validate_runs "$expected_sha" "$tag_name" "$repo" "$run_ids"
}

# Only execute main when the script is run directly, not when sourced.
# This lets validate-run-shas.test.sh import the functions without side-effects.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
