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
	"strings"
	"sync"
	"sync/atomic"
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

//nolint:gocyclo,gocognit,nestif,funlen,gosec
func TestExchangeTokenForCluster(t *testing.T) {
	auth.ResetSTSCache()

	var tokenRequests atomic.Int32

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
			tokenRequests.Add(1)

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

			isValidSubjectType := subjectTokenType == "urn:ietf:params:oauth:token-type:jwt" ||
				subjectTokenType == "urn:ietf:params:oauth:token-type:access_token"
			if !isValidSubjectType {
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
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusUnauthorized)
					_, _ = w.Write([]byte(`{"error":"invalid_client","secret_token_leak":"sensitive-data"}`))

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

			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"access_token": "exchanged-cluster-token-123",
				"token_type":   "Bearer",
				"expires_in":   3600,
			})

			return
		}

		http.NotFound(w, r)
	}))
	defer mockServer.Close()

	opts := auth.STSOptions{
		Enabled:      true,
		IssuerURL:    mockServer.URL,
		ClientID:     "mock-client-id",
		ClientSecret: "mock-client-secret",
		AudienceMap:  map[string]string{"cluster-a": "https://cluster-a.audience.com"},
	}

	// 2. Test successful token exchange
	t.Run("successful token exchange", func(t *testing.T) {
		tokenRequests.Store(0)
		auth.ResetSTSCache()

		token, err := auth.ExchangeTokenForCluster(context.Background(), opts, "mock-subject-token", "cluster-a")
		if err != nil {
			t.Fatalf("expected successful exchange, got error: %v", err)
		}

		if token != "exchanged-cluster-token-123" {
			t.Errorf("expected 'exchanged-cluster-token-123', got '%s'", token)
		}

		if tokenRequests.Load() != 1 {
			t.Errorf("expected 1 token request, got %d", tokenRequests.Load())
		}
	})

	// 3. Test token caching
	t.Run("token caching avoids duplicate network request", func(t *testing.T) {
		// Calling again with the same parameters should hit the cache without calling /token
		token, err := auth.ExchangeTokenForCluster(context.Background(), opts, "mock-subject-token", "cluster-a")
		if err != nil {
			t.Fatalf("expected cached exchange, got error: %v", err)
		}

		if token != "exchanged-cluster-token-123" {
			t.Errorf("expected 'exchanged-cluster-token-123', got '%s'", token)
		}

		if tokenRequests.Load() != 1 {
			t.Errorf("expected still 1 token request due to caching, got %d", tokenRequests.Load())
		}
	})

	// 4. Test subject token type propagation
	t.Run("subject token type access_token normalization", func(t *testing.T) {
		auth.ResetSTSCache()
		tokenRequests.Store(0)

		accessOpts := opts
		accessOpts.SubjectTokenType = "access_token"

		token, err := auth.ExchangeTokenForCluster(context.Background(), accessOpts, "mock-subject-token", "cluster-a")
		if err != nil {
			t.Fatalf("expected successful exchange with access_token type, got error: %v", err)
		}

		if token != "exchanged-cluster-token-123" {
			t.Errorf("expected 'exchanged-cluster-token-123', got '%s'", token)
		}
	})

	// 5. Test concurrent request deduplication
	t.Run("concurrent token requests deduplication", func(t *testing.T) {
		auth.ResetSTSCache()
		tokenRequests.Store(0)

		var wg sync.WaitGroup

		concurrency := 10

		for i := 0; i < concurrency; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()

				tkn, err := auth.ExchangeTokenForCluster(context.Background(), opts, "mock-subject-token", "cluster-a")
				if err != nil || tkn != "exchanged-cluster-token-123" {
					t.Errorf("unexpected concurrent result: tkn=%s, err=%v", tkn, err)
				}
			}()
		}

		wg.Wait()

		if tokenRequests.Load() != 1 {
			t.Errorf("expected 1 token request due to singleflight deduplication, got %d", tokenRequests.Load())
		}
	})

	// 6. Test invalid subject token or empty clusterID validation
	t.Run("empty subject token", func(t *testing.T) {
		_, err := auth.ExchangeTokenForCluster(context.Background(), opts, "  ", "cluster-a")
		if err == nil {
			t.Fatal("expected error due to empty subject token, got nil")
		}
	})

	t.Run("empty cluster ID", func(t *testing.T) {
		_, err := auth.ExchangeTokenForCluster(context.Background(), opts, "mock-subject-token", "  ")
		if err == nil {
			t.Fatal("expected error due to empty cluster ID, got nil")
		}
	})

	// 7. Test successful exchange using client assertion (Workload Identity)
	t.Run("successful token exchange using client assertion", func(t *testing.T) {
		auth.ResetSTSCache()

		tempDir := t.TempDir()
		tokenFile := filepath.Join(tempDir, "token")

		err := os.WriteFile(tokenFile, []byte("mock-sa-token"), 0o600)
		if err != nil {
			t.Fatalf("failed to write mock token file: %v", err)
		}

		assertionOpts := opts
		assertionOpts.ClientSecret = ""
		assertionOpts.ServiceAccountTokenPath = tokenFile

		token, err := auth.ExchangeTokenForCluster(
			context.Background(),
			assertionOpts,
			"mock-subject-token",
			"cluster-a",
		)
		if err != nil {
			t.Fatalf("expected successful exchange using client assertion, got error: %v", err)
		}

		if token != "exchanged-cluster-token-123" {
			t.Errorf("expected 'exchanged-cluster-token-123', got '%s'", token)
		}
	})

	// 8. Test Workload Identity token read failure returns 500
	t.Run("workload identity token file read error returns 500", func(t *testing.T) {
		auth.ResetSTSCache()

		unreadableOpts := opts
		unreadableOpts.ClientSecret = ""
		unreadableOpts.ServiceAccountTokenPath = "/nonexistent/token/path"

		_, err := auth.ExchangeTokenForCluster(
			context.Background(),
			unreadableOpts,
			"mock-subject-token",
			"cluster-a",
		)
		if err == nil {
			t.Fatal("expected error for unreadable SA token, got nil")
		}

		code := auth.GetSTSErrorStatusCode(err)
		if code != http.StatusInternalServerError {
			t.Errorf("expected status %d, got %d", http.StatusInternalServerError, code)
		}
	})

	t.Run("workload identity empty token file returns 500", func(t *testing.T) {
		auth.ResetSTSCache()

		tempDir := t.TempDir()
		tokenFile := filepath.Join(tempDir, "empty-token")

		err := os.WriteFile(tokenFile, []byte("   \n"), 0o600)
		if err != nil {
			t.Fatalf("failed to write empty token file: %v", err)
		}

		emptyOpts := opts
		emptyOpts.ClientSecret = ""
		emptyOpts.ServiceAccountTokenPath = tokenFile

		_, err = auth.ExchangeTokenForCluster(
			context.Background(),
			emptyOpts,
			"mock-subject-token",
			"cluster-a",
		)
		if err == nil {
			t.Fatal("expected error for empty SA token file, got nil")
		}

		code := auth.GetSTSErrorStatusCode(err)
		if code != http.StatusInternalServerError {
			t.Errorf("expected status %d, got %d", http.StatusInternalServerError, code)
		}
	})

	// 9. Test missing audience configuration
	t.Run("missing audience mapping", func(t *testing.T) {
		_, err := auth.ExchangeTokenForCluster(context.Background(), opts, "mock-subject-token", "cluster-b")
		if err == nil {
			t.Fatal("expected error due to missing audience mapping, got nil")
		}
	})

	// 10. Test disabled options
	t.Run("disabled STS options", func(t *testing.T) {
		disabledOpts := opts
		disabledOpts.Enabled = false

		_, err := auth.ExchangeTokenForCluster(context.Background(), disabledOpts, "mock-subject-token", "cluster-a")
		if err == nil {
			t.Fatal("expected error due to disabled STS, got nil")
		}
	})

	// 11. Test token rejection returns 401 and does not leak body in error message
	t.Run("token rejection returns 401 without leaking sensitive response body", func(t *testing.T) {
		auth.ResetSTSCache()

		invalidOpts := opts
		invalidOpts.ClientSecret = "wrong-secret"

		_, err := auth.ExchangeTokenForCluster(context.Background(), invalidOpts, "mock-subject-token", "cluster-a")
		if err == nil {
			t.Fatal("expected error, got nil")
		}

		code := auth.GetSTSErrorStatusCode(err)
		if code != http.StatusUnauthorized {
			t.Errorf("expected status %d, got %d", http.StatusUnauthorized, code)
		}

		if strings.Contains(err.Error(), "sensitive-data") {
			t.Errorf("error message should not contain upstream response body: %s", err.Error())
		}
	})

	// 12. Test upstream failure returns 502
	t.Run("upstream discovery failure returns 502", func(t *testing.T) {
		auth.ResetSTSCache()

		badIssuerOpts := opts
		badIssuerOpts.IssuerURL = "http://127.0.0.1:1" // unreachable port

		_, err := auth.ExchangeTokenForCluster(context.Background(), badIssuerOpts, "mock-subject-token", "cluster-a")
		if err == nil {
			t.Fatal("expected error, got nil")
		}

		code := auth.GetSTSErrorStatusCode(err)
		if code != http.StatusBadGateway {
			t.Errorf("expected status %d, got %d", http.StatusBadGateway, code)
		}
	})
}
