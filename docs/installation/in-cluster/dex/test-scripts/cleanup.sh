#!/usr/bin/env bash
# Tears down everything that run.sh started.
set -euo pipefail

PROFILE="dex"
NAMESPACE="headlamp"
PF_PORT=8080
DEX_PID_FILE="/tmp/headlamp-dex.pid"
PF_PID_FILE="/tmp/headlamp-oauth2-proxy-pf.pid"
# Specific enough to avoid SIGTERMing an unrelated `kubectl port-forward`
# whose PID happens to match what we have in the pidfile.
PF_PATTERN="port-forward svc/oauth2-proxy ${PF_PORT}:80"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!! \033[0m %s\n' "$*" >&2; }

# kill_pidfile FILE NAME PATTERN
#
# Reads a PID from FILE and kills it only if it is still alive AND its
# command line contains PATTERN. PATTERN guards against PID reuse: if
# the recorded PID has since been recycled by an unrelated process, we
# would otherwise SIGTERM/SIGKILL the wrong thing. Always removes FILE.
kill_pidfile() {
  local file="$1" name="$2" pattern="$3"
  if [[ -f "$file" ]]; then
    local pid cmd
    pid="$(cat "$file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
      if [[ "$cmd" == *"$pattern"* ]]; then
        log "Stopping $name (PID $pid)"
        kill "$pid" 2>/dev/null || true
        # Give it a moment, then force.
        sleep 1
        if kill -0 "$pid" 2>/dev/null; then kill -9 "$pid" 2>/dev/null || true; fi
      else
        warn "PID $pid in $file is not $name (got: ${cmd:-<gone>}); leaving it alone"
      fi
    fi
    rm -f "$file"
  fi
}

kill_pidfile "$PF_PID_FILE"  "oauth2-proxy port-forward" "$PF_PATTERN"
kill_pidfile "$DEX_PID_FILE" "dex"                       "dex serve"

if helm --kube-context "$PROFILE" -n "$NAMESPACE" status oauth2-proxy >/dev/null 2>&1; then
  log "Uninstalling oauth2-proxy Helm release"
  helm --kube-context "$PROFILE" -n "$NAMESPACE" uninstall oauth2-proxy || true
fi

if helm --kube-context "$PROFILE" -n "$NAMESPACE" status headlamp >/dev/null 2>&1; then
  log "Uninstalling headlamp Helm release"
  helm --kube-context "$PROFILE" -n "$NAMESPACE" uninstall headlamp || true
fi

if minikube status -p "$PROFILE" --format '{{.Host}}' 2>/dev/null | grep -q .; then
  log "Deleting Minikube profile '$PROFILE'"
  minikube delete -p "$PROFILE" || true
fi

# Generated files.
rm -f "$(dirname "$0")/oauth2-proxy-values.yaml" /tmp/dex.db /tmp/headlamp-dex.log /tmp/headlamp-oauth2-proxy-pf.log

log "Done."
