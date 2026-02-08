# Custom API Server Endpoint

By default, when running in-cluster, Headlamp automatically detects and connects to the Kubernetes API server using the in-cluster configuration. However, in some scenarios, you may need to route API requests through a proxy server instead of connecting directly to the API server.

## Use Cases

This feature is particularly useful for:

- **OIDC Authentication with Private Endpoints**: When using managed Kubernetes services (like AWS EKS, Azure AKS, or Google GKE) with OIDC authentication where the identity provider is on a private endpoint, you can use [kube-oidc-proxy](https://github.com/jetstack/kube-oidc-proxy) to handle authentication requests.
- **API Gateway or Proxy Requirements**: When your cluster requires all API traffic to go through a specific gateway or proxy for security, logging, or compliance reasons.
- **Multi-cluster Authentication**: When using a centralized authentication proxy across multiple clusters.

## Configuration

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

**Note**: These options are only used when running Headlamp with in-cluster mode enabled (`--in-cluster` flag or `config.inCluster: true` in Helm values).

## Example: Using with kube-oidc-proxy on Managed Kubernetes

When using managed Kubernetes services (AWS EKS, Azure AKS, Google GKE) with a private OIDC issuer, you can deploy kube-oidc-proxy to handle authentication and configure Headlamp to route requests through it.

**Example with AWS EKS:**

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

For more information about using kube-oidc-proxy with managed Kubernetes clusters, see:
- AWS EKS: [Consistent OIDC authentication across multiple EKS clusters](https://aws.amazon.com/blogs/opensource/consistent-oidc-authentication-across-multiple-eks-clusters-using-kube-oidc-proxy/)
- The configuration works similarly with Azure AKS and Google GKE when using private OIDC providers

## Testing the Custom API Server Endpoint

The custom API server endpoint feature allows you to configure Headlamp to route all Kubernetes API requests through an intermediate proxy server instead of connecting directly to the cluster's API server. This is useful in architectures where:

- **Private OIDC providers**: Your OIDC identity provider is on a private network and needs a proxy like kube-oidc-proxy to handle authentication requests before they reach the API server.
- **Centralized authentication**: You have multiple clusters and want to use a single authentication proxy to provide consistent OIDC authentication across all of them.
- **Security policies**: Your organization requires all API traffic to go through a specific gateway for auditing, logging, or compliance reasons.
- **Network segmentation**: The cluster API server is not directly accessible from where Headlamp is deployed and must go through a proxy.

**Benefits:**
- Enables using OIDC authentication with private identity providers in managed Kubernetes services (like AWS EKS)
- Centralizes authentication logic across multiple clusters
- Provides a single point for API traffic monitoring and control
- Maintains security by enforcing https:// connections and validating endpoint URLs

To manually test the custom API server endpoint configuration with kube-oidc-proxy:

1. **Deploy kube-oidc-proxy** in your cluster following the [kube-oidc-proxy documentation](https://github.com/jetstack/kube-oidc-proxy).

2. **Install Headlamp** with the custom endpoint pointing to kube-oidc-proxy:
   ```bash
   helm install my-headlamp headlamp/headlamp \
     --namespace kube-system \
     --set config.apiServerEndpoint=https://kube-oidc-proxy.kube-system.svc.cluster.local:443
   ```

3. **Verify the configuration**:
   ```bash
   # Check pod arguments include the custom endpoint
   kubectl get pod -n kube-system -l app.kubernetes.io/name=headlamp -o jsonpath='{.items[0].spec.containers[0].args}' | grep api-server-endpoint
   ```

4. **Check Headlamp logs** to confirm it's connecting through the custom endpoint:
   ```bash
   kubectl logs -n kube-system -l app.kubernetes.io/name=headlamp | grep -i "api server\|endpoint\|proxy"
   ```

5. **Test API connectivity** by accessing Headlamp and verifying you can list resources from the cluster.

6. **Test backward compatibility** by installing without the custom endpoint:
   ```bash
   helm install headlamp-default headlamp/headlamp --namespace kube-system
   # Verify it connects to the default in-cluster API server
   ```

