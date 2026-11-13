// Copyright 2025 The Kubernetes Authors.
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

package k8cache

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestGetResourceAttributesPreservesSelectors(t *testing.T) {
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet,
		"/api/v1/namespaces/team/pods?fieldSelector=metadata.name%3Dweb&labelSelector=app%3Dweb", nil)
	request = mux.SetURLVars(request, map[string]string{"api": "api/v1/namespaces/team/pods"})

	attributes, err := getResourceAttributes(request)
	if !assert.NoError(t, err) {
		return
	}

	assert.Equal(t, "list", attributes.Verb)
	assert.Equal(t, "team", attributes.Namespace)
	assert.Equal(t, "pods", attributes.Resource)
	assert.Equal(t, "web", attributes.Name)
	assert.Equal(t, "metadata.name=web", attributes.FieldSelector.RawSelector)
	assert.Equal(t, "app=web", attributes.LabelSelector.RawSelector)
}

type resourceAttributesTestCase struct {
	name                string
	urlPath             string
	apiPath             string
	expectedGroup       string
	expectedVersion     string
	expectedNamespace   string
	expectedResource    string
	expectedName        string
	expectedSubresource string
	expectedVerb        string
}

func TestGetResourceAttributesForNamedResource(t *testing.T) {
	tests := []resourceAttributesTestCase{
		{
			name:              "named namespaced core resource",
			urlPath:           "/clusters/named-resource-test/api/v1/namespaces/default/pods/nginx",
			apiPath:           "api/v1/namespaces/default/pods/nginx",
			expectedVersion:   "v1",
			expectedNamespace: "default",
			expectedResource:  "pods",
			expectedName:      "nginx",
			expectedVerb:      "get",
		},
		{
			name:                "named resource with subresource",
			urlPath:             "/clusters/named-resource-test/api/v1/namespaces/default/pods/nginx/log",
			apiPath:             "api/v1/namespaces/default/pods/nginx/log",
			expectedVersion:     "v1",
			expectedNamespace:   "default",
			expectedResource:    "pods",
			expectedName:        "nginx",
			expectedSubresource: "log",
			expectedVerb:        "get",
		},
		{
			name:              "named namespaced API group resource",
			urlPath:           "/clusters/named-resource-test/apis/apps/v1/namespaces/default/deployments/frontend",
			apiPath:           "apis/apps/v1/namespaces/default/deployments/frontend",
			expectedGroup:     "apps",
			expectedVersion:   "v1",
			expectedNamespace: "default",
			expectedResource:  "deployments",
			expectedName:      "frontend",
			expectedVerb:      "get",
		},
		{
			name:              "namespaced collection",
			urlPath:           "/clusters/named-resource-test/api/v1/namespaces/default/pods",
			apiPath:           "api/v1/namespaces/default/pods",
			expectedVersion:   "v1",
			expectedNamespace: "default",
			expectedResource:  "pods",
			expectedVerb:      "list",
		},
	}

	runResourceAttributesTests(t, tests)
}

func TestGetResourceAttributesForNamespaceResource(t *testing.T) {
	tests := []resourceAttributesTestCase{
		{
			name:             "named namespace",
			urlPath:          "/clusters/named-resource-test/api/v1/namespaces/default",
			apiPath:          "api/v1/namespaces/default",
			expectedVersion:  "v1",
			expectedResource: "namespaces",
			expectedName:     "default",
			expectedVerb:     "get",
		},
		{
			name:                "namespace status subresource",
			urlPath:             "/clusters/named-resource-test/api/v1/namespaces/default/status",
			apiPath:             "api/v1/namespaces/default/status",
			expectedVersion:     "v1",
			expectedResource:    "namespaces",
			expectedName:        "default",
			expectedSubresource: "status",
			expectedVerb:        "get",
		},
		{
			name:                "namespace finalize subresource",
			urlPath:             "/clusters/named-resource-test/api/v1/namespaces/default/finalize",
			apiPath:             "api/v1/namespaces/default/finalize",
			expectedVersion:     "v1",
			expectedResource:    "namespaces",
			expectedName:        "default",
			expectedSubresource: "finalize",
			expectedVerb:        "get",
		},
	}

	runResourceAttributesTests(t, tests)
}

func runResourceAttributesTests(t *testing.T, tests []resourceAttributesTestCase) {
	t.Helper()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, tc.urlPath, nil)
			req = mux.SetURLVars(req, map[string]string{
				"api": tc.apiPath,
			})

			attributes, err := getResourceAttributes(req)
			assert.NoError(t, err)

			assert.Equal(t, tc.expectedGroup, attributes.Group)
			assert.Equal(t, tc.expectedVersion, attributes.Version)
			assert.Equal(t, tc.expectedNamespace, attributes.Namespace)
			assert.Equal(t, tc.expectedResource, attributes.Resource)
			assert.Equal(t, tc.expectedName, attributes.Name)
			assert.Equal(t, tc.expectedSubresource, attributes.Subresource)
			assert.Equal(t, tc.expectedVerb, attributes.Verb)
		})
	}
}

func TestAuthorizationPrefixPruningAndEviction(t *testing.T) {
	t.Cleanup(func() {
		ResetForTesting()
	})

	t.Run("evict_empty_prefix_noop", func(t *testing.T) {
		ResetForTesting()
		EvictClientsetsForCluster("")
	})

	t.Run("clientset_prefix_from_cache_key_without_nul", func(t *testing.T) {
		assert.Equal(t, "plain-key", clientsetCachePrefixFromCacheKey("plain-key"))
	})

	t.Run("has_activity_and_prune_blocked_prefixes", func(t *testing.T) {
		ResetForTesting()
		mu.Lock()
		now := time.Now()
		clientsetCache["active\x00tok"] = clientsetLRUList.PushFront(&lruEntry{
			key: "active\x00tok",
			cs:  &CachedClientSet{clientset: &kubernetes.Clientset{}, lastUsed: now},
		})
		inFlight["inflight\x00tok"] = &inFlightEntry{waitCh: make(chan struct{})}
		blockedClientsetPrefixes["active"] = blockedPrefixEntry{blockedAt: now.Add(-2 * clientsetTTL)}
		blockedClientsetPrefixes["inflight"] = blockedPrefixEntry{blockedAt: now.Add(-2 * clientsetTTL)}
		blockedClientsetPrefixes["stale"] = blockedPrefixEntry{blockedAt: now.Add(-2 * clientsetTTL)}

		assert.True(t, hasClientsetActivityForPrefix("active"))
		assert.True(t, hasClientsetActivityForPrefix("inflight"))
		assert.False(t, hasClientsetActivityForPrefix("stale"))

		pruneBlockedClientsetPrefixesLocked(now)

		_, hasActive := blockedClientsetPrefixes["active"]
		_, hasInFlight := blockedClientsetPrefixes["inflight"]
		_, hasStale := blockedClientsetPrefixes["stale"]

		assert.True(t, hasActive)
		assert.True(t, hasInFlight)
		assert.False(t, hasStale)
		mu.Unlock()
	})

	t.Run("clear_blocked_prefixes_for_active_contexts", func(t *testing.T) {
		ResetForTesting()
		mu.Lock()
		blockedClientsetPrefixes["ctx-a"] = blockedPrefixEntry{blockedAt: time.Now()}
		blockedClientsetPrefixes["ctx-b"] = blockedPrefixEntry{blockedAt: time.Now()}
		mu.Unlock()

		clearBlockedClientsetPrefixesForActiveContexts([]string{"ctx-a\x00rev1"})

		mu.Lock()
		_, hasA := blockedClientsetPrefixes["ctx-a"]
		_, hasB := blockedClientsetPrefixes["ctx-b"]
		mu.Unlock()
		assert.False(t, hasA)
		assert.True(t, hasB)
	})
}

func TestCreateAndCacheClientSetErrors(t *testing.T) {
	ResetForTesting()
	t.Cleanup(func() {
		ResetForTesting()
	})

	k := &kubeconfig.Context{
		Name:        "c",
		Cluster:     &api.Cluster{Server: "https://example.test"},
		AuthInfo:    &api.AuthInfo{Token: "t"},
		KubeContext: &api.Context{Cluster: "c"},
	}

	origCreator := clientsetCreator

	t.Cleanup(func() {
		hookMu.Lock()
		clientsetCreator = origCreator
		hookMu.Unlock()
	})

	hookMu.Lock()
	clientsetCreator = func(*kubeconfig.Context, string) (*kubernetes.Clientset, error) {
		return nil, errors.New("creator boom")
	}
	hookMu.Unlock()

	_, err := createAndCacheClientSet(k, "tok", "c\x00rev\x00tok", nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "creator boom")

	existingCS := &kubernetes.Clientset{}

	hookMu.Lock()
	clientsetCreator = func(*kubeconfig.Context, string) (*kubernetes.Clientset, error) {
		mu.Lock()
		clientsetCache["c\x00rev\x00tok"] = clientsetLRUList.PushFront(&lruEntry{
			key: "c\x00rev\x00tok",
			cs:  &CachedClientSet{clientset: existingCS, lastUsed: time.Now(), context: k},
		})
		mu.Unlock()

		return &kubernetes.Clientset{}, nil
	}
	hookMu.Unlock()

	got, err := createAndCacheClientSet(k, "tok", "c\x00rev\x00tok", nil)
	require.NoError(t, err)
	assert.Same(t, existingCS, got)
}

func TestGetCachedAndGetClientSetErrors(t *testing.T) {
	ResetForTesting()
	t.Cleanup(func() {
		ResetForTesting()
	})

	mu.Lock()
	clientsetCache["ctx\x00rev\x00tok"] = clientsetLRUList.PushFront(&lruEntry{
		key: "ctx\x00rev\x00tok",
		cs: &CachedClientSet{
			clientset: &kubernetes.Clientset{},
			lastUsed:  time.Now().Add(-2 * clientsetTTL),
		},
	})
	mu.Unlock()

	cs, ok := getCachedClientSet("ctx\x00rev\x00tok", nil)
	assert.False(t, ok)
	assert.Nil(t, cs)

	_, err := GetClientSet("", nil, "tok")
	require.Error(t, err)

	_, err = GetClientSet("ctx", nil, "tok")
	require.Error(t, err)
}

func TestGetResourceAttributesErrorsAndParseAPIPath(t *testing.T) {
	t.Run("invalid_api_path", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api", nil)
		req = mux.SetURLVars(req, map[string]string{"api": "api"})

		_, err := getResourceAttributes(req)
		require.Error(t, err)

		kind, verb := GetKindAndVerb(req)
		assert.Empty(t, kind)
		assert.Equal(t, unknownVerb, verb)
	})

	t.Run("invalid_field_selector", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
			"/api/v1/pods?fieldSelector=a==b==c", nil)
		req = mux.SetURLVars(req, map[string]string{"api": "api/v1/pods"})

		_, err := getResourceAttributes(req)
		require.Error(t, err)
	})

	t.Run("parse_api_resource_request_invalid_paths", func(t *testing.T) {
		_, ok := parseAPIResourceRequest("unknown/v1/pods")
		assert.False(t, ok)
		_, ok = parseAPIResourceRequest("api/v1")
		assert.False(t, ok)
		_, ok = parseAPIResourceRequest("apis/apps/v1")
		assert.False(t, ok)
		_, ok = parseAPIResourceRequest("apis/apps")
		assert.False(t, ok)
	})
}

func TestIsAllowed_WithFakeAPIServer(t *testing.T) {
	t.Cleanup(func() {
		ResetForTesting()
	})

	var (
		allowed    bool
		statusCode int
	)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if statusCode != 0 && statusCode != http.StatusOK {
			w.WriteHeader(statusCode)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		if allowed {
			_, _ = w.Write([]byte(
				`{"kind":"SelfSubjectAccessReview","apiVersion":"authorization.k8s.io/v1","status":{"allowed":true}}`,
			))
		} else {
			_, _ = w.Write([]byte(
				`{"kind":"SelfSubjectAccessReview","apiVersion":"authorization.k8s.io/v1","status":{"allowed":false}}`,
			))
		}
	}))
	defer srv.Close()

	k := fakeSSARContext(srv.URL)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/fake-cluster/api/v1/pods", nil)
	req = mux.SetURLVars(req, map[string]string{"api": "api/v1/pods"})

	allowed = true
	statusCode = http.StatusOK
	ok, err := IsAllowed("fake-cluster", k, req)
	require.NoError(t, err)
	assert.True(t, ok)

	allowed = false

	ResetForTesting()

	ok, err = IsAllowed("fake-cluster", k, req)
	require.NoError(t, err)
	assert.False(t, ok)

	statusCode = http.StatusInternalServerError

	ResetForTesting()

	ok, err = IsAllowed("fake-cluster", k, req)
	require.Error(t, err)
	assert.False(t, ok)

	requireIsAllowedRejectsInvalidRequest(t, k)
}

func fakeSSARContext(serverURL string) *kubeconfig.Context {
	return &kubeconfig.Context{
		Name:        "fake-cluster",
		ClusterID:   "fake-cluster",
		Cluster:     &api.Cluster{Server: serverURL},
		AuthInfo:    &api.AuthInfo{Token: "tok"},
		KubeContext: &api.Context{Cluster: "fake-cluster"},
	}
}

func requireIsAllowedRejectsInvalidRequest(t *testing.T, k *kubeconfig.Context) {
	t.Helper()

	badReq := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/fake-cluster/invalid", nil)
	_, err := IsAllowed("fake-cluster", k, badReq)
	require.Error(t, err)
}
