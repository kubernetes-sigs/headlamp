#!/usr/bin/env bash
# Reproduce #2126 — desktop callback handoff.
#
# This one is manual because it needs an Electron build and the system
# browser. Script just lays out the recipe.
set -euo pipefail

mkdir -p tools/oidc-repro/notes
NOTES=tools/oidc-repro/notes/2126.md

cat <<EOF
=== #2126 manual repro ===

Prerequisites:
  - Headlamp Electron dev build (npm run app-dev or npm run app:build)
  - Dex port-forwarded so the system browser can reach it:
      kubectl -n dex port-forward svc/dex 5556:5556
  - A kubeconfig with an OIDC user pointing at the in-cluster cluster.

Steps:
1. Launch the Electron app (npm run app-dev from repo root).
2. Add the kubeconfig-OIDC cluster.
3. Click Sign In on that cluster.

Observe:
  - Does Headlamp open the SYSTEM browser, or an in-Electron BrowserWindow?
    For kubeconfig OIDC clusters the failure path is system browser.
  - After Dex login, does the browser land on /oidc-callback and then /auth?
  - Does the Electron renderer ever update? (Expected: no — that's #2126.)
  - Are there any cookies or localStorage entries on the Electron side after
    the system-browser flow? (Expected: no.)

Diagnostic taps:
  - Watch the Electron main process console for 'open-url' events.
  - Watch headlamp-server logs for /oidc-callback hits and where they redirect.

Record findings in $NOTES.

PR 2 design check: confirm the failure is exactly "callback in system browser,
no path back to Electron renderer". If something else is also broken (e.g. the
cookie IS being set but the renderer doesn't notice), the design changes.
EOF

cat <<EOF >> "$NOTES"
# 2126 repro run on $(date -Iseconds)

## Observations
- Sign-in opens (system browser / Electron window):
- After Dex login, browser URL ends at:
- Electron renderer state after flow:
- Cookies on Electron side (auth_status, headlamp_token, etc.):
- localStorage entries:

## PR 2 design implications
EOF

echo "Recipe printed. Notes template at $NOTES."
