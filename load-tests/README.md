# Load Testing Headlamp

Scripts and documentation for load testing Headlamp.

See [docs/development/testing.md](../docs/development/testing.md) for general testing documentation.

## WebSocket Rate Limit Testing

Headlamp uses WebSocket multiplexing to overcome browser connection limits. Testing the rate limiting
behavior is important to ensure the server can handle high load while protecting against abuse.

### Prerequisites

- [KWOK](https://kwok.sigs.k8s.io/) (Kubernetes Without Kubelet) for simulating large clusters
- [websocat](https://github.com/vi/websocat) or similar WebSocket client for manual testing
- Node.js 20+ for running the load test scripts

### Setting Up a Test Cluster with KWOK

KWOK allows you to simulate thousands of nodes and pods without actual container runtime overhead:

```bash
# Install KWOK
brew install kwok  # macOS
# or
go install sigs.k8s.io/kwok/cmd/kwokctl@latest

# Create a simulated cluster
kwokctl create cluster --name=load-test

# Set kubectl context
kubectl config use-context kwok-load-test
```

### Creating Simulated Resources

```bash
# Create simulated nodes (100 nodes)
for i in $(seq 1 100); do
  kubectl apply -f - <<EOF
apiVersion: v1
kind: Node
metadata:
  name: node-$i
  labels:
    type: kwok
status:
  conditions:
  - status: "True"
    type: Ready
EOF
done

# Create simulated pods (10,000 pods across namespaces)
for ns in $(seq 1 10); do
  kubectl create namespace test-ns-$ns --dry-run=client -o yaml | kubectl apply -f -
  for i in $(seq 1 1000); do
    kubectl apply -n test-ns-$ns -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: test-pod-$i
  labels:
    app: load-test
spec:
  containers:
  - name: fake
    image: fake-image
  nodeName: node-$((i % 100 + 1))
EOF
  done
done
```

### Running WebSocket Load Tests

Start Headlamp:

```bash
# Rate limits are compile-time constants in the backend.
# See backend/cmd/multiplexer.go for MessagesPerSecond and IPMessagesPerSecond.
npm start
```

Use the provided test scripts or websocat:

```bash
# Using websocat to test WebSocket connection
websocat ws://localhost:4466/wsMultiplexer -H "Origin: http://localhost:4466"

# Send rapid messages to trigger rate limiting
for i in $(seq 1 150); do
  echo '{"type":"REQUEST","clusterId":"your-cluster","path":"/api/v1/pods"}'
done | websocat ws://localhost:4466/wsMultiplexer -H "Origin: http://localhost:4466"
```

### Rate Limit Recommendations

Rate limits are currently compile-time constants (not configurable via CLI flags or environment variables):

- **Per-connection message rate**: 50 messages/second (`MessagesPerSecond` in `backend/cmd/multiplexer.go`)
- **Per-IP message rate**: 200 messages/second (`IPMessagesPerSecond` in `backend/cmd/multiplexer.go`)

The table below provides guidance based on cluster size:

| Cluster Size | Pods | Notes |
|-------------|------|-------|
| Small | < 100 | Default compile-time limits are suitable for development and small teams |
| Medium | 100 - 1,000 | Default limits work well for active monitoring dashboards |
| Large | 1,000 - 5,000 | Consider caching strategies; adjust compile-time constants if needed |
| Very Large | 5,000+ | Test with KWOK first; may need to adjust compile-time constants or use horizontal scaling |

### Configuration Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--websocket-require-origin` | true | Require Origin header for WebSocket connections |
| `--allowed-hosts` | (empty) | Comma-separated list of allowed Host headers |
| `--trusted-proxies` | (empty) | Comma-separated list of trusted proxy IPs/CIDRs |

### Monitoring Rate Limiting

When rate limiting is triggered, Headlamp logs warnings:

```
WARN: Rate limit exceeded for WebSocket connection from 192.168.1.100
```

Clients receive error responses when rate limited:

```json
{
  "type": "error",
  "error": "rate limit exceeded"
}
```

After 10 consecutive rate limit violations, the connection is automatically closed.

### Cleanup

```bash
# Delete the KWOK cluster when done
kwokctl delete cluster --name=load-test
```

## Existing Load Test Scripts

The `scripts/` directory contains Node.js scripts for creating test resources:

- `create-nodes.js` - Create simulated nodes
- `create-pods.js` - Create simulated pods
- `create-deployments.js` - Create simulated deployments
- `create-events.js` - Create simulated events
- `create-clusters.js` - Create multiple cluster configurations
- `helpers.js` - Shared utility functions

Run scripts with:

```bash
cd load-tests
npm install
node scripts/create-pods.js
```
