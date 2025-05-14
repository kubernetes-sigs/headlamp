# Telemetry Package

telemetry implementation for Headlamp backend providing distributed tracing, metrics collection, and monitoring capabilities.

## Architecture

The package is organized into three main components:

1. **Core Telemetry** (`telemetry.go`):

   - Configuration management
   - Trace provider setup
   - Resource creation

2. **Metrics** (`metrics.go`):

   - HTTP metrics middleware
   - Custom metric counters
   - Prometheus integration

3. **Tracing** (`tracing.go`):
   - Span management
   - Exporter configuration
   - Context propagation

## Testing

Run the test suite:

```bash
go test ./pkg/telemetry/...
```
