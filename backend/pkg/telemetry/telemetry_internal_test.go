package telemetry

import (
	"testing"

	cfg "github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
)

func TestNormalizeEndpoint(t *testing.T) {
	tests := []struct {
		name     string
		endpoint string
		expected string
	}{
		{
			name:     "keeps host and port",
			endpoint: "localhost:4317",
			expected: "localhost:4317",
		},
		{
			name:     "strips scheme",
			endpoint: "http://localhost:14268",
			expected: "localhost:14268",
		},
		{
			name:     "strips path",
			endpoint: "http://localhost:14268/api/traces",
			expected: "localhost:14268",
		},
		{
			name:     "strips path without scheme",
			endpoint: "localhost:14268/api/traces",
			expected: "localhost:14268",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.expected, normalizeEndpoint(tc.endpoint))
		})
	}
}

func TestCreateTracingExporter_JaegerFallback(t *testing.T) {
	jaegerEndpoint := "http://localhost:4318/v1/traces"
	stdoutEnabled := false

	config := cfg.Config{
		JaegerEndpoint:     &jaegerEndpoint,
		StdoutTraceEnabled: &stdoutEnabled,
	}

	exporter, err := createTracingExporter(config)
	require.NoError(t, err)
	require.NotNil(t, exporter)

	assert.IsType(t, &otlptrace.Exporter{}, exporter)
}
