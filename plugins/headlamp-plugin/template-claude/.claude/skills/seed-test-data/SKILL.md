---
name: seed-test-data
description: Create real test data for this plugin — author sample custom resources (from the project's docs, validated against the live CRD schema) under test-files/deploy/ named by state, write the required test-files/README.md (manual setup + scenario→state matrix), build any custom images a scenario needs, and apply them to the chosen cluster so the plugin renders against real objects. Use after the operator is installed but the cluster has no instances yet.
allowed-tools:
  - mcp__kubernetes__*
  - Bash(kubectl get:*)
  - Bash(kubectl explain:*)
  - Bash(kubectl config use-context:*)
  - Bash(kubectl apply -f test-files:*)
  - Bash(kubectl delete -f test-files:*)
  - Bash(kubectl create namespace:*)
  - Bash(docker build:*)
  - Bash(kind load:*)
  - Bash(minikube image load:*)
  - Write(test-files/**)
  - Edit(test-files/**)
  - Edit(PLAN.md)
  - WebFetch
  - WebSearch
---

# seed-test-data

Installing the operator gives you the CRDs but **no instances** — so the views are still empty.
This skill creates realistic sample resources (and any workloads a scenario needs) so the plugin can
be built and verified against real data, covering the distinct states the UI must render. Model the
layout on KEDA's `test-files/` (https://github.com/headlamp-k8s/plugins/tree/main/keda/test-files).

## Required deliverables — not done until ALL exist

```
- [ ] test-files/deploy/*.yaml   — sample CRs named by state (…-running.yaml, …-failed.yaml, …) + supporting workloads
- [ ] test-files/README.md       — REQUIRED: manual-setup walkthrough + scenario→state matrix (step 5)
- [ ] (if needed) test-files/<app>/ + Dockerfile — custom image, built/loaded
- [ ] applied to the cluster and verified (CRs reach expected states; plugin renders them)
```

The **README is the most-skipped item** — author it as part of seeding. One file per state under
`test-files/deploy/` (not one combined YAML).

## Steps

1. **Source specs from the project's docs** (WebFetch/WebSearch the official examples) — don't
   invent fields — then **validate against the live schema**: `kubectl explain <res>.spec` / the
   CRD's `openAPIV3Schema` (kubernetes MCP), so required fields/enums are right for the installed
   version.

2. **Author fixtures under `test-files/deploy/`**, deliberately covering the **distinct states the
   plugin renders** — healthy/**Running**, **Failed/Error**, **Warning/Degraded**, and any
   project-specific states (Paused, Fallback, …). Name files by the state they produce
   (`scaledobject-running.yaml`, `scaledobject-failed.yaml`). Every status column/badge the UI shows
   should have a fixture that exercises it.

3. **Custom images — when a scenario needs real activity** (e.g. a load generator so a trigger
   fires): create the app source + `Dockerfile` under `test-files/`, `docker build`, and make it
   available — kind: `kind load docker-image <img>`; minikube: `minikube image load <img>`;
   docker-desktop: local image + `imagePullPolicy: IfNotPresent`; remote: push to a reachable registry.

4. **Apply to the cluster (permission-gated). ⛔** Applying mutates the cluster — **ask first**, then
   (cluster MCP is read-only, helm MCP is install-only, so use the CLI):
   ```bash
   kubectl apply -f test-files/deploy/ --context <ctx> -n <namespace>
   ```
   Build/load any image before applying workloads that reference it. Verify via the kubernetes MCP
   that the CRs reach the expected states; record the scenarios → states in `PLAN.md` (Test fixtures).

5. **Write `test-files/README.md` (required)** so a human can reproduce every scenario:
   - **Use case & prerequisites** — what the plugin shows, operator/version, cluster/namespace, any
     external dependency (broker, registry).
   - **Manual setup, step by step** — exact commands in order (build/load image; `kubectl apply`
     order, workloads before the CRs that target them; **how to induce each state**).
   - **Scenario → state matrix:**

     | Fixture | Produces | Plugin should show |
     |---|---|---|
     | `deploy/scaledobject-running.yaml` | Healthy / **Running** | Ready=True, Active, green status |
     | `deploy/scaledobject-failed.yaml` | **Failed** (bad trigger auth) | Ready=False, error reason in Status |
     | `deploy/scaledobject-paused.yaml` | **Paused** (annotation) | Paused badge, replicas frozen |

   - **Cleanup** — `kubectl delete -f deploy/ --context <ctx> -n <ns>`.

## Guardrails

- Don't fabricate CR specs — source from docs, validate against the live CRD schema. A spec the
  apiserver rejects yields no data.
- Applying fixtures / building / pushing images are cluster/outward actions — confirm cluster,
  namespace, image target first; report what was applied.
- Cleanup is the user's call (the cluster MCP can't delete) — give them the `kubectl delete` command.
- Keep secrets out of fixtures — use obvious placeholder credentials and say so.
- `test-files/` is committed, so the scenario is reproducible and documents how to exercise the plugin.
