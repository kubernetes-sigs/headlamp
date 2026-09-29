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
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
)

var testKeyCounter int

func seedCache(c *k8cache.ClientsetCache, n int, lastUsed time.Time) {
	for i := 0; i < n; i++ {
		testKeyCounter++
		key := fmt.Sprintf("test-token-%d-%d", time.Now().UnixNano(), testKeyCounter)
		c.SeedClientset(key, lastUsed)
	}
}

func TestEvictExpiredClientsets_AllExpired(t *testing.T) {
	cache := k8cache.NewClientsetCache()

	// Seed 5 expired entries
	expiredTime := time.Now().Add(-20 * time.Minute)
	seedCache(cache, 5, expiredTime)

	assert.Equal(t, 5, cache.Len())

	// Run eviction
	cache.EvictExpired()

	assert.Equal(t, 0, cache.Len(), "all expired entries should be removed")
}

func TestEvictExpiredClientsets_AllActive(t *testing.T) {
	cache := k8cache.NewClientsetCache()

	// Seed 5 active entries
	activeTime := time.Now().Add(-2 * time.Minute)
	seedCache(cache, 5, activeTime)

	assert.Equal(t, 5, cache.Len())

	// Run eviction
	cache.EvictExpired()

	assert.Equal(t, 5, cache.Len(), "all active entries should be preserved")
}

func TestEvictExpiredClientsets_Mixed(t *testing.T) {
	cache := k8cache.NewClientsetCache()

	// 3 expired
	seedCache(cache, 3, time.Now().Add(-15*time.Minute))
	// 2 active
	seedCache(cache, 2, time.Now().Add(-1*time.Minute))

	assert.Equal(t, 5, cache.Len())

	// Run eviction
	cache.EvictExpired()

	assert.Equal(t, 2, cache.Len(), "only active entries should remain")
}

func TestEvictExpiredClientsets_Empty(t *testing.T) {
	cache := k8cache.NewClientsetCache()

	assert.Equal(t, 0, cache.Len())

	// Run eviction on empty cache
	assert.NotPanics(t, func() {
		cache.EvictExpired()
	})

	assert.Equal(t, 0, cache.Len())
}

func TestEvictExpiredClientsets_BoundaryTTL(t *testing.T) {
	cache := k8cache.NewClientsetCache()

	// Nearly 10 minutes ago (should stay)
	cache.SeedClientset("at-boundary", time.Now().Add(-10*time.Minute+5*time.Second))

	// Well over 10 minutes ago (should be evicted)
	cache.SeedClientset("past-boundary", time.Now().Add(-10*time.Minute-5*time.Second))

	assert.Equal(t, 2, cache.Len())

	// Run eviction
	cache.EvictExpired()

	assert.Equal(t, 1, cache.Len())
}

func TestClientsetCacheLen_Accuracy(t *testing.T) {
	cache := k8cache.NewClientsetCache()

	assert.Equal(t, 0, cache.Len())

	cache.SeedClientset("one", time.Now())
	assert.Equal(t, 1, cache.Len())

	cache.SeedClientset("two", time.Now())
	assert.Equal(t, 2, cache.Len())
}
