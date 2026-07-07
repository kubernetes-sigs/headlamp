package telemetry_test

import (
	"testing"

	cfg "github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	tel "github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
)

func TestNormalizeOTLPEndpoint(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{name: "host port", input: "localhost:4317", expected: "localhost:4317"},
		{name: "http url", input: "http://localhost:14268", expected: "localhost:14268"},
		{name: "https url with path", input: "https://collector:4318/v1/traces", expected: "collector:4318"},
		{name: "empty", input: "", expected: ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tc.expected, tel.NormalizeOTLPEndpointForTest(tc.input))
		})
	}
}

func TestResolveOTLPEndpoint(t *testing.T) {
	t.Parallel()

	otlp := "localhost:4317"
	jaeger := "localhost:14268"
	jaegerURL := "http://jaeger:4317"

	tests := []struct {
		name     string
		config   cfg.Config
		expected string
	}{
		{
			name: "otlp takes precedence",
			config: cfg.Config{
				OTLPEndpoint:   &otlp,
				JaegerEndpoint: &jaeger,
			},
			expected: "localhost:4317",
		},
		{
			name: "jaeger fallback when otlp empty",
			config: cfg.Config{
				OTLPEndpoint:   new(string),
				JaegerEndpoint: &jaegerURL,
			},
			expected: "jaeger:4317",
		},
		{
			name: "empty when unset",
			config: cfg.Config{
				OTLPEndpoint:   new(string),
				JaegerEndpoint: new(string),
			},
			expected: "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tc.expected, tel.ResolveOTLPEndpointForTest(tc.config))
		})
	}
}
