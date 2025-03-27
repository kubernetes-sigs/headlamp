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
	"go.opentelemetry.io/otel/exporters/prometheus"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/metric"
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

// NewTelemetry creates and initializes a new Telemetry instance based on the provided configuration.
// It sets up tracing and metrics collection according to the config.
// Returns a configured Telemetry instance and any error encountered during initialization.
// If initialization fails, all resources are properly cleaned up.
func NewTelemetry(cfg Config) (*Telemetry, error) {
	if cfg.ServiceName == "" {
		return nil, fmt.Errorf("service name cannot be empty")
	}

	t := &Telemetry{
		config: cfg,
	}

	res, err := createResource(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create telemetry resource: %w", err)
	}

	// Initialize trace provider if tracing is enabled
	if cfg.TracingEnabled {
		if err := setupTracing(t, res, cfg); err != nil {
			return nil, fmt.Errorf("failed to setup tracing %w", err)
		}
	}

	// Initialize metrics provider if metrics are enabled
	if cfg.MetricsEnabled && cfg.PrometheusPort > 0 {
		if err := setupMetrics(t, res); err != nil {
			// Clean up trace provider if metrics setup fails
			if t.tracerProvider != nil {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()

				_ = t.tracerProvider.Shutdown(ctx)
			}

			return nil, fmt.Errorf("failed to setup metrics: %w", err)
		}
	} else if cfg.MetricsEnabled && cfg.PrometheusPort <= 0 {
		return nil, fmt.Errorf("metrics enabled but invalid Prometheus port: %d", cfg.PrometheusPort)
	}

	setupShutdownFunction(t)

	return t, nil
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

// setupMetrics initializes and configures the metrics components.
// It creates a Prometheus exporter and sets up a meter provider,
// registering it with the global OpenTelemetry instance.
func setupMetrics(t *Telemetry, res *resource.Resource) error {
	promExporter, err := prometheus.New()
	if err != nil {
		return fmt.Errorf("failed to initialize Prometheus exporter: %w", err)
	}

	mp := metric.NewMeterProvider(
		metric.WithReader(promExporter),
		metric.WithResource(res),
	)
	if mp == nil {
		return fmt.Errorf("meter provider initialization returned nil")
	}

	t.meterProvider = mp
	otel.SetMeterProvider(mp)

	return nil
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

// setupShutdownFunction prepares a function that will properly shut down
// all telemetry components when called. This ensures that all pending
// data is flushed to exporters before the application exits.
func setupShutdownFunction(t *Telemetry) {
	t.shutdown = func(ctx context.Context) error {
		var err1, err2 error
		if t.tracerProvider != nil {
			err1 = t.tracerProvider.Shutdown(ctx)
		}

		if t.meterProvider != nil {
			err2 = t.meterProvider.Shutdown(ctx)
		}

		// Return both errors if both occur
		if err1 != nil && err2 != nil {
			return fmt.Errorf("multiple shutdown errors: tracer: %w; meter: %v", err1, err2)
		}

		if err1 != nil {
			return fmt.Errorf("tracer shutdown error: %w", err1)
		}

		if err2 != nil {
			return fmt.Errorf("meter shutdown error: %w", err2)
		}

		return nil
	}
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

// DefaultConfig provides a reasonable default configuration for telemetry.
// It enables both tracing and metrics with 100% sampling rate and
// configures exporters to local endpoints for development use.
func DefaultConfig() Config {
	return Config{
		ServiceName:        "headlamp",
		ServiceVersion:     "0.30.0",
		TracingEnabled:     true,
		MetricsEnabled:     true,
		OTLPEndpoint:       "localhost:4317",
		StdoutTraceEnabled: false,
		PrometheusPort:     9090,
		SamplingRate:       1.0,
	}
}
