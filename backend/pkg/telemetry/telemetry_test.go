//nolint:testpackage // testing private functions.
package telemetry

import (
	"bytes"
	"context"
	"errors"
	"log"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	semconv "go.opentelemetry.io/otel/semconv/v1.4.0"
)

func TestNewTelemetry(t *testing.T) { //nolint:funlen
	tests := []struct {
		name          string
		config        Config
		expectError   bool
		errorContains string
	}{
		{
			name: "valid config",
			config: Config{
				ServiceName:        "test-service",
				TracingEnabled:     true,
				StdoutTraceEnabled: true,
			},
			expectError: false,
		},
		{
			name: "valid config with metrics",
			config: Config{
				ServiceName:        "test-service",
				TracingEnabled:     true,
				MetricsEnabled:     true,
				PrometheusPort:     9090,
				StdoutTraceEnabled: true,
			},
			expectError: false,
		},
		{
			name: "missing service name",
			config: Config{
				TracingEnabled: true,
			},
			expectError:   true,
			errorContains: "service name cannot be empty",
		},
		{
			name: "invalid prometheus port",
			config: Config{
				ServiceName:    "test-service",
				MetricsEnabled: true,
				PrometheusPort: 0,
			},
			expectError:   true,
			errorContains: "metrics enabled but invalid Prometheus port: 0",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			telemetry, err := NewTelemetry(tc.config)

			if tc.expectError {
				assert.Error(t, err)

				if tc.errorContains != "" {
					assert.Contains(t, err.Error(), tc.errorContains)
				}

				assert.Nil(t, telemetry)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, telemetry)

				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()

				err = telemetry.Shutdown(ctx)
				assert.NoError(t, err)
			}
		})
	}
}

func TestCreateResource(t *testing.T) {
	cfg := Config{
		ServiceName:    "test-service",
		ServiceVersion: "1.0.0",
	}

	res, err := createResource(cfg)
	require.NoError(t, err)
	assert.NotNil(t, res)

	attrs := res.Attributes()

	var serviceNameFound, serviceVersionFound, environmentFound bool

	for _, attr := range attrs {
		switch attr.Key {
		case semconv.ServiceNameKey:
			assert.Equal(t, "test-service", attr.Value.AsString())

			serviceNameFound = true
		case semconv.ServiceVersionKey:
			assert.Equal(t, "1.0.0", attr.Value.AsString())

			serviceVersionFound = true
		case attribute.Key("environment"):
			assert.Equal(t, "production", attr.Value.AsString())

			environmentFound = true
		}
	}

	assert.True(t, serviceNameFound, "Service name attribute not found")
	assert.True(t, serviceVersionFound, "Service version attribute not found")
	assert.True(t, environmentFound, "Environment attribute not found")
}

func TestCreateTracingExporter(t *testing.T) { //nolint:funlen // too long due to multiple test cases
	tests := []struct {
		name                  string
		config                Config
		expectError           bool
		exporterType          string
		expectMultipleWarning bool
	}{
		{
			name: "stdout exporter",
			config: Config{
				StdoutTraceEnabled: true,
			},
			expectError:           false,
			exporterType:          "*stdouttrace.Exporter",
			expectMultipleWarning: false,
		},
		{
			name: "OTLP exporter",
			config: Config{
				OTLPEndpoint: "localhost:4317",
			},
			expectError:           false,
			exporterType:          "otlptrace.Exporter",
			expectMultipleWarning: false,
		},
		{
			name: "jaeger fallback to OTLP",
			config: Config{
				JaegerEndpoint: "http://localhost:14268/api/traces",
			},
			expectError:           false,
			exporterType:          "otlptrace.Exporter",
			expectMultipleWarning: false,
		},
		{
			name:                  "default to stdout",
			config:                Config{},
			expectError:           false,
			exporterType:          "*stdouttrace.Exporter",
			expectMultipleWarning: false,
		},
		{
			name: "multiple exporters - stdout and OTLP",
			config: Config{
				StdoutTraceEnabled: true,
				OTLPEndpoint:       "localhost:4317",
			},
			expectError:           false,
			exporterType:          "*stdouttrace.Exporter",
			expectMultipleWarning: true,
		},
		{
			name: "multiple exporters - stdout and Jaeger",
			config: Config{
				StdoutTraceEnabled: true,
				JaegerEndpoint:     "http://localhost:14268/api/traces",
			},
			expectError:           false,
			exporterType:          "*stdouttrace.Exporter",
			expectMultipleWarning: true,
		},
		{
			name: "all exporters configured",
			config: Config{
				StdoutTraceEnabled: true,
				JaegerEndpoint:     "http://localhost:14268/api/traces",
				OTLPEndpoint:       "localhost:4317",
			},
			expectError:           false,
			exporterType:          "*stdouttrace.Exporter",
			expectMultipleWarning: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var logBuf bytes.Buffer

			log.SetOutput(&logBuf)

			defer log.SetOutput(os.Stderr)

			exporter, err := createTracingExporter(tc.config)

			if tc.expectError {
				assert.Error(t, err)
				assert.Nil(t, exporter)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, exporter)

				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()

				err = exporter.Shutdown(ctx)
				assert.NoError(t, err)
			}

			// Check for warning about multiple exporters
			warningMsg := "Warning: Multiple trace exporters configured"
			logOutput := logBuf.String()

			if tc.expectMultipleWarning {
				assert.Contains(t, logOutput, warningMsg, "Expected warning about multiple exporters")
			} else {
				assert.NotContains(t, logOutput, warningMsg, "Did not expect warning about multiple exporters")
			}
		})
	}
}

func TestCreateOTLPExporter(t *testing.T) {
	if os.Getenv("CI") != "" {
		t.Skip("Skipping OTPL exporter test in CI environment")
	}

	tests := []struct {
		name        string
		config      Config
		expectError bool
	}{
		{
			name: "gRPC exporter",
			config: Config{
				OTLPEndpoint: "localhost:4317",
				UseOTLPHTTP:  false,
			},
			expectError: false,
		},
		{
			name: "HTTP exporter",
			config: Config{
				OTLPEndpoint: "localhost:4318",
				UseOTLPHTTP:  true,
			},
			expectError: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			exporter, err := createOTLPExporter(tc.config)

			if err != nil && !errors.Is(err, context.DeadlineExceeded) {
				t.Logf("Got error creating OTPL exporter: %v", err)
			}

			if exporter != nil {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()

				_ = exporter.Shutdown(ctx)
			}
		})
	}
}

func TestCreateSampler(t *testing.T) {
	tests := []struct {
		rate          float64
		expectedType  string
		alwaysOn      bool
		alwaysOff     bool
		ratioSampling bool
	}{
		{1.5, "AlwaysSample", true, false, false},
		{1.0, "AlwaysSample", true, false, false},
		{0.5, "TraceIDRatioBased", false, false, true},
		{0.0, "NeverSample", false, true, false},
		{-1.0, "NeverSample", false, true, false},
	}

	for _, tc := range tests {
		t.Run(tc.expectedType, func(t *testing.T) {
			sampler := createSampler(tc.rate)
			assert.NotNil(t, sampler)

			exporter := tracetest.NewInMemoryExporter()
			tp := trace.NewTracerProvider(
				trace.WithSampler(sampler),
				trace.WithBatcher(exporter),
			)

			tracer := tp.Tracer("test")
			_, span := tracer.Start(context.Background(), "test-span")
			span.End()

			require.NoError(t, tp.ForceFlush(context.Background()))

			spans := exporter.GetSpans()

			switch {
			case tc.alwaysOn:
				assert.Len(t, spans, 1, "AlwaysSample should record the span")
			case tc.alwaysOff:
				assert.Len(t, spans, 0, "NeverSample should not record any spans")
			case tc.ratioSampling:
				desc := sampler.Description()
				assert.Contains(t, desc, "TraceIDRatioBased")
			}

			_ = tp.Shutdown(context.Background())
		})
	}
}

func TestSetupTracing(t *testing.T) {
	oldTP := otel.GetTracerProvider()
	defer otel.SetTracerProvider(oldTP)

	telemetry := &Telemetry{
		config: Config{
			ServiceName:        "test-service",
			StdoutTraceEnabled: true,
		},
	}

	res, err := createResource(telemetry.config)
	require.NoError(t, err)

	err = setupTracing(telemetry, res, telemetry.config)
	require.NoError(t, err)

	assert.NotNil(t, telemetry.tracerProvider)

	tracer := otel.Tracer("test")
	_, span := tracer.Start(context.Background(), "test-span")
	span.End()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err = telemetry.Shutdown(ctx)
	assert.NoError(t, err)
}

func TestSetupShutdownFunction(t *testing.T) {
	telemetry := &Telemetry{
		config: Config{
			ServiceName: "test-service",
		},
	}

	mockTP := trace.NewTracerProvider()
	telemetry.tracerProvider = mockTP

	setupShutdownFunction(telemetry)

	assert.NotNil(t, telemetry.shutdown)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := telemetry.Shutdown(ctx)
	assert.NoError(t, err)

	telemetry = &Telemetry{
		config: Config{
			ServiceName: "test-service",
		},
	}

	setupShutdownFunction(telemetry)
	err = telemetry.shutdown(ctx)
	assert.NoError(t, err)
}

func TestShutDown(t *testing.T) {
	telemetry := &Telemetry{
		config: Config{
			ServiceName: "test-service",
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := telemetry.Shutdown(ctx)
	assert.NoError(t, err)
}

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()

	assert.Equal(t, "headlamp", cfg.ServiceName)
	assert.Equal(t, "0.30.0", cfg.ServiceVersion)
	assert.True(t, cfg.TracingEnabled)
	assert.True(t, cfg.MetricsEnabled)
	assert.Equal(t, "localhost:4317", cfg.OTLPEndpoint)
	assert.False(t, cfg.StdoutTraceEnabled)
	assert.Equal(t, 9090, cfg.PrometheusPort)
	assert.Equal(t, 1.0, cfg.SamplingRate)
}
