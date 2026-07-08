package telemetry

import (
	"testing"

	"github.com/stretchr/testify/assert"
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
