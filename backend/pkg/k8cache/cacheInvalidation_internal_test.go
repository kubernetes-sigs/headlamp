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
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

type watchAPI struct {
	server      *httptest.Server
	mu          sync.Mutex
	streams     map[chan any]string
	denied      map[string]bool
	watches     atomic.Int32
	listGate    chan struct{}
	listStarted chan struct{}
}

func newWatchAPI(t *testing.T) *watchAPI {
	t.Helper()

	ResetForTesting()

	a := &watchAPI{streams: map[chan any]string{}, denied: map[string]bool{}}
	a.server = httptest.NewTLSServer(http.HandlerFunc(a.handle))
	t.Cleanup(a.server.Close)
	t.Cleanup(ResetForTesting)

	return a
}

// newWatchFixture starts a fake API server and a response cache, and returns
// a GET for path together with its cache key.
func newWatchFixture(t *testing.T, path string) (*watchAPI, cache.Cache[string], *http.Request, string) {
	t.Helper()

	a := newWatchAPI(t)
	c := cache.New[string]()

	t.Cleanup(func() { _ = c.Close() })

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil)
	key, err := GenerateRequestKey(request, "connection")
	require.NoError(t, err)

	return a, c, request, key
}

func (a *watchAPI) handle(w http.ResponseWriter, r *http.Request) {
	token := r.Header.Get("Authorization")

	a.mu.Lock()
	denied := a.denied[token]
	a.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")

	if denied {
		http.Error(w, "denied", http.StatusForbidden)
		return
	}

	if r.URL.Query().Get("watch") != "true" {
		if a.listGate != nil {
			a.listStarted <- struct{}{}

			select {
			case <-a.listGate:
			case <-r.Context().Done():
				return
			}
		}

		_ = json.NewEncoder(w).Encode(map[string]any{
			"apiVersion": "meta.k8s.io/v1", "kind": "PartialObjectMetadataList",
			"metadata": map[string]string{"resourceVersion": "1"}, "items": []any{},
		})

		return
	}

	events := make(chan any, 8)

	a.mu.Lock()
	a.streams[events] = token
	a.mu.Unlock()

	a.watches.Add(1)
	defer func() { a.mu.Lock(); delete(a.streams, events); a.mu.Unlock() }()

	w.WriteHeader(http.StatusOK)
	w.(http.Flusher).Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case event, open := <-events:
			if !open {
				return
			}

			_ = json.NewEncoder(w).Encode(event)
			w.(http.Flusher).Flush()
		}
	}
}

func (a *watchAPI) connection() *kubeconfig.Context {
	return &kubeconfig.Context{
		Name: "connection", Source: kubeconfig.ClusterInventory,
		KubeContext: &api.Context{Cluster: "connection", AuthInfo: "connection"},
		Cluster:     &api.Cluster{Server: a.server.URL, InsecureSkipTLSVerify: true},
		AuthInfo: &api.AuthInfo{AuthProvider: &api.AuthProviderConfig{
			Name: "oidc", Config: map[string]string{
				"client-id": "headlamp", "idp-issuer-url": "https://idp.example.com",
			},
		}},
	}
}

func readyRead(
	t *testing.T, c cache.Cache[string], key string, connection *kubeconfig.Context, token string,
) *CacheRead {
	t.Helper()

	var read *CacheRead

	require.Eventually(t, func() bool {
		read = BeginCacheRead(c, key, connection, token)

		return read.Ready()
	}, 5*time.Second, 5*time.Millisecond)

	return read
}

func storePod(t *testing.T, read *CacheRead) {
	t.Helper()

	response := NewResponseCapture(httptest.NewRecorder())
	_, err := response.Write([]byte(`{"kind":"PodList","apiVersion":"v1","items":[]}`))
	require.NoError(t, err)
	require.NoError(t, read.Store(response))
}

func TestSharedWatchUsesRequestCredentialAndFencesLateResponses(t *testing.T) {
	a, c, request, key := newWatchFixture(t, "/api/v1/namespaces/team/pods?labelSelector=app%3Dweb")
	read := readyRead(t, c, key, a.connection(), "user-a")
	storePod(t, read)

	other := BeginCacheRead(c, key, a.connection(), "user-b")
	require.Same(t, read.watcher, other.watcher)
	served, err := other.Load(httptest.NewRecorder(), request)
	require.NoError(t, err)
	require.True(t, served)
	require.EqualValues(t, 1, a.watches.Load())
	a.mu.Lock()
	for events, token := range a.streams {
		require.Equal(t, "Bearer user-a", token)

		events <- map[string]any{"type": "MODIFIED", "object": map[string]any{
			"apiVersion": "meta.k8s.io/v1", "kind": "PartialObjectMetadata",
			"metadata": map[string]string{"name": "web", "namespace": "team", "resourceVersion": "2"},
		}}
	}
	a.mu.Unlock()
	require.Eventually(t, func() bool {
		_, err := c.Get(t.Context(), key)
		return err != nil
	}, time.Second, time.Millisecond)
	storePod(t, read)
	_, err = c.Get(t.Context(), key)
	require.Error(t, err, "a response from before the event must not repopulate the cache")
}

func TestWatchDisconnectAndCredentialRecovery(t *testing.T) {
	a, c, request, key := newWatchFixture(t, "/api/v1/pods")
	read := readyRead(t, c, key, a.connection(), "old-token")
	storePod(t, read)
	a.mu.Lock()

	a.denied["Bearer old-token"] = true
	for events := range a.streams {
		close(events)
	}
	a.mu.Unlock()
	require.Eventually(t, func() bool {
		watcherMu.Lock()
		defer watcherMu.Unlock()

		return read.watcher.failed
	}, time.Second, time.Millisecond)

	served, err := read.Load(httptest.NewRecorder(), request)
	require.NoError(t, err)
	require.False(t, served)
	replacement := readyRead(t, c, key, a.connection(), "new-token")
	require.NotSame(t, read.watcher, replacement.watcher)
	storePod(t, read)
	_, err = c.Get(t.Context(), key)
	require.Error(t, err)
	storePod(t, replacement)
	served, err = replacement.Load(httptest.NewRecorder(), request)
	require.NoError(t, err)
	require.True(t, served)
	SyncWatchers(c, nil)
	storePod(t, replacement)
	_, err = c.Get(t.Context(), key)
	require.Error(t, err)
	require.Nil(t, BeginCacheRead(c, key, a.connection(), "new-token"), "removed connections cannot restart a watch")
}

func TestUnwatchableResourceDoesNotBecomeCacheable(t *testing.T) {
	a, c, request, key := newWatchFixture(t, "/api/v1/namespaces/team/pods")
	a.mu.Lock()
	a.denied["Bearer limited"] = true
	a.mu.Unlock()

	read := BeginCacheRead(c, key, a.connection(), "limited")

	require.Eventually(t, func() bool {
		watcherMu.Lock()
		defer watcherMu.Unlock()

		return read.watcher.failed
	}, time.Second, time.Millisecond)
	storePod(t, read)
	_, err := c.Get(t.Context(), key)
	require.Error(t, err)
	read = readyRead(t, c, key, a.connection(), "allowed")
	storePod(t, read)
	served, err := read.Load(httptest.NewRecorder(), request)
	require.NoError(t, err)
	require.True(t, served)
}

func TestWatchIdleShutdownRejectsLateFill(t *testing.T) {
	a, c, _, key := newWatchFixture(t, "/api/v1/pods")
	read := readyRead(t, c, key, a.connection(), "user")
	storePod(t, read)
	require.False(t, read.watcher.stopIfIdle(time.Now()))
	require.True(t, read.watcher.stopIfIdle(time.Now().Add(responseTTL)))

	select {
	case <-read.watcher.done:
	case <-time.After(time.Second):
		t.Fatal("idle watch did not stop")
	}

	storePod(t, read)
	_, err := c.Get(t.Context(), key)
	require.Error(t, err)
	replacement := readyRead(t, c, key, a.connection(), "user")
	require.NotSame(t, read.watcher, replacement.watcher)
}

func TestInactiveConnectionCancelsInitialList(t *testing.T) {
	for _, reason := range []string{"removal", "idle"} {
		t.Run(reason, func(t *testing.T) {
			a, c, _, key := newWatchFixture(t, "/api/v1/pods")
			a.listGate = make(chan struct{})
			a.listStarted = make(chan struct{}, 1)

			connection := a.connection()
			read := BeginCacheRead(c, key, connection, "user")

			select {
			case <-a.listStarted:
			case <-time.After(time.Second):
				t.Fatal("initial list did not start")
			}

			if reason == "removal" {
				SyncWatchers(c, nil)
			} else {
				require.True(t, read.watcher.stopIfIdle(time.Now().Add(responseTTL)))
			}

			select {
			case <-read.watcher.done:
			case <-time.After(time.Second):
				t.Fatal("removed watch did not stop")
			}

			require.Zero(t, a.watches.Load())
			require.False(t, read.Ready())
			require.Empty(t, connection.AuthInfo.Token)
			require.Empty(t, connection.AuthInfo.AuthProvider.Config["id-token"])
		})
	}
}

func TestMutationFencesConcurrentGETs(t *testing.T) {
	a, c, _, key := newWatchFixture(t, "/api/v1/namespaces/team/pods")
	before := readyRead(t, c, key, a.connection(), "user")
	storePod(t, before)

	var during *CacheRead

	mutation := httptest.NewRequestWithContext(t.Context(), http.MethodPatch, "/api/v1/namespaces/team/pods/web", nil)
	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		during = BeginCacheRead(c, key, a.connection(), "user")
		storePod(t, during)
	})
	err := HandleNonGETCacheInvalidation(c, httptest.NewRecorder(), mutation, next, "connection")
	require.ErrorIs(t, err, ErrHandled)
	storePod(t, before)
	storePod(t, during)
	_, err = c.Get(t.Context(), key)
	require.Error(t, err, "GETs overlapping a mutation cannot restore stale data")
}
