#!/usr/bin/env bash

# Copyright 2025 The Kubernetes Authors.
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

# Reproduce https://github.com/kubernetes-sigs/headlamp/issues/4019
# — OIDC login fails behind more than one headlamp-server replica.
#
# Hypothesis: headlamp-server stores pending OAuth requests in a process-local
# map keyed by `state` (oauthRequestMap in backend/cmd/headlamp.go). GET /oidc
# lands on replica A and writes the entry there; the IdP redirects the browser
# to /oidc-callback, the proxy round-robins it to replica B, replica B has no
# entry for that state, and the callback fails with HTTP 400 "invalid request".
#
# This script drives the whole authorization-code flow with curl against the
# round-robin nginx, so it observes the real failure rather than simulating it:
#
#   1. GET /oidc          — through nginx, note which replica answered
#   2. follow to Dex, submit the static-password login form
#   3. GET /oidc-callback — through nginx, note which replica answered
#
# It then reports whether the two requests hit different replicas and what the
# callback returned.
set -euo pipefail

# shellcheck source=./common.sh
source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )/common.sh"
require_cluster

HEADLAMP="$(headlamp_url)"
NOTES="$(notes_file 4019.md)"

USER_EMAIL="${USER_EMAIL:-alice@example.com}"
USER_PASSWORD="${USER_PASSWORD:-password}"

JAR="$(mktemp)"
HDRS="$(mktemp)"
BODY="$(mktemp)"
trap 'rm -f "$JAR" "$HDRS" "$BODY"' EXIT

# Values from the most recent response.
#
# The trailing `|| true` matters. Under `set -e` with `pipefail`, a bare
# `X="$(header_of location)"` aborts the script the moment grep finds no such
# header -- which is exactly when the "no redirect to the IdP" diagnostic below
# is supposed to fire. Without this the script dies silently instead of
# explaining itself. Callers check for an empty value.
header_of() { grep -i "^$1:" "$HDRS" | tail -1 | cut -d' ' -f2- | tr -d '\r' || true; }
status_of() { grep -E '^HTTP/' "$HDRS" | tail -1 | awk '{print $2}' || true; }

# One request, no redirect following, cookies preserved.
req() { curl -sS -c "$JAR" -b "$JAR" -D "$HDRS" -o "$BODY" "$@"; }

echo "Headlamp (round-robin): $HEADLAMP"
echo

echo "==> [1/4] GET /oidc?cluster=main"
req "$HEADLAMP/oidc?cluster=main"
OIDC_UPSTREAM="$(header_of x-upstream-addr)"
AUTH_URL="$(header_of location)"
echo "    replica:  ${OIDC_UPSTREAM:-<none>}"
echo "    status:   $(status_of)"
echo "    redirect: ${AUTH_URL:0:100}"

if [ -z "$AUTH_URL" ]; then
  echo
  echo "FAILED: /oidc did not redirect to the IdP. Response body:" >&2
  head -c 500 "$BODY" >&2
  echo >&2
  exit 1
fi

echo
echo "==> [2/4] Following to Dex and submitting the login form"
curl -sS -c "$JAR" -b "$JAR" -L -o "$BODY" "$AUTH_URL"

# The action is an HTML attribute, so its query separators arrive encoded as
# &amp;. Posting to it verbatim sends a parameter literally named "amp;state"
# and Dex just re-renders the login form.
# `|| true` for the same reason as header_of: no match must reach the
# diagnostic below, not abort the script under `set -e`.
LOGIN_ACTION="$(grep -oE 'action="[^"]*"' "$BODY" | head -1 | cut -d'"' -f2 | sed 's/&amp;/\&/g' || true)"
if [ -z "$LOGIN_ACTION" ]; then
  echo "FAILED: no login form found at Dex. Body was:" >&2
  head -c 500 "$BODY" >&2
  echo >&2
  exit 1
fi

DEX_ORIGIN="$(echo "$AUTH_URL" | grep -oE '^https?://[^/]+')"
case "$LOGIN_ACTION" in
  http*) LOGIN_URL="$LOGIN_ACTION" ;;
  *)     LOGIN_URL="${DEX_ORIGIN}${LOGIN_ACTION}" ;;
esac
echo "    login form: $LOGIN_URL"

# Submitting credentials sends us through Dex's approval step and on to
# Headlamp's callback. We must NOT follow that last hop: an authorization code
# is single-use, so letting curl -L spend it here would make the deliberate
# request in step 3 fail with "code already used" — a 400 that looks exactly
# like the state-map miss we are trying to detect. Walk the redirects by hand
# and stop at the first Location pointing back at Headlamp.
walk_to_callback() {
  local url loc hop=0
  # First hop is the credential POST; the rest are plain GETs.
  curl -sS -c "$JAR" -b "$JAR" -D "$HDRS" -o "$BODY" \
    --data-urlencode "login=${USER_EMAIL}" \
    --data-urlencode "password=${USER_PASSWORD}" \
    "$1"

  while [ "$hop" -lt 10 ]; do
    loc="$(header_of location)"
    [ -z "$loc" ] && return 1

    # Dex emits relative Locations for its own steps.
    case "$loc" in
      http*) url="$loc" ;;
      *)     url="${DEX_ORIGIN}${loc}" ;;
    esac

    # Reached Headlamp's callback: hand the URL back UNSPENT.
    case "$url" in
      "$HEADLAMP"/oidc-callback*) echo "$url"; return 0 ;;
    esac

    curl -sS -c "$JAR" -b "$JAR" -D "$HDRS" -o "$BODY" "$url"
    hop=$((hop + 1))
  done
  return 1
}

if ! CALLBACK_URL="$(walk_to_callback "$LOGIN_URL")"; then
  echo "FAILED: login did not reach /oidc-callback." >&2
  echo "  Last body:" >&2
  head -c 500 "$BODY" >&2
  echo >&2
  echo "  Check Dex: kubectl --kubeconfig $KUBECONFIG -n dex logs deploy/dex" >&2
  exit 1
fi
echo "    callback: ${CALLBACK_URL:0:100}"

echo
echo "==> [3/4] GET /oidc-callback through the round-robin proxy"
req "$CALLBACK_URL"
CB_STATUS="$(status_of)"
CB_UPSTREAM="$(header_of x-upstream-addr)"
CB_BODY="$(head -c 200 "$BODY" | tr -d '\r\n')"
echo "    replica: ${CB_UPSTREAM:-<none>}"
echo "    status:  $CB_STATUS"
echo "    body:    $CB_BODY"

echo
echo "==> [4/4] Verdict"
DIFFERENT_REPLICAS=no
if [ -n "$OIDC_UPSTREAM" ] && [ -n "$CB_UPSTREAM" ] && [ "$OIDC_UPSTREAM" != "$CB_UPSTREAM" ]; then
  DIFFERENT_REPLICAS=yes
fi

echo "    /oidc replica:          ${OIDC_UPSTREAM:-<unknown>}"
echo "    /oidc-callback replica: ${CB_UPSTREAM:-<unknown>}"
echo "    different replicas:     $DIFFERENT_REPLICAS"
echo "    callback status:        $CB_STATUS"
echo

if [ "$DIFFERENT_REPLICAS" = yes ] && [ "$CB_STATUS" = "400" ]; then
  VERDICT="REPRODUCED — callback crossed replicas and returned 400."
  echo "$VERDICT"
  echo "    Check the body reads 'invalid request' — that is the oauthRequestMap"
  echo "    miss path in backend/cmd/headlamp.go, not some other 400."
elif [ "$DIFFERENT_REPLICAS" = yes ]; then
  VERDICT="NOT REPRODUCED — callback crossed replicas but returned $CB_STATUS."
  echo "$VERDICT"
  echo "    Either the state is no longer process-local, or something else is"
  echo "    carrying it. Investigate before designing a fix."
else
  VERDICT="INCONCLUSIVE — both requests hit the same replica (${CB_UPSTREAM:-unknown})."
  echo "$VERDICT"
  echo "    Re-run; nginx round-robin should alternate. If it never alternates,"
  echo "    check that both hl-a and hl-b are Ready."
fi

{
  echo "# 4019 repro run on $(date -Iseconds)"
  echo
  echo "- /oidc replica:          ${OIDC_UPSTREAM:-unknown}"
  echo "- /oidc-callback replica: ${CB_UPSTREAM:-unknown}"
  echo "- different replicas:     $DIFFERENT_REPLICAS"
  echo "- callback status:        $CB_STATUS"
  echo "- callback body:          $CB_BODY"
  echo
  echo "## Verdict"
  echo
  echo "$VERDICT"
  echo
} >> "$NOTES"

echo
echo "Appended to $NOTES"

# Map the upstream address that served /oidc back to a Service name.
#
# nginx resolves `hl-a:4466` / `hl-b:4466` to ClusterIPs at startup, so
# $upstream_addr -- surfaced as X-Upstream-Addr -- is "<clusterIP>:4466".
#
# Getting this wrong inverts the control. Round-robin sends /oidc to hl-b about
# half the time, and port-forwarding the replica that did NOT issue the state
# returns the same 400 as the failure case -- which reads as "the state map is
# not the cause" when it is.
issuing_svc() {
  local svc ip
  [ -n "$OIDC_UPSTREAM" ] || return 1
  for svc in hl-a hl-b; do
    ip="$(kubectl --context "$CTX" -n headlamp get svc "$svc" \
            -o jsonpath='{.spec.clusterIP}' 2>/dev/null || true)"
    [ -n "$ip" ] && [ "${OIDC_UPSTREAM%%:*}" = "$ip" ] && { echo "$svc"; return 0; }
  done
  return 1
}

echo
echo "Control: to confirm the same state succeeds on the replica that issued it,"
echo "port-forward THAT replica and replay the callback against it directly."
if ISSUING_SVC="$(issuing_svc)"; then
  echo "    /oidc was served by $ISSUING_SVC ($OIDC_UPSTREAM)"
  echo "    kubectl --kubeconfig $KUBECONFIG -n headlamp port-forward svc/$ISSUING_SVC 4466:4466"
else
  echo "    Could not map upstream '${OIDC_UPSTREAM:-<unknown>}' to a Service."
  echo "    Forward the one whose ClusterIP matches it -- forwarding the other"
  echo "    returns the same 400 and inverts the control:"
  echo "    kubectl --kubeconfig $KUBECONFIG -n headlamp get svc hl-a hl-b"
fi
