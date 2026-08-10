package audit_test

import (
	"encoding/json"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/audit"
)

//nolint:funlen
func TestMatchFilter(t *testing.T) {
	event := audit.AuditEvent{
		Verb: "create",
		User: struct {
			Username string `json:"username,omitempty"`
		}{Username: "admin"},
		ObjectRef: struct {
			Resource  string `json:"resource,omitempty"`
			Namespace string `json:"namespace,omitempty"`
			Name      string `json:"name,omitempty"`
		}{Resource: "pods"},
		ResponseStatus: struct {
			Code int `json:"code,omitempty"`
		}{Code: 201},
	}
	eventBytes, _ := json.Marshal(event)

	tests := []struct {
		name     string
		filter   *audit.Filter
		expected bool
	}{
		{
			name:     "No filter",
			filter:   nil,
			expected: true,
		},
		{
			name:     "Empty filter",
			filter:   &audit.Filter{},
			expected: true,
		},
		{
			name:     "Match user",
			filter:   &audit.Filter{User: "admin"},
			expected: true,
		},
		{
			name:     "Mismatch user",
			filter:   &audit.Filter{User: "user1"},
			expected: false,
		},
		{
			name:     "Match verb and kind",
			filter:   &audit.Filter{Verb: "create", Kind: "pods"},
			expected: true,
		},
		{
			name:     "Mismatch verb",
			filter:   &audit.Filter{Verb: "delete", Kind: "pods"},
			expected: false,
		},
		{
			name:     "Match status code",
			filter:   &audit.Filter{StatusCode: 201},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := audit.MatchFilter(eventBytes, tt.filter)
			if result != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result)
			}
		})
	}
}
