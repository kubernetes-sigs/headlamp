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
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

// TestCheckForChangesRestartsWatcherOfReplacedContext checks that a context
// replaced with another configuration gets a new invalidation watcher, and its
// cached responses are dropped, while one replaced with the same configuration
// keeps them.
func TestCheckForChangesRestartsWatcherOfReplacedContext(t *testing.T) {
	ResetForTesting()
	t.Cleanup(ResetForTesting)

	newContext := func(server, token string) *kubeconfig.Context {
		return &kubeconfig.Context{
			Name: "test-cluster",
			// Nothing listens there, so the watchers this starts end right away.
			Cluster:  &api.Cluster{Server: server},
			AuthInfo: &api.AuthInfo{Token: token},
		}
	}

	const contextKey = "test-cluster"

	k8scache := cache.New[string]()
	cachedKey := buildCacheKey("", "pods", "default", contextKey)

	canceled := 0

	watcherRegistry.Store(contextKey, &watcher{
		context: newContext("https://127.0.0.1:1", "token-1"),
		cancel:  func() { canceled++ },
	})

	require.NoError(t, k8scache.Set(context.Background(), cachedKey, "cached"))

	CheckForChanges(k8scache, contextKey, newContext("https://127.0.0.1:1", "token-1"))

	assert.Equal(t, 0, canceled, "a context replaced with the same configuration keeps its watcher")

	_, err := k8scache.Get(context.Background(), cachedKey)
	require.NoError(t, err, "a context replaced with the same configuration keeps its cached responses")

	CheckForChanges(k8scache, contextKey, newContext("https://127.0.0.1:2", "token-1"))

	assert.Equal(t, 1, canceled, "the watcher of the old configuration should be stopped")

	_, err = k8scache.Get(context.Background(), cachedKey)
	require.ErrorIs(t, err, cache.ErrNotFound, "the old configuration's cached responses should be dropped")
}
