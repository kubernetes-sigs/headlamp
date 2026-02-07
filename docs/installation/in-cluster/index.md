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

## Custom API Server Endpoint

By default, when running in-cluster, Headlamp automatically detects and connects to the Kubernetes API server using the in-cluster configuration. However, in some scenarios, you may need to route API requests through a proxy server instead of connecting directly to the API server.

### Use Cases

This feature is particularly useful for:

- **OIDC Authentication with Private Endpoints**: When using managed Kubernetes services (like AWS EKS) with OIDC authentication where the identity provider is on a private endpoint, you can use [kube-oidc-proxy](https://github.com/jetstack/kube-oidc-proxy) to handle authentication requests.
- **API Gateway or Proxy Requirements**: When your cluster requires all API traffic to go through a specific gateway or proxy for security, logging, or compliance reasons.
- **Multi-cluster Authentication**: When using a centralized authentication proxy across multiple clusters.

### Configuration

You can configure a custom API server endpoint using Helm values:

```bash
helm install my-headlamp headlamp/headlamp \
  --namespace kube-system \
  --set config.apiServerEndpoint=https://kube-oidc-proxy.example.com:443
```

Or in your Helm values file:

```yaml
config:
  apiServerEndpoint: "https://kube-oidc-proxy.example.com:443"
```

You can also configure it using environment variables or command-line flags:

- **Environment variable**: `HEADLAMP_CONFIG_API_SERVER_ENDPOINT=https://kube-oidc-proxy.example.com:443`
- **Command-line flag**: `--api-server-endpoint=https://kube-oidc-proxy.example.com:443`

### Example: Using with kube-oidc-proxy on EKS

When using Amazon EKS with a private OIDC issuer, you can deploy kube-oidc-proxy to handle authentication and configure Headlamp to route requests through it:

```bash
# Install kube-oidc-proxy (example)
kubectl apply -f kube-oidc-proxy-deployment.yaml

# Install Headlamp with custom API endpoint
helm install my-headlamp headlamp/headlamp \
  --namespace kube-system \
  --set config.apiServerEndpoint=https://kube-oidc-proxy.kube-system.svc.cluster.local:443 \
  --set config.oidc.clientID=your-client-id \
  --set config.oidc.clientSecret=your-client-secret \
  --set config.oidc.issuerURL=https://your-private-issuer.example.com
```

For more information about using kube-oidc-proxy with EKS, see the [AWS blog post on consistent OIDC authentication](https://aws.amazon.com/blogs/opensource/consistent-oidc-authentication-across-multiple-eks-clusters-using-kube-oidc-proxy/).

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
config:
  watchPlugins: true
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
