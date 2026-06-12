/*
Copyright 2025 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

// Helper to create a mock OIDC provider server
func newMockOIDCProvider(t *testing.T) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	// .well-known configuration
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		cfg := map[string]interface{}{
			"issuer":                 srv.URL,
			"authorization_endpoint": srv.URL + "/auth",
			"token_endpoint":         srv.URL + "/token",
			"jwks_uri":               srv.URL + "/jwks",
		}
		err := json.NewEncoder(w).Encode(cfg)
		if err != nil {
			http.Error(w, "failed to encode config", http.StatusInternalServerError)
		}
	})

	// JWKS
	mux.HandleFunc("/jwks", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, err := w.Write([]byte(`{"keys":[]}`))
		if err != nil {
			http.Error(w, "failed to write jwks", http.StatusInternalServerError)
		}
	})

	return srv
}

func TestOIDCIntegration(t *testing.T) {
	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != "true" {
		t.Skip("skipping integration test")
	}

	// 1. Start Mock OIDC Provider
	oidcServer := newMockOIDCProvider(t)

	// 2. Configure Headlamp with OIDC Context
	clientID := "test-client-id"
	clientSecret := "test-client-secret"
	clusterName := "oidc-test-cluster"

	store := kubeconfig.NewContextStore()

	// Create a context with OIDC configuration
	ctx := &kubeconfig.Context{
		Name: clusterName,
		Cluster: &api.Cluster{
			Server: "https://test-cluster.com",
		},
		AuthInfo: &api.AuthInfo{
			AuthProvider: &api.AuthProviderConfig{
				Name: "oidc",
				Config: map[string]string{
					"client-id":      clientID,
					"client-secret":  clientSecret,
					"idp-issuer-url": oidcServer.URL,
					"scope":          "openid,profile",
				},
			},
		},
	}

	err := store.AddContext(ctx)
	require.NoError(t, err)

	c := HeadlampConfig{
		HeadlampCFG: &headlampconfig.HeadlampCFG{
			UseInCluster:          false,
			KubeConfigPath:        "",
			EnableDynamicClusters: true,
			KubeConfigStore:       store,
		},
		cache:            cache.New[interface{}](),
		telemetryConfig:  GetDefaultTestTelemetryConfig(),
		telemetryHandler: &telemetry.RequestHandler{},
	}

	// Initialize Handler
	handler := createHeadlampHandler(&c)

	// 3. Request /oidc endpoint to initiate login
	t.Run("OIDC Redirect", func(t *testing.T) {
		rr := httptest.NewRecorder()
		req, err := http.NewRequest("GET", "/oidc?cluster="+clusterName, nil)
		require.NoError(t, err)
		handler.ServeHTTP(rr, req)

		// Expect 302 Found (Redirect)
		require.Equal(t, http.StatusFound, rr.Code)

		location := rr.Header().Get("Location")
		require.NotEmpty(t, location)

		// Verify redirection is to our mock OIDC server
		assert.True(t, strings.HasPrefix(location, oidcServer.URL+"/auth"),
			"Location should start with OIDC auth endpoint, got: %s", location)

		// Verify expected params in URL
		assert.Contains(t, location, "client_id="+clientID)
		assert.Contains(t, location, "scope=openid")
		assert.Contains(t, location, "redirect_uri=")
	})
}
