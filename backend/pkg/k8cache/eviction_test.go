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
