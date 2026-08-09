package audit

import (
	"encoding/json"
	"testing"
)

func TestMatchFilter(t *testing.T) {
	event := AuditEvent{
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
		filter   *Filter
		expected bool
	}{
		{
			name:     "No filter",
			filter:   nil,
			expected: true,
		},
		{
			name:     "Empty filter",
			filter:   &Filter{},
			expected: true,
		},
		{
			name:     "Match user",
			filter:   &Filter{User: "admin"},
			expected: true,
		},
		{
			name:     "Mismatch user",
			filter:   &Filter{User: "user1"},
			expected: false,
		},
		{
			name:     "Match verb and kind",
			filter:   &Filter{Verb: "create", Kind: "pods"},
			expected: true,
		},
		{
			name:     "Mismatch verb",
			filter:   &Filter{Verb: "delete", Kind: "pods"},
			expected: false,
		},
		{
			name:     "Match status code",
			filter:   &Filter{StatusCode: 201},
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := MatchFilter(eventBytes, tt.filter)
			if result != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, result)
			}
		})
	}
}
