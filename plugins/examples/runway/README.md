# runway-topology-demo

Headlamp example plugin: a demo / conversation piece for the Topology
tab described in `projects-and-aks-overlay.md` §6a. Renders a fictional
Customer Support Agent project — gateway, agent app, three model
deployments, vector DB, RAG PVC, AOAI credential helper, HF pull
secret — as a left-to-right topology graph with rich AI-flavored
metrics on each model node and a deep side drawer per node.

**This is a conversation piece, not a reference implementation.** It
hardcodes all data, requires no cluster connection, and includes
several forward-looking concepts that the source spec does not yet
define (see "Forward-looking" below).

Design: `docs/superpowers/specs/2026-06-02-topology-demo-design.md`
ADR: `docs/adr/0001-topology-demo-as-headlamp-plugin.md`
Spec feedback: `docs/superpowers/specs/projects-and-aks-overlay-feedback.md`

## Install and run

The plugin must be installed under Headlamp's user config plugin directory before `make run-app` picks it up. Headlamp's dev build does _not_ read directly from `plugins/examples/`.

### One-shot install (typical demo flow)

```bash
# 1. Build the plugin
cd plugins/examples/runway
npm install        # first time only
npm run build      # produces dist/main.js

# 2. Install into Headlamp's user plugin dir using the official
#    headlamp-plugin extract command — copies main.js + package.json
#    into ~/.config/Headlamp/plugins/runway/ (the directory name
#    'runway' comes from the source folder, NOT the package name).
cd ../../..        # back to repo root
npx --prefix plugins/examples/runway headlamp-plugin extract \
    plugins/examples/runway ~/.config/Headlamp/plugins

# 3. Run Headlamp (loads plugins from ~/.config/Headlamp/plugins/ at startup)
make run-app
```

The sidebar entry **AI Runway → Topology demo** appears after Headlamp finishes loading. No cluster connection is required — the demo route registers with `useClusterURL: false` and `noAuthRequired: true`.

### Iteration loop (rebuild + reload during demo polish)

Headlamp loads plugins at startup and does not hot-reload them. After any source change:

```bash
cd plugins/examples/runway && npm run build && \
  cd ../../.. && \
  npx --prefix plugins/examples/runway headlamp-plugin extract \
    plugins/examples/runway ~/.config/Headlamp/plugins
# then restart make run-app (Ctrl-C, re-run)
```

A faster inner loop: symlink the built `main.js` so a rebuild is immediately visible without re-running `extract`:

```bash
ln -sf "$(pwd)/plugins/examples/runway/dist/main.js" \
    ~/.config/Headlamp/plugins/runway/main.js
# now: cd plugins/examples/runway && npm run build  →  restart Headlamp
```

### Where plugins live

| Location                               | Used by                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `plugins/examples/runway/`             | source tree — what you edit                                                                     |
| `plugins/examples/runway/dist/main.js` | `npm run build` output (not used by Headlamp directly)                                          |
| `.plugins/<name>/` (repo root)         | the packaged production Headlamp app build (`make app-build`) — NOT the dev `make run-app` flow |
| `~/.config/Headlamp/plugins/<name>/`   | what `make run-app` (Electron dev mode) actually reads                                          |

`make run-app` runs `app/scripts/setup-plugins.js` which fetches the three default plugins listed in `app/app-build-manifest.json` into `.plugins/`, but the Electron backend then reads from `~/.config/Headlamp/plugins/` (per `defaultPluginDir()` in `backend/pkg/config/config.go`). Custom example plugins like this one have to be installed there manually.

### Browser-only frontend dev (`make frontend`) does NOT load plugins

If you launch just the frontend dev server (`make frontend` / `npm run frontend:start`) and view in a browser at `localhost:3000`, **no plugins load** in that mode — the plugin loader is wired through the Electron app shell. Use `make run-app` for plugin work.

### Production install

```bash
cd plugins/examples/runway && npm run build
# Then either:
# (a) headlamp-plugin extract into the production plugin dir on the target host
# (b) headlamp-plugin package + drop the tarball into the host's plugin dir
```

## Original brief install snippet (kept for reference)

The original plan called for a simple two-terminal flow:

```bash
cd plugins/examples/runway && npm install && npm start
```

In practice, that runs the headlamp-plugin watcher but does NOT install the bundle into Headlamp's plugin dir. Use the `headlamp-plugin extract` flow above instead.

## What you see

- Project header strip with AI-flavored aggregates (project
  throughput in tok/s, avg TTFT, active sessions, semantic cache hit,
  cost/1M tokens over 24h).
- Topology canvas with four lanes: Ingress · Agent · Models · Memory.
- Per-model nodes carry TTFT / TPOT / tokens/s sparklines, plus
  inline GPU utilization and KV-cache bars on the node face.
- Hover any edge for an explanation of the relationship.
- Click any node for a side drawer with latency, throughput,
  KV-cache, GPU telemetry (DCGM-shaped), TTFT distribution
  histogram, and cost sections.

The `bge-embeddings` model is intentionally saturated (GPU 91%,
queue growing). The drawer banner is **observational only** — no
recommendation, no implied action. The spec's `Ready/Degraded/Empty`
chip is deliberately not an alert; this demo respects that.

## Where each metric would come from

Every metric in this demo is illustrative. In a real wire-up, the
data would come from one of:

| Metric                                                                                        | Source                                                                                                             |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| TTFT, TPOT, e2e latency, tokens/s, requests/s, queue depth, KV-cache util, error rate         | **Inference engine** (vLLM / TEI Prometheus endpoint, served through the AI Runway backend or Prometheus directly) |
| Prefix cache hit, running batch size, spec-decode acceptance, preemptions/min, context length | **Inference engine** (extended Prometheus exposition)                                                              |
| GPU util, SM occupancy, mem bandwidth, power, temp                                            | **DCGM exporter**                                                                                                  |
| NCCL bandwidth, NCCL retransmits                                                              | **Inspektor Gadget** (`trace_tcpretrans`, `profile_tcprtt`)                                                        |
| OOM kills, CUDA allocations                                                                   | **Inspektor Gadget** (`trace_oomkill`, `profile_cuda`)                                                             |
| Cost / GPU-hours / $/1M tokens                                                                | **Not yet exposed** — would need a billing exporter                                                                |
| Routing decisions breakdown, tool calls/s, turns/conversation, semantic cache hit             | **Not yet exposed** — requires the agent app to expose these (see Forward-looking note 1)                          |
| Vector count, search QPS / p95, recall@10                                                     | **Vector DB** (qdrant `/metrics`)                                                                                  |

## Forward-looking concepts

Three things in this demo go beyond what the v1.0 source spec
defines. Both findings #1 and #2 are captured as spec feedback in
`docs/superpowers/specs/projects-and-aks-overlay-feedback.md` for
follow-up against the source spec.

1. **Agents as a first-class concept.** The "Agent" lane and the
   agent-shaped face/drawer metrics (tool calls, turns, routing
   decisions) assume the AI Runway plugin would detect agent
   runtimes (langgraph / LlamaIndex / AutoGen) the way `projects-and-aks-overlay.md`
   §7 detects inference engines. Today it does not.
2. **`calls-runtime` edge kind.** The agent → model edges have no
   equivalent in the source spec's §6a edge table, which only
   covers K8s-state-derivable relationships. The demo draws them
   anyway (visually identical to `routes-to`) because without them
   an agent-shaped Project's topology is disconnected islands.
3. **Aspirational metric sources.** Several metrics in the table
   above are labeled "not yet exposed." The demo shows them because
   they're what makes an agent-shaped Project legible; the
   implementation conversation is which to prioritize wiring up.

## Glossary

Terms used here that got loose during brainstorming and are pinned
so the implementation conversation doesn't drift:

- **Agent** — an app Deployment running an LLM-orchestration
  runtime (langgraph, LlamaIndex, AutoGen, etc.) that makes
  runtime decisions about which downstream model to call.
  Forward-looking; not detected by v1.0.
- **Routing decision** — the agent's runtime choice of which
  downstream model to call. Distinct from HTTPRoute (network-layer)
  routing.
- **Fallback** — the agent's runtime decision to call an alternative
  model (e.g., AOAI) when the primary path fails. The plugin only
  provides credentials per `projects-and-aks-overlay.md` §9.6; it
  does not implement fallback orchestration.
- **Project throughput** — sum across member ModelDeployments of
  their reported tokens/s.
- **Cache hit (in the project header)** — semantic cache hit at the
  agent layer. Distinct from per-model KV-cache and prefix cache,
  which live in model drawers under their own labels.
- **`calls-runtime` edge** — forward-looking edge kind for "this Pod
  makes runtime HTTP calls to that Service." Not in the source-spec
  edge table.

## Long-term location

This plugin lives in the Headlamp repo today for convenience. It is
expected to move to the kaito-project/airunway plugin repo when one
exists.
