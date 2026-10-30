/*
Copyright 2026 The Kubernetes Authors.

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
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestInventoryResponsesAreCachedWithPerUserAuthorization(t *testing.T) {
	var podRequests atomic.Int32

	apiServer := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case strings.HasSuffix(r.URL.Path, "/selfsubjectaccessreviews"):
			// Each user's own token is checked; only user-a may list pods.
			allowed := "false"
			if r.Header.Get("Authorization") == "Bearer user-a" {
				allowed = "true"
			}

			_, _ = w.Write([]byte(`{"apiVersion":"authorization.k8s.io/v1","kind":"SelfSubjectAccessReview",` +
				`"status":{"allowed":` + allowed + `}}`))
		case r.URL.Path == "/api/v1/pods":
			podRequests.Add(1)

			_, _ = w.Write([]byte(`{"apiVersion":"v1","kind":"PodList","items":[{"metadata":{"name":"web-0"}}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(apiServer.Close)

	// Discovered clusters have no "<kubeconfig>+<context>" ID, but the response
	// cache serves them like any other cluster that authenticates each user.
	cfg := newDrainAuthConfig(t, &kubeconfig.Context{
		Name: "inventory-cached", Source: kubeconfig.ClusterInventory,
		ClusterID:   "cluster-inventory/root/team-a/spoke-a",
		KubeContext: &api.Context{Cluster: "inventory-cached", AuthInfo: "inventory-cached"},
		Cluster:     &api.Cluster{Server: apiServer.URL, InsecureSkipTLSVerify: true},
		AuthInfo:    &api.AuthInfo{}, OidcConf: &kubeconfig.OidcConfig{ClientID: "headlamp"},
	})
	cfg.CacheEnabled = true

	router := mux.NewRouter()
	router.Use(cfg.requireInventoryAuthentication)
	handleClusterAPI(cfg, router)

	get := func(token string) *httptest.ResponseRecorder {
		req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/clusters/inventory-cached/api/v1/pods", nil)
		req.Header.Set("Authorization", "Bearer "+token)

		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)

		return response
	}

	require.Equal(t, http.StatusOK, get("user-a").Code)
	require.Equal(t, http.StatusOK, get("user-a").Code)
	require.EqualValues(t, 1, podRequests.Load(), "the second request should be served from the cache")

	denied := get("user-b")
	require.Equal(t, http.StatusForbidden, denied.Code, denied.Body.String())
	assert.NotContains(t, denied.Body.String(), "web-0", "a denied user must not receive a cached response")
	require.EqualValues(t, 1, podRequests.Load())
}
