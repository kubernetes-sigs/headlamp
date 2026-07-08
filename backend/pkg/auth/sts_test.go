/*
Copyright 2026 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
you may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
)

func TestParseAudienceMap(t *testing.T) {
	tests := []struct {
		input    string
		expected map[string]string
	}{
		{
			input:    "cluster-a=https://aud-a.com,cluster-b=https://aud-b.com",
			expected: map[string]string{"cluster-a": "https://aud-a.com", "cluster-b": "https://aud-b.com"},
		},
		{
			input:    "single-cluster=https://aud-only.com",
			expected: map[string]string{"single-cluster": "https://aud-only.com"},
		},
		{
			input:    "",
			expected: map[string]string{},
		},
	}

	for _, tt := range tests {
		result := auth.ParseAudienceMap(tt.input)
		if len(result) != len(tt.expected) {
			t.Fatalf("expected len %d, got %d for input %s", len(tt.expected), len(result), tt.input)
		}

		for k, v := range tt.expected {
			if result[k] != v {
				t.Errorf("expected key %s value %s, got %s", k, v, result[k])
			}
		}
	}
}

//nolint:gocognit,nestif,funlen,gosec
func TestExchangeTokenForCluster(t *testing.T) {
	// 1. Start a mock server representing the IdP/STS provider
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Mock discovery configuration endpoint
		if r.URL.Path == "/.well-known/openid-configuration" {
			scheme := "http"
			if r.TLS != nil {
				scheme = "https"
			}

			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{
				"issuer":         scheme + "://" + r.Host,
				"token_endpoint": scheme + "://" + r.Host + "/token",
			})

			return
		}

		// Mock token exchange endpoint
		if r.URL.Path == "/token" {
			if err := r.ParseForm(); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			// Validate RFC 8693 parameters
			grantType := r.FormValue("grant_type")
			subjectToken := r.FormValue("subject_token")
			subjectTokenType := r.FormValue("subject_token_type")
			requestedTokenType := r.FormValue("requested_token_type")
			audience := r.FormValue("audience")

			if grantType != "urn:ietf:params:oauth:grant-type:token-exchange" {
				http.Error(w, "invalid grant_type: "+grantType, http.StatusBadRequest)
				return
			}

			if subjectToken != "mock-subject-token" {
				http.Error(w, "invalid subject_token: "+subjectToken, http.StatusBadRequest)
				return
			}

			if subjectTokenType != "urn:ietf:params:oauth:token-type:jwt" {
				http.Error(w, "invalid subject_token_type: "+subjectTokenType, http.StatusBadRequest)
				return
			}

			if requestedTokenType != "urn:ietf:params:oauth:token-type:access_token" {
				http.Error(w, "invalid requested_token_type: "+requestedTokenType, http.StatusBadRequest)
				return
			}

			if audience != "https://cluster-a.audience.com" {
				http.Error(w, "invalid audience: "+audience, http.StatusBadRequest)
				return
			}

			// Validate client authentication
			username, password, hasBasicAuth := r.BasicAuth()
			clientAssertion := r.FormValue("client_assertion")
			clientAssertionType := r.FormValue("client_assertion_type")
			clientID := r.FormValue("client_id")

			if hasBasicAuth {
				if username != "mock-client-id" || password != "mock-client-secret" {
					http.Error(w, "invalid basic auth credentials", http.StatusUnauthorized)
					return
				}
			} else if clientAssertion != "" {
				isInvalidAssertion := clientID != "mock-client-id" ||
					clientAssertionType != "urn:ietf:params:oauth:client-assertion-type:jwt-bearer" ||
					clientAssertion != "mock-sa-token"
				if isInvalidAssertion {
					http.Error(w, "invalid client assertion details", http.StatusUnauthorized)
					return
				}
			}

			// Respond with exchanged token
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"access_token": "exchanged-cluster-token-123",
				"token_type":   "Bearer",
				"expires_in":   3600,
			})

			return
		}

		http.Error(w, "not found", http.StatusNotFound)
	}))
	defer mockServer.Close()

	// 2. Configure STS options
	opts := auth.STSOptions{
		Enabled:      true,
		IssuerURL:    mockServer.URL,
		ClientID:     "mock-client-id",
		ClientSecret: "mock-client-secret",
		AudienceMap:  map[string]string{"cluster-a": "https://cluster-a.audience.com"},
	}

	// 3. Test successful exchange (Basic Auth)
	t.Run("successful token exchange", func(t *testing.T) {
		token, err := auth.ExchangeTokenForCluster(context.Background(), opts, "mock-subject-token", "cluster-a")
		if err != nil {
			t.Fatalf("expected successful exchange, got error: %v", err)
		}

		if token != "exchanged-cluster-token-123" {
			t.Errorf("expected 'exchanged-cluster-token-123', got '%s'", token)
		}
	})

	// 4. Test successful exchange using client assertion (Workload Identity)
	t.Run("successful token exchange using client assertion", func(t *testing.T) {
		// Setup temp directory and write mock Service Account token
		tempDir := t.TempDir()
		tokenFile := filepath.Join(tempDir, "token")

		err := os.WriteFile(tokenFile, []byte("mock-sa-token"), 0o600)
		if err != nil {
			t.Fatalf("failed to write mock token file: %v", err)
		}

		assertionOpts := opts
		assertionOpts.ClientSecret = "" // No secret to trigger Workload Identity flow
		assertionOpts.ServiceAccountTokenPath = tokenFile

		token, err := auth.ExchangeTokenForCluster(context.Background(), assertionOpts, "mock-subject-token", "cluster-a")
		if err != nil {
			t.Fatalf("expected successful exchange using client assertion, got error: %v", err)
		}

		if token != "exchanged-cluster-token-123" {
			t.Errorf("expected 'exchanged-cluster-token-123', got '%s'", token)
		}
	})

	// 5. Test missing audience configuration
	t.Run("missing audience mapping", func(t *testing.T) {
		_, err := auth.ExchangeTokenForCluster(context.Background(), opts, "mock-subject-token", "cluster-b")
		if err == nil {
			t.Fatal("expected error due to missing audience mapping, got nil")
		}
	})

	// 6. Test disabled options
	t.Run("disabled STS options", func(t *testing.T) {
		disabledOpts := opts
		disabledOpts.Enabled = false

		_, err := auth.ExchangeTokenForCluster(context.Background(), disabledOpts, "mock-subject-token", "cluster-a")
		if err == nil {
			t.Fatal("expected error due to disabled STS, got nil")
		}
	})
}
