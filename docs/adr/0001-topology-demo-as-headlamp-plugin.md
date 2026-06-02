# 0001 — Topology demo realized as a Headlamp plugin

**Status:** Accepted
**Date:** 2026-06-02
**Context document:** `docs/superpowers/specs/2026-06-02-topology-demo-design.md`

## Context

We needed a demo of the Topology tab described in
`projects-and-aks-overlay.md` §6a — a conversation piece for
stakeholders to validate the visual direction and information
density before the real Topology tab work is scoped.

Two shapes were on the table:

1. A standalone HTML file under `docs/` — single file, no build,
   opens via `file://` in any browser. Lowest cost, lowest fidelity.
2. A Headlamp plugin under `plugins/examples/runway/` — installable,
   runs inside the real Headlamp chrome, no real backend or cluster
   needed (Headlamp itself does not require a cluster connection).

A third path — building a stubbed Project CRD + controller + fixtures
— was considered and rejected as scope creep; that is the real
product, not a demo.

## Decision

Ship the demo as a Headlamp plugin (option 2). Specifically:

- Location: `plugins/examples/runway/`.
- One sidebar entry under a new **AI Runway** group, one route, one
  Topology view with hardcoded fixture data.
- MUI for the shell (sidebar, drawer, buttons); custom CSS + SVG for
  the topology canvas. The canvas is supposed to feel different from
  the rest of the app.
- Hand-rolled SVG bezier edges, *not* react-flow. The real §6a
  implementation will use react-flow; pulling that dependency for a
  demo would commit us to a library evaluation that this demo is not
  trying to make.
- Demo includes forward-looking concepts that the source spec does
  not have — agents as first-class, a `calls-runtime` edge kind, and
  several metrics whose sources are not yet wired up. These are
  documented as forward-looking in the plugin README and captured as
  spec feedback at
  `docs/superpowers/specs/projects-and-aks-overlay-feedback.md`.

## Consequences

**Positive.**

- The demo runs inside real Headlamp. The sidebar, topbar, and
  routing are not mock-ups — they are the actual product chrome.
  The audience never has to bridge "what would this look like in the
  real app" mentally.
- Install + view is one command (`headlamp-plugin install` or dev
  symlink). No screenshots, no slide decks needed for a 1:1 demo.
- Building it surfaced real product questions (agents as
  first-class, edge kind for runtime calls) that a static HTML file
  would not have forced.

**Negative / trade-offs.**

- Higher build cost than an HTML file. The plugin needs a scaffold,
  TypeScript, MUI, a build step. Estimated 1–2 days vs. the few
  hours an HTML file would take.
- The demo's forward-looking elements (agent lane, `calls-runtime`
  edges, aspirational metrics) set stakeholder expectations that
  the real v1.0 won't meet. Mitigated by an explicit "forward-looking"
  README section and a metric-source table that labels every value
  by its real-world data source — but the risk is real and will
  require disciplined demoing.
- A plugin in `plugins/examples/` invites confusion about whether
  it's a real example to learn from or a one-off demo. Mitigated by
  the README leading with "this is a conversation piece, not a
  reference implementation."
- The demo will move to the kaito-project/airunway repo at some
  point. Until then it lives in the Headlamp repo, which is the
  wrong long-term home.

## Alternatives considered

- **Standalone HTML in `docs/`.** Rejected: lower fidelity (mock
  chrome, not real chrome) and the audience response to a mock-up
  is meaningfully weaker than to a thing running inside Headlamp.
- **Plugin + stubbed Project CRD + fixture Projects list.** Rejected
  as scope creep — the Projects list and CRD reconciler are the real
  product and not what the demo is testing. We can land them as
  follow-up if demos uncover that the navigation context matters.
- **v1.0-honest demo (cut all forward-looking content).** Rejected:
  the resulting demo would be a green-on-green graph of three
  ModelDeployments with no narrative. The forward-looking content is
  why this is interesting to show.
