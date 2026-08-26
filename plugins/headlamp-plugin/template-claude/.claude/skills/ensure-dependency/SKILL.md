---
name: ensure-dependency
description: Ensure the CNCF/operator project this plugin targets (Dapr, KEDA, Flux, cert-manager, …) is installed in the chosen cluster — detect its CRDs via the kubernetes MCP, and if missing, ask the user for permission and install via the helm MCP. Use before building or verifying the plugin, whose views render nothing on a cluster without the project's CRDs.
allowed-tools:
  - mcp__kubernetes__*
  - mcp__helm__install_helm_chart
  - Bash(kubectl get:*)
  - Bash(kubectl config get-contexts:*)
  - Bash(kubectl config current-context:*)
  - Bash(kubectl config use-context:*)
  - Bash(helm version:*)
  - Bash(helm repo:*)
  - Bash(helm install:*)
  - Write(src/resources/common.ts)
  - Edit(src/resources/common.ts)
  - Edit(PLAN.md)
---

# ensure-dependency

The plugin's views depend on a project's custom resources, so the project must actually be
installed in the target cluster — otherwise you're building and testing against an empty cluster.
Never silently proceed or fabricate data.

## Steps

1. **Confirm the target cluster.** `kubectl config get-contexts` (or the kubernetes MCP). If more
   than one context, **ask the user which to use**. Then **set it as the current context once** —
   `kubectl config use-context <ctx>` — and run **plain verb-first `kubectl` commands** thereafter
   (`kubectl get …`, not `kubectl --context <ctx> get …`). A `--context` flag between `kubectl` and
   the verb breaks the `allowed-tools` prefix match and re-prompts every command; setting the context
   once keeps the rest prompt-free.

2. **Detect whether the project is installed** (kubernetes MCP, read-only): list CRDs and look for
   the project's API group (`dapr.io`, `keda.sh`, `*.toolkit.fluxcd.io`, `cert-manager.io`, …).
   Absence of its CRDs ⇒ not installed. If present, you're done — go enumerate the CRDs (step 5).

3. **If missing, ASK for explicit permission.** Present: the project, the **chart ref + repo URL**,
   the **target namespace**, and that it installs the **latest** chart (no version pin) into *their*
   cluster, and that uninstall is not automated. Don't install without a clear "yes".

4. **On approval, install via the helm MCP** (`install_helm_chart`) — pass `chart`, `repo`, `name`,
   `namespace`, `createNamespace: true`, and the chosen `context`. Then verify with the kubernetes
   MCP that the CRDs exist and operator pods reach `Running` (give CRDs a few seconds to register).

5. **Enumerate the COMPLETE CRD set** — `kubectl get crds | grep <group>`. This **live** list (not
   your memory of the project's "main" CRDs — you'll miss newer ones like Dapr's `mcpservers`) is the
   plugin's scope.

6. **Record install metadata** in `PLAN.md` (Project & cluster): project, installed version,
   namespace, the official **install-docs URL**, and the `helm`/install command. The views'
   not-installed banner (see `/add-list-view`'s `CrdInstalledGate`) links to these, so also put
   `{ name, docsUrl, installCmd }` in `src/resources/common.ts` as the single source of truth.

7. **Seed test data.** A fresh operator has no instances, so views are still empty — hand off to
   **`/seed-test-data`**.

## Guardrails

- The helm MCP is **install/upgrade only** (no delete, no arbitrary kubectl). To remove a project,
  tell the user to run `helm uninstall <name> -n <ns>` themselves.
- No version pinning via the MCP (installs latest). For a pinned version, the user installs with the
  `helm` CLI (`--version X.Y.Z`) and you proceed once it's present.
- Installing mutates the user's cluster — confirm the exact chart/namespace/cluster first, and
  report what was installed.