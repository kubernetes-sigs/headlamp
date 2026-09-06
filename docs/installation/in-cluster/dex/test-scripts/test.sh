#!/usr/bin/env bash
# Smoke-tests the Headlamp + OAuth2-Proxy + Dex deployment brought up by
# run.sh. We don't try to drive a browser; instead we follow the redirect
# chain that an unauthenticated client would see, and check that:
#
#   1. Hitting OAuth2-Proxy on /  returns a redirect to /oauth2/sign_in
#      (the OAuth2-Proxy "Sign in with OpenID Connect" splash page).
#   2. /oauth2/start (the link the splash page's button points at)
#      redirects to Dex's /auth endpoint with the right client_id and
#      redirect_uri.
#   3. Dex's discovery document is reachable and advertises the issuer
#      we expect.
#
# Exit non-zero on the first failure.
set -euo pipefail

PF_PORT=8080
DEX_PORT=5556
PROFILE="${HEADLAMP_DEX_MINIKUBE_PROFILE:-dex}"
DEX_LOG_FILE="/tmp/headlamp-dex.log"
EXPECTED_ISSUER="http://host.minikube.internal:${DEX_PORT}"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
pass() { printf '\033[1;32m ok\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mfail\033[0m %s\n' "$*" >&2; exit 1; }

[[ "$PROFILE" =~ ^[[:alnum:]._-]+$ ]] \
  || fail "invalid Minikube profile name: $PROFILE"

log "1. OAuth2-Proxy gates unauthenticated requests"
response_headers=$(mktemp)
response_body=$(mktemp)
trap 'rm -f "$response_headers" "$response_body"' EXIT
status=$(curl -sS -D "$response_headers" -o "$response_body" -w '%{http_code}' \
  "http://localhost:${PF_PORT}/") \
  || fail "could not reach oauth2-proxy on http://localhost:${PF_PORT}/ (is run.sh's port-forward up?)"
if [[ "$status" =~ ^30[0-9]$ ]]; then
  location=$(tr -d '\r' < "$response_headers" | awk '/^[Ll]ocation:/ {print $2}')
  [[ "$location" == */oauth2/sign_in* ]] \
    || fail "expected redirect to /oauth2/sign_in, got '$location'"
  pass "got 30x -> $location"
elif [[ "$status" == "401" || "$status" == "403" ]]; then
  grep -Eqi 'sign in( with OpenID Connect)?' "$response_body" \
    || fail "expected OAuth2-Proxy sign-in page for HTTP $status"
  pass "got HTTP $status with the OAuth2-Proxy sign-in page"
else
  fail "expected a redirect or 401/403 sign-in page from oauth2-proxy /, got $status"
fi

log "2. /oauth2/start redirects to Dex with our client_id"
auth_location=$(curl -sI "http://localhost:${PF_PORT}/oauth2/start" | tr -d '\r' | awk '/^[Ll]ocation:/ {print $2}') \
  || fail "could not fetch headers from http://localhost:${PF_PORT}/oauth2/start"
[[ -n "$auth_location" ]] || fail "/oauth2/start did not return a Location header"
[[ "$auth_location" == *"client_id=headlamp"* ]] \
  || fail "expected client_id=headlamp in '$auth_location'"
[[ "$auth_location" == *"redirect_uri=http%3A%2F%2Flocalhost%3A${PF_PORT}%2Foauth2%2Fcallback"* ]] \
  || fail "expected the OAuth2-Proxy callback as redirect_uri in '$auth_location'"
pass "redirected to Dex /auth with the right parameters"

log "3. Dex discovery document is served and advertises the expected issuer"
discovery=$(curl -fsS "http://localhost:${DEX_PORT}/.well-known/openid-configuration") \
  || fail "could not reach Dex discovery document at http://localhost:${DEX_PORT}/.well-known/openid-configuration (is Dex up? check $DEX_LOG_FILE)"
compact_discovery=$(printf '%s' "$discovery" | tr -d '[:space:]')
printf '%s' "$compact_discovery" | grep -Fq "\"issuer\":\"${EXPECTED_ISSUER}\"" \
  || { printf 'expected issuer %s in discovery document, got:\n%s\n' "$EXPECTED_ISSUER" "$discovery" >&2; exit 1; }
pass "Dex advertises issuer ${EXPECTED_ISSUER}"

log "4. Headlamp pod is Ready"
# `kubectl wait` fails if no pods match the selector, and only succeeds
# once *every* matched pod reports Ready=True, which is what we want,
# instead of a substring match on a list of booleans that would pass as
# long as one container in one pod was ready.
if ! kubectl --context "$PROFILE" -n headlamp wait \
    --for=condition=Ready pod \
    -l app.kubernetes.io/name=headlamp \
    --timeout=60s >/dev/null 2>&1; then
  kubectl --context "$PROFILE" -n headlamp get pods -l app.kubernetes.io/name=headlamp >&2 || true
  fail "headlamp pod did not become Ready within 60s"
fi
pass "Headlamp pod is Ready"

echo
echo "All smoke tests passed."
