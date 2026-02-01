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

Start Headlamp with specific rate limit settings:

```bash
# Default rate limits (50 msg/s per connection)
npm start

# Higher rate limits for large cluster testing
HEADLAMP_CONFIG_WEBSOCKET_RATE_LIMIT=200 npm start
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

The table below provides recommended rate limit settings based on cluster size and usage patterns:

| Cluster Size | Pods | Recommended Rate Limit | IP Rate Limit | Notes |
|-------------|------|----------------------|---------------|-------|
| Small | < 100 | 50 msg/s (default) | 10 conn/s | Suitable for development and small teams |
| Medium | 100 - 1,000 | 100 msg/s | 20 conn/s | Good for active monitoring dashboards |
| Large | 1,000 - 5,000 | 150 msg/s | 30 conn/s | Consider caching strategies |
| Very Large | 5,000+ | 200+ msg/s | 50 conn/s | Test with KWOK first; may need horizontal scaling |

### Configuration Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--websocket-rate-limit` | 50 | Maximum messages per second per WebSocket connection |
| `--websocket-ip-rate-limit` | 10 | Maximum new WebSocket connections per second per IP |
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
