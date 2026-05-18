---
title: MCP Support in Headlamp
sidebar_position: 8
---

# MCP Support in Headlamp

Headlamp MCP support makes Kubernetes easier to understand by bringing specialized expertise directly into the UI. MCPs surface insights next to workloads and applications instead of in separate tools or terminals. Teams gain clarity without losing context. By keeping expertise close to the resources it explains, MCP support helps teams troubleshoot faster and make better decisions in their day-to-day Kubernetes work.

## What Is MCP

The Model Context Protocol, or MCP, is an open standard that defines how an AI system connects to external tools and data through a consistent interface.

MCP uses a client-server model. An AI application acts as the host and connects to one or more MCP servers. Each server exposes capabilities that the host can discover and use.

MCP servers can provide tools that perform actions, resources that supply data, and prompts that guide interactions. The host can list available capabilities and call them using structured inputs. Results are returned in a structured form.

## Why Use MCPs in Headlamp

Kubernetes teams often switch between dashboards, terminals, and scripts to understand what is happening. Each switch breaks focus and slows action.

With MCPs in Headlamp, expertise shows up where Kubernetes work already happens. Insight appears alongside pods, namespaces, and applications. Results stay tied to the resources on screen instead of being shown somewhere else.

This reduces context switching and makes investigations faster. It also makes answers easier to trust, since the insight is grounded in the same Kubernetes context you are viewing.

## Requirements

- Headlamp Desktop — MCP server support is currently available only in the Headlamp desktop application.
- The AI Assistant plugin enabled and at least one AI provider configured.
- Access to an MCP server that can run locally.

## Setting Up MCP Support

### Enable MCP Servers

1. Open **Settings** in Headlamp.
2. Go to **AI Assistant**.
3. Find the **MCP Servers** section.
4. Turn MCP servers on.

### Configuring MCP Servers

When adding a server you provide a name, a command, optional arguments, and any required environment variables. After you save, Headlamp starts the server and discovers the tools it provides.

Navigate to the AI Assistant settings to add and manage MCP servers. Each server is configured with:

- **Name** — A unique identifier for the server.
- **Command** — The executable to run (e.g., `flux-operator-mcp`).
- **Args** — Command-line arguments (e.g., `serve --kube-context HEADLAMP_CURRENT_CLUSTER`).
- **Environment Variables** — Optional env vars required by the server (e.g., `KUBECONFIG`).

Note: `HEADLAMP_CURRENT_CLUSTER` is a Headlamp-specific placeholder, not a shell environment variable. When starting an MCP server, Headlamp replaces this placeholder with the name of the currently selected cluster before running the command, so you should only reference it in the **Args** field where command-line arguments are defined.

You can configure servers using the form-based UI or by editing the JSON configuration directly.

<img width="624" height="387" alt="enable MCP Servers" src="https://github.com/user-attachments/assets/461336f1-1e7d-4529-ba67-ae005171df55" />

<img width="624" height="386" alt="add MCP server" src="https://github.com/user-attachments/assets/c88eb56a-7e03-4659-b351-d2151cf40cae" />

<img width="1430" height="829" alt="MCP configuration" src="https://github.com/user-attachments/assets/4a8ad48b-0b54-4d8d-9eeb-dc06d1d358ff" />

## Managing MCP Tools

Once a server is connected, Headlamp lists the tools it exposes.

- Enable or disable individual tools per server.
- View tool descriptions and input schemas.
- Track tool usage statistics.
- Use bulk operations to enable or disable all tools at once.

This keeps interactions predictable and helps teams use MCPs with confidence.

## Using MCPs in Chat

After setup, MCPs are used through normal chat prompts.

For example:

1. What is happening with this deployment?
2. Why is this workload out of sync?
3. Show all Flux resources in this namespace.

The assistant selects the right tool and presents results next to the Kubernetes resources you are already viewing.

## Limitations

- MCP server support is currently available only in Headlamp Desktop.
- MCP servers must be available as local commands, since the desktop app runs them as local processes.
- Available tools depend on the servers you connect.

## Get Started

MCP support brings expert knowledge directly into the Kubernetes UI. Insight stays close to workloads and applications so teams can understand issues faster and act without switching tools.

Open Headlamp Desktop, enable MCP support, connect a server, and start using expertise where Kubernetes work already happens.
