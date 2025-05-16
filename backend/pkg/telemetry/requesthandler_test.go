package telemetry_test

import (
	"testing"

	tel "github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
)

func TestNewRequestHandler(t *testing.T) {
	telemetry := &tel.Telemetry{}
	metrics := &tel.Metrics{}

	handler := tel.NewRequestHandler(telemetry, metrics)

	if handler == nil {
		t.Errorf("Expected non-nil RequestHandler, got nil")
	}
}
