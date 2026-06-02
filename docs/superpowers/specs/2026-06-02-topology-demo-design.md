# AI Runway — Topology Tab Demo Screen (UI-only)

**Date:** 2026-06-02
**Status:** Draft for review
**Scope:** Demo / conversation-piece UI for the Topology tab described in
`projects-and-aks-overlay.md` §6a. No backend, no real data, no plugin
wiring. The goal is a self-contained HTML mockup that stakeholders can
play with in a browser to validate the visual direction and the
information density before any implementation work begins.

---

## 1. Purpose

`projects-and-aks-overlay.md` §6a defines the Topology tab as a v1.0
stretch goal: the default view of a Project, a left-to-right graph of
the Project's members, edges by relationship, GPU-aware. Before any of
that work is scoped or scheduled, we want a high-fidelity demo to:

1. **Validate the visual direction** — does a Project-as-application
   topology view actually feel like the right answer when you see it?
2. **Test information density** — the spec calls out that the topology
   view should not duplicate the Observability tab, but for a *demo*
   the audience response is sharper if model nodes carry AI-flavored
   metrics on their face and the side drawer goes deep. This mockup
   leans heavily into that to see how far we can push it.
3. **Serve as a conversation piece** — internal demos, stakeholder
   reviews, recorded walkthroughs. Looks like a real product
   screenshot, behaves like a real product when clicked.

Non-goals: shippable code, backend integration, performance work,
react-flow library evaluation, accessibility audit. Those happen when
the real §6a Topology tab implementation is scoped — this demo informs
that scoping.

## 2. Scope

**In scope.** A single, self-contained HTML file that renders:

- Headlamp-style chrome (left sidebar with AI Runway nav group; top
  breadcrumb with cluster pill).
- Project header — title, Ready chip, AI-flavored overview strip
  (project throughput, avg TTFT, active sessions, cache hit, cost/1M
  tokens), tab row with Topology active.
- Topology canvas with four lanes (Ingress · Agent · Models ·
  Memory/Secrets) and the agent-app graph described in §3.
- Hover interaction on edges (tooltip with edge kind + source).
- Click interaction on nodes (right-side detail drawer with deep
  AI-workload metrics — see §4).
- Visual polish: radial gradient background, tinted lane backgrounds,
  glow on GPU and agent nodes, gradient `routes-to` edges, status dots
  with shadow, sparklines, GPU-utilization bars, histogram, distinct
  edge styles per relationship kind.

**Out of scope.** Real data; backend calls; live updates; mobile
responsive layout; theming beyond the dark default; keyboard
navigation; tests; bundling; integration with the actual Headlamp
plugin.

## 3. Demo content: the agent-app graph

A Customer Support Agent — a deliberately developer-facing example
that exercises the multi-model, multi-storage, AKS-integrated story:

```
Gateway → HTTPRoute → Service → agent-app (langgraph)
                                      ├─ llama-3-70b-instruct (vLLM, A100×2, FP8)   ← reasoning
                                      ├─ phi-3-mini-router    (vLLM, T4×1, spec-dec) ← routing / fast path
                                      ├─ bge-embeddings       (TEI, T4×1)            ← RAG embeddings
                                      ├─ vector-db (qdrant, 3-pod StatefulSet)
                                      ├─ rag-index (50Gi PVC, managed-csi-premium)
                                      ├─ aoai-creds (Secret, AOAI fallback)
                                      └─ hf-token (pull secret)
```

Edges follow the §6a edge table exactly (`routes-to`, `selects`,
`refs`, `mounts`, `owns`), with the agent → model edges modeled as
`references`. The `bge-embeddings` node is intentionally in a
**warning** state (GPU 91%, queue depth growing, p95 latency +22%) so
the demo has a story to tell beyond "everything is green" — clicking
that node opens a drawer that leads with a "Saturation detected"
banner and a "Run IG: trace_oomkill" action button.

## 4. Information density: AI-flavored metrics

The demo leans deliberately into AI-workload-specific metrics. This
goes further than §6a's spec text — which keeps the topology view
thin and routes detail to Observability — but is appropriate for a
**conversation-piece demo** whose job is to make the audience feel
what a Project view *could* surface. The implementation phase
revisits whether all of this lives on the Topology tab or some
migrates to Observability.

**Project header strip (project-wide aggregates):**
- Project throughput (tokens/s across all MDs)
- Avg TTFT across MDs
- Active sessions
- Semantic cache hit rate
- Cost per 1M tokens (24h)

**On model node faces (visible without clicking):**
- TTFT and TPOT (with sparkline + delta arrow)
- Tokens/s (with sparkline + delta)
- Inline GPU utilization bar
- Inline KV-cache utilization bar
- SKU chip (A100 80G ×2, T4 ×1), engine chip (vLLM 0.6, TEI 1.2),
  feature chip (FP8, spec-dec, slow)
- Status dot with shadow (green / amber / red)

**In model detail drawer (each section is a card grid):**

| Section | Metrics |
|---|---|
| Latency | TTFT p50/p95/p99, TPOT, inter-token jitter, E2E p95 |
| Throughput & batching | decode tok/s, prefill tok/s, running batch (X/max), pending requests, **spec-decode acceptance %**, preemptions/min |
| KV-cache & prefix cache | KV-cache util, prefix-cache hit rate, evictions/min, context length p95 |
| GPU telemetry (DCGM-shaped) | GPU util, **SM occupancy**, mem bandwidth, power (W), temp (°C), **NCCL bandwidth** for multi-GPU |
| TTFT distribution | inline histogram with hot tail in orange |
| Cost | tokens served, GPU-hours, $/1M tokens, vs-AOAI delta |

**Agent drawer:** request rate, p95 latency, tool calls/s, active
sessions, avg turns/conversation, tool error rate, **routing
decisions breakdown** (% to each downstream model + % to AOAI
fallback), RAG retrieval stats (vector QPS, chunks retrieved,
reranker hits, semantic cache hit).

**AOAI Secret drawer:** credentials + **fallback traffic** (requests,
tokens, cost, p95) in the last 15m — surfaces "the topology shows the
spend leak."

**Vector-db drawer:** vector count, dimensions, disk used, search QPS,
search p95, recall@10.

The intent: a viewer scanning the canvas sees the bottleneck without
clicking; clicking gets them the smoking gun. Both layers exist
because the audience for a demo skims the canvas first, then drills.

## 5. Visual direction

**B (dashboard-rich) + hint of C (poster polish)**, picked in
brainstorming. Translates to:

- Dark Headlamp-adjacent palette, radial-gradient canvas background.
- Tinted lane backgrounds (very subtle), uppercase lane labels.
- Node faces have layered backgrounds, soft shadows; GPU nodes carry
  a warm orange glow, agent nodes carry a purple glow.
- Status dots have a soft `box-shadow` of their own color (the "C"
  polish that catches the eye).
- Edges are SVG bezier paths between node anchor points; four styles
  by edge kind (gradient solid for `routes-to`/`selects`, dashed for
  `owns`, longer dashes for `mounts`, dotted for `references`).
- Hover on a node lifts it 1px and intensifies the glow; the
  associated drawer state shows a 2px focus ring.

Bottom-left legend explains edge styles; top-right toolbar carries
zoom / fit / collapse / layout buttons (visual only).

## 6. Interactivity (option C from brainstorming)

- **Hover any edge** → tooltip near the cursor showing the edge kind
  in accent color and the underlying K8s relationship (e.g.
  `HTTPRoute → Service · routes-to · backendRefs`).
- **Click any node** → right-side drawer slides in (440px wide,
  scrollable). Node gets a selection ring. The drawer auto-opens on
  `llama-3-70b-instruct` at page load so the demo lands on the
  richest view.
- **Close drawer** → ✕ in the drawer header. Selection ring clears.
- **Drawer footer** → 1–2 action buttons per node (`Open in
  Headlamp` primary, plus a context-appropriate secondary like
  `Run IG: profile_cuda` or `Open Azure Portal`). Buttons are visual
  only.
- **Toolbar buttons** (zoom / fit / collapse / layout) are visual
  only — included so the screenshot looks complete.

No state persists across reload; this is a static page.

## 7. File layout

Single self-contained HTML file, no build step, no external assets
beyond inline SVG. Vanilla JS for the click/hover handlers. All CSS
inline in a `<style>` block.

**Proposed final location:**
`docs/superpowers/demos/topology-demo.html`

**Working location during iteration:**
`.superpowers/brainstorm/<session>/content/topology-demo-v2.html`
(already produced during the brainstorm session and not committed —
the implementation phase moves and polishes it).

A short README sibling (`topology-demo.md`) explains how to view it
(`xdg-open` / `open` / serve via `python -m http.server`) and what
the demo represents.

## 8. Relationship to the real §6a Topology tab

This demo is a **forecasting artifact**, not a prototype to be lifted
into the codebase. Specifically:

- The hand-laid-out node positions and hand-drawn SVG bezier edges are
  throwaway; the real implementation will use react-flow per §6a, with
  computed layout from the lane discipline.
- The node faces here pack more metric content than §6a currently
  specifies. If reviewers like it, the implementation phase needs to
  decide which signals stay on Topology vs. move to Observability —
  the demo gives that conversation something concrete.
- The drawer is a stand-in for "click → open in Headlamp" per §6a (no
  editing in topology view). It exists in the demo only to show what
  the surrounding product feels like; the real Topology tab navigates
  away on click rather than rendering a side panel.
- Tooling chips (FP8, spec-dec) and metrics that depend on
  engine-specific exporters are aspirational and will follow whatever
  the engine-adapter registry (§6 Panel 1) ends up surfacing.

## 9. Risks &amp; open questions

- **Demo over-promises.** The metric density on model node faces and
  in the drawer assumes telemetry that the v1.0 backend ring buffer
  (§6) does not produce. We need to be honest in any presentation
  that several of these come from Prometheus or DCGM and are v1.1+.
  Mitigation: include a one-line "aspirational metrics" note in the
  demo README before showing it externally.
- **Drawer pattern may not match real product behavior.** §6a says
  click → navigate to Headlamp's detail page. If the demo bakes in
  expectations of a side panel, the real implementation has to
  push back on those expectations. Mitigation: call this out
  explicitly when demoing.
- **No accessibility work.** Demo is mouse-only. Real §6a calls for
  keyboard navigation across nodes and edges; the demo does not
  reflect that. Mitigation: out of scope, documented.

## 10. Deliverables

1. Self-contained `topology-demo.html` at
   `docs/superpowers/demos/topology-demo.html`.
2. Sibling `topology-demo.md` README — what it is, how to view, what
   the aspirational metrics are vs. what v1.0 actually produces.
3. Commit both. No other code changes.
