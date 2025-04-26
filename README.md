<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/src/resources/logo-light.svg">
    <img src="frontend/src/resources/logo-dark.svg" alt="Headlamp">
  </picture>
</h1>

> **NOTICE:** We have recently moved the project under the Kubernetes SIG UI (and the repo under the _kubernetes-sigs_ org). Container images are still at [ghcr.io](https://github.com/orgs/headlamp-k8s/packages). Please bear with us while we may experience some broken links.

[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/7551/badge)](https://www.bestpractices.dev/projects/7551)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/kubernetes-sigs/headlamp/badge)](https://scorecard.dev/viewer/?uri=github.com/kubernetes-sigs/headlamp)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fheadlamp-k8s%2Fheadlamp.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2Fheadlamp-k8s%2Fheadlamp?ref=badge_shield)

Headlamp is an easy-to-use and extensible Kubernetes web UI.

Headlamp was created to blend the traditional feature set of other web UIs/dashboards
(i.e., to list and view resources) with added functionality.

<div align="center">
  <img src="https://raw.githubusercontent.com/kubernetes-sigs/headlamp/screenshots/videos/headlamp_quick_run.gif" width="80%">
</div>

## Features

- Vendor-independent / generic Kubernetes UI
- Works in-cluster, or locally as a desktop app
- Multi-cluster
- Extensible through plugins
- UI controls reflecting user roles (no deletion/update if not allowed)
- Clean & modern UI
- Cancellable creation/update/deletion operations
- Logs, exec, and resource editor with documentation
- Read-write / interactive (actions based on permissions)

## Screenshots

<table>
    <tr>
        <td width="33%"><img src="https://raw.githubusercontent.com/kubernetes-sigs/headlamp/screenshots/screenshots/home.png"></td>
        <td width="33%"><img src="https://raw.githubusercontent.com/kubernetes-sigs/headlamp/screenshots/screenshots/cluster_chooser.png"></td>
    </tr>
    <tr>
        <td width="33%"><img src="https://raw.githubusercontent.com/kubernetes-sigs/headlamp/screenshots/screenshots/workloads.png"></td>
        <td width="33%"><img src="https://raw.githubusercontent.com/kubernetes-sigs/headlamp/screenshots/screenshots/resource_edition.png"></td>
    </tr>
    <tr>
        <td width="33%"><img src="https://raw.githubusercontent.com/kubernetes-sigs/headlamp/screenshots/screenshots/logs.png"></td>
        <td width="33%"><img src="https://raw.githubusercontent.com/kubernetes-sigs/headlamp/screenshots/screenshots/terminal.png"></td>
    </tr>
</table>

## Quickstart

If you want to deploy Headlamp in your cluster, check out the instructions on running it [in-cluster](https://headlamp.dev/docs/latest/installation/in-cluster/).

If you have a kubeconfig already, you can quickly try Headlamp locally as a
[desktop application](https://headlamp.dev/docs/latest/installation/desktop/)
for [Linux](https://headlamp.dev/docs/latest/installation/desktop/linux-installation),
[Mac](https://headlamp.dev/docs/latest/installation/desktop/mac-installation),
or [Windows](https://headlamp.dev/docs/latest/installation/desktop/win-installation).
**Make sure** you have a kubeconfig file set up with your favorite clusters and
in the default path so Headlamp can use it.

### Accessing

Headlamp uses [RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac) for checking
users' access to resources. If you try Headlamp with a token that has very limited
permissions, you may not be able to view your cluster resources correctly.

See the documentation on [how to easily get a Service Account token](https://headlamp.dev/docs/latest/installation#create-a-service-account-token) for your cluster.

## Tested platforms

We maintain a list of the [Kubernetes platforms](./docs/platforms.md) we have
tested Headlamp with. We invite you to add any missing platforms you have
tested, or comment if there are any regressions in the existing ones.

## Extensions / Plugins

If you are interested in tweaking Headlamp to fit your use-cases, you can check out
our [plugin development guide](https://headlamp.dev/docs/latest/development/plugins/).

## Get involved

Check out our: 
- [Guidelines](https://headlamp.dev/docs/latest/contributing/)
- [Code of Conduct](./code-of-conduct.md),
- [#headlamp](https://kubernetes.slack.com/messages/headlamp) slack channel in the Kubernetes Slack 
- [Monthly Community Meeting](https://zoom-lfx.platform.linuxfoundation.org/meetings/headlamp)

## Roadmap / Release Planning

If you are interested in the direction of the project, we maintain a
[Roadmap](https://github.com/orgs/headlamp-k8s/projects/1/views/1). It has the
biggest changes planned so far, as well as a [board](https://github.com/orgs/headlamp-k8s/projects/1/) tracking each release.

## License

Headlamp is released under the terms of the [Apache 2.0](./LICENSE) license.

## Frequently Asked Questions

For more information about Headlamp, see the [Headlamp FAQ](https://headlamp.dev/docs/latest/faq/).
