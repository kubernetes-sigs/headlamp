<<'EOF'
# Headlamp Deployment - Definition of Acceptance

## Deployment Details

| Property | Value |
|---|---|
| Application | Headlamp |
| Helm repository | https://kubernetes-sigs.github.io/headlamp/ |
| Chart name | headlamp |
| Chart reference | headlamp/headlamp |
| Chart version | 0.46.0 |
| Application version | 0.46.0 |
| Kubernetes environment | Kind |
| Cluster | headlamp-doa |
| Namespace | headlamp-doa |
| Helm release | headlamp |

## Add Helm Repository

```bash
helm repo add headlamp https://kubernetes-sigs.github.io/headlamp/
helm repo update
