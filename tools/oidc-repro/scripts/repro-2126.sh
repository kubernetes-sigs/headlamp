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

# Reproduce https://github.com/kubernetes-sigs/headlamp/issues/2126
# — OIDC login in the desktop app completes in the system browser and the
# Electron renderer never picks it up.
#
# Hypothesis: for kubeconfig-OIDC clusters the desktop app opens the system
# browser. Dex redirects back to /oidc-callback, which the browser handles, so
# the session cookie is set in the browser's jar. Electron's renderer has a
# different cookie store and no channel to learn the login happened.
#
# Manual, because it needs an Electron build and a real system browser. This
# script prints the recipe and a notes template.
set -euo pipefail

# shellcheck source=./common.sh
source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )/common.sh"
require_cluster

NOTES="$(notes_file 2126.md)"
DEX_ISSUER="$(dex_issuer_url)"

cat <<EOF
=== #2126 — desktop callback handoff, manual repro ===

Prerequisites:
  - An Electron build: npm run start:with-app (from the repo root)
  - The harness stack up (this cluster's Dex is at $DEX_ISSUER)

Note: Dex is on a NodePort, so the system browser reaches it at the same URL
the pods do. No port-forward needed.

Steps:
  1. Start the desktop app:  npm run start:with-app
  2. Add a cluster whose kubeconfig user is an OIDC user pointing at:
         issuer:    $DEX_ISSUER
         client ID: headlamp-test
         secret:    headlamp-test-secret
  3. Click Sign In on that cluster.
  4. Log in as alice@example.com / password.

Observe and record:
  - Did sign-in open the SYSTEM browser or an in-app BrowserWindow?
    The reported failure path is the system browser.
  - Where does the browser end up after login?
  - Does the Electron renderer ever reflect the login?
  - Any cookies or localStorage on the Electron side afterwards?

Diagnostic taps:
  - Electron main process console: watch for 'open-url' events.
  - Server side: the LOCAL headlamp-server that \`npm run start:with-app\`
    starts. It is the one handling /oidc and /oidc-callback for this flow, so
    watch its output in that terminal. The in-cluster hl-a / hl-b replicas are
    NOT in the desktop path and will log nothing -- do not read their silence
    as "the callback never arrived".
  - IdP side, and this one IS in the path (the local server redirects the
    system browser to this cluster's Dex):
        kubectl --kubeconfig $KUBECONFIG -n dex logs deploy/dex -f

The thing to pin down: whether the only gap is "no path from the browser back
to the renderer", or whether the session is also never established on the
Electron side at all. Those need different fixes.

Record findings in $NOTES
EOF

{
  echo "# 2126 repro run on $(date -Iseconds)"
  echo
  echo '## Observations'
  echo '- Sign-in opened (system browser / in-app window):'
  echo '- Browser URL after login:'
  echo '- Electron renderer updated? yes / no'
  echo '- Cookies on the Electron side:'
  echo '- localStorage on the Electron side:'
  echo
  echo '## Conclusion'
  echo
  echo '- Is the session established anywhere Electron can see it?'
  echo '- If not, the fix needs a transport back to the renderer, not just a'
  echo '  redirect change.'
  echo
} >> "$NOTES"

echo
echo "Notes template appended to $NOTES"
