/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Evaluates a plugin's `clusterSelector` against a cluster's labels.
 *
 * Equality-only, comma-separated `key=value` pairs (e.g. `"tenant=a,has-velero=true"`) —
 * the same syntax as `kubectl`'s `-l`, restricted to the equality subset. Set-based
 * operators (`in`, `notin`, `exists`) are intentionally not supported; the backend's
 * `clusterProfileMatchesSelector` supports the full syntax for the sync-time gate, but
 * this frontend matcher only needs to cover the common case of showing/hiding a plugin.
 *
 * Permissive by design in two cases, so that adding `clusterSelector` support never
 * breaks an existing setup:
 * - No selector (empty/undefined): always matches — a plugin without `clusterSelector`
 *   behaves exactly as before this feature existed.
 * - No labels available for the cluster (`null`/`undefined`, e.g. a manually-added
 *   kubeconfig cluster with no Cluster Inventory ClusterProfile to carry labels): always
 *   matches, rather than hiding the plugin because Headlamp simply doesn't know the
 *   cluster's labels.
 *
 * Conversely, a malformed *non-empty* selector fails closed (never matches), rather than
 * silently ignoring the malformed part: an empty term from a stray/leading/trailing/
 * doubled comma (e.g. `","`, `"tenant=a,"`, `"tenant=a,,has-velero=true"`) makes the whole
 * selector invalid, even if every other term would have matched. This field controls
 * cluster scoping, so a typo should not quietly make a selector more permissive than what
 * was actually written.
 *
 * @param selector - The plugin's `clusterSelector`, e.g. `"tenant=a,has-velero=true"`.
 * @param labels - The active cluster's labels, or `null`/`undefined` if unavailable.
 * @returns Whether the selector matches (or is inapplicable and so treated as a match).
 */
export function matchesClusterSelector(
  selector: string | undefined | null,
  labels: Record<string, string> | undefined | null
): boolean {
  const trimmedSelector = (selector ?? '').trim();
  if (!trimmedSelector) {
    return true;
  }

  if (!labels) {
    return true;
  }

  return trimmedSelector
    .split(',')
    .map(term => term.trim())
    .every(term => {
      // An empty term means a malformed selector (e.g. "," or a trailing/leading/double
      // comma like "tenant=a,"). Reject it outright rather than silently dropping it —
      // this field controls cluster scoping, so a malformed selector must fail closed
      // (never match) instead of quietly becoming more permissive than what was written.
      if (!term) {
        return false;
      }

      const equalsIndex = term.indexOf('=');
      if (equalsIndex === -1) {
        // Not a `key=value` term (e.g. a set-based expression) — unsupported, so it
        // can never be satisfied by this equality-only matcher.
        return false;
      }

      const key = term.slice(0, equalsIndex).trim();
      const value = term.slice(equalsIndex + 1).trim();

      return key !== '' && labels[key] === value;
    });
}
