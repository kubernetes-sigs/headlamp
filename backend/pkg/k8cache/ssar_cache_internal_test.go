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
	"container/list"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	authorizationv1 "k8s.io/api/authorization/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd/api"
)

func resetSSARCache() {
	ssarMu.Lock()
	ssarCache = make(map[string]*ssarCacheEntry)
	ssarCacheOrder = list.New()
	ssarInFlight = make(map[string]*ssarInFlightEntry)
	ssarWorkerCount = 0
	ssarMu.Unlock()
}

var buildSSARCacheKeyTests = []struct {
	name        string
	contextKey  string
	token       string
	attrs       *authorizationv1.ResourceAttributes
	expectedKey string
}{
	{
		name:       "core resource list",
		contextKey: "kind-cluster",
		token:      "tok-abc",
		attrs: &authorizationv1.ResourceAttributes{
			Group: "", Resource: "pods", Verb: "list", Namespace: "default",
		},
		expectedKey: "kind-cluster\x00tok-abc\x00\x00\x00pods\x00\x00list\x00default\x00\x00\x00",
	},
	{
		name:       "named API resource get",
		contextKey: "prod-cluster",
		token:      "tok-xyz",
		attrs: &authorizationv1.ResourceAttributes{
			Group: "apps", Resource: "deployments", Verb: "get", Namespace: "kube-system", Name: "frontend",
		},
		expectedKey: "prod-cluster\x00tok-xyz\x00apps\x00\x00deployments\x00\x00get\x00kube-system\x00frontend\x00\x00",
	},
	{
		name:       "cluster-scoped resource",
		contextKey: "dev",
		token:      "t1",
		attrs: &authorizationv1.ResourceAttributes{
			Group: "", Resource: "namespaces", Verb: "list", Namespace: "",
		},
		expectedKey: "dev\x00t1\x00\x00\x00namespaces\x00\x00list\x00\x00\x00\x00",
	},
	{
		name:       "subresource produces distinct key",
		contextKey: "dev",
		token:      "t1",
		attrs: &authorizationv1.ResourceAttributes{
			Resource: "pods", Subresource: "log", Verb: "get", Namespace: "default", Name: "nginx",
		},
		expectedKey: "dev\x00t1\x00\x00\x00pods\x00log\x00get\x00default\x00nginx\x00\x00",
	},
}

func TestBuildSSARCacheKey(t *testing.T) {
	for _, tc := range buildSSARCacheKeyTests {
		t.Run(tc.name, func(t *testing.T) {
			key := buildSSARCacheKey(tc.contextKey, tc.token, tc.attrs)
			assert.Equal(t, tc.expectedKey, key)
		})
	}
}

func TestSSARCacheStoreAndRetrieve(t *testing.T) {
	resetSSARCache()

	key := "ctx\x00token\x00/pods/list/default"

	// Initially not found.
	_, found := getSSARCacheResult(key)
	assert.False(t, found)

	// Store allowed=true.
	storeSSARCacheResult(key, true)

	allowed, found := getSSARCacheResult(key)
	require.True(t, found)
	assert.True(t, allowed)

	// Store allowed=false for a different key.
	key2 := "ctx\x00token\x00apps/deployments/get/kube-system"
	storeSSARCacheResult(key2, false)

	allowed2, found2 := getSSARCacheResult(key2)
	require.True(t, found2)
	assert.False(t, allowed2)

	// Original key is still allowed.
	allowed, found = getSSARCacheResult(key)
	require.True(t, found)
	assert.True(t, allowed)
}

func TestSSARCacheExpiry(t *testing.T) {
	resetSSARCache()

	key := "ctx\x00token\x00/pods/list/default"

	// Store with a very short expiry by directly manipulating the entry.
	ssarMu.Lock()
	ssarCache[key] = &ssarCacheEntry{
		allowed:   true,
		expiresAt: time.Now().Add(-1 * time.Second), // already expired
	}
	ssarMu.Unlock()

	_, found := getSSARCacheResult(key)
	assert.False(t, found, "expired entry should not be returned")

	ssarMu.RLock()

	_, exists := ssarCache[key]

	ssarMu.RUnlock()
	assert.False(t, exists, "expired entry should be removed on lookup")
}

func TestSSARCacheEvictionForPrefix(t *testing.T) {
	resetSSARCache()

	// Store entries for two different clusters.
	storeSSARCacheResult("cluster-a\x00tok\x00/pods/list/default", true)
	storeSSARCacheResult("cluster-a\x00tok\x00apps/deployments/get/ns", false)
	storeSSARCacheResult("cluster-b\x00tok\x00/pods/list/default", true)

	// Evict cluster-a.
	evictSSARCacheForPrefix("cluster-a")

	ssarMu.RLock()
	assert.Equal(t, 1, len(ssarCache), "only cluster-b entry should remain")
	ssarMu.RUnlock()

	// cluster-b entry still valid.
	allowed, found := getSSARCacheResult("cluster-b\x00tok\x00/pods/list/default")
	require.True(t, found)
	assert.True(t, allowed)
}

func TestSSARCacheJanitorSweep(t *testing.T) {
	resetSSARCache()

	now := time.Now()

	// One expired, one still valid.
	ssarMu.Lock()
	ssarCache["expired\x00tok\x00/pods/list/"] = &ssarCacheEntry{
		allowed:   true,
		expiresAt: now.Add(-10 * time.Second),
	}
	ssarCache["valid\x00tok\x00/pods/list/"] = &ssarCacheEntry{
		allowed:   true,
		expiresAt: now.Add(30 * time.Second),
	}
	ssarMu.Unlock()

	evictExpiredSSARResults(now)

	ssarMu.RLock()
	assert.Equal(t, 1, len(ssarCache))
	_, exists := ssarCache["valid\x00tok\x00/pods/list/"]
	assert.True(t, exists)
	ssarMu.RUnlock()
}

func TestSSARCacheDifferentTokensSameResource(t *testing.T) {
	resetSSARCache()

	attrs := &authorizationv1.ResourceAttributes{
		Resource: "pods", Verb: "list", Namespace: "default",
	}

	key1 := buildSSARCacheKey("ctx", "user-token-1", attrs)
	key2 := buildSSARCacheKey("ctx", "user-token-2", attrs)

	assert.NotEqual(t, key1, key2, "different tokens must produce different cache keys")

	storeSSARCacheResult(key1, true)
	storeSSARCacheResult(key2, false)

	allowed1, found1 := getSSARCacheResult(key1)
	require.True(t, found1)
	assert.True(t, allowed1)

	allowed2, found2 := getSSARCacheResult(key2)
	require.True(t, found2)
	assert.False(t, allowed2)
}

func TestSSARCacheKeyIncludesSelectors(t *testing.T) {
	attrs := &authorizationv1.ResourceAttributes{
		Version:  "v1",
		Resource: "pods",
		Verb:     "list",
		FieldSelector: &authorizationv1.FieldSelectorAttributes{
			RawSelector: "metadata.name=web",
		},
		LabelSelector: &authorizationv1.LabelSelectorAttributes{
			RawSelector: "app=web",
		},
	}

	key := buildSSARCacheKey("ctx", "token", attrs)
	attrs.LabelSelector.RawSelector = "app=api"

	assert.NotEqual(t, key, buildSSARCacheKey("ctx", "token", attrs))
}

func TestSSAROnlyConnectionsAreDiscoveredForCleanup(t *testing.T) {
	resetSSARCache()

	attrs := &authorizationv1.ResourceAttributes{
		Resource: "pods",
		Verb:     "list",
	}
	contextKey := "cluster\x00revision"
	key := buildSSARCacheKey(contextKey, "token", attrs)
	storeSSARCacheResult(key, true)

	_, _, inFlight, leader := acquireSSARRequest(
		buildSSARCacheKey("other\x00revision", "token", attrs),
	)
	require.True(t, leader)

	keys := collectCachedContextKeys(nil)
	assert.Contains(t, keys, contextKey)
	assert.Contains(t, keys, "other\x00revision")

	cleanupRemovedContext(nil, contextKey)

	_, found := getSSARCacheResult(key)
	assert.False(t, found)

	allowed, found, next, nextLeader := acquireSSARRequest(
		buildSSARCacheKey("other\x00revision", "token", attrs),
	)
	assert.False(t, allowed)
	assert.False(t, found)
	assert.Same(t, inFlight, next)
	assert.False(t, nextLeader)

	finishSSARRequest(
		buildSSARCacheKey("other\x00revision", "token", attrs),
		inFlight,
		false,
		context.Canceled,
	)
}

func TestSSARCacheCapacityIsBounded(t *testing.T) {
	resetSSARCache()

	for i := range ssarCacheMaxEntries {
		storeSSARCacheResult(fmt.Sprintf("key-%d", i), true)
	}

	storeSSARCacheResult("newest", true)

	ssarMu.RLock()

	size := len(ssarCache)

	_, oldestFound := ssarCache["key-0"]

	_, newestFound := ssarCache["newest"]

	ssarMu.RUnlock()

	assert.Equal(t, ssarCacheMaxEntries, size)
	assert.False(t, oldestFound)
	assert.True(t, newestFound)
}

func TestSSARWorkerAdmissionIsBounded(t *testing.T) {
	resetSSARCache()

	release := make(chan struct{})
	entries := make([]*ssarInFlightEntry, 0, ssarMaxInFlight)

	for i := range ssarMaxInFlight {
		key := fmt.Sprintf("stalled-%d\x00token", i)
		_, _, entry, leader := acquireSSARRequest(key)
		require.True(t, leader)

		entries = append(entries, entry)

		startSSARRequest(t.Context(), key, entry, 10*time.Millisecond,
			func(context.Context) (bool, error) {
				<-release

				return false, errors.New("client acquisition released")
			})
	}

	_, _, overflow, leader := acquireSSARRequest("overflow\x00token")
	assert.False(t, leader)
	assert.Nil(t, overflow)

	for _, entry := range entries {
		_, err := waitForSSARRequest(t.Context(), entry)
		assert.ErrorIs(t, err, context.DeadlineExceeded)
	}

	ssarMu.RLock()

	workers := ssarWorkerCount

	ssarMu.RUnlock()
	assert.Equal(t, ssarMaxInFlight, workers)

	close(release)
	require.Eventually(t, func() bool {
		ssarMu.RLock()

		workers := ssarWorkerCount

		ssarMu.RUnlock()

		return workers == 0
	}, time.Second, time.Millisecond)
}

func TestRequestSSARRejectsEvaluationError(t *testing.T) {
	ResetForTesting()
	t.Cleanup(ResetForTesting)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(
			`{"kind":"SelfSubjectAccessReview","apiVersion":"authorization.k8s.io/v1",` +
				`"status":{"allowed":false,"evaluationError":"authorizer unavailable"}}`,
		))
	}))
	defer server.Close()

	k := &kubeconfig.Context{
		Name:        "evaluation-error",
		Cluster:     &api.Cluster{Server: server.URL},
		AuthInfo:    &api.AuthInfo{Token: "token"},
		KubeContext: &api.Context{Cluster: "evaluation-error"},
	}
	attrs := &authorizationv1.ResourceAttributes{Resource: "pods", Verb: "list"}

	allowed, err := requestSSAR(t.Context(), "evaluation-error", k, "token", attrs)

	assert.False(t, allowed)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "authorizer unavailable")
}

func TestSSARCacheDeduplicatesInFlightRequests(t *testing.T) {
	resetSSARCache()

	key := "ctx\x00token\x00pods"
	_, _, first, leader := acquireSSARRequest(key)
	require.True(t, leader)

	_, _, second, leader := acquireSSARRequest(key)
	assert.False(t, leader)
	assert.Same(t, first, second)

	type result struct {
		allowed bool
		err     error
	}

	resultCh := make(chan result, 1)

	go func() {
		allowed, err := waitForSSARRequest(t.Context(), second)
		resultCh <- result{allowed: allowed, err: err}
	}()

	select {
	case <-resultCh:
		t.Fatal("in-flight waiter returned before the request completed")
	default:
	}

	finishSSARRequest(key, first, true, nil)

	got := <-resultCh
	require.NoError(t, got.err)
	assert.True(t, got.allowed)

	allowed, found, _, leader := acquireSSARRequest(key)
	assert.True(t, found)
	assert.True(t, allowed)
	assert.False(t, leader)
}

func TestSSARCacheWaitHonorsCancellation(t *testing.T) {
	resetSSARCache()

	_, _, entry, leader := acquireSSARRequest("ctx\x00token\x00pods")
	require.True(t, leader)

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	allowed, err := waitForSSARRequest(ctx, entry)

	assert.False(t, allowed)
	assert.ErrorIs(t, err, context.Canceled)
	finishSSARRequest("ctx\x00token\x00pods", entry, true, nil)
}

func TestSSARCacheSharedRequestOutlivesInitiator(t *testing.T) {
	resetSSARCache()

	parent, cancelInitiator := context.WithCancel(t.Context())
	key := "ctx\x00token\x00pods"
	_, _, entry, leader := acquireSSARRequest(key)
	require.True(t, leader)

	release := make(chan struct{})

	startSSARRequest(parent, key, entry, ssarRequestTimeout, func(ctx context.Context) (bool, error) {
		select {
		case <-release:
			return true, nil
		case <-ctx.Done():
			return false, ctx.Err()
		}
	})
	cancelInitiator()

	_, err := waitForSSARRequest(parent, entry)
	assert.ErrorIs(t, err, context.Canceled)

	result := make(chan error, 1)

	go func() {
		allowed, err := waitForSSARRequest(t.Context(), entry)
		assert.True(t, allowed)

		result <- err
	}()

	close(release)
	require.NoError(t, <-result)
}

func TestSSARCacheDeadlineDetachesStalledClientAcquisition(t *testing.T) {
	resetSSARCache()
	ResetInFlight()

	t.Cleanup(func() {
		ResetForTesting()
	})

	creatorStarted, creatorRelease := holdSSARClientCreation(t)
	requestFinished := make(chan struct{})
	k, attrs := stalledClientTestContext()
	contextCacheKey, err := ContextCacheKey("stalled-client", k)
	require.NoError(t, err)

	key := buildSSARCacheKey(contextCacheKey, "token", attrs)
	_, _, entry, leader := acquireSSARRequest(key)
	require.True(t, leader)

	startSSARRequest(t.Context(), key, entry, 20*time.Millisecond, func(ctx context.Context) (bool, error) {
		defer close(requestFinished)

		return requestSSAR(ctx, "stalled-client", k, "token", attrs)
	})
	<-creatorStarted

	allowed, err := waitForSSARRequest(t.Context(), entry)
	assert.False(t, allowed)
	assert.ErrorIs(t, err, context.DeadlineExceeded)

	_, found, retry, leader := acquireSSARRequest(key)
	assert.False(t, found)
	assert.False(t, leader)
	assert.Same(t, entry, retry)

	close(creatorRelease)
	<-requestFinished

	requireSSARRequestDetached(t, key)

	_, found, retry, leader = acquireSSARRequest(key)
	assert.False(t, found)
	assert.True(t, leader)
	require.NotSame(t, entry, retry)
	finishSSARRequest(key, retry, false, err)

	ssarMu.RLock()

	_, cached := ssarCache[key]

	_, attached := ssarInFlight[key]

	ssarMu.RUnlock()

	assert.False(t, cached, "late client acquisition must not cache a result")
	assert.False(t, attached, "late client acquisition must not reattach the entry")
}

func stalledClientTestContext() (*kubeconfig.Context, *authorizationv1.ResourceAttributes) {
	k := &kubeconfig.Context{
		Name:        "stalled-client",
		Cluster:     &api.Cluster{Server: "https://example.test"},
		AuthInfo:    &api.AuthInfo{Token: "token"},
		KubeContext: &api.Context{Cluster: "stalled-client"},
	}
	attrs := &authorizationv1.ResourceAttributes{
		Resource:  "pods",
		Verb:      "list",
		Namespace: "default",
	}

	return k, attrs
}

func requireSSARRequestDetached(t *testing.T, key string) {
	t.Helper()

	require.Eventually(t, func() bool {
		ssarMu.RLock()

		_, attached := ssarInFlight[key]

		ssarMu.RUnlock()

		return !attached
	}, time.Second, time.Millisecond)
}

func holdSSARClientCreation(t *testing.T) (<-chan struct{}, chan<- struct{}) {
	t.Helper()

	creatorStarted := make(chan struct{})
	creatorRelease := make(chan struct{})
	originalCreator := clientsetCreator

	hookMu.Lock()
	clientsetCreator = func(*kubeconfig.Context, string) (*kubernetes.Clientset, error) {
		close(creatorStarted)
		<-creatorRelease

		return nil, errors.New("client creation released")
	}
	hookMu.Unlock()

	t.Cleanup(func() {
		hookMu.Lock()
		clientsetCreator = originalCreator
		hookMu.Unlock()
	})

	return creatorStarted, creatorRelease
}

func TestSSARCacheEvictionDetachesInFlightRequest(t *testing.T) {
	resetSSARCache()

	key := "cluster-a\x00token\x00pods"
	_, _, old, leader := acquireSSARRequest(key)
	require.True(t, leader)

	evictSSARCacheForPrefix("cluster-a")

	_, _, replacement, leader := acquireSSARRequest(key)
	require.True(t, leader)
	require.NotSame(t, old, replacement)

	finishSSARRequest(key, old, true, nil)
	<-old.waitCh

	_, found, current, leader := acquireSSARRequest(key)
	assert.False(t, found)
	assert.False(t, leader)
	assert.Same(t, replacement, current)

	finishSSARRequest(key, replacement, false, errors.New("replacement failed"))
}

func TestIsSSARCacheable(t *testing.T) {
	tests := []struct {
		verb     string
		expected bool
	}{
		{"get", true},
		{"list", true},
		{"watch", true},
		{"unknown", false},
		{"create", false},
		{"update", false},
		{"delete", false},
		{"patch", false},
		{"", false},
	}

	for _, tc := range tests {
		t.Run(tc.verb, func(t *testing.T) {
			assert.Equal(t, tc.expected, isSSARCacheable(tc.verb))
		})
	}
}
