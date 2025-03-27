package telemetry

import (
	"testing"

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
