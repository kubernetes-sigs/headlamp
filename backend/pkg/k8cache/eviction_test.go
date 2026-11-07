// Copyright 2025 The Kubernetes Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package k8cache_test

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

var testKeyCounter int

func seedCache(n int, lastUsed time.Time) {
	for i := 0; i < n; i++ {
		testKeyCounter++
		key := fmt.Sprintf("test-token-%d-%d", time.Now().UnixNano(), testKeyCounter)
		k8cache.SeedClientsetCache(key, lastUsed)
	}
}

func TestEvictExpiredClientsets_AllExpired(t *testing.T) {
	k8cache.ResetClientsetCache()

	// Seed 5 expired entries
	expiredTime := time.Now().Add(-20 * time.Minute)
	seedCache(5, expiredTime)

	assert.Equal(t, 5, k8cache.ClientsetCacheLen())

	// Run eviction
	k8cache.ManualEvictExpiredClientsets()

	assert.Equal(t, 0, k8cache.ClientsetCacheLen(), "all expired entries should be removed")
}

func TestEvictExpiredClientsets_AllActive(t *testing.T) {
	k8cache.ResetClientsetCache()

	// Seed 5 active entries
	activeTime := time.Now().Add(-2 * time.Minute)
	seedCache(5, activeTime)

	assert.Equal(t, 5, k8cache.ClientsetCacheLen())

	// Run eviction
	k8cache.ManualEvictExpiredClientsets()

	assert.Equal(t, 5, k8cache.ClientsetCacheLen(), "all active entries should be preserved")
}

func TestEvictExpiredClientsets_Mixed(t *testing.T) {
	k8cache.ResetClientsetCache()

	// 3 expired
	seedCache(3, time.Now().Add(-15*time.Minute))
	// 2 active
	seedCache(2, time.Now().Add(-1*time.Minute))

	assert.Equal(t, 5, k8cache.ClientsetCacheLen())

	// Run eviction
	k8cache.ManualEvictExpiredClientsets()

	assert.Equal(t, 2, k8cache.ClientsetCacheLen(), "only active entries should remain")
}

func TestEvictExpiredClientsets_Empty(t *testing.T) {
	k8cache.ResetClientsetCache()

	assert.Equal(t, 0, k8cache.ClientsetCacheLen())

	// Run eviction on empty cache
	assert.NotPanics(t, func() {
		k8cache.ManualEvictExpiredClientsets()
	})

	assert.Equal(t, 0, k8cache.ClientsetCacheLen())
}

func TestEvictExpiredClientsets_BoundaryTTL(t *testing.T) {
	k8cache.ResetClientsetCache()

	// Nearly 10 minutes ago (should stay)
	k8cache.SeedClientsetCache("at-boundary", time.Now().Add(-10*time.Minute+5*time.Second))

	// Well over 10 minutes ago (should be evicted)
	k8cache.SeedClientsetCache("past-boundary", time.Now().Add(-10*time.Minute-5*time.Second))

	assert.Equal(t, 2, k8cache.ClientsetCacheLen())

	// Run eviction
	k8cache.ManualEvictExpiredClientsets()

	assert.Equal(t, 1, k8cache.ClientsetCacheLen())
}

func TestClientsetCacheLen_Accuracy(t *testing.T) {
	k8cache.ResetClientsetCache()

	assert.Equal(t, 0, k8cache.ClientsetCacheLen())

	k8cache.SeedClientsetCache("one", time.Now())
	assert.Equal(t, 1, k8cache.ClientsetCacheLen())

	k8cache.SeedClientsetCache("two", time.Now())
	assert.Equal(t, 2, k8cache.ClientsetCacheLen())
}

func TestLRUEviction_CapacityLimit(t *testing.T) {
	k8cache.ResetClientsetCache()
	t.Setenv("HEADLAMP_MAX_CLIENTSETS", "3")

	restoreCreator := k8cache.SetClientsetCreator(
		func(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
			return &kubernetes.Clientset{}, nil
		},
	)
	defer restoreCreator()

	ctx1 := &kubeconfig.Context{ClusterID: "c+1"}
	ctx2 := &kubeconfig.Context{ClusterID: "c+2"}
	ctx3 := &kubeconfig.Context{ClusterID: "c+3"}
	ctx4 := &kubeconfig.Context{ClusterID: "c+4"}

	_, err := k8cache.GetClientSet("ctx1", ctx1, "token1")
	assert.NoError(t, err)
	_, err = k8cache.GetClientSet("ctx2", ctx2, "token2")
	assert.NoError(t, err)
	_, err = k8cache.GetClientSet("ctx3", ctx3, "token3")
	assert.NoError(t, err)

	assert.Equal(t, 3, k8cache.ClientsetCacheLen())

	_, err = k8cache.GetClientSet("ctx4", ctx4, "token4")
	assert.NoError(t, err)

	assert.Equal(t, 3, k8cache.ClientsetCacheLen())

	calls := make(map[string]int)

	k8cache.SetClientsetCreator(
		func(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
			calls[token]++

			return &kubernetes.Clientset{}, nil
		},
	)

	_, err = k8cache.GetClientSet("ctx1", ctx1, "token1")
	assert.NoError(t, err)
	assert.Equal(t, 1, calls["token1"])

	_, err = k8cache.GetClientSet("ctx4", ctx4, "token4")
	assert.NoError(t, err)
	assert.Equal(t, 0, calls["token4"])
}

func TestLRUEviction_MoveToFront(t *testing.T) {
	k8cache.ResetClientsetCache()
	t.Setenv("HEADLAMP_MAX_CLIENTSETS", "3")

	restoreCreator := k8cache.SetClientsetCreator(
		func(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
			return &kubernetes.Clientset{}, nil
		},
	)
	defer restoreCreator()

	ctx1 := &kubeconfig.Context{ClusterID: "c+1"}
	ctx2 := &kubeconfig.Context{ClusterID: "c+2"}
	ctx3 := &kubeconfig.Context{ClusterID: "c+3"}
	ctx4 := &kubeconfig.Context{ClusterID: "c+4"}

	_, err := k8cache.GetClientSet("ctx1", ctx1, "token1")
	assert.NoError(t, err)
	_, err = k8cache.GetClientSet("ctx2", ctx2, "token2")
	assert.NoError(t, err)
	_, err = k8cache.GetClientSet("ctx3", ctx3, "token3")
	assert.NoError(t, err)

	_, err = k8cache.GetClientSet("ctx1", ctx1, "token1")
	assert.NoError(t, err)

	_, err = k8cache.GetClientSet("ctx4", ctx4, "token4")
	assert.NoError(t, err)

	assert.Equal(t, 3, k8cache.ClientsetCacheLen())

	calls := make(map[string]int)

	k8cache.SetClientsetCreator(
		func(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
			calls[token]++

			return &kubernetes.Clientset{}, nil
		},
	)

	_, err = k8cache.GetClientSet("ctx1", ctx1, "token1")
	assert.NoError(t, err)
	assert.Equal(t, 0, calls["token1"])

	_, err = k8cache.GetClientSet("ctx2", ctx2, "token2")
	assert.NoError(t, err)
	assert.Equal(t, 1, calls["token2"])
}

type mockTransport struct {
	closeCalled bool
}

func (m *mockTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return nil, fmt.Errorf("mockTransport RoundTrip not implemented")
}

func (m *mockTransport) CloseIdleConnections() {
	m.closeCalled = true
}

func TestLRUEviction_ClosesConnections(t *testing.T) {
	k8cache.ResetClientsetCache()
	t.Setenv("HEADLAMP_MAX_CLIENTSETS", "1")

	tr := &mockTransport{}

	restoreCreator := k8cache.SetClientsetCreator(
		func(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
			config := &rest.Config{
				Host:      "http://localhost:8080",
				Transport: tr,
			}

			return kubernetes.NewForConfig(config)
		},
	)
	defer restoreCreator()

	ctx1 := &kubeconfig.Context{ClusterID: "c+1"}
	ctx2 := &kubeconfig.Context{ClusterID: "c+2"}

	_, err := k8cache.GetClientSet("ctx1", ctx1, "token1")
	assert.NoError(t, err)

	assert.False(t, tr.closeCalled)

	_, err = k8cache.GetClientSet("ctx2", ctx2, "token2")
	assert.NoError(t, err)

	assert.True(t, tr.closeCalled)
}
