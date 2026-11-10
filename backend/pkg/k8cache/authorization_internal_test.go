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
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
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
	t.Run("evict_empty_prefix_noop", func(t *testing.T) {
		NewClientsetCache().EvictClientsetsForCluster("")
	})

	t.Run("clientset_prefix_from_cache_key_without_nul", func(t *testing.T) {
		assert.Equal(t, "plain-key", clientsetCachePrefixFromCacheKey("plain-key"))
	})

	t.Run("has_activity_and_prune_blocked_prefixes", func(t *testing.T) {
		cache := NewClientsetCache()
		now := time.Now()
		cache.SeedClientset("active\x00tok", now)
		cache.SeedInFlight("inflight\x00tok")
		cache.SeedBlockedPrefix("active", now.Add(-2*clientsetTTL))
		cache.SeedBlockedPrefix("inflight", now.Add(-2*clientsetTTL))
		cache.SeedBlockedPrefix("stale", now.Add(-2*clientsetTTL))

		cache.EvictExpired(now)

		assert.True(t, cache.IsPrefixBlocked("active"))
		assert.True(t, cache.IsPrefixBlocked("inflight"))
		assert.False(t, cache.IsPrefixBlocked("stale"))
	})

	t.Run("clear_blocked_prefixes_for_active_contexts", func(t *testing.T) {
		cache := NewClientsetCache()
		cache.SeedBlockedPrefix("ctx-a\x00rev1", time.Now())
		cache.SeedBlockedPrefix("ctx-b\x00rev1", time.Now())

		cache.ClearBlockedClientsetPrefixesForActiveContexts([]string{"ctx-a\x00rev1"})

		assert.False(t, cache.IsPrefixBlocked("ctx-a\x00rev1"))
		assert.True(t, cache.IsPrefixBlocked("ctx-b\x00rev1"))
	})

	t.Run("activity_in_another_shard_preserves_block", func(t *testing.T) {
		cache := NewClientsetCache()
		blockedPrefix := "removed-context"
		activeRevision := blockedPrefix + "\x00revision-0"
		otherRevision := activeRevision

		for i := 1; cache.shardForPrefix(otherRevision) == cache.shardForPrefix(activeRevision); i++ {
			otherRevision = fmt.Sprintf("%s\x00revision-%d", blockedPrefix, i)
		}

		now := time.Now()
		cache.SeedBlockedPrefix(blockedPrefix, now.Add(-2*clientsetTTL))
		cache.SeedInFlight(activeRevision + "\x00token")

		cache.EvictExpired(now)

		assert.True(t, cache.IsPrefixBlocked(activeRevision))
		assert.True(t, cache.IsPrefixBlocked(otherRevision),
			"active work in one revision shard must keep the shared prefix blocked in every shard")
	})
}

func differentRevisionShard(t *testing.T, contextKey string, k *kubeconfig.Context, excluded int) int {
	t.Helper()

	for i := 1; ; i++ {
		otherContext := k.Copy()
		otherContext.Cluster.Server = fmt.Sprintf("https://example-%d.test", i)
		revision, err := ContextCacheKey(contextKey, otherContext)
		require.NoError(t, err)

		shard := int(hashPrefix(revision) % numShards)
		if shard != excluded {
			return shard
		}
	}
}

func differentRevisionContext(
	t *testing.T,
	contextKey string,
	k *kubeconfig.Context,
	excluded int,
) (*kubeconfig.Context, string) {
	t.Helper()

	for i := 1; ; i++ {
		otherContext := k.Copy()
		otherContext.Name = fmt.Sprintf("%s-other-%d", contextKey, i)
		otherContext.Cluster.Server = fmt.Sprintf("https://%s-%d.test", contextKey, i)

		revision, err := ContextCacheKey(contextKey, otherContext)
		require.NoError(t, err)

		if int(hashPrefix(revision)%numShards) != excluded {
			return otherContext, revision
		}
	}
}

//nolint:funlen // The interleaving requires explicit setup, synchronization, and cleanup.
func TestClientsetRegistrationDoesNotBlockOtherShards(t *testing.T) {
	const contextKey = "registration"

	firstContext := &kubeconfig.Context{
		Name:        "first",
		Cluster:     &api.Cluster{Server: "https://registration-first.test"},
		AuthInfo:    &api.AuthInfo{},
		KubeContext: &api.Context{Cluster: contextKey},
	}
	firstRevision, err := ContextCacheKey(contextKey, firstContext)
	require.NoError(t, err)

	firstShard := int(hashPrefix(firstRevision) % numShards)
	secondContext, secondRevision := differentRevisionContext(t, contextKey, firstContext, firstShard)
	secondShard := int(hashPrefix(secondRevision) % numShards)
	require.NotEqual(t, firstShard, secondShard)

	enteredRegistration := make(chan struct{})
	continueFirstRegistration := make(chan struct{})
	secondCreated := make(chan struct{})

	var registrationCount atomic.Int32

	var creatorOnce sync.Once

	cache := NewClientsetCache(
		WithRegistrationHook(func() {
			if registrationCount.Add(1) == 1 {
				close(enteredRegistration)
				<-continueFirstRegistration
			}
		}),
		WithClientsetCreator(func(k *kubeconfig.Context, _ string) (*kubernetes.Clientset, error) {
			if k.Name == secondContext.Name {
				creatorOnce.Do(func() { close(secondCreated) })
			}

			return &kubernetes.Clientset{}, nil
		}),
	)
	cache.SeedBlockedPrefix(contextKey, time.Now())

	firstDone := make(chan error, 1)

	go func() {
		_, getErr := cache.GetClientSet(contextKey, firstContext, "token")
		firstDone <- getErr
	}()

	<-enteredRegistration
	close(continueFirstRegistration)

	secondDone := make(chan error, 1)

	go func() {
		_, getErr := cache.GetClientSet(contextKey, secondContext, "token")
		secondDone <- getErr
	}()

	select {
	case <-secondCreated:
	case <-time.After(time.Second):
		t.Fatal("a registration blocked by one shard stalled an unrelated shard")
	}

	require.NoError(t, <-firstDone)
	require.NoError(t, <-secondDone)
}

func TestClearBlockedPrefixesWaitsForReadersBeforeDeleting(t *testing.T) {
	cache := NewClientsetCache()
	cache.SeedBlockedPrefix("removed", time.Now())

	cache.blockedMu.RLock()

	started := make(chan struct{})
	cleared := make(chan struct{})

	go func() {
		close(started)
		cache.ClearBlockedClientsetPrefixesForActiveContexts([]string{"removed\x00revision"})
		close(cleared)
	}()

	<-started

	select {
	case <-cleared:
		cache.blockedMu.RUnlock()
		t.Fatal("blocked-prefix deletion completed while a read lock was held")
	case <-time.After(50 * time.Millisecond):
	}

	cache.blockedMu.RUnlock()

	select {
	case <-cleared:
	case <-time.After(time.Second):
		t.Fatal("blocked-prefix deletion did not resume after readers released")
	}

	require.False(t, cache.IsPrefixBlocked("removed\x00revision"))
}

//nolint:funlen // Controlled interleaving needs explicit lifecycle steps.
func TestLateRegistrationDuringPruningCannotRecacheRemovedRevision(t *testing.T) {
	const contextKey = "removed-context"

	k := &kubeconfig.Context{
		Name:        contextKey,
		Cluster:     &api.Cluster{Server: "https://example.test"},
		AuthInfo:    &api.AuthInfo{},
		KubeContext: &api.Context{Cluster: contextKey},
	}
	revision, err := ContextCacheKey(contextKey, k)
	require.NoError(t, err)

	targetShard := int(hashPrefix(revision) % numShards)
	otherShard := differentRevisionShard(t, contextKey, k, targetShard)
	require.NotEqual(t, targetShard, otherShard, "regression must exercise distinct revision shards")

	scanned := make(chan struct{})
	continuePruning := make(chan struct{})
	creatorStarted := make(chan struct{})
	finishCreation := make(chan struct{})
	cache := NewClientsetCache(
		WithClientsetCreator(func(*kubeconfig.Context, string) (*kubernetes.Clientset, error) {
			close(creatorStarted)
			<-finishCreation

			return &kubernetes.Clientset{}, nil
		}),
		WithPruneShardHook(func(shard int) {
			if shard != targetShard {
				return
			}

			close(scanned)
			<-continuePruning
		}),
	)
	cache.SeedBlockedPrefix(contextKey, time.Now().Add(-2*clientsetTTL))

	pruned := make(chan struct{})

	go func() {
		cache.EvictExpired()
		close(pruned)
	}()

	<-scanned

	created := make(chan error, 1)

	go func() {
		_, getErr := cache.GetClientSet(contextKey, k, "token")
		created <- getErr
	}()

	<-creatorStarted
	close(continuePruning)
	<-pruned
	require.True(t, cache.IsPrefixBlocked(contextKey),
		"pruning must revalidate all revision shards before removing a shared prefix block")

	close(finishCreation)
	require.NoError(t, <-created)
	require.Zero(t, cache.Len(), "an in-flight registration that raced pruning must retain the removal barrier")
}

func TestCreateAndCacheClientSetErrors(t *testing.T) {
	k := &kubeconfig.Context{
		Name:        "c",
		Cluster:     &api.Cluster{Server: "https://example.test"},
		AuthInfo:    &api.AuthInfo{Token: "t"},
		KubeContext: &api.Context{Cluster: "c"},
	}

	cache := NewClientsetCache(WithClientsetCreator(func(*kubeconfig.Context, string) (*kubernetes.Clientset, error) {
		return nil, errors.New("creator boom")
	}))

	_, err := cache.GetClientSet("c", k, "tok")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "creator boom")

	existingCS := &kubernetes.Clientset{}

	cache = NewClientsetCache(WithClientsetCreator(func(*kubeconfig.Context, string) (*kubernetes.Clientset, error) {
		return &kubernetes.Clientset{}, nil
	}))
	connection, err := ContextCacheKey("c", k)
	require.NoError(t, err)
	cache.SeedClientset(connection+"\x00tok", time.Now(), existingCS)

	got, err := cache.GetClientSet("c", k, "tok")
	require.NoError(t, err)
	assert.Same(t, existingCS, got)
}

func TestGetCachedAndGetClientSetErrors(t *testing.T) {
	cache := NewClientsetCache(WithTTL(time.Minute), WithClientsetCreator(
		func(*kubeconfig.Context, string) (*kubernetes.Clientset, error) {
			return &kubernetes.Clientset{}, nil
		},
	))
	k := &kubeconfig.Context{
		Cluster:     &api.Cluster{Server: "https://example.test"},
		AuthInfo:    &api.AuthInfo{},
		KubeContext: &api.Context{Cluster: "ctx"},
	}
	connection, err := ContextCacheKey("ctx", k)
	require.NoError(t, err)
	cache.SeedClientset(connection+"\x00tok", time.Now().Add(-2*time.Minute))
	cache.EvictExpired()
	assert.Equal(t, 0, cache.Len())

	_, err = cache.GetClientSet("", nil, "tok")
	require.Error(t, err)

	_, err = cache.GetClientSet("ctx", nil, "tok")
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
	cache := NewClientsetCache()

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

	k := &kubeconfig.Context{
		Name:        "fake-cluster",
		ClusterID:   "fake-cluster",
		Cluster:     &api.Cluster{Server: srv.URL},
		AuthInfo:    &api.AuthInfo{Token: "tok"},
		KubeContext: &api.Context{Cluster: "fake-cluster"},
	}

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/fake-cluster/api/v1/pods", nil)
	req = mux.SetURLVars(req, map[string]string{"api": "api/v1/pods"})

	allowed = true
	statusCode = http.StatusOK
	ok, err := IsAllowed(cache, "fake-cluster", k, req)
	require.NoError(t, err)
	assert.True(t, ok)

	allowed = false
	ok, err = IsAllowed(cache, "fake-cluster", k, req)
	require.NoError(t, err)
	assert.False(t, ok)

	statusCode = http.StatusInternalServerError
	ok, err = IsAllowed(cache, "fake-cluster", k, req)
	require.Error(t, err)
	assert.False(t, ok)

	badReq := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/fake-cluster/invalid", nil)
	_, err = IsAllowed(cache, "fake-cluster", k, badReq)
	require.Error(t, err)
}
