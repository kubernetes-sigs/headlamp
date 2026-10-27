# AKS Upgrade Insights for Headlamp

**An interactive prototype for discovering upgrade risk across AKS clusters.**

This initial draft adds a Headlamp plugin with a cluster readiness overview and a
single-cluster workspace. It is grounded in the AKS Upgrade Insights preview API
contract and uses clearly labeled, synthetic scenarios for its out-of-the-box demo.
The standalone preview and Headlamp plugin share the same UI and data adapters.

> **Prototype, not a supported AKS product.** Demo results are fictional. The live
> integration has not been validated against a preview-enabled customer cluster or
> the AKS Desktop build. A readiness result is a point-in-time evaluation, not an
> upgrade guarantee. This plugin never starts a cluster upgrade.

## Screenshots

### Cluster readiness

Prioritize blockers and warnings, filter by issue category, and inspect a cluster
in a side panel without losing your place. Fleet membership is shown only when it
can be discovered.

![AKS Upgrade Insights cluster readiness view](docs/images/fleet-readiness.png)

### Single-cluster workspace

Inspect the evaluated upgrade scope, affected resources, remediation guidance, and
the exact stored API response.

![AKS Upgrade Insights single-cluster view](docs/images/cluster-readiness.png)

## Start the offline demo

```sh
npm ci
npm run demo
```

Open [http://127.0.0.1:5178](http://127.0.0.1:5178). No Azure login, cluster,
network access, or external data is needed.

Eight demo clusters exercise blocked, warning, ready, expired, and missing
evaluation states. Try the two-minute walkthrough:

1. Select **Blocked** and inspect `aks-checkout-prod`.
2. Open **Disruption budgets** and review the impacted Kubernetes resource and the
   recommended next steps.
3. Simulate remediation. The existing evaluation remains blocked; the cluster is
   not changed.
4. Re-check readiness and inspect the request body. The simulated evaluation is
   now ready for the selected version.
5. Explore the cluster to compare control-plane and agent-pool scopes, see a
   separate node-image evaluation, and review the API response.
6. Reset the demo scenarios from **Data source** settings.

## What is included

- **Cluster readiness:** paged cluster inventory, per-page readiness counts and
  filters, issue categories, sorting, search, export, and an in-context inspector.
- **Optional Fleet membership:** discovered through Azure Fleet resources in the
  configured subscriptions. Missing or inaccessible membership data is shown as
  unavailable, never interpreted as proof that a cluster is standalone.
- **Cluster workspace:** readiness and freshness, control-plane and agent-pool
  breakdowns, affected resources, safe remediation links, maintenance context,
  selectable stored scopes, and API response inspection.
- **Evaluation dialog:** review the exact `generateUpgradeInsights` request. Demo
  requests are simulated. For Kubernetes upgrade scopes, target versions are loaded
  from the cluster upgrade profile and selected from a dropdown. Live requests
  require an explicit confirmation.
- **Typed API adapter:** subscription-scoped cluster inventory, per-cluster
  `upgradeInsights` LIST, server-provided pagination, and synchronous generation.
- **Offline fixtures:** separate Kubernetes version and node OS image scenarios,
  with no implicit substitution to mock results in live mode.
- **Loopback Azure CLI bridge:** opt-in, read-only by default, limited to the
  subscriptions and ARM operations explicitly selected by the operator.

## API and readiness behavior

Upgrade Insights targets the `2026-08-02-preview` API:

```text
GET  {managedClusterId}/upgradeInsights?api-version=2026-08-02-preview
GET  {insightResourceId}?api-version=2026-08-02-preview
POST {managedClusterId}/generateUpgradeInsights?api-version=2026-08-02-preview
```

There is no Upgrade Insights fleet-readiness endpoint. Readiness is aggregated from
each cluster's stored LIST results. Optional membership is discovered through the
stable `Microsoft.ContainerService/fleets` and `members` APIs (`2025-03-01`) within
the configured subscriptions. Access failures and partial discovery are surfaced;
the plugin does not presume every cluster is in a fleet. A cluster with no matching
membership in the configured subscriptions is not guaranteed to be outside a fleet
whose owning subscription was not configured. Cluster targets can differ and remain
visible per row. Kubernetes version and node OS image evaluations are separate scopes.

GET/LIST read stored evaluations and do not compute readiness. Generation is
synchronous and stores a fresh result; it **does not start an upgrade**. The plugin
verifies each live Generate result with GET using its server-returned resource ID.
A failed or stale GET is shown as an error rather than a verified evaluation.
Kubernetes targets are read from the raw ARM upgrade profile's `properties`
envelope. Control-plane targets use the cluster upgrade profile; pool targets use
the selected `agentPools/{name}/upgradeProfiles/default` endpoint because the
cluster profile may return `agentPoolProfiles: null`. Nullable upgrade arrays
mean no available targets, not a parsing failure. Targets are not unioned across
scopes. NodeImage evaluation does not require Kubernetes upgrade-profile access.
The plugin
uses the server-provided `expiresAt` and also applies a clearly client-side
24-hour freshness threshold. Missing/incomplete scopes, failed requests, unknown
statuses, expired snapshots, and changed source versions are never called **Ready**.
The 24-hour threshold is a demo client policy, not the server retention period.

The UI shows 25 clusters per page and reads readiness only for those visible
clusters. Inventory is fetched through ARM continuation pages so search can span
the configured subscriptions; readiness/issue filters and counts are scoped to the
current page. Retrieved readiness is cached in memory for up to 60 seconds, shared
across plugin routes in the current browser session. **Refresh current page**
bypasses that cache. No readiness data is written to browser storage or disk.
The selected data provider and its bridge pairing remain in memory across plugin
route changes; reloading the host clears them.

The linked Headlamp [PR #5747](https://github.com/kubernetes-sigs/headlamp/pull/5747)
visualizes node upgrade execution from Kubernetes Events. Execution progress is
distinct from pre-upgrade readiness and is not fabricated by this plugin.

## Build the Headlamp plugin

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run package
```

The official Headlamp SDK creates `dist/main.js` and
`aks-upgrade-insights-0.1.0.tar.gz`. The archive is intentionally not committed;
the source, lockfile, tests, and screenshots are.

The archive layout is `aks-upgrade-insights/main.js` plus `package.json`. Install
the archive using the plugin directory appropriate to your installed Headlamp or
AKS Desktop version. Restart the host and verify its plugin management screen;
development watch mode can target a different application profile than packaged
AKS Desktop. See [`SETUP.txt`](SETUP.txt) for macOS paths and operational detail.

The global Headlamp page is `/aks-upgrade-fleet`; the selected-cluster page is
`/c/<context>/aks-upgrade-insights`. In demo mode a real kubeconfig context is not
silently matched to a synthetic cluster. Select a demo cluster explicitly.

## Optional live-data bridge

Live access is **not required** for the demo. See [`SETUP.txt`](SETUP.txt) before
enabling it. In brief:

- The local bridge listens only on loopback and obtains an ARM token through
  `az account get-access-token --subscription <validated-subscription>`. The
  token stays in the bridge process and is never returned to the browser.
- It defaults to read-only, allowlists explicit subscriptions and read endpoints,
  validates browser origin and a short-lived in-memory pairing key, and does not
  expose Azure bearer tokens to the UI.
- Readiness generation can be enabled deliberately with `--allow-generate`; the
  UI then requires approval of the exact POST request. It still cannot execute
  upgrades or other cluster-resource writes.
- For an owner-approved internal preview test subscription only, add
  `--preview-opt-in` to inject the exact Upgrade Insights custom-feature header
  on Generate, named GET, LIST and continuation requests. It defaults off,
  does not register a feature, and does not bypass Azure permissions or rollout
  gates. Client-supplied custom headers are not accepted.
- ARM errors retain their actual HTTP status, structured error code/message,
  request ID and retry metadata. They are not all converted into HTTP 502.
- In a selected Headlamp context, explicitly choose an ARM cluster by its
  resource group and subscription. Its full ID is shown and the binding is
  retained only in memory for that provider session; names are never used to
  infer a live mapping.
- The bridge and live API have not been validated with a preview-enabled AKS
  cluster. Feature registration, service rollout, permissions, browser policy,
  and AKS Desktop support must be confirmed by the environment owner.

## Integration validation

See [ARM integration test results](docs/arm-integration-test-results.md) for
automated checks, sanitized real-cluster results, and browser screenshots.
The real ARM run validates the client data adapter and authenticated bridge.
The browser screenshots use synthetic responses and do not establish native
AKS Desktop or live-browser integration.

## Limitations

- No fleet-native readiness API, upgrade execution, automatic remediation, node-event
  progress display, polling, or background re-evaluation.
- No Azure sign-in UI, identity/token storage, or automatic mapping of kubeconfig
  contexts to ARM resources.
- Live inventory and Fleet membership discovery are scoped to explicitly configured
  subscriptions. Partial inventory and membership failures are surfaced; readiness
  counts cover the current page and inventory totals cover reachable subscriptions.
- Demo state is in-memory and resets when the page reloads.
- English-only interface; production-scale virtualization is not implemented.

## Project structure

```text
src/api/types.ts          Validated API/domain schemas
src/api/arm.ts            Per-cluster ARM API provider
src/api/demo.ts           Clearly labeled synthetic provider
src/api/session.ts        In-memory provider shared across routes
src/domain.ts             Freshness, scopes, conservative readiness
src/App.tsx               Shared cluster-list and single-cluster experience
src/index.tsx             Headlamp route and sidebar registration
bridge/server.mjs         Optional loopback-only Azure CLI bridge
bridge/validation.mjs     Read-only ARM endpoint allowlist
demo/                     Standalone local preview
docs/images/              Screenshots shown above
```

## Validation

The initial draft was checked with TypeScript, domain/adapter/UI tests, bridge
allowlist tests, production preview and plugin builds, and the official SDK
packager. The packaged UMD plugin was loaded in an isolated local Headlamp 0.35.0
instance with an empty kubeconfig; no user plugin profile was changed. AKS Desktop
installation and live AKS API access are not yet validated.
