#!/usr/bin/env bash
# Reproduce #4019 — multi-replica state loss.
#
# Hypothesis: /oidc lands on replica A, IdP redirects /oidc-callback to replica
# B, replica B's in-process oauthRequestMap has no entry for that state, and
# the callback returns 400.
#
# Verification: drive the OAuth flow end-to-end through the round-robin nginx
# and check the X-Upstream-Addr header on each request to confirm alternation,
# then assert that /oidc-callback returns a 4xx with an "unknown state"
# message.
set -euo pipefail

NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
HEADLAMP="http://${NODE_IP}:30080"

mkdir -p tools/oidc-repro/notes
NOTES=tools/oidc-repro/notes/4019.md

echo "Headlamp URL: $HEADLAMP"
echo "Driving the flow with curl + cookie jar; logging upstream routing."
echo "Open $NOTES and paste the X-Upstream-Addr trail when done."

JAR=$(mktemp)
trap "rm -f $JAR" EXIT

echo "==> /oidc (initial)"
curl -sS -c "$JAR" -b "$JAR" -D - -o /dev/null \
  "$HEADLAMP/oidc?cluster=main" | grep -iE 'x-upstream|location' || true

echo
echo "==> /oidc-callback with a bogus state (sanity check that the handler"
echo "    surfaces 'unknown state' from a different replica's map):"
curl -sS -c "$JAR" -b "$JAR" -D - -o /dev/null \
  "$HEADLAMP/oidc-callback?state=BOGUS&code=irrelevant&cluster=main" \
  | grep -iE 'x-upstream|http/' || true

cat <<EOF >> "$NOTES"
# 4019 repro run on $(date -Iseconds)

(paste curl output above)

## Verdict

- Did /oidc and /oidc-callback hit different upstreams? (yes/no)
- Did /oidc-callback return a 4xx unknown-state response? (yes/no)
- Was the response body shape consistent with the v1 oauthRequestMap miss path?
EOF

echo
echo "Notes appended to $NOTES — fill in the verdict block."
echo
echo "For a full browser-driven repro, port-forward Dex (kubectl -n dex"
echo "port-forward svc/dex 5556:5556) and complete the flow in a private window"
echo "while watching the kubectl logs for hl-a and hl-b to see which one"
echo "received the callback."
