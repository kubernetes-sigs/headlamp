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

# Reproduce https://github.com/kubernetes-sigs/headlamp/issues/4877
# and https://github.com/kubernetes-sigs/headlamp/issues/2134
# — the URL a user asked for is lost across an OIDC login.
#
# Current behavior: popup completion restores location.state.from. Direct
# login with no return intent uses the cluster-root fallback, as expected.
# History state is not automatically lost on reload. Full-page /auth completion
# explicitly navigates to a stored return URL or, without one, the cluster route.
# The historical popup bug is fixed; these are manual routing checks, not
# asserted reproductions. Callback replica mismatch and Kubernetes rejection
# of Dex tokens must be distinguished from a lost return route.
#
# This script prints the recipe for all three variants and a notes template. It
# does not drive the browser: what is being observed is where the URL bar ends
# up, and asserting that mechanically would need a full browser automation
# dependency this stage does not warrant.
set -euo pipefail

# shellcheck source=./common.sh
source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )/common.sh"
require_cluster

HEADLAMP="$(headlamp_url)"
NOTES="$(notes_file 4877.md)"
# Any non-root route works; /c/:cluster/pods is the pod list
# (frontend/src/lib/router/index.tsx). Swap in a pod detail route
# -- /c/main/pods/<namespace>/<name> -- if you want a deeper link.
DEEP_LINK="$HEADLAMP/c/main/pods"
# The AuthChooser route. `login` is defined in frontend/src/lib/router/index.tsx
# with useClusterURL defaulting to true, so it resolves under /c/:cluster.
# Reaching it by direct navigation is what produces a history entry with no
# state -- see VARIANT 2.
LOGIN_URL="$HEADLAMP/c/main/login"

cat <<EOF
=== #4877 / #2134 — manual repro ===

Headlamp:  $HEADLAMP
Deep link: $DEEP_LINK

Use the test credentials in dex/dex-config.yaml, not copied into notes.
Use a fresh private window each time so no session or return intent carries over.
These checks are unverified here. This stack deliberately rejects Dex tokens at
Kubernetes; record the route reached on callback completion separately from any
subsequent return to login. A cross-replica callback 400 is #4019, not #4877.

------------------------------------------------------------
VARIANT 1 — popup flow, no reload
  1. Open a private window.
  2. Go to: $DEEP_LINK
  3. AuthChooser appears. Click the OIDC sign-in button.
  4. Complete the Dex login.
  5. Record the URL bar.

  If the deep link comes back, history.replace(from) is doing its job and this
  variant needs regression coverage only.

------------------------------------------------------------
VARIANT 2 — AuthChooser reached with no history state
  1. Open a private window.
  2. Go DIRECTLY to: $LOGIN_URL
     Paste it in the URL bar; do not arrive via the deep link.
  3. Click sign-in and complete the Dex login.
  4. Record the URL bar.

  Why this and not a reload: RouteSwitcher redirects to the login route with
  state {from: location} (frontend/src/components/App/RouteSwitcher.tsx), and
  <Redirect> replaces the history entry, so \`from\` lives in the History API
  entry itself. A reload re-reads that same entry and \`from\` survives -- so
  reloading would just repeat VARIANT 1. Navigating straight to the route
  creates a fresh entry with no state, and AuthChooser falls back to its
  default of createRouteURL('cluster').

  Landing on the cluster root (/c/main or /c/main/) is expected: there was no
  return intent to preserve. This is not a residual deep-link bug.

------------------------------------------------------------
VARIANT 3 — full-page redirect, no opener
  1. Open a private window.
  2. At Headlamp, navigate directly to /oidc with query parameter cluster=main.
  3. Complete the Dex login.
  4. Record where you land.

  This is the no-opener path: current /auth explicitly navigates to the cluster
  route (/c/main or /c/main/) when there is no stored return URL. It does not
  need an opener or a storage-event listener. No deep-link intent was supplied.

------------------------------------------------------------
Watch the server side while you do this (do not copy raw auth output into notes):
    kubectl --kubeconfig $KUBECONFIG -n headlamp logs -l app=hl-a -f
    kubectl --kubeconfig $KUBECONFIG -n headlamp logs -l app=hl-b -f

Record results in $NOTES
EOF

{
  echo "# 4877 / 2134 repro run on $(date -Iseconds)"
  echo
  echo "Deep link used: $DEEP_LINK"
  echo
  echo '## Variant 1 (popup, no reload)'
  echo '- Final application pathname only (no query or fragment):'
  echo '- Preserved? yes / no'
  echo
  echo '## Variant 2 (direct navigation to the login route, no history state)'
  echo '- Final application pathname only (no query or fragment):'
  echo '- Expected cluster-root fallback? yes / no (no return intent)'
  echo
  echo '## Variant 3 (full-page, no opener)'
  echo '- Final application pathname only (no query or fragment):'
  echo '- Explicit navigation to cluster route? yes / no (no return intent)'
  echo
  echo '## Conclusion'
  echo
  echo '- Distinguish routing from cross-replica callback failure and expected'
  echo '  API-server rejection of Dex tokens. Never record codes/tokens/cookies.'
  echo
} >> "$NOTES"

echo
echo "Notes template appended to $NOTES"
