// Copyright 2025 The Kubernetes Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/nsdiscovery"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	authorizationv1 "k8s.io/api/authorization/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/clientcmd/api"
)

const (
	accessibleNamespacesUserToken   = "user-token"
	accessibleNamespacesProxyHeader = "X-Forwarded-Access-Token"
)

// fakeSSARServer answers SelfSubjectAccessReviews and only accepts the user's
// token. It allows "list pods" in the team-a namespace.
func fakeSSARServer(t *testing.T, sawOtherToken *atomic.Bool) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+accessibleNamespacesUserToken {
			sawOtherToken.Store(true)
			w.WriteHeader(http.StatusUnauthorized)

			return
		}

		if r.Method != http.MethodPost || r.URL.Path != "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews" {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		// client-go sends protobuf by default; the universal deserializer handles both.
		obj, _, err := scheme.Codecs.UniversalDeserializer().Decode(body, nil, nil)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		review, ok := obj.(*authorizationv1.SelfSubjectAccessReview)
		if !ok {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		attrs := review.Spec.ResourceAttributes
		review.Status.Allowed = attrs != nil && attrs.Namespace == "team-a" && attrs.Resource == "pods"

		review.APIVersion = "authorization.k8s.io/v1"
		review.Kind = "SelfSubjectAccessReview"

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(review)
	}))
	t.Cleanup(server.Close)

	return server
}

func setupAccessibleNamespacesTest(
	t *testing.T,
	enabled bool,
	source int,
	serverURL string,
) *mux.Router {
	t.Helper()

	return setupAccessibleNamespacesTestWithNamespaces(t, enabled, source, serverURL, "team-a", "team-b")
}

func setupAccessibleNamespacesTestWithNamespaces(
	t *testing.T,
	enabled bool,
	source int,
	serverURL string,
	names ...string,
) *mux.Router {
	t.Helper()

	return setupAccessibleNamespacesTestWithConfig(t, enabled, source, serverURL, nil, names...)
}

func setupAccessibleNamespacesTestWithConfig(
	t *testing.T,
	enabled bool,
	source int,
	serverURL string,
	configure func(*HeadlampConfig),
	names ...string,
) *mux.Router {
	t.Helper()

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:        "main",
		KubeContext: &api.Context{Cluster: "main", AuthInfo: "main"},
		Cluster:     &api.Cluster{Server: serverURL, InsecureSkipTLSVerify: true},
		// A service account token on the context must never be sent for the user checks.
		AuthInfo: &api.AuthInfo{TokenFile: writeTestTokenFile(t)},
		Source:   source,
	}))

	oldDiscoverer := namespaceDiscoverer
	oldFactory := newServiceAccountClient
	oldClient := serviceAccountClient

	namespaceDiscoverer = nsdiscovery.New()
	serviceAccountClient = nil
	newServiceAccountClient = func() (kubernetes.Interface, error) {
		objects := make([]k8sruntime.Object, 0, len(names))
		for _, name := range names {
			objects = append(objects, &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: name}})
		}

		return fake.NewClientset(objects...), nil
	}

	t.Cleanup(func() {
		namespaceDiscoverer = oldDiscoverer
		newServiceAccountClient = oldFactory
		serviceAccountClient = oldClient
	})

	cfg := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				UseInCluster:             true,
				KubeConfigStore:          store,
				EnableNamespaceDiscovery: enabled,
			},
			ProxyAuthEnabled:     true,
			ProxyAuthTokenHeader: accessibleNamespacesProxyHeader,
		},
	}

	if configure != nil {
		configure(cfg)
	}

	router := mux.NewRouter()
	handleClusterAPI(cfg, router)

	return router
}

func getAccessibleNamespaces(router http.Handler, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
		"/clusters/main/accessible-namespaces", nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	return rr
}

func TestAccessibleNamespacesReturnsVerifiedNamespaces(t *testing.T) {
	var sawOtherToken atomic.Bool

	server := fakeSSARServer(t, &sawOtherToken)
	router := setupAccessibleNamespacesTest(t, true, kubeconfig.InCluster, server.URL)

	rr := getAccessibleNamespaces(router, accessibleNamespacesUserToken)

	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	assert.Equal(t, "no-store", rr.Header().Get("Cache-Control"))

	var result nsdiscovery.Result
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
	assert.Equal(t, nsdiscovery.StatusRestricted, result.Status)
	assert.Equal(t, []string{"team-a"}, result.Namespaces)
	assert.False(t, sawOtherToken.Load(), "user checks must only use the user's token")
}

func TestAccessibleNamespacesDisabled(t *testing.T) {
	router := setupAccessibleNamespacesTest(t, false, kubeconfig.InCluster, "https://unused.invalid")

	rr := getAccessibleNamespaces(router, accessibleNamespacesUserToken)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestAccessibleNamespacesRequiresToken(t *testing.T) {
	router := setupAccessibleNamespacesTest(t, true, kubeconfig.InCluster, "https://unused.invalid")

	rr := getAccessibleNamespaces(router, "")

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestAccessibleNamespacesUnsupportedForKubeconfigContexts(t *testing.T) {
	router := setupAccessibleNamespacesTest(t, true, kubeconfig.KubeConfig, "https://unused.invalid")

	rr := getAccessibleNamespaces(router, accessibleNamespacesUserToken)

	require.Equal(t, http.StatusOK, rr.Code)

	var result nsdiscovery.Result
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
	assert.Equal(t, nsdiscovery.StatusUnsupported, result.Status)
}

func TestAccessibleNamespacesInvalidUserToken(t *testing.T) {
	var sawOtherToken atomic.Bool

	server := fakeSSARServer(t, &sawOtherToken)
	router := setupAccessibleNamespacesTest(t, true, kubeconfig.InCluster, server.URL)

	rr := getAccessibleNamespaces(router, "wrong-token")

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestAccessibleNamespacesErrorStatus(t *testing.T) {
	assert.Equal(t, http.StatusInternalServerError,
		accessibleNamespacesErrorStatus(&nsdiscovery.ListError{Err: errors.New("forbidden")}))
	assert.Equal(t, http.StatusGatewayTimeout, accessibleNamespacesErrorStatus(context.DeadlineExceeded))
	assert.Equal(t, http.StatusBadGateway, accessibleNamespacesErrorStatus(errors.New("boom")))
	assert.True(t, isRateLimiterDeadline(errors.New(
		"client rate limiter Wait returned an error: rate: Wait(n=1) would exceed context deadline")))
	assert.False(t, isRateLimiterDeadline(errors.New("boom")))
}

// TestAccessibleNamespacesManyNamespacesIsNotRateLimited guards against the
// client-go default rate limit (5 QPS): namespaces without access cost every
// probe, so 60 of them need 240 reviews, about 48s at the default limit.
func TestAccessibleNamespacesManyNamespacesIsNotRateLimited(t *testing.T) {
	var sawOtherToken atomic.Bool

	server := fakeSSARServer(t, &sawOtherToken)

	names := make([]string, 0, 61)
	names = append(names, "team-a")

	for i := range 60 {
		names = append(names, fmt.Sprintf("other-%02d", i))
	}

	router := setupAccessibleNamespacesTestWithNamespaces(t, true, kubeconfig.InCluster, server.URL, names...)

	start := time.Now()
	rr := getAccessibleNamespaces(router, accessibleNamespacesUserToken)

	require.Equal(t, http.StatusOK, rr.Code, rr.Body.String())
	assert.Less(t, time.Since(start), 10*time.Second)

	var result nsdiscovery.Result
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
	assert.Equal(t, []string{"team-a"}, result.Namespaces)
}

func accessibleNamespacesRequest(t *testing.T, headers map[string]string, cookieToken string) *http.Request {
	t.Helper()

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
		"/clusters/main/accessible-namespaces", nil)

	for name, value := range headers {
		req.Header.Set(name, value)
	}

	if cookieToken != "" {
		w := httptest.NewRecorder()
		require.NoError(t, auth.SetTokenCookie(w, req, "main", cookieToken, "", 3600))

		for _, cookie := range w.Result().Cookies() {
			req.AddCookie(cookie)
		}
	}

	return req
}

// accessibleNamespacesTokenCases are the cases of
// TestAccessibleNamespacesTokenPrecedence.
var accessibleNamespacesTokenCases = []struct {
	name    string
	headers map[string]string
	cookie  string
	want    int
}{
	{
		name:    "proxy header only",
		headers: map[string]string{accessibleNamespacesProxyHeader: accessibleNamespacesUserToken},
		want:    http.StatusOK,
	},
	{
		name: "proxy header wins over cookie and Authorization",
		headers: map[string]string{
			accessibleNamespacesProxyHeader: accessibleNamespacesUserToken,
			"Authorization":                 "Bearer other-token",
		},
		cookie: "other-token",
		want:   http.StatusOK,
	},
	{
		// The OIDC refresh middleware puts the renewed token in Authorization
		// while the request cookie still holds the expired one.
		name:    "refreshed Authorization wins over stale cookie",
		headers: map[string]string{"Authorization": "Bearer " + accessibleNamespacesUserToken},
		cookie:  "other-token",
		want:    http.StatusOK,
	},
	{
		name:    "conflicting Authorization is used instead of cookie",
		headers: map[string]string{"Authorization": "Bearer other-token"},
		cookie:  accessibleNamespacesUserToken,
		want:    http.StatusUnauthorized,
	},
	{
		name:   "cookie only",
		cookie: accessibleNamespacesUserToken,
		want:   http.StatusOK,
	},
	{
		name:    "non-Bearer Authorization falls through to cookie",
		headers: map[string]string{"Authorization": "Basic dXNlcjpwYXNz"},
		cookie:  accessibleNamespacesUserToken,
		want:    http.StatusOK,
	},
	{
		name:    "non-Bearer Authorization alone is no user token",
		headers: map[string]string{"Authorization": "Basic dXNlcjpwYXNz"},
		want:    http.StatusUnauthorized,
	},
}

// TestAccessibleNamespacesTokenPrecedence checks that discovery uses the same
// token as the cluster API proxy: proxy-auth header, then the Authorization
// header, then the cookie.
func TestAccessibleNamespacesTokenPrecedence(t *testing.T) {
	for _, tt := range accessibleNamespacesTokenCases {
		t.Run(tt.name, func(t *testing.T) {
			var sawOtherToken atomic.Bool

			server := fakeSSARServer(t, &sawOtherToken)
			router := setupAccessibleNamespacesTest(t, true, kubeconfig.InCluster, server.URL)

			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, accessibleNamespacesRequest(t, tt.headers, tt.cookie))

			assert.Equal(t, tt.want, rr.Code, rr.Body.String())
		})
	}
}

// TestAccessibleNamespacesLargeClusterNeedsConfiguredBudget covers clusters
// beyond the default budget: 300 namespaces without access need 1,500 reviews.
// At the default 100 QPS that does not fit a 2s limit (504), while a raised
// -namespace-discovery-qps does.
func TestAccessibleNamespacesLargeClusterNeedsConfiguredBudget(t *testing.T) {
	names := make([]string, 0, 301)
	names = append(names, "team-a")

	for i := range 300 {
		names = append(names, fmt.Sprintf("other-%03d", i))
	}

	tests := []struct {
		name string
		qps  float64
		want int
	}{
		{name: "default qps exceeds the time limit", qps: 0, want: http.StatusGatewayTimeout},
		{name: "raised qps fits the time limit", qps: 5000, want: http.StatusOK},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var sawOtherToken atomic.Bool

			server := fakeSSARServer(t, &sawOtherToken)
			router := setupAccessibleNamespacesTestWithConfig(t, true, kubeconfig.InCluster, server.URL,
				func(c *HeadlampConfig) {
					c.NamespaceDiscoveryQPS = tt.qps
					c.NamespaceDiscoveryTimeout = 2 * time.Second
				}, names...)

			rr := getAccessibleNamespaces(router, accessibleNamespacesUserToken)

			require.Equal(t, tt.want, rr.Code, rr.Body.String())

			if tt.want == http.StatusOK {
				var result nsdiscovery.Result
				require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
				assert.Equal(t, []string{"team-a"}, result.Namespaces)
			}
		})
	}
}
