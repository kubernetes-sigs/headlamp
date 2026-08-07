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
# Hypothesis: AuthChooser (frontend/src/components/authchooser/index.tsx) calls
# history.replace(from) after login, so the popup flow may already restore the
# deep link on current main. If it does, the remaining gap is one of:
#
#   (a) reloading the deep-linked page before signing in — location.state.from
#       lives in history state and does not survive a reload
#   (b) a full-page redirect with no opener window, where the /auth bridge has
#       nothing listening for its storage event
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

Sign in as alice@example.com / password in every variant.
Use a fresh private window each time so no session carries over.

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

  Landing on /c/main is expected here, and it is the residual to design for:
  there is no \`from\` to replace with. If VARIANT 1 and VARIANT 2 end up at the
  same URL, one of them is not doing what it claims -- check that step 2 really
  was a fresh navigation.

------------------------------------------------------------
VARIANT 3 — full-page redirect, no opener
  1. Open a private window.
  2. Navigate directly to: $HEADLAMP/oidc?cluster=main
  3. Complete the Dex login.
  4. Record where you land.

  This is the no-opener path: /auth signals completion through localStorage,
  and in this variant there is no opener window listening for it.

------------------------------------------------------------
Watch the server side while you do this:
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
  echo '- Final URL:'
  echo '- Preserved? yes / no'
  echo
  echo '## Variant 2 (direct navigation to the login route, no history state)'
  echo '- Final URL:'
  echo '- Preserved? yes / no'
  echo
  echo '## Variant 3 (full-page, no opener)'
  echo '- Final URL:'
  echo '- Preserved? yes / no'
  echo
  echo '## Conclusion'
  echo
  echo '- Which variants fail, and is the common factor the loss of'
  echo '  location.state.from?'
  echo
} >> "$NOTES"

echo
echo "Notes template appended to $NOTES"
