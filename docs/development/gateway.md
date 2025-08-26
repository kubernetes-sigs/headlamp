# Gateway API Development Guide

This guide documents the usage of Gateway API manifests for testing and development. These manifests are configured to work with the Envoy Gateway controller (`gateway.envoyproxy.io/gatewayclass-controller`), and are useful for validating Gateway API features like HTTP routing, gRPC, backend TLS, traffic policies, and cross-namespace permissions.

## Manifest Files

| File                                                                                         | Description                               |
| -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| [`gatewayclass.yaml`](../../frontend/src/components/gateway/manifests/gatewayclass.yaml)     | Defines the GatewayClass used by Gateway. |
| [`gateway.yaml`](../../frontend/src/components/gateway/manifests/gateway.yaml)               | Configures the Gateway resource.          |
| [`httproute.yaml`](../../frontend/src/components/gateway/manifests/httproute.yaml)           | Configures HTTP route rules.              |
| [`grpcroute.yaml`](../../frontend/src/components/gateway/manifests/grpcroute.yaml)           | Configures gRPC route rules.              |
| [`referencegrant.yaml`](../../frontend/src/components/gateway/manifests/referencegrant.yaml) | Grants cross-namespace access.            |
| [`backendtls.yaml`](../../frontend/src/components/gateway/manifests/backendtls.yaml)         | Configures TLS for backends.              |
| [`backendtraffic.yaml`](../../frontend/src/components/gateway/manifests/backendtraffic.yaml) | Configures traffic policies to backends.  |

> These files are located in:  
> `frontend/src/components/gateway/manifests/`

## How to Apply the Manifests

### Apply Manifests One-by-One (in recommended order):

```bash
kubectl apply -f frontend/src/components/gateway/manifests/gatewayclass.yaml
kubectl apply -f frontend/src/components/gateway/manifests/gateway.yaml
kubectl apply -f frontend/src/components/gateway/manifests/referencegrant.yaml
kubectl apply -f frontend/src/components/gateway/manifests/httproute.yaml
kubectl apply -f frontend/src/components/gateway/manifests/grpcroute.yaml
kubectl apply -f frontend/src/components/gateway/manifests/backendtls.yaml
kubectl apply -f frontend/src/components/gateway/manifests/backendtraffic.yaml
```

### Alternative: Apply All Manifests at Once

```bash
kubectl apply -R -f frontend/src/components/gateway/manifests/
```

> This recursively applies all YAML files in the directory.

## Verifying the Setup

After applying the manifests, verify that the Gateway and Routes are accepted and functioning:

```bash
kubectl get gateway
kubectl get gatewayclass
kubectl get httproute
kubectl get grpcroute
kubectl describe gateway envoy-gateway
kubectl get backendtlspolicies.gateway.networking.k8s.io
kubectl get xbackendtrafficpolicies.gateway.networking.x-k8s.io
```

You can also inspect events or logs for the Envoy Gateway controller if routes are not becoming `Accepted`.

## Testing Locally with Minikube

Start a fresh Minikube cluster with a dedicated profile:

```bash
minikube start --profile=gateway-checkup
```

Install the Gateway API CRDs and the Envoy Gateway controller, then apply the manifests as shown above.

## Resources

- [Kubernetes Gateway API Docs](https://gateway-api.sigs.k8s.io/)
- [Envoy Gateway Docs](https://gateway.envoyproxy.io/)
- [Gateway API GitHub](https://github.com/kubernetes-sigs/gateway-api)
