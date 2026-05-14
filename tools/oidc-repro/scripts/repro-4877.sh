#!/usr/bin/env bash
# Reproduce #4877 / #2134 — original-URL preservation across OIDC.
#
# Hypothesis from the v2 review: authchooser/index.tsx:154,160,164 already
# calls history.replace(from), so the popup-flow URL preservation may already
# work on current main. The residual is likely:
#   (a) page reload of the deep-linked URL after the redirect — location.state.from
#       is lost on reload and the user lands at the cluster root.
#   (b) full-page / autologin redirect with no opener window — the /auth bridge
#       relies on a storage event that there's nothing to fire on.
#
# This script gives you the manual recipe for both. It does not automate the
# browser flow — Playwright would be heavier than this stage warrants.
set -euo pipefail

NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
HEADLAMP="http://${NODE_IP}:30080"

mkdir -p tools/oidc-repro/notes
NOTES=tools/oidc-repro/notes/4877.md

cat <<EOF
=== #4877 / #2134 manual repro ===
Headlamp: $HEADLAMP

Port-forward Dex first so the browser can reach it:
    kubectl -n dex port-forward svc/dex 5556:5556

Then run BOTH variants below and record results in:
    $NOTES

------------------------------------------------------------
VARIANT 1 — popup flow, NO reload
1. Open a private/incognito window. Clear all cookies for $NODE_IP.
2. Navigate to:
     $HEADLAMP/c/main/pods/default/headlamp?view=logs
3. AuthChooser appears. Click the OIDC sign-in button.
4. Complete Dex login as alice@example.com / password.
5. Observe URL bar AFTER login completes.

Expected on current main (per the v2 hypothesis): URL bar is
'/c/main/pods/default/headlamp?view=logs' — the deep-link is preserved by
history.replace(from). If so, this variant is fixed and PR 1 only needs
regression coverage for it.

------------------------------------------------------------
VARIANT 2 — popup flow, WITH reload after AuthChooser
1. Open a private window. Navigate to the deep-link URL above.
2. AuthChooser appears.
3. PRESS F5 / Cmd-R to reload the page. (This is the key step — it clears
   location.state.from.)
4. AuthChooser appears again. Click sign-in. Complete Dex login.
5. Observe URL bar.

Expected: URL bar is '/c/main' (cluster root), NOT the original deep-link.
This is the residual that PR 1's full-page mode + signed-state-carried
returnTo is designed to fix.

------------------------------------------------------------
VARIANT 3 — full-page (no opener)
1. Open the deep-link in a new tab via address bar (NOT clicked from a popup).
2. If autologin is configured, you'll redirect straight to Dex.
   (#4475 isn't merged yet, so this variant requires manual nav to /oidc?cluster=main.)
3. Complete Dex login.
4. Observe where you land.

Expected: cluster root, because /auth's localStorage signal has no opener
to listen for it. This is the autologin variant of the same root cause.

EOF

cat <<EOF >> "$NOTES"
# 4877 / 2134 repro run on $(date -Iseconds)

## Variant 1 (popup, no reload)
- Final URL after login:
- Verdict: fixed on main / still broken / unclear

## Variant 2 (popup, with reload)
- Final URL after login:
- Verdict:

## Variant 3 (full-page, no opener)
- Final URL after login:
- Verdict:

## PR 1 design implications
EOF

echo "Recipe printed. Notes template at $NOTES."
