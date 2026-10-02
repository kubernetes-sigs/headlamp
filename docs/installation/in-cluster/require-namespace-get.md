---
title: Showing only namespaces the user can access
sidebar_label: Namespace visibility
---

Kubernetes RBAC cannot restrict the `list` verb to a subset of namespaces.
Multi-tenant platforms therefore often grant `list` on namespaces to every
user (otherwise dashboards cannot populate a namespace selector at all) while
real access is granted per namespace through `RoleBinding`s. With such a
setup, Headlamp's namespace selector shows **every** namespace in the cluster,
including the ones a user cannot do anything with.

The `-require-namespace-get` option makes Headlamp behave like
[Kiali's `require_namespace_get` feature flag](https://kiali.io/docs/configuration/rbac/):
a namespace is shown only if the user is allowed to `get` it.

## Configuration

Enable the option on the Headlamp server:

- `-require-namespace-get=true` or env var `HEADLAMP_CONFIG_REQUIRE_NAMESPACE_GET=true`

With Helm:

```yaml
config:
  extraArgs:
    - -require-namespace-get=true
```

The option is off by default and has no effect on clusters that are accessed
with the service account token (`-unsafe-use-service-account-token`), because
there is no per-user identity to check in that case.

## How it works

For every namespace returned by `GET /api/v1/namespaces`, the backend performs
`GET /api/v1/namespaces/<name>` **with the user's own token** and removes the
namespaces that answer `403 Forbidden` (or `404 Not Found`). The checks take
the same route as the user's own requests, so they also work when cluster
traffic is sent through an [OIDC API proxy](./oidc-api-proxy.md).

Namespace watches receive the same treatment: watch events for namespaces the
user cannot `get` are dropped before they reach the browser. This applies to
both the per-request WebSocket watches and the WebSocket multiplexer.

Decisions are cached per user token for 30 seconds, so the extra `GET`
requests are only issued on the first listing and after the cache expires. Up
to 8 checks run in parallel.

## Safety

- The filter fails closed. If any access check returns an unexpected error the
  whole listing is answered with `502 Bad Gateway` instead of an unfiltered
  list, and a namespace watch is closed instead of forwarding an event that
  could not be checked. The frontend simply retries.
- Namespaces are hidden, not protected: a user who can `list` namespaces can
  still enumerate them with `kubectl`. Use this option to keep the UI focused
  on the user's namespaces, not as an authorization boundary. Authorization is
  enforced by the Kubernetes API server (or your API proxy) as usual.

## Limitations

- Users who are not allowed to `list` namespaces at all still get a `403` from
  the cluster; this option does not synthesise a list for them.
- Resource lists in the *All namespaces* view are still requested cluster-wide
  and are subject to the user's RBAC. Users without cluster-wide read access
  should pick a namespace, or configure the per-cluster
  **Allowed namespaces** setting in the Headlamp UI.
- Very large clusters pay one `GET` per namespace per user every 30 seconds
  at most. The checks are cheap for the API server, but you may notice a short
  delay the first time the namespace list is loaded.
