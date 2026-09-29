---
title: Telemetry
sidebar_position: 1.5
---

Headlamp's backend supports [OpenTelemetry](https://opentelemetry.io/) for distributed tracing and Prometheus-compatible metrics. This lets operators monitor Headlamp health, debug issues, and observe request patterns in production.

Telemetry is **backend-only** today. Both tracing and metrics are **disabled by default**.

## What is collected

### Metrics

When metrics are enabled, Headlamp exposes a Prometheus scrape endpoint at `/metrics` on the main HTTP port (default `4466`).

| Metric | Description |
|--------|-------------|
| `http.server.request_count` | Total HTTP requests (by method, path, status code) |
| `http.server.duration` | HTTP request duration histogram (milliseconds) |
| `http.server.active_requests` | Currently active HTTP requests |
| `headlamp.cluster_proxy.requests` | Requests through the cluster proxy |
| `headlamp.plugin.load_count` | Plugin load operations |
| `headlamp.plugin.delete_count` | Plugin delete operations |
| `headlamp.errors` | Application errors by category |

### Traces

When tracing is enabled, Headlamp exports spans via OTLP (gRPC or HTTP) or to stdout. Instrumented operations include:

- Plugin list and delete
- Helm operations
- Cluster API proxy requests
- Cluster add, delete, and rename
- Node drain operations
- OIDC token refresh (auth middleware)

## Configuration

Telemetry can be configured with CLI flags or environment variables. Environment variables use the `HEADLAMP_CONFIG_` prefix with underscores; they map to the underlying config keys (matching flag names where applicable).

| Flag | Environment variable | Default | Description |
|------|---------------------|---------|-------------|
| `--service-name` | `HEADLAMP_CONFIG_SERVICE_NAME` | `headlamp` | OpenTelemetry service name |
| `--service-version` | `HEADLAMP_CONFIG_SERVICE_VERSION` | `0.30.0` | Service version resource attribute |
| `--tracing-enabled` | `HEADLAMP_CONFIG_TRACING_ENABLED` | `false` | Enable distributed tracing |
| `--metrics-enabled` | `HEADLAMP_CONFIG_METRICS_ENABLED` | `false` | Enable metrics and `/metrics` endpoint |
| `--otlp-endpoint` | `HEADLAMP_CONFIG_OTLP_ENDPOINT` | `localhost:4317` | OTLP collector endpoint (host:port) |
| `--use-otlp-http` | `HEADLAMP_CONFIG_USE_OTLP_HTTP` | `false` | Use OTLP HTTP instead of gRPC |
| `--stdout-trace-enabled` | `HEADLAMP_CONFIG_STDOUT_TRACE_ENABLED` | `false` | Export traces to stdout |
| `--sampling-rate` | `HEADLAMP_CONFIG_SAMPLING_RATE` | `1.0` | Trace sampling rate (0.0–1.0) |

When tracing is enabled, Headlamp exports spans either to stdout (when
`--stdout-trace-enabled` is `true`) or via OTLP to the configured
endpoint (`--otlp-endpoint` / `HEADLAMP_CONFIG_OTLP_ENDPOINT`, default
`localhost:4317`). To view traces in Jaeger locally, run `make run-jaeger`
and send OTLP to `localhost:4317` (gRPC). If you set `--use-otlp-http=true`,
use the HTTP port instead (for example `--otlp-endpoint=localhost:4318`).

## Local development

### Enable metrics only

Build the backend, then run with metrics enabled:

```bash
npm run backend:build
npm run backend:start:metrics
```

Or with Make:

```bash
make backend && make run-backend-with-metrics
```

Verify metrics are exposed:

```bash
curl http://localhost:4466/metrics
```

### Enable tracing only

Start an OTLP collector first (see [Monitoring stack](#monitoring-stack) below), then run:

```bash
npm run backend:build
npm run backend:start:traces
```

Or with Make:

```bash
make backend && make run-backend-with-traces
```

Traces are sent to `localhost:4317` by default. View them in the Jaeger UI at [http://localhost:16686](http://localhost:16686).

### Enable both

```bash
HEADLAMP_CONFIG_METRICS_ENABLED=true \
HEADLAMP_CONFIG_TRACING_ENABLED=true \
HEADLAMP_CONFIG_OTLP_ENDPOINT=localhost:4317 \
npm run backend:start
```

## Monitoring stack

Headlamp includes Makefile targets to run Jaeger and Prometheus locally via Docker.

Note: the Prometheus target uses Docker host networking (`--network host`) and may require Linux/WSL2 or adjustments on macOS/Windows.

```bash
make run-monitoring
```

This starts:

- **Jaeger UI** at [http://localhost:16686](http://localhost:16686) — OTLP on gRPC `4317` and HTTP `4318`
- **Prometheus UI** at [http://localhost:9090](http://localhost:9090) — scrapes Headlamp at `localhost:4466/metrics`

Stop the stack with:

```bash
make stop-monitoring
```

Prometheus scrape configuration for local development is in `backend/pkg/telemetry/prometheus.yaml`.

## In-cluster deployment

Example manifests are provided for running Headlamp with a full observability stack in Kubernetes:

- `kubernetes-headlamp.yaml` — Headlamp deployment with telemetry environment variables
- `kubernetes-headlamp-monitoring.yaml` — Jaeger, OpenTelemetry Collector, and Prometheus

Apply the monitoring stack first, then deploy Headlamp:

```bash
kubectl apply -f kubernetes-headlamp-monitoring.yaml
kubectl apply -f kubernetes-headlamp.yaml
```

The Headlamp deployment sets:

```yaml
env:
  - name: HEADLAMP_CONFIG_TRACING_ENABLED
    value: "true"
  - name: HEADLAMP_CONFIG_METRICS_ENABLED
    value: "true"
  - name: HEADLAMP_CONFIG_OTLP_ENDPOINT
    value: "otel-collector:4317"
  - name: HEADLAMP_CONFIG_SERVICE_NAME
    value: "headlamp"
  - name: HEADLAMP_CONFIG_SERVICE_VERSION
    value: "latest"
```

Prometheus should scrape Headlamp at `headlamp.kube-system.svc.cluster.local/metrics` (Service port `80` → container port `4466`). If you use `kubernetes-headlamp-monitoring.yaml` as-is, update its Prometheus scrape target from `headlamp.kube-system.svc.cluster.local:4466` to the Service port (for example `headlamp.kube-system.svc.cluster.local:80` or `headlamp:80`).

## Troubleshooting

**Tracing enabled but no collector running**

If `--tracing-enabled` is set without a reachable OTLP endpoint, trace export may fail. Start a collector (`make run-jaeger`), enable stdout export (`--stdout-trace-enabled=true`), or disable tracing.

**`/metrics` returns 404**

The `/metrics` endpoint is only registered when `--metrics-enabled` is `true` (or `HEADLAMP_CONFIG_METRICS_ENABLED=true`). Confirm the flag is set and restart the server.

**No traces in Jaeger**

1. Confirm Jaeger or an OTLP collector is running and reachable at the configured endpoint.
2. Generate traffic against Headlamp (e.g. load the UI or call an API endpoint).
3. Check that `--sampling-rate` is not `0`.

## Further reading

- Package overview and tests: `backend/pkg/telemetry/README.md`
- Implementation: `backend/pkg/telemetry/`
- Related RFC: [kubernetes-sigs/headlamp#2799](https://github.com/kubernetes-sigs/headlamp/issues/2799)
