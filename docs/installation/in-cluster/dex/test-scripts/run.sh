#!/usr/bin/env bash
# Brings up a Minikube cluster + Dex + Headlamp + OAuth2-Proxy that
# reproduces the tutorial in ../index.md.
#
# Idempotent: re-running this script will skip steps that are already done.
#
# Layout when this script finishes:
#   - Minikube profile        : "dex"
#   - Dex                     : on the host, listening on :5556
#                               PID file at /tmp/headlamp-dex.pid
#                               log file at /tmp/headlamp-dex.log
#   - Headlamp Helm release   : "headlamp"   in namespace "headlamp"
#   - OAuth2-Proxy Helm release: "oauth2-proxy" in namespace "headlamp"
#   - Port-forward            : http://localhost:8080  ->  oauth2-proxy
#                               PID file at /tmp/headlamp-oauth2-proxy-pf.pid
#
# Browser test:
#   open http://localhost:8080  ->  redirected to Dex
#   sign in as: admin@example.com / password
#   you are redirected back into Headlamp.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PROFILE="dex"
NAMESPACE="headlamp"
DEX_PORT=5556
PF_PORT=8080
PF_PATTERN="port-forward svc/oauth2-proxy ${PF_PORT}:80"
DEX_PID_FILE="/tmp/headlamp-dex.pid"
DEX_LOG_FILE="/tmp/headlamp-dex.log"
PF_PID_FILE="/tmp/headlamp-oauth2-proxy-pf.pid"
DEX_ISSUER="http://host.minikube.internal:${DEX_PORT}"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!! \033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31mxx \033[0m %s\n' "$*" >&2; exit 1; }

# pid_matches PID PATTERN
#
# Returns success only when PID is alive AND its command line matches
# PATTERN (a fixed substring). Guards against a stale pidfile whose PID
# has since been reused by an unrelated process — without this we could
# (a) skip starting Dex / port-forward because we think they're already
# running, or (b) later signal the wrong process from cleanup.sh.
pid_matches() {
  local pid="$1" pattern="$2"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  local cmd
  cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  [[ "$cmd" == *"$pattern"* ]]
}

require() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

require minikube
require kubectl
require helm
require dex
require openssl
require curl

# ---------------------------------------------------------------- 1. Dex
start_dex() {
  if [[ -f "$DEX_PID_FILE" ]] && pid_matches "$(cat "$DEX_PID_FILE")" "dex serve"; then
    log "Dex already running (PID $(cat "$DEX_PID_FILE"))"
    return
  fi
  # Either no pidfile, or the recorded PID is dead/belongs to something
  # else now — drop the stale file and start fresh.
  rm -f "$DEX_PID_FILE"
  log "Starting Dex on :${DEX_PORT} (logs: ${DEX_LOG_FILE})"
  rm -f /tmp/dex.db
  nohup dex serve "$SCRIPT_DIR/dex-config.yaml" >"$DEX_LOG_FILE" 2>&1 &
  echo $! > "$DEX_PID_FILE"

  # Wait for Dex to be ready.
  for _ in $(seq 1 30); do
    if curl -fsS "http://localhost:${DEX_PORT}/.well-known/openid-configuration" >/dev/null 2>&1; then
      log "Dex is ready."
      return
    fi
    sleep 1
  done
  fail "Dex did not become ready in 30s. See ${DEX_LOG_FILE}"
}

# ---------------------------------------------------------------- 2. Minikube
start_minikube() {
  if minikube status -p "$PROFILE" --format '{{.Host}}' 2>/dev/null | grep -q Running; then
    log "Minikube profile '$PROFILE' already running."
    return
  fi
  # NOTE: we intentionally do NOT pass --extra-config=apiserver.oidc-* here.
  #
  # In this OAuth2-Proxy + Dex pattern Headlamp does not impersonate the
  # user against the Kubernetes API — it talks to the API server using
  # its in-cluster ServiceAccount (see headlamp-values.yaml). The OIDC
  # flow is between the browser, OAuth2-Proxy and Dex; the API server
  # never sees the id_token. Configuring apiserver-level OIDC would
  # additionally require Dex to serve HTTPS (kube-apiserver rejects
  # --oidc-issuer-url with an http:// scheme), which is out of scope
  # for this local-development smoke test.
  #
  # For production / per-user RBAC against the API server, see the
  # "Production" section of ../index.md.
  log "Starting Minikube profile '$PROFILE'."
  minikube start -p "$PROFILE" \
    --extra-config=apiserver.authorization-mode=Node,RBAC
}

# ----------------------------------------------------- 3. RBAC + Helm releases
apply_rbac() {
  log "Applying ClusterRoleBinding for the Dex test user."
  kubectl --context "$PROFILE" apply -f clusterrolebinding.yaml
}

helm_install_or_upgrade() {
  local release="$1" chart="$2" values="$3"
  if helm --kube-context "$PROFILE" -n "$NAMESPACE" status "$release" >/dev/null 2>&1; then
    helm --kube-context "$PROFILE" -n "$NAMESPACE" upgrade "$release" "$chart" -f "$values" --wait
  else
    helm --kube-context "$PROFILE" -n "$NAMESPACE" install "$release" "$chart" -f "$values" --create-namespace --wait
  fi
}

deploy_helm_releases() {
  log "Adding Helm repositories."
  # `--force-update` makes `helm repo add` succeed even when the repo
  # name is already present locally (otherwise it would exit non-zero
  # under `set -e` and break the script's idempotency claim).
  helm repo add --force-update headlamp https://kubernetes-sigs.github.io/headlamp/ >/dev/null
  helm repo add --force-update oauth2-proxy https://oauth2-proxy.github.io/manifests >/dev/null
  helm repo update >/dev/null

  log "Installing/upgrading Headlamp."
  helm_install_or_upgrade headlamp headlamp/headlamp headlamp-values.yaml

  log "Rendering oauth2-proxy values from template."
  local cookie_secret
  cookie_secret="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
  sed \
    -e "s|__COOKIE_SECRET__|${cookie_secret}|" \
    -e "s|__DEX_ISSUER__|${DEX_ISSUER}|" \
    oauth2-proxy-values.yaml.tpl > oauth2-proxy-values.yaml

  log "Installing/upgrading OAuth2-Proxy."
  helm_install_or_upgrade oauth2-proxy oauth2-proxy/oauth2-proxy oauth2-proxy-values.yaml
}

# ---------------------------------------------------------- 4. Port-forward
start_port_forward() {
  if [[ -f "$PF_PID_FILE" ]] && pid_matches "$(cat "$PF_PID_FILE")" "$PF_PATTERN"; then
    log "Port-forward already running (PID $(cat "$PF_PID_FILE"))"
    return
  fi
  # Stale pidfile (or PID reused by something else) — discard it.
  rm -f "$PF_PID_FILE"
  # Refuse if the local port is already taken — kubectl port-forward would
  # exit immediately and we'd cache a stale PID. The port is hard-coded
  # to 8080 because the OAuth2-Proxy `redirect_url` and Dex
  # `redirectURIs` are pinned to `http://localhost:8080/...`; changing
  # it here would also require editing dex-config.yaml and
  # oauth2-proxy-values.yaml.tpl.
  if (exec 3<>/dev/tcp/127.0.0.1/"${PF_PORT}") 2>/dev/null; then
    exec 3<&- 3>&-
    fail "local port ${PF_PORT} is already in use; stop the process holding it (e.g. lsof -i :${PF_PORT}) before re-running"
  fi

  log "Port-forwarding oauth2-proxy on http://localhost:${PF_PORT}"
  nohup kubectl --context "$PROFILE" -n "$NAMESPACE" \
    port-forward svc/oauth2-proxy "${PF_PORT}:80" \
    >/tmp/headlamp-oauth2-proxy-pf.log 2>&1 &
  local pf_pid=$!

  # Wait for the port-forward to actually accept connections (kubectl
  # exits early if the Service has no ready endpoints), and verify the
  # process is still alive before we cache its PID.
  for _ in $(seq 1 30); do
    if ! kill -0 "$pf_pid" 2>/dev/null; then
      fail "kubectl port-forward exited; see /tmp/headlamp-oauth2-proxy-pf.log"
    fi
    if (exec 3<>/dev/tcp/127.0.0.1/"${PF_PORT}") 2>/dev/null; then
      exec 3<&- 3>&-
      echo "$pf_pid" > "$PF_PID_FILE"
      log "Port-forward is ready (PID ${pf_pid})."
      return
    fi
    sleep 1
  done
  kill "$pf_pid" 2>/dev/null || true
  fail "port-forward did not start listening on :${PF_PORT} within 30s; see /tmp/headlamp-oauth2-proxy-pf.log"
}

# -------------------------------------------------------------------- main
start_dex
start_minikube
apply_rbac
deploy_helm_releases
start_port_forward

cat <<EOF

✓ All set.

  Open Headlamp at:   http://localhost:${PF_PORT}
  Sign in to Dex as:  admin@example.com / password

  Dex log:            ${DEX_LOG_FILE}
  Port-forward log:   /tmp/headlamp-oauth2-proxy-pf.log

  Run ./test.sh   to smoke-test the deployment.
  Run ./cleanup.sh to tear everything down.
EOF
