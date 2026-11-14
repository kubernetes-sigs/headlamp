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
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	authorizationv1 "k8s.io/api/authorization/v1"
	"k8s.io/client-go/kubernetes/scheme"
)

type cacheAuthorizationAPI struct {
	server                            *httptest.Server
	gets, reviews, watches            atomic.Int32
	revoked, reviewError, watchDenied atomic.Bool
}

func newCacheAuthorizationAPI(t *testing.T) *cacheAuthorizationAPI {
	t.Helper()

	a := &cacheAuthorizationAPI{}
	a.server = httptest.NewTLSServer(http.HandlerFunc(a.handle))
	t.Cleanup(a.server.Close)

	return a
}

func (a *cacheAuthorizationAPI) handle(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if strings.HasSuffix(r.URL.Path, "/selfsubjectaccessreviews") {
		a.review(w, r, token)
		return
	}

	resource := "pods"
	if strings.Contains(r.URL.Path, "/secrets") {
		resource = "secrets"
	}

	if !a.allowed(token, resource, "team") {
		http.Error(w, "denied", http.StatusForbidden)
		return
	}

	if strings.Contains(r.Header.Get("Accept"), "as=PartialObjectMetadata") {
		a.metadata(w, r)
		return
	}

	a.gets.Add(1)
	w.Header().Set("Cache-Control", "no-cache, private")

	if resource == "secrets" {
		_, _ = w.Write([]byte(`{"apiVersion":"v1","kind":"Secret","metadata":{"name":"shared","namespace":"team"},` +
			`"data":{"private":"sensitive-value"}}`))

		return
	}

	if strings.Contains(r.Header.Get("Accept"), "as=Table") {
		_, _ = w.Write([]byte(`{"apiVersion":"meta.k8s.io/v1","kind":"Table","rows":[]}`))
		return
	}

	_ = json.NewEncoder(w).Encode(map[string]any{
		"apiVersion": "v1", "kind": "Pod", "metadata": map[string]string{
			"name": "shared", "namespace": "team", "selector": r.URL.Query().Get("labelSelector"),
		},
	})
}

func (a *cacheAuthorizationAPI) metadata(w http.ResponseWriter, r *http.Request) {
	if a.watchDenied.Load() {
		http.Error(w, "watch denied", http.StatusForbidden)
		return
	}

	serveMetadataListWatch(w, r, func() { a.watches.Add(1) })
}

func (a *cacheAuthorizationAPI) review(w http.ResponseWriter, r *http.Request, token string) {
	a.reviews.Add(1)

	if a.reviewError.Load() {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
		return
	}

	var review authorizationv1.SelfSubjectAccessReview

	body, err := io.ReadAll(r.Body)
	if err == nil {
		_, _, err = scheme.Codecs.UniversalDeserializer().Decode(body, nil, &review)
	}

	if err != nil {
		http.Error(w, "invalid review", http.StatusBadRequest)
		return
	}

	attrs := review.Spec.ResourceAttributes
	allowed := attrs != nil && a.allowed(token, attrs.Resource, attrs.Namespace)
	writeAccessReview(w, allowed)
}

func (a *cacheAuthorizationAPI) allowed(token, resource, namespace string) bool {
	return token == "admin" || (token == "reader" && resource == "pods" && namespace == "team" && !a.revoked.Load())
}

func cacheResourceRequest(
	t *testing.T, router http.Handler, path, token, cookie, accept string,
) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/clusters/cache-switch"+path, nil)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}

	if cookie != "" {
		request.AddCookie(&http.Cookie{
			Name: "headlamp-auth-cache-switch.0", Value: cookie,
			Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode,
		})
	}

	if accept != "" {
		request.Header.Set("Accept", accept)
	}

	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	return response
}

func requireCachedResource(t *testing.T, router http.Handler, path, token, accept string) *httptest.ResponseRecorder {
	t.Helper()

	var response *httptest.ResponseRecorder

	require.Eventually(t, func() bool {
		response = cacheResourceRequest(t, router, path, token, "", accept)
		return response.Code == http.StatusOK && response.Header().Get("X-HEADLAMP-CACHE") == "true"
	}, 5*time.Second, 5*time.Millisecond)

	return response
}

func TestSharedCacheChecksExactResourceForEachUser(t *testing.T) {
	for _, source := range []int{kubeconfig.KubeConfig, kubeconfig.ClusterInventory, kubeconfig.DiscoveredCluster} {
		t.Run(fmt.Sprint(source), func(t *testing.T) {
			a := newCacheAuthorizationAPI(t)
			_, router := cacheConnectionRouter(t, cacheConnectionContext(t, a.server, source))
			sensitivePath := "/api/v1/namespaces/team/secrets/shared"
			pod := "/api/v1/namespaces/team/pods/shared"

			requireCachedResource(t, router, sensitivePath, "admin", "")
			first := cacheResourceRequest(t, router, pod, "reader", "", "")
			require.Equal(t, http.StatusOK, first.Code)
			require.Contains(t, first.Body.String(), `"kind":"Pod"`)
			require.NotContains(t, first.Body.String(), "sensitive-value")
			requireCachedResource(t, router, pod, "reader", "")

			gets, reviews, watches := a.gets.Load(), a.reviews.Load(), a.watches.Load()
			shared := cacheResourceRequest(t, router, pod, "admin", "", "")
			require.Equal(t, "true", shared.Header().Get("X-HEADLAMP-CACHE"))
			require.Equal(t, gets, a.gets.Load())
			require.Equal(t, reviews+1, a.reviews.Load())
			require.Equal(t, watches, a.watches.Load())
			denied := cacheResourceRequest(t, router, sensitivePath, "reader", "", "")
			require.Equal(t, http.StatusForbidden, denied.Code)
			require.NotContains(t, denied.Body.String(), "sensitive-value")
			a.revoked.Store(true)

			denied = cacheResourceRequest(t, router, pod, "reader", "", "")
			require.Equal(t, http.StatusForbidden, denied.Code)
			require.NotContains(t, denied.Body.String(), `"kind":"Pod"`)
		})
	}
}

func TestSharedCacheSeparatesSelectorsAndRepresentations(t *testing.T) {
	a := newCacheAuthorizationAPI(t)
	_, router := cacheConnectionRouter(t, cacheConnectionContext(t, a.server, kubeconfig.ClusterInventory))
	path := "/api/v1/namespaces/team/pods/shared"
	requireCachedResource(t, router, path+"?labelSelector=app%3Da", "admin", "")
	different := cacheResourceRequest(t, router, path+"?labelSelector=app%3Db", "reader", "", "")
	require.Contains(t, different.Body.String(), `"selector":"app=b"`)
	requireCachedResource(t, router, path, "reader", "application/json;as=Table;g=meta.k8s.io;v=v1")
	normal := cacheResourceRequest(t, router, path, "admin", "", "")
	require.Contains(t, normal.Body.String(), `"kind":"Pod"`)
}

func TestCacheAuthorizationUsesProxyCredentialSelection(t *testing.T) {
	a := newCacheAuthorizationAPI(t)
	cfg, router := cacheConnectionRouter(t, cacheConnectionContext(t, a.server, kubeconfig.KubeConfig))
	path := "/api/v1/namespaces/team/secrets/shared"
	requireCachedResource(t, router, path, "admin", "")
	headerWins := cacheResourceRequest(t, router, path, "admin", "reader", "")
	require.Equal(t, http.StatusOK, headerWins.Code)
	denied := cacheResourceRequest(t, router, path, "reader", "admin", "")
	require.Equal(t, http.StatusForbidden, denied.Code)

	cfg.ProxyAuthEnabled = true
	cfg.ProxyAuthTokenHeader = "X-Trusted-Token"
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/clusters/cache-switch"+path, nil)
	request.Header.Set("Authorization", "Bearer reader")
	request.Header.Set("X-Trusted-Token", "admin")

	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, "true", response.Header().Get("X-HEADLAMP-CACHE"))
}

func TestCacheFallsBackWhenAuthorizationOrWatchIsUnavailable(t *testing.T) {
	a := newCacheAuthorizationAPI(t)
	cfg, router := cacheConnectionRouter(t, cacheConnectionContext(t, a.server, kubeconfig.ClusterInventory))
	path := "/api/v1/namespaces/team/pods/shared"

	a.watchDenied.Store(true)

	for range 3 {
		response := cacheResourceRequest(t, router, path, "reader", "", "")
		require.Equal(t, http.StatusOK, response.Code)
		require.Empty(t, response.Header().Get("X-HEADLAMP-CACHE"))
	}

	a.watchDenied.Store(false)
	requireCachedResource(t, router, path, "admin", "")
	a.reviewError.Store(true)
	before := a.gets.Load()
	response := cacheResourceRequest(t, router, path, "reader", "", "")
	require.Equal(t, http.StatusOK, response.Code)
	require.Empty(t, response.Header().Get("X-HEADLAMP-CACHE"))
	require.Equal(t, before+1, a.gets.Load())
	a.reviewError.Store(false)

	cfg.CacheEnabled = false
	router = mux.NewRouter()
	handleClusterAPI(cfg, router)

	for range 2 {
		response = cacheResourceRequest(t, router, path, "reader", "", "")
		require.Equal(t, http.StatusOK, response.Code)
		require.Empty(t, response.Header().Get("X-HEADLAMP-CACHE"))
	}

	require.Equal(t, before+3, a.gets.Load())
}
