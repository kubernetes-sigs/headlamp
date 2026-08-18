package telemetry_test

import (
	"context"
	"testing"
	"time"

	cfg "github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	tel "github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
)

func TestNewTelemetry(t *testing.T) { //nolint:funlen // multiple test cases function
	testVersion := "1.0.0"
	sampleRate := 1.0
	emptyStr := ""
	jaegerEndpoint := "http://jaeger:14268/api/traces"
	trueVal := true
	falseVal := false

	tests := []struct {
		name          string
		config        cfg.Config
		expectError   bool
		errorContains string
	}{
		{
			name: "valid config",
			config: cfg.Config{
				ServiceName:        "test-service",
				ServiceVersion:     &testVersion,
				TracingEnabled:     &trueVal,
				StdoutTraceEnabled: &trueVal,
				SamplingRate:       &sampleRate,
				MetricsEnabled:     &falseVal,
				JaegerEndpoint:     &emptyStr,
				OTLPEndpoint:       &emptyStr,
				UseOTLPHTTP:        &falseVal,
			},
			expectError: false,
		},
		{
			name: "valid config with metrics",
			config: cfg.Config{
				ServiceName:        "test-service",
				ServiceVersion:     &testVersion,
				TracingEnabled:     &trueVal,
				MetricsEnabled:     &trueVal,
				StdoutTraceEnabled: &trueVal,
				SamplingRate:       &sampleRate,
				JaegerEndpoint:     &emptyStr,
				OTLPEndpoint:       &emptyStr,
				UseOTLPHTTP:        &falseVal,
			},
			expectError: false,
		},
		{
			name: "missing service name",
			config: cfg.Config{
				TracingEnabled:     &trueVal,
				ServiceVersion:     &testVersion,
				SamplingRate:       &sampleRate,
				MetricsEnabled:     &falseVal,
				JaegerEndpoint:     &emptyStr,
				OTLPEndpoint:       &emptyStr,
				UseOTLPHTTP:        &falseVal,
				StdoutTraceEnabled: &falseVal,
			},
			expectError:   true,
			errorContains: "service name cannot be empty",
		},
		{
			name: "jaeger endpoint is rejected instead of falling back to otlp",
			config: cfg.Config{
				ServiceName:        "test-service",
				ServiceVersion:     &testVersion,
				TracingEnabled:     &trueVal,
				StdoutTraceEnabled: &falseVal,
				SamplingRate:       &sampleRate,
				MetricsEnabled:     &falseVal,
				JaegerEndpoint:     &jaegerEndpoint,
				OTLPEndpoint:       &emptyStr,
				UseOTLPHTTP:        &falseVal,
			},
			expectError: true,
			errorContains: "jaeger endpoint http://jaeger:14268/api/traces is not supported; " +
				"use an OTLP endpoint or stdout tracing instead",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			telemetry, err := tel.NewTelemetry(tc.config)

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

func TestNewTelemetryDoesNotCountJaegerInExporterWarning(t *testing.T) {
	testVersion := "1.0.0"
	sampleRate := 1.0
	jaegerEndpoint := "http://jaeger:14268/api/traces"
	otlpEndpoint := "localhost:4317"
	trueVal := true
	falseVal := false

	var warningFields map[string]string

	originalLogFunc := logger.SetLogFunc(func(level uint, str map[string]string, err interface{}, msg string) {
		if level == logger.LevelWarn && msg == "Multiple trace exporters configured, using highest priority exporter" {
			warningFields = str
		}
	})
	defer logger.SetLogFunc(originalLogFunc)

	telemetry, err := tel.NewTelemetry(cfg.Config{
		ServiceName:        "test-service",
		ServiceVersion:     &testVersion,
		TracingEnabled:     &trueVal,
		StdoutTraceEnabled: &trueVal,
		SamplingRate:       &sampleRate,
		MetricsEnabled:     &falseVal,
		JaegerEndpoint:     &jaegerEndpoint,
		OTLPEndpoint:       &otlpEndpoint,
		UseOTLPHTTP:        &falseVal,
	})
	assert.NoError(t, err)
	assert.NotNil(t, telemetry)
	assert.Equal(t, "stdout, OTLP", warningFields["configured"])
	assert.Equal(t, "stdout", warningFields["selected"])

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	assert.NoError(t, telemetry.Shutdown(ctx))
}
