package telemetry

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	"go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.17.0"
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

// setupTracing initializes and configures the tracing components.
// It creates the appropriate exporter based on configuration,
// sets up a tracer provider with the configured sampling rate,
// and registers it with the global OpenTelemetry instance.
func setupTracing(t *Telemetry, res *resource.Resource, cfg Config) error {
	exporter, err := createTracingExporter(cfg)
	if err != nil {
		return err
	}

	sampler := createSampler(cfg.SamplingRate)

	tp := trace.NewTracerProvider(
		trace.WithSampler(sampler),
		trace.WithBatcher(exporter),
		trace.WithResource(res),
	)

	if tp == nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		_ = exporter.Shutdown(ctx)

		return fmt.Errorf("tracer provider initialization returned nil")
	}

	t.tracerProvider = tp
	otel.SetTracerProvider(tp)

	// Configure context propagation for distributed tracing across service boundaries
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return nil
}

// createSampler creates a sampling strategy based on the configured sampling rate.
// - 1.0 or greater: sample every trace (AlwaysSample)
// - 0.0 or lower: sample no traces (NeverSample)
// - Between 0 and 1: sample the specified fraction of traces
func createSampler(samplingRate float64) trace.Sampler {
	if samplingRate >= 1.0 {
		return trace.AlwaysSample()
	}

	if samplingRate <= 0.0 {
		return trace.NeverSample()
	}

	return trace.TraceIDRatioBased(samplingRate)
}

// // createTracingExporter creates a span exporter based on cfg.
// It prioritizes exporters in the following order:
// 1. Stdout exporter like Jaeger (if StdoutTraceEnabled is true)
// 2. OTLP exporter (if OTLPEndpoint is set)
// 3. Defaults to stdout exporter if no other options are available
func createTracingExporter(cfg Config) (trace.SpanExporter, error) {
	enabledExporters := 0
	var enabledTypes []string

	if cfg.StdoutTraceEnabled {
		enabledExporters++
		enabledTypes = append(enabledTypes, "stdout")
	}

	isJaegerConfigured := cfg.JaegerEndpoint != ""
	isOTLPConfigured := cfg.OTLPEndpoint != ""

	if isJaegerConfigured {
		enabledExporters++
		enabledTypes = append(enabledTypes, "Jaeger")

		if !isOTLPConfigured {
			cfg.OTLPEndpoint = "localhost:4317"
			isOTLPConfigured = true
		}
	}

	if isOTLPConfigured && !isJaegerConfigured {
		enabledExporters++
		enabledTypes = append(enabledTypes, "OTLP")
	}

	if enabledExporters > 1 {
		log.Printf("Warning: Multiple trace exporters configured (%s). Using %s exporter based on priority.",
			strings.Join(enabledTypes, ", "), enabledTypes[0])
	}

	if cfg.StdoutTraceEnabled {
		exporter, err := createStdoutExporter()
		if err != nil {
			return nil, fmt.Errorf("failed to create stdout exporter: %w", err)
		}
		return exporter, nil
	}

	if isOTLPConfigured {
		exporter, err := createOTLPExporter(cfg)
		if err != nil {
			return nil, fmt.Errorf("failed to create OTLP exporter with endpoint %s: %w",
				cfg.OTLPEndpoint, err)
		}
		return exporter, nil
	}

	exporter, err := createStdoutExporter()
	if err != nil {
		return nil, fmt.Errorf("failed to create default stdout exporter: %w", err)
	}

	return exporter, nil
}

// createOTLPExporter creates an OpenTelemetry Protocol (OTLP) exporter
// that can send traces to compatible backends like Jaeger, etc
// OTLP-compatible systems. It supports both HTTP and gRPC transport protocols.
func createOTLPExporter(cfg Config) (trace.SpanExporter, error) {
	var client otlptrace.Client

	if cfg.UseOTLPHTTP {
		client = otlptracehttp.NewClient(
			otlptracehttp.WithEndpoint(cfg.OTLPEndpoint),
			otlptracehttp.WithInsecure(),
		)
	} else {
		client = otlptracegrpc.NewClient(
			otlptracegrpc.WithEndpoint(cfg.OTLPEndpoint),
			otlptracegrpc.WithInsecure(),
		)
	}

	return otlptrace.New(context.Background(), client)
}

// createStdoutExporter creates an exporter that writes traces to stdout.
// This is primarily useful for debugging or development environments.
func createStdoutExporter() (trace.SpanExporter, error) {
	return stdouttrace.New(stdouttrace.WithPrettyPrint())
}

// Shutdown gracefully terminates all telemetry components,
// ensuring that any buffered data is flushed to exporters.
// This method should be called during application shutdown.
// The provided context controls the maximum time allowed for shutdown operations.
func (t *Telemetry) Shutdown(ctx context.Context) error {
	if t.shutdown != nil {
		return t.shutdown(ctx)
	}

	return nil
}
