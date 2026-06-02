# Feedback on `projects-and-aks-overlay.md` from the Topology demo

**Date:** 2026-06-02
**Source:** Building the Topology demo plugin
(`plugins/examples/runway/`, designed in
`docs/superpowers/specs/2026-06-02-topology-demo-design.md`).

Two findings surfaced while building a developer-facing Topology
demo for the source spec's §6a Topology tab. Both are extensions to
the source spec, not corrections — the spec as written is internally
consistent; these are gaps that only become visible when you try to
demo it on a realistic agent-shaped workload.

---

## 1. Agents as a first-class concept

**What the demo wants:** an "Agent" lane between Ingress and Models,
agent-shaped face metrics (tool calls/s, turns/conversation, routing
decisions breakdown), and agent-runtime detection (langgraph,
LlamaIndex, AutoGen).

**What the spec has:** §7's framework detection table lists inference
engines only — vLLM, Triton, SGLang, TorchServe, Ray Serve, KServe,
ONNX Runtime, Ollama. No agent frameworks. The §6a topology renderer
is explicitly "kind-agnostic — no MD-shape knowledge in the
renderer." Agents are implicitly treated as generic Deployments.

**Why it matters:** every realistic developer demo of "an AI app on
Kubernetes" in 2026 puts an agent (LangGraph / LlamaIndex /
AutoGen / a homegrown orchestrator) in front of one or more models.
Treating that agent as a generic Deployment loses the most
interesting story the topology view could tell — *which model did
the agent pick this request, and why?* The Topology tab as
currently scoped would render an agent-app box with no special
treatment, which is both less informative and less impressive than
it could be.

**Possible shape (sketch, for the source-spec discussion):**

- A `airunway.ai/agent-runtime=<name>` label paralleling the
  existing `airunway.ai/engine=<name>` override (§7.1). Authoritative
  when set; inferable from image regex otherwise.
- §7 table additions for common agent runtimes (langgraph,
  llamaindex, autogen, smolagents, maybe homegrown).
- An `airunway.ai/role=agent` value alongside the existing
  `role=prefill|decode` (§4 controller addendum). Topology renderer
  uses the role label for lane assignment — the renderer itself
  stays kind-agnostic, which is the property §6a wants to preserve.
- Engine-adapter-style metrics for agents (separate from the §6
  CanonicalMetric set, which is inference-engine-shaped) covering
  tool calls/s, routing decisions, turns/session, semantic cache
  hit. Could be a new `AgentRuntimeAdapter` registry parallel to
  the `EngineAdapter` one.

This is meaningful spec extension, not a tweak. It probably wants
its own discussion / ADR within the source-spec process.

---

## 2. An edge kind for runtime calls

**What the demo wants:** an edge from the agent-app to each
ModelDeployment it can call, with a tooltip explaining the
relationship.

**What the spec has:** §6a's edge table covers
`routes-to`, `selects`, `owns`, `mounts`, `references` — every
relationship derivable from K8s state via well-known field paths.
There is no edge kind for "Pod A makes runtime HTTP calls to
Service B," which is the most important edge in any agent-shaped
Project.

The demo uses a placeholder edge kind called `calls-runtime`,
visually identical to `references`. This is a fiction — the
relationship is not derivable from anything in the source spec.

**Why it matters:** without a runtime-call edge, an agent-shaped
Project's topology view shows the agent and the models as
*disconnected islands*. The structural story ("agent fans out to
three models, calls AOAI as fallback") is exactly what makes a
developer demo land. Punting this to "click into the agent's
Observability tab to see what it calls" works for a list view but
sells the *topology* view short.

**Possible shape (sketch):**

- **Declarative.** Have the caller declare downstream Services in
  a CRD field (`Agent.spec.calls: [Service references]`) or via a
  well-known env-var convention (`AIRUNWAY_CALLS_<NAME>=http://svc`).
  Plugin reads the field, draws the edge. Pro: deterministic, no
  observation latency. Con: requires the agent author to opt in.
- **Observed.** Compute the edge set from IG `trace_tcp` traffic
  (per §8) sampled over a configurable window. Pro: works for any
  agent without code changes. Con: needs IG installed, edge set
  is time-windowed (a model the agent hasn't called in the
  sampling window is invisible), privileges to run `trace_tcp`
  required.
- **Both, in priority order.** Declarative wins when present;
  observed fills in when not. The §7.1 detection-contract pattern
  (`{ detected, confidence, source }`) maps onto this nicely.

This is smaller in surface area than #1 but deserves the same
think-it-through treatment, possibly with its own ADR.

---

## Disposition

Neither finding blocks the v1.0 source-spec timeline. Both should
go on the source-spec maintainers' radar — most naturally as items
in §14 (Open questions) until decided, then as scoped additions to
§4 / §6a / §7.

The demo plugin documents both as forward-looking concepts and
clearly labels which content depends on them, so a stakeholder
viewing the demo understands the gap.
