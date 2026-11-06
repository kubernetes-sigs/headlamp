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

package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
)

// recordingContextStore remembers which cluster names were looked up.
type recordingContextStore struct {
	kubeconfig.ContextStore
	looked []string
}

func (s *recordingContextStore) GetContext(name string) (*kubeconfig.Context, error) {
	s.looked = append(s.looked, name)

	return s.ContextStore.GetContext(name)
}

// With a base URL, a cluster request must not be skipped by the middleware.
// It should look up the real cluster and pass the original request on.
func TestOIDCMiddlewareHandlesBaseURLRequest(t *testing.T) {
	const baseURL = "/clusters/headlamp"

	const path = baseURL + "/clusters/real-cluster/me"

	store := &recordingContextStore{ContextStore: kubeconfig.NewContextStore()}
	config := OIDCTokenRefreshConfig{
		KubeConfigStore:  store,
		Cache:            cache.New[interface{}](),
		TelemetryHandler: &telemetry.RequestHandler{},
		BaseURL:          baseURL,
	}

	var gotPath string

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, path, nil)
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-auth-real-cluster.0",
		Value:    "real-cluster-token",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})

	NewOIDCTokenRefreshMiddleware(config)(next).ServeHTTP(httptest.NewRecorder(), req)

	assert.Equal(t, []string{"real-cluster"}, store.looked)
	assert.Equal(t, path, gotPath)
}

// The OIDC refresh middleware runs before the router has matched a route, so it
// parses the raw path. With a base URL that has its own "clusters/" segment, the
// cluster (and its cookie) must come from the path after the base URL.
func TestOIDCMiddlewareClusterWithClustersBaseURL(t *testing.T) {
	const baseURL = "/clusters/headlamp"

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
		baseURL+"/clusters/real-cluster/api/v1/namespaces", nil)
	req.AddCookie(&http.Cookie{
		Name:     "headlamp-auth-real-cluster.0",
		Value:    "real-cluster-token",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})

	cluster, token := ParseClusterAndToken(stripBaseURL(req, baseURL))
	assert.Equal(t, "real-cluster", cluster)
	assert.Equal(t, "real-cluster-token", token)

	// The original request is left as it was.
	assert.Equal(t, baseURL+"/clusters/real-cluster/api/v1/namespaces", req.URL.Path)

	// Without a base URL, or a path outside it, the request is used unchanged.
	assert.Same(t, req, stripBaseURL(req, ""))
	assert.Same(t, req, stripBaseURL(req, "/other"))
}
