---
title: In-cluster
sidebar_position: 1
---

A common use case for any Kubernetes web UI is to deploy it in-cluster and
set up an ingress server for having it available to users.

## Using Helm

The easiest way to install headlamp in your existing cluster is to
use [helm](https://helm.sh/docs/intro/quickstart/) with our [helm chart](https://github.com/kubernetes-sigs/headlamp/tree/main/charts/headlamp).

```bash
# first add our custom repo to your local helm repositories
helm repo add headlamp https://kubernetes-sigs.github.io/headlamp/

# now you should be able to install headlamp via helm
helm install my-headlamp headlamp/headlamp --namespace kube-system
```

As usual, it is possible to configure the helm release via the [values file](https://github.com/kubernetes-sigs/headlamp/blob/main/charts/headlamp/values.yaml) or setting your preferred values directly.

```bash
# install headlamp with your own values.yaml
helm install my-headlamp headlamp/headlamp --namespace kube-system -f values.yaml

# install headlamp by setting your values directly
helm install my-headlamp headlamp/headlamp --namespace kube-system --set replicaCount=2
```

## Using simple yaml

We also maintain a simple/vanilla [file](https://github.com/kubernetes-sigs/headlamp/blob/main/kubernetes-headlamp.yaml)
for setting up a Headlamp deployment and service. Be sure to review it and change
anything you need.

If you're happy with the options in this deployment file, and assuming
you have a running Kubernetes cluster and your `kubeconfig` pointing to it,
you can run:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/headlamp/main/kubernetes-headlamp.yaml
```

## Optional TLS Backend Termination

Headlamp supports optional TLS termination at the backend server. The default is to terminate at the ingress (default) or optionally directly at the Headlamp container. This enables use cases such as NGINX TLS passthrough and transport server. See [tls](./tls.md) for details and usage.

## Use a non-default kube config file

By default, Headlamp uses the default service account from the namespace it is deployed to, and generates a kubeconfig from it named `main`.

If you wish to use another specific non-default kubeconfig file, then you can do it by mounting it to the default location at `/home/headlamp/.config/Headlamp/kubeconfigs/config`, or 
providing a custom path Headlamp with the ` -kubeconfig` argument or the KUBECONFIG env (through helm values.env)

### Use several kubeconfig files

If you need to use more than one kubeconfig file at the same time, you can list
each config file path with a ":" separator in the KUBECONFIG env.

## Exposing Headlamp with an ingress server

With the instructions in the previous section, the Headlamp service should be
running, but you still need the
ingress server as mentioned. We provide a sample ingress YAML file
for this purpose, but you have to manually replace the **URL** placeholder
with the desired URL. The ingress file also assumes that you have Contour
and a cert-manager set up, but if you don't, then you'll just not have TLS.

Assuming your URL is `headlamp.mydeployment.io`, getting the sample ingress
file and changing the URL can quickly be done by:

```bash
curl -s https://raw.githubusercontent.com/kubernetes-sigs/headlamp/main/kubernetes-headlamp-ingress-sample.yaml | sed -e s/__URL__/headlamp.mydeployment.io/ > headlamp-ingress.yaml
```

and with that, you'll have a configured ingress file, so verify it and apply it:

```bash
kubectl apply -f ./headlamp-ingress.yaml
```

## Exposing Headlamp with port-forwarding

If you want to quickly access Headlamp (after having its service running) and
don't want to set up an ingress for it, you can run use port-forwarding as follows:

```bash
kubectl port-forward -n kube-system service/headlamp 8080:80
```

and then you can access `localhost:8080` in your browser.

## Accessing Headlamp

Once Headlamp is up and running, be sure to enable access to it either by creating
a [service account](../#create-a-service-account-token) or by setting up
[OIDC](./oidc).

## Plugin Management

Headlamp supports managing plugins through a sidecar container when deployed in-cluster.

### Using values.yaml

You can directly specify the plugin configuration in your `values.yaml`:

```yaml
pluginsManager:
  enabled: true
  configContent: |
    plugins:
      - name: my-plugin
        source: https://artifacthub.io/packages/headlamp/my-repo/my_plugin
        version: 1.0.0
    installOptions:
      parallel: true
      maxConcurrent: 2
  baseImage: node:lts-alpine
  version: latest
```

### Using a Separate plugin.yml

Alternatively, you can maintain a separate `plugin.yml` file:

1. Create a `plugin.yml` file:
```yaml
plugins:
  - name: my-plugin
    source: https://artifacthub.io/packages/headlamp/my-repo/my_plugin
    version: 1.0.0
    # Optional: specify dependencies if needed
    dependencies:
      - another-plugin

installOptions:
  parallel: true
  maxConcurrent: 2
```

2. Install/upgrade Headlamp using the plugin configuration:
```bash
helm upgrade --install my-headlamp headlamp/headlamp --namespace kube-system -f values.yaml --set pluginsManager.configContent="$(cat plugin.yml)"
```

### Plugin Configuration Format

The plugin configuration supports the following fields:

- `plugins`: Array of plugins to install
  - `name`: Plugin name (required)
  - `source`: Plugin source URL from Artifact Hub (required)
  - `version`: Plugin version (required)
  - `dependencies`: Array of plugin names that this plugin depends on (optional)
- `installOptions`:
  - `parallel`: Whether to install plugins in parallel (default: false)
  - `maxConcurrent`: Maximum number of concurrent installations when parallel is true

### Auto-updating Plugins

Headlamp's plugin manager can automatically watch for changes in the plugin configuration. However, you need to enable watch for these changes in the main headlamp container. This can be enabled through the `watchPlugins` setting in `values.yaml`:

```yaml
config:
  watchPlugins: true  # Set to true to enable automatic plugin updates in main headlamp container
```

When enabled, any plugins' changes (either through Helm upgrades or direct ConfigMap updates) wil update in the main headlamp container by enabling --watch-plugins-changes flag on headlamp server.
