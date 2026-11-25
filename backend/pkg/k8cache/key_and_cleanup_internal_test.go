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

package k8cache

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestK8CacheKeyAndCleanupEdgeCases(t *testing.T) {
	t.Run("ContextCacheKey errors on nil or empty", func(t *testing.T) {
		_, err := ContextCacheKey("c1", nil)
		require.Error(t, err)

		_, err = ContextCacheKey("", &kubeconfig.Context{})
		require.Error(t, err)
	})

	t.Run("PurgeCacheForContext handles nil cache and empty key", func(t *testing.T) {
		PurgeCacheForContext(nil, "k")

		c := cache.New[string]()
		PurgeCacheForContext(c, "")

		require.NoError(t, c.Set(context.Background(), "conn1|key1", "v1"))
		PurgeCacheForContext(c, "conn1")
	})
}

func TestK8CacheAuthAndCaptureEdgeCases(t *testing.T) {
	t.Run("GetClientSet and IsAllowed error on nil context", func(t *testing.T) {
		_, err := GetClientSet("c1", nil, "")
		require.Error(t, err)

		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/api/v1/pods", nil)
		_, err = IsAllowed("c1", nil, req)
		require.Error(t, err)
	})

	t.Run("CacheableRequest rejects watch and non-GET", func(t *testing.T) {
		reqWatch := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v1/pods?watch=true", nil)
		assert.False(t, CacheableRequest(reqWatch))

		reqPost := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/v1/pods", nil)
		assert.False(t, CacheableRequest(reqPost))
	})

	t.Run("ResponseCapture Write captures status and body", func(t *testing.T) {
		rec := httptest.NewRecorder()
		rc := NewResponseCapture(rec)
		n, err := rc.Write([]byte("hello"))
		require.NoError(t, err)
		assert.Equal(t, 5, n)
		assert.Equal(t, http.StatusOK, rc.StatusCode)
		assert.Equal(t, "hello", rc.Body.String())
	})
}
