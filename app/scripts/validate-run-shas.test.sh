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

# Unit tests for validate-run-shas.sh
#
# Tests are self-contained: they stub out git and gh commands so no network
# access or real repository state is required.
#
# Usage:
#   ./validate-run-shas.test.sh
#
# Exit codes:
#   0 - All tests passed
#   1 - One or more tests failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATE_SCRIPT="$SCRIPT_DIR/validate-run-shas.sh"

# ---------------------------------------------------------------------------
# Test framework helpers
# ---------------------------------------------------------------------------

TESTS_PASSED=0
TESTS_FAILED=0

# pass <test_name>
pass() {
  echo "  PASS: $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

# fail <test_name> [reason]
fail() {
  echo "  FAIL: $1${2:+ — $2}"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

# assert_exit <expected_code> <actual_code> <test_name>
assert_exit() {
  local expected="$1"
  local actual="$2"
  local name="$3"
  if [ "$actual" -eq "$expected" ]; then
    pass "$name"
  else
    fail "$name" "expected exit $expected, got $actual"
  fi
}

# assert_output_contains <substring> <output> <test_name>
assert_output_contains() {
  local substring="$1"
  local output="$2"
  local name="$3"
  if echo "$output" | grep -qF "$substring"; then
    pass "$name"
  else
    fail "$name" "expected output to contain: $substring"
  fi
}

# ---------------------------------------------------------------------------
# Source only the library functions (skip main) for unit testing.
# We do this by sourcing the script with BASH_SOURCE guard awareness: the
# script calls main "$@" only when executed directly, so we can source it
# and then call individual functions.
# ---------------------------------------------------------------------------

# Source the script to import its functions. The BASH_SOURCE guard in
# validate-run-shas.sh ensures main is NOT called during source.
# shellcheck source=validate-run-shas.sh
source "$VALIDATE_SCRIPT"

# ---------------------------------------------------------------------------
# Stubs: override git and gh so tests need no real repo or network access.
# Each test sets the relevant stub variables before calling the function.
# ---------------------------------------------------------------------------

# Stub state (set per test)
STUB_TAG_EXISTS=""       # tag name that should "exist", empty means none
STUB_TAG_SHA=""          # SHA returned by git rev-list
STUB_RUN_SHA=""          # SHA returned by gh run view
STUB_GH_EMPTY=""         # set to "1" to make gh return empty string

git() {
  case "$1" in
    rev-parse)
      # The call is: git rev-parse "refs/tags/<name>" >/dev/null 2>&1
      # After the subcommand ($1), the tag ref is the next argument ($2).
      local tag="${2#refs/tags/}"
      if [ "$tag" = "$STUB_TAG_EXISTS" ]; then
        return 0
      fi
      return 1
      ;;
    rev-list)
      echo "$STUB_TAG_SHA"
      ;;
    fetch)
      # no-op: tests don't need a real remote
      return 0
      ;;
    *)
      echo "Unexpected git invocation in test stub: git $*" >&2
      return 127
      ;;
  esac
}

gh() {
  if [ "$STUB_GH_EMPTY" = "1" ]; then
    echo ""
  else
    echo "$STUB_RUN_SHA"
  fi
}

# ---------------------------------------------------------------------------
# Tests: resolve_tag
# ---------------------------------------------------------------------------

echo ""
echo "=== resolve_tag ==="

test_resolve_tag_plain() {
  STUB_TAG_EXISTS="0.9.0"
  local result rc
  # Capture stdout only; errors are not expected on the happy path.
  result=$(resolve_tag "0.9.0")
  rc=$?
  assert_exit 0 "$rc" "resolve_tag: plain tag exists"
  assert_output_contains "0.9.0" "$result" "resolve_tag: plain tag returns tag name"
}

test_resolve_tag_v_prefix() {
  # Plain tag does not exist; "v0.9.0" does.
  STUB_TAG_EXISTS="v0.9.0"
  local result rc
  result=$(resolve_tag "0.9.0")
  rc=$?
  assert_exit 0 "$rc" "resolve_tag: v-prefix fallback exists"
  assert_output_contains "v0.9.0" "$result" "resolve_tag: v-prefix fallback returns v-prefixed name"
}

 test_resolve_tag_strip_v_prefix() {
  # v-prefixed tag does not exist; plain tag does.
  STUB_TAG_EXISTS="0.9.0"
  local result rc
  result=$(resolve_tag "v0.9.0")
  rc=$?
  assert_exit 0 "$rc" "resolve_tag: strip v-prefix fallback exists"
  assert_output_contains "0.9.0" "$result" "resolve_tag: strip v-prefix fallback returns plain name"
 }

test_resolve_tag_missing() {
  STUB_TAG_EXISTS=""
  local result rc
  # Capture both stdout and stderr; disable errexit so the non-zero return
  # does not abort the test runner before we can inspect $?.
  set +e
  result=$(resolve_tag "0.9.0" 2>&1)
  rc=$?
  set -e
  assert_exit 1 "$rc" "resolve_tag: missing tag returns exit 1"
  assert_output_contains "not found" "$result" "resolve_tag: missing tag prints error"
}

test_resolve_tag_plain
test_resolve_tag_v_prefix
test_resolve_tag_strip_v_prefix
test_resolve_tag_missing

# ---------------------------------------------------------------------------
# Tests: get_tag_sha
# ---------------------------------------------------------------------------

echo ""
echo "=== get_tag_sha ==="

test_get_tag_sha() {
  STUB_TAG_SHA="abc123def456"
  local result
  result=$(get_tag_sha "v0.9.0")
  assert_output_contains "abc123def456" "$result" "get_tag_sha: returns expected SHA"
}

test_get_tag_sha

# ---------------------------------------------------------------------------
# Tests: validate_runs
# ---------------------------------------------------------------------------

echo ""
echo "=== validate_runs ==="

test_validate_runs_matching_sha() {
  STUB_GH_EMPTY=""
  STUB_RUN_SHA="deadbeef1234"
  local out rc
  out=$(validate_runs "deadbeef1234" "v0.9.0" "kubernetes-sigs/headlamp" "111" 2>&1)
  rc=$?
  assert_exit 0 "$rc" "validate_runs: matching SHA passes"
}

test_validate_runs_mismatched_sha() {
  STUB_GH_EMPTY=""
  STUB_RUN_SHA="badc0ffee999"
  local out rc
  set +e
  out=$(validate_runs "deadbeef1234" "v0.9.0" "kubernetes-sigs/headlamp" "222" 2>&1)
  rc=$?
  set -e
  assert_exit 1 "$rc" "validate_runs: mismatched SHA fails"
  assert_output_contains "mismatch" "$out" "validate_runs: mismatch prints diagnostic"
}

test_validate_runs_empty_run_sha() {
  STUB_GH_EMPTY="1"
  local out rc
  set +e
  out=$(validate_runs "deadbeef1234" "v0.9.0" "kubernetes-sigs/headlamp" "333" 2>&1)
  rc=$?
  set -e
  assert_exit 1 "$rc" "validate_runs: empty run SHA fails"
  assert_output_contains "Could not determine SHA" "$out" "validate_runs: empty SHA prints error"
}

test_validate_runs_multiple_run_ids_pass() {
  STUB_GH_EMPTY=""
  STUB_RUN_SHA="cafebabe5678"
  local out rc
  out=$(validate_runs "cafebabe5678" "v0.9.0" "kubernetes-sigs/headlamp" "101,102,103" 2>&1)
  rc=$?
  assert_exit 0 "$rc" "validate_runs: multiple matching IDs all pass"
}

test_validate_runs_multiple_run_ids_one_fails() {
  # All IDs return the same (wrong) SHA from the stub, so the first mismatch
  # fails the whole run — confirms a bad run ID in a list blocks the release.
  STUB_GH_EMPTY=""
  STUB_RUN_SHA="badc0de00000"
  local out rc
  set +e
  out=$(validate_runs "cafebabe5678" "v0.9.0" "kubernetes-sigs/headlamp" "101,102" 2>&1)
  rc=$?
  set -e
  assert_exit 1 "$rc" "validate_runs: mismatch in multi-ID list fails"
}

test_validate_runs_empty_run_ids() {
  STUB_GH_EMPTY=""
  STUB_RUN_SHA=""
  local out rc
  # All entries are whitespace / empty; should fail (nothing to validate).
  set +e
  out=$(validate_runs "deadbeef1234" "v0.9.0" "kubernetes-sigs/headlamp" ",, ," 2>&1)
  rc=$?
  set -e
  assert_exit 1 "$rc" "validate_runs: all-empty run IDs fails (fail fast)"
  assert_output_contains "Error: No workflow run IDs provided." "$out" "validate_runs: empty run IDs prints error"
}

test_validate_runs_get_run_sha_failure() (
  # Simulate `gh`/API failure by making get_run_sha return non-zero.
  get_run_sha() { return 2; }
  local out rc
  set +e
  out=$(validate_runs "deadbeef1234" "v0.9.0" "kubernetes-sigs/headlamp" "444" 2>&1)
  rc=$?
  set -e
  assert_exit 1 "$rc" "validate_runs: get_run_sha failure fails"
  assert_output_contains "Failed to query SHA" "$out" "validate_runs: get_run_sha failure prints error"
  )

test_validate_runs_option_like_run_id() {
  STUB_GH_EMPTY=""
  STUB_RUN_SHA=""
  local out rc
  # Option-like run ID (-n) should fail validation as a non-numeric run ID, rather than being silently skipped.
  set +e
  out=$(validate_runs "deadbeef1234" "v0.9.0" "kubernetes-sigs/headlamp" " -n " 2>&1)
  rc=$?
  set -e
  assert_exit 1 "$rc" "validate_runs: option-like run ID fails"
  assert_output_contains "Invalid workflow run ID '-n'" "$out" "validate_runs: option-like run ID prints error"
}

test_validate_runs_matching_sha
test_validate_runs_mismatched_sha
test_validate_runs_empty_run_sha
test_validate_runs_multiple_run_ids_pass
test_validate_runs_multiple_run_ids_one_fails
test_validate_runs_empty_run_ids
test_validate_runs_get_run_sha_failure
test_validate_runs_option_like_run_id

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "=== Results ==="
echo "  Passed: $TESTS_PASSED"
echo "  Failed: $TESTS_FAILED"
echo ""

if [ "$TESTS_FAILED" -gt 0 ]; then
  exit 1
fi
