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
  including workload, scheduling, and Gateway API resources.
- Keep first-class views for common resources and good generic support for
  custom resources (CRDs).

### Make everyday tasks easier

- Expand guided create and edit forms for common resources, alongside the YAML
  editor.
- Improve search, navigation, and the resource map across namespaces and
  clusters.
- Keep improving logs, exec, port forwarding, and Helm workflows.

### Multi-cluster and in-cluster deployments

- Improve working with many clusters at once, including cluster discovery and
  inventory, projects, and cluster grouping.
- Keep authentication options well documented and tested (OIDC, token, and
  proxy-based setups), with end-to-end tests for common identity providers.

### Plugins and extensibility

- Grow and stabilize the plugin APIs, and document them well.
- Make plugin discovery, installation, and updates safer, including clear
  provenance information and explicit, reviewed permissions for desktop
  capabilities.

### Desktop app

- Keep the desktop app secure by default, signed, and easy to install and update
  on Linux, macOS, and Windows.
- Support distributions that customize the desktop app for their products.

### Quality, security, and accessibility

- Reach at least 80% statement coverage in the frontend and backend test
  suites, and require tests for new functionality and regression tests for bug
  fixes.
- Sign all release artifacts, container images, and release tags, and document
  how to verify them.
- Reach the OpenSSF Best Practices
  [Silver](https://www.bestpractices.dev/projects/7551) level and keep it.
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
