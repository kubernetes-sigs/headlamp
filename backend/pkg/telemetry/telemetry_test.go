package telemetry

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/attribute"
	semconv "go.opentelemetry.io/otel/semconv/v1.17.0"
)

func TestCreateReosurce(t *testing.T) {
	cfg := Config{
		ServiceName:    "test-service",
		ServiceVersion: "1.0.0",
	}

	res, err := createResource(cfg)
	require.NoError(t, err)
	assert.NotNil(t, res)

	// Verify resource attributes
	attrs := res.Attributes()

	var serviceNameFound, serviceVersionFound, environmentFound bool

	// Check for expected attributes

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
