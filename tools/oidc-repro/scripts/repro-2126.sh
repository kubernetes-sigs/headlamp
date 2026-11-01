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
# Existing desktop recipe remains manual and UNVERIFIED. The question is
# whether authentication completes in a browser without updating Electron.
# Do not assume a cookie-store cause without observing the current path.
# A separate disposable OIDC kubeconfig plus isolated Headlamp persistence and
# Electron profile are prerequisites; this script provides no setup subsystem.
set -euo pipefail

# shellcheck source=./common.sh
source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )/common.sh"
require_cluster

NOTES="$(notes_file 2126.md)"
DEX_ISSUER="$(dex_issuer_url)"

cat <<EOF
=== #2126 — desktop callback handoff, manual repro ===

Status: existing recipe UNVERIFIED; no verified isolated desktop launch here.

Prerequisites BEFORE any desktop run:
  - A separate disposable OIDC kubeconfig using the committed Dex fixture.
    The harness kind admin kubeconfig is NOT that OIDC user configuration.
  - Isolated Headlamp persistence AND a separate disposable Electron profile.
    KUBECONFIG alone does not isolate either of these stores. Do not use an
    ambient kubeconfig or an existing desktop profile.
  - An Electron build, a system browser, and the harness Dex at $DEX_ISSUER.

After independently establishing those prerequisites, start the isolated app,
select the disposable OIDC cluster, and use the test credentials documented in
dex/dex-config.yaml. This script does not establish or verify that setup.

Observe and record:
  - Did sign-in open the SYSTEM browser or an in-app BrowserWindow?
    The reported failure path is the system browser.
  - Where does the browser end up after login?
  - Does the Electron renderer ever reflect the login?
  - Are cookies or localStorage present on the Electron side? Record only
    presence/absence, never values, auth URLs, queries or callback bodies.

Diagnostic taps:
  - Electron main process console: watch for 'open-url' events.
  - Server side: the LOCAL headlamp-server used by the isolated desktop app.
    It handles /oidc and /oidc-callback for this flow, so
    watch its output in that terminal. The in-cluster hl-a / hl-b replicas are
    NOT in the desktop path and will log nothing -- do not read their silence
    as "the callback never arrived".
  - IdP side, and this one IS in the path (the local server redirects the
    system browser to this cluster's Dex):
        kubectl --kubeconfig $KUBECONFIG -n dex logs deploy/dex -f

The thing to pin down: whether the only gap is "no path from the browser back
to the renderer", or whether the session is also never established on the
Electron side at all. Those need different fixes.

Do not copy raw auth logs or capabilities into notes. This harness's Kubernetes
API server rejects Dex tokens, so callback completion is not proof of usable
cluster authentication. Record findings in $NOTES
EOF

{
  echo "# 2126 repro run on $(date -Iseconds)"
  echo
  echo '## Observations'
  echo '- Sign-in opened (system browser / in-app window):'
  echo '- Browser application pathname only (no query or fragment):'
  echo '- Electron renderer updated? yes / no'
  echo '- Cookies present on the Electron side? yes / no (no values)'
  echo '- localStorage present on the Electron side? yes / no (no values)'
  echo '- Prerequisites independently verified? yes / no; recipe remains unverified otherwise.'
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
