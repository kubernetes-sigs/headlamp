package telemetry

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.17.0"
	"go.opentelemetry.io/otel/trace"
)

// Config defines the configuration options for telemetry initialization.
// It controls how tracing and metrics are collected and where they are exported.
type Config struct {
	// ServiceName is the name of the service being monitored (required)
	ServiceName string
	// ServiceVersion is the version of the service being monitored
	ServiceVersion string
	// TracingEnabled determines if distributed tracing is enabled
	TracingEnabled bool
	// MetricsEnabled determines if metrics collection is enabled
	MetricsEnabled bool
	// JaegerEndpoint is the endpoint for Jaeger tracing backend
	// Setting this will also set OTLPEndpoint if it's not already set
	JaegerEndpoint string
	// OTLPEndpoint is the endpoint for OTLP-compatible tracing backends
	OTLPEndpoint string
	// UseOTLPHTTP determines whether to use HTTP (true) or gRPC (false) for OTLP export
	UseOTLPHTTP bool
	// StdoutTraceEnabled enables logging of traces to stdout (useful for debugging)
	StdoutTraceEnabled bool
	// PrometheusPort is the port where Prometheus metrics will be exposed
	PrometheusPort int
	// SamplingRate controls the fraction of traces that are sampled
	SamplingRate float64
}

// Telemetry is the main struct that manages the lifecycle of telemetry components.
// It holds the trace and meter providers and provides methods for shutdown.
type Telemetry struct {
	config         Config
	tracerProvider *trace.TracerProvider
	meterProvider  *metric.MeterProvider
	shutdown       func(context.Context) error
}

// createResource creates an OpenTelemetry resource with service information.
// The resource contains identifying information about the service being monitored,
// including its name, version, and deployment environment.
func createResource(cfg Config) (*resource.Resource, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := resource.New(
		ctx,
		resource.WithAttributes(
			semconv.ServiceName(cfg.ServiceName),
			semconv.ServiceVersion(cfg.ServiceVersion),
			attribute.String("environment", "production"),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create OpenTelemetry resource: %w", err)
	}

	return res, nil
}
