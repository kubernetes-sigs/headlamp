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

package k8cache_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestResourceInvalidationIncludesEveryRepresentation(t *testing.T) {
	c := cache.New[string]()

	t.Cleanup(func() { require.NoError(t, c.Close()) })

	paths := []string{
		"/api/v1/namespaces/team/pods/shared",
		"/api/v1/namespaces/team/pods?labelSelector=app%3Da",
		"/api/v1/pods",
		"/api/v1/namespaces/team/secrets/shared",
		"/api/v1/namespaces/other/pods/shared",
	}

	keys := make([]string, len(paths))
	for i, path := range paths {
		keys[i] = testResponseKey(t, "connection", path)
		require.NoError(t, c.Set(t.Context(), keys[i], "cached"))
	}

	k8cache.ExportedInvalidateCacheKeysForResourceEvent(
		schema.GroupVersionResource{Version: "v1", Resource: "pods"}, "team", "shared", "connection", c,
	)

	for i, key := range keys {
		_, err := c.Get(t.Context(), key)
		if i < 3 {
			require.Error(t, err)
		} else {
			require.NoError(t, err)
		}
	}
}

func TestMutationForwardsOnceWithoutSyntheticGET(t *testing.T) {
	c := cache.New[string]()

	t.Cleanup(func() { require.NoError(t, c.Close()) })

	key := testResponseKey(t, "connection", "/api/v1/namespaces/team/pods")
	require.NoError(t, c.Set(t.Context(), key, "stale"))

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		calls := 0
		request := httptest.NewRequestWithContext(t.Context(), method, "/api/v1/namespaces/team/pods", nil)
		response := httptest.NewRecorder()
		next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			calls++

			require.Equal(t, method, r.Method)
			w.WriteHeader(http.StatusCreated)
		})
		err := k8cache.HandleNonGETCacheInvalidation(c, response, request, next, "connection")
		require.ErrorIs(t, err, k8cache.ErrHandled)
		require.Equal(t, 1, calls)
		require.Equal(t, http.StatusCreated, response.Code)
		_, err = c.Get(t.Context(), key)
		require.Error(t, err)
	}

	// A GET is not a mutation: it passes through without touching the cache or the handler.
	get := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/v1/pods", nil)
	require.NoError(t, k8cache.HandleNonGETCacheInvalidation(nil, httptest.NewRecorder(), get, nil, "connection"))
}

func TestSkipWebSocket(t *testing.T) {
	for _, header := range []string{"upgrade", "Upgrade", "keep-alive, Upgrade", ""} {
		calls := 0
		request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/v1/pods", nil)
		request.Header.Set("Connection", header)

		next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { calls++ })
		skipped := k8cache.SkipWebSocket(request, next, httptest.NewRecorder())
		require.Equal(t, header != "", skipped)

		if skipped {
			require.Equal(t, 1, calls)
		} else {
			require.Zero(t, calls)
		}
	}
}

func TestCacheableRequest(t *testing.T) {
	for _, path := range []string{
		"/api/v1/pods?watch=true", "/api/v1/pods?watch=1", "/api/v1/pods?limit=10", "/api/v1/pods?continue=page-2",
		"/api/v1/pods?resourceVersion=123", "/api/v1/pods?resourceVersionMatch=Exact",
		"/api/v1/namespaces/ns/pods/pod/log", "/apis/authentication.k8s.io/v1/selfsubjectreviews",
		"/apis/authorization.k8s.io/v1/selfsubjectrulesreviews", "/api/v1/pods?bad;query",
	} {
		request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil)
		require.False(t, k8cache.CacheableRequest(request), path)
	}

	request := httptest.NewRequestWithContext(
		t.Context(), http.MethodGet, "/api/v1/namespaces/ns/pods?labelSelector=app%3Dweb", nil,
	)
	require.True(t, k8cache.CacheableRequest(request))

	for _, header := range []string{"Impersonate-User", "Range", "If-None-Match", "Cache-Control"} {
		request.Header.Set(header, "no-cache")
		require.False(t, k8cache.CacheableRequest(request), header)
		request.Header.Del(header)
	}
}
