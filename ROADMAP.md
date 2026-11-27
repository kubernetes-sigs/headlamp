# Headlamp Roadmap

This document describes the direction of Headlamp through the end of 2027. It is
a statement of intent, not a commitment:
priorities change as we learn from users and contributors, and items may slip or
be dropped. Changes to this roadmap are discussed in the
[monthly community meeting](https://zoom-lfx.platform.linuxfoundation.org/meetings/headlamp)
and approved by the maintainers listed in [OWNERS_ALIASES](./OWNERS_ALIASES).

The detailed, per-release plan is tracked in
[milestones](https://github.com/kubernetes-sigs/headlamp/milestones).
This document gives the bigger picture.

## What we plan to do

### Keep up with Kubernetes

- Support new stable and widely used beta Kubernetes APIs soon after they ship,
  including Dynamic Resource Allocation (DRA / Devices), workload, scheduling,
  and Gateway API resources.
- Keep first-class views for common resources alongside a generic resource
  viewer and OpenAPI v3 on-demand resource documentation for custom resources
  (CRDs).

### Make everyday tasks easier

- Expand guided create and edit forms for common resources, alongside the YAML
  editor.
- Improve search, navigation, and the resource map across namespaces and
  clusters.
- Keep improving logs, exec, built-in terminal workflows, port forwarding, and
  Helm workflows.

### Multi-cluster and in-cluster deployments

- Improve working with many clusters at once, including cluster discovery and
  inventory, projects, and cluster grouping.
- Keep authentication and proxy options well documented, reliable, and tested
  (OIDC, BaseURL, custom CA, token, and proxy-based setups), with end-to-end
  integration tests for common identity providers.
- Keep Helm chart options aligned with backend features and strengthen chart
  validation beyond static template rendering.

### Plugins and extensibility

- Grow and stabilize the plugin APIs, and document them well.
- Make plugin discovery, installation (including airgapped/custom sources), and
  updates safer, with clear provenance and explicit permissions for desktop and
  MCP capabilities.

### Desktop app

- Keep the desktop app secure by default (process isolation and OS-backed
  encrypted credential storage), signed, and easy to install and update on
  Linux, macOS, and Windows.
- Support distributions that customize the desktop app for their products.

### Quality, security, and accessibility

- Build on 80%+ statement coverage across backend (90%+) and frontend (85%+)
  to reach **80%+ branch coverage** and **90%+ statement coverage**
  (OpenSSF Gold), while expanding end-to-end coverage across major Kubernetes
  workflows and Helm chart validation.
- Maintain signed release checksums, container images, and Helm charts
  ([verifying releases](./docs/installation/verify-releases.md)), and work toward
  consistently verified release tags and reproducible builds.
- Complete and maintain OpenSSF Best Practices
  [Silver](https://www.bestpractices.dev/projects/7551) and work toward Gold.
- Improve performance and memory use on large clusters.
- Meet accessibility best practices (WCAG) and keep expanding translations.

## What we do not plan to do

- **Bypass Kubernetes authorization.** Headlamp will not add its own
  authorization model on top of, or instead of, Kubernetes RBAC. What a user
  can see and do is always decided by the Kubernetes API server.
- **Vendor-specific features in core.** Headlamp stays a vendor-neutral,
  generic Kubernetes UI. Features specific to one cloud provider or product
  belong in [plugins](https://github.com/headlamp-k8s/plugins).
- **Store cluster state.** Headlamp will not become a database or long-term
  store for cluster data. The Kubernetes API remains the source of truth.
- **Replace cluster provisioning or CI/CD tools.** Headlamp helps users view and
  operate existing clusters. Creating or upgrading clusters and running
  deployment pipelines are out of scope, though plugins may integrate with
  such tools.
