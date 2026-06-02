# AI Runway — Topology Tab Demo (Headlamp plugin)

**Date:** 2026-06-02
**Status:** Draft for review
**Scope:** A demo / conversation-piece Headlamp plugin that renders the
Topology tab described in `projects-and-aks-overlay.md` §6a. No backend,
no real data, no Project CRD reconciler — the plugin ships one route
with hardcoded fixture data so stakeholders can install it, click
around, and validate the visual direction before the real §6a Topology
tab work is scoped.

> **Note on supersession.** The first cut of this spec proposed shipping
> the demo as a standalone HTML file in `docs/`. That decision was
> revised during the grilling pass: the demo ships as a Headlamp plugin
> instead, so the audience sees the topology view inside the real
> Headlamp chrome rather than in a fake mock-up. See
> `docs/adr/0001-topology-demo-as-headlamp-plugin.md` for the trade-off.

---

## 1. Purpose

`projects-and-aks-overlay.md` §6a defines the Topology tab as a v1.0
stretch goal: the default view of a Project, a left-to-right graph of
the Project's members, edges by relationship, GPU-aware. Before any of
that work is scoped or scheduled, we want a high-fidelity, *installable*
demo to:

1. **Validate the visual direction** — does a Project-as-application
   topology view feel like the right answer when you see it inside
   Headlamp, not a screenshot?
2. **Test information density** — the spec keeps the topology view
   thin and routes detail to Observability. The demo deliberately
   leans the other way (rich on-face metrics, deep side drawer) so we
   can have a concrete conversation about where the line should sit.
3. **Surface gaps in the source spec** — the act of building the
   demo forced two extensions that the source spec does not yet have:
   agents as a first-class concept, and a `calls-runtime` edge kind.
   Captured as feedback in §11.
4. **Serve as a conversation piece** — install the plugin, click the
   sidebar item, demo to stakeholders. Looks like the real product
   because it *is* running in the real product.

Non-goals: shippable Topology code, backend integration, performance
work, react-flow library evaluation, accessibility audit, real Project
CRD interaction. Those happen when the real §6a Topology tab
implementation is scoped — this demo informs that scoping.

## 2. Scope

**In scope.** A Headlamp plugin at `plugins/examples/runway/` that
registers:

- One sidebar entry under a new **AI Runway** group: *Topology demo*.
- One route rendering the Topology view with hardcoded fixture data:
  - Project header — title, Ready chip, AI-flavored overview strip
    (project throughput, avg TTFT, active sessions, cache hit, cost/1M
    tokens), tab row with Topology active.
  - Topology canvas with four lanes (Ingress · Agent · Models ·
    Memory/Secrets) and the agent-app graph described in §3.
  - Hover on edges → tooltip with edge kind + source.
  - Click on nodes → right-side drawer with deep AI-workload metrics
    (§4).
- Visual polish: radial gradient background, tinted lane backgrounds,
  glow on GPU and agent nodes, gradient `routes-to` edges, status
  dots with shadow, sparklines, GPU-utilization bars, distribution
  histogram, distinct edge styles per relationship kind.
- A sibling `README.md` covering: install instructions (`headlamp-plugin`),
  glossary (§10), metric source table (§9), and the forward-looking
  caveats (§5 / §11).

**Out of scope.** Real data; backend calls; live updates; a real
Project CRD; the Projects list / Resources / Observability tabs;
multiple Project archetypes; mobile responsive layout; theming beyond
the dark default; keyboard navigation; cluster connection requirement
(Headlamp itself does not require a cluster, and neither does the
demo); tests.

## 3. Demo content: the agent-app graph

A Customer Support Agent — deliberately developer-facing, exercises
the multi-model + RAG + AKS story:

```
Gateway → HTTPRoute → Service → agent-app (langgraph)
                                      ├─ llama-3 family preset    (vLLM, A100×2, FP8) ← reasoning
                                      ├─ phi-3 family preset      (vLLM, T4×1, spec-dec) ← routing / fast path
                                      ├─ bge-embeddings           (TEI, T4×1)         ← RAG embeddings
                                      ├─ vector-db (qdrant, 3-pod StatefulSet)
                                      ├─ rag-index (PVC, managed-csi-premium)
                                      ├─ aoai-creds (Secret, AOAI credential helper)
                                      └─ hf-token (pull secret)
```

Edges:

- Standard `routes-to`, `selects`, `mounts`, `references` per §6a's
  edge table.
- **`calls-runtime`** (forward-looking; not in the source spec) for
  agent → model edges. Drawn the same as `references` visually but
  semantically distinct — see §11 feedback note.

The `bge-embeddings` node is intentionally in a **warning** state
(GPU 91%, queue depth growing, p95 latency +22%) so the demo has a
story to tell beyond "everything is green." The drawer leads with an
**observational** signal block (raw numbers, no recommendation) — not
an alert, in line with `projects-and-aks-overlay.md` §1's non-goal
on alerting.

**Verification before ship.** SKU names (`Standard_NC48ads_A100_v4`,
`Standard_NC4as_T4_v3`) and KAITO preset family names must be
verified against current Azure AKS GPU pools and KAITO's
`kaitollmconfig.json` before the demo goes out — these are what an
AKS-shop viewer will catch first. Other version numbers (vLLM, TEI,
qdrant, langgraph minor versions) stay illustrative.

## 4. Information density: AI-flavored metrics

The demo leans deliberately into AI-workload-specific metrics. This
goes further than §6a's spec text — which keeps the topology view
thin and routes detail to Observability — but is appropriate for a
**conversation-piece demo** whose job is to make the audience feel
what a Project view *could* surface. The implementation phase
revisits whether all of this lives on Topology vs. moves to
Observability.

**Project header strip (project-wide aggregates):**
- Project throughput (sum of member MD tokens/s)
- Avg TTFT across MDs
- Active sessions
- Semantic cache hit rate
- Cost per 1M tokens (24h)

**On model node faces (visible without clicking):**
- TTFT and TPOT (sparkline + delta)
- Tokens/s (sparkline + delta)
- Inline GPU utilization bar
- Inline KV-cache utilization bar
- SKU chip, engine chip, feature chip (FP8, spec-dec, slow)
- Status dot (green / amber / red)

**In model detail drawer (each section a card grid):**

| Section | Metrics |
|---|---|
| Latency | TTFT p50/p95/p99, TPOT, inter-token jitter, E2E p95 |
| Throughput & batching | decode tok/s, prefill tok/s, running batch (X/max), pending, spec-decode acceptance, preemptions/min |
| KV-cache & prefix cache | KV-cache util, prefix hit, evictions/min, context length p95 |
| GPU telemetry | GPU util, SM occupancy, mem bandwidth, power, temp, NCCL bandwidth for multi-GPU |
| TTFT distribution | inline histogram, hot tail highlighted |
| Cost | tokens served, GPU-hours, $/1M tokens, vs-AOAI delta |

**Agent drawer:** request rate, p95 latency, tool calls/s, active
sessions, avg turns/conversation, tool error rate, routing decisions
breakdown (% to each downstream model + % to AOAI fallback), RAG
retrieval stats (vector QPS, chunks retrieved, reranker hits,
semantic cache hit).

**AOAI Secret drawer:** credentials + **fallback traffic** (requests,
tokens, cost, p95) in the last 15m.

**Vector-db drawer:** vector count, dimensions, disk used, search
QPS, search p95, recall@10.

A viewer scanning the canvas sees the bottleneck without clicking;
clicking gets them the smoking gun.

## 5. Forward-looking elements (called out as such)

Three pieces of the demo are not in the v1.0 source spec and are
labeled as forward-looking in the plugin README:

1. **Agent as a first-class concept** — the "Agent" lane between
   Ingress and Models, the agent-shaped face metrics (tool calls/s,
   turns/conversation), and the agent drawer's routing-decisions
   section all assume agents are detected and treated specially.
   In `projects-and-aks-overlay.md` §7 the framework table lists
   inference engines only — no agent frameworks.
2. **`calls-runtime` edge kind** — agent → model edges. The source
   spec's §6a edge table has no kind for "this pod makes HTTP calls
   to that Service at runtime." Such an edge would need to be
   derivable either from an agent-CRD declaration or from observed
   IG `trace_tcp` traffic (per §8).
3. **Several metrics** — see source table in §9 below. SM occupancy,
   NCCL bandwidth, $/1M tokens, semantic cache hit, routing
   breakdown all require sources outside what the v1.0 backend
   ring buffer produces.

Both #1 and #2 are surfaced as spec feedback in §11.

## 6. Visual direction

**B (dashboard-rich) + hint of C (poster polish)**, picked during
brainstorming. Translates to:

- Dark Headlamp-adjacent palette, radial-gradient canvas background.
- Tinted lane backgrounds (very subtle), uppercase lane labels.
- Node faces with layered backgrounds, soft shadows; GPU nodes carry
  a warm orange glow, agent nodes carry a purple glow.
- Status dots have a soft `box-shadow` of their own color.
- Edges are SVG bezier paths between node anchor points; four styles
  by edge kind (gradient solid for `routes-to`/`selects`/`calls-runtime`,
  dashed for `owns`, longer dashes for `mounts`, dotted for `references`).
- Hover on a node lifts 1px and intensifies the glow; selected node
  gets a 2px focus ring.

Bottom-left legend explains edge styles; top-right toolbar carries
zoom / fit / collapse / layout buttons (visual only).

## 7. Interactivity

- **Hover any edge** → tooltip near the cursor showing the edge kind
  and the underlying K8s relationship.
- **Click any node** → right drawer (440px, scrollable). Node gets a
  selection ring. The drawer auto-opens on the reasoning model node
  at first paint so the demo lands on the richest view.
- **Close drawer** → ✕ button. Selection ring clears.
- **Drawer footer** → 1–2 action buttons per node (`Open in Headlamp`
  primary, plus a context-appropriate secondary). Visual only.
- **Toolbar buttons** — visual only.

No state persists across reload.

## 8. Stack and packaging

- **Plugin scaffold:** `headlamp-plugin create runway` (or equivalent),
  TypeScript + React, follows the same shape as the existing examples
  under `plugins/examples/`.
- **Routing:** one route registered via the Headlamp plugin API,
  sidebar entry under a new "AI Runway" group.
- **UI primitives:** MUI for the shell (sidebar entry, drawer, buttons,
  typography) — matches the rest of Headlamp; custom CSS for the
  canvas (lanes, nodes, glow, gradient edges) — the canvas is
  *supposed* to feel different from the rest of the app.
- **Edges:** SVG with bezier paths, computed from node DOM positions
  on mount + resize. React-flow is what §6a's real implementation
  will use — for the demo, a hand-rolled SVG is faster and avoids
  pulling a dependency we'd then have to defend.
- **Data:** all hardcoded in TypeScript fixture modules; no fetch,
  no Headlamp K8s client calls, no Project CRD reads. The plugin
  works on a Headlamp instance with no cluster connected.
- **Bundle:** standard `headlamp-plugin build`. Install via
  `headlamp-plugin install` or by symlinking into Headlamp's plugin
  directory in dev mode.

## 9. Metric source table (in the plugin README)

Every metric the demo shows is labeled in the README by where the
real data would come from, so audiences understand what would have
to be wired up for the demo to become live. Source labels are
concrete tools rather than version numbers:

| Metric | Source |
|---|---|
| TTFT, TPOT, e2e latency, tokens/s, reqs/s, queue depth, KV-cache util, error rate | **Inference engine** (vLLM / TEI Prometheus endpoint, via AI Runway backend ring buffer or Prometheus) |
| Prefix cache hit, running batch size, spec-decode acceptance, preemptions, context length | **Inference engine** (extended Prometheus) |
| GPU util, SM occupancy, mem bandwidth, power, temp | **DCGM exporter** |
| NCCL bandwidth, NCCL retransmits | **Inspektor Gadget** (`trace_tcpretrans`, `profile_tcprtt`) |
| OOM kills, CUDA allocs | **Inspektor Gadget** (`trace_oomkill`, `profile_cuda`) |
| Cost / GPU-hours / $/1M tokens | **Not yet exposed** — would need a billing exporter |
| Routing decisions breakdown, tool calls/s, turns/conversation, semantic cache hit | **Not yet exposed** — requires the agent app to expose these (see §11 feedback) |
| Vector count, search QPS / p95, recall@10 | **Vector DB** (qdrant /metrics) |

## 10. Glossary (lives in the plugin README; reproduced here)

These terms got used loosely during brainstorming and get pinned in
the README so the implementation conversation doesn't drift:

- **Agent** — an app Deployment running an LLM-orchestration runtime
  (langgraph, LlamaIndex, etc.) that makes runtime decisions about
  which model to call. *Forward-looking; not detected by v1.0.*
- **Routing decision** — the agent's *runtime* choice of which
  downstream model to call. Distinct from HTTPRoute (network-layer)
  routing.
- **Fallback** — the agent's runtime decision to call an alternative
  model when the primary path fails. The plugin only provides
  credentials per `projects-and-aks-overlay.md` §9.6; it doesn't
  implement fallback orchestration.
- **Project throughput** — sum across member ModelDeployments of
  their reported tokens/s.
- **Cache hit** (project header) — semantic cache hit at the agent
  layer. Distinct from per-model KV-cache and prefix cache, which
  live in model drawers under their own labels.
- **`calls-runtime` edge** — forward-looking edge kind for "this Pod
  makes runtime HTTP calls to that Service." Not in the source spec
  §6a edge table.

## 11. Spec feedback for `projects-and-aks-overlay.md`

Two findings from building this demo warrant feedback against the
source spec. Captured as a sibling note at
`docs/superpowers/specs/projects-and-aks-overlay-feedback.md`:

1. **Agents as a first-class concept.** Developer-facing AI Runway
   demos consistently want to show an agent fanning out to multiple
   models, not bare ModelDeployments. The source spec's §7 framework
   table lists inference engines only. Worth considering: agent-runtime
   detection (langgraph / LlamaIndex / AutoGen via image regex or a
   dedicated label `airunway.ai/agent-runtime=<name>`), an `Agent`
   role label paralleling the existing `airunway.ai/role=prefill|decode`
   convention (§4 controller addendum), and agent-shaped engine
   adapters that surface tool-call / routing / session metrics.

2. **An edge kind for runtime calls.** §6a's edge table covers the
   K8s-state-derivable relationships (`routes-to`, `selects`, `owns`,
   `mounts`, `references`). It does not cover "Pod A makes runtime
   HTTP calls to Service B," which is the most important edge in any
   agent-shaped Project. Two ways to make it derivable: have the
   caller declare downstream Services in an agent-CRD field or via a
   well-known env-var convention; or compute the edge from observed
   IG `trace_tcp` traffic (per §8) over a configurable window. Both
   have trade-offs worth a short ADR-style discussion against the
   source spec.

## 12. Deliverables

1. `plugins/examples/runway/` — Headlamp plugin scaffold + Topology
   demo route + fixture data + README (install instructions, metric
   source table, glossary, forward-looking caveats).
2. `docs/adr/0001-topology-demo-as-headlamp-plugin.md` — ADR
   capturing the standalone-HTML vs. plugin trade-off and the
   forward-looking-content posture.
3. `docs/superpowers/specs/projects-and-aks-overlay-feedback.md` —
   spec-feedback note covering the two findings in §11.
4. SKU and KAITO preset values verified before the plugin lands.
