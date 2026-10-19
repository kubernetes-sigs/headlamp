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
	"sync"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const (
	// DefaultMaxEntryBytes is the default size above which a single response is not cached.
	DefaultMaxEntryBytes int64 = 16 << 20
	// DefaultMaxTotalBytes is the default budget for all cached responses together.
	DefaultMaxTotalBytes int64 = 256 << 20
	// maxCachedEntries bounds the number of cached responses, however small they are.
	maxCachedEntries = 1024
)

// limits bounds the memory used by the cached Kubernetes responses.
type limits struct {
	maxEntryBytes int64
	maxTotalBytes int64
}

var (
	// admitMu makes the room check and the insert in storeWithinLimits one step, so concurrent
	// writers cannot all pass the check against the same snapshot and overshoot the limits.
	admitMu     sync.Mutex
	limitsMu    sync.RWMutex
	cacheLimits = limits{maxEntryBytes: DefaultMaxEntryBytes, maxTotalBytes: DefaultMaxTotalBytes}
)

// SetLimits sets the largest response, in bytes, that is cached and the budget, in bytes, for all
// cached responses together. A value that is not positive keeps its default.
func SetLimits(maxEntryBytes, maxTotalBytes int64) {
	limitsMu.Lock()
	defer limitsMu.Unlock()

	cacheLimits = limits{maxEntryBytes: DefaultMaxEntryBytes, maxTotalBytes: DefaultMaxTotalBytes}

	if maxEntryBytes > 0 {
		cacheLimits.maxEntryBytes = maxEntryBytes
	}

	if maxTotalBytes > 0 {
		cacheLimits.maxTotalBytes = maxTotalBytes
	}
}

// storeWithinLimits stores value under key with the given TTL unless it does not fit in the cache
// limits. It reports whether the value was stored. Checking and inserting happen under admitMu so
// the limits hold with concurrent writers.
func storeWithinLimits(k8scache cache.Cache[string], key, value string, ttl time.Duration) (bool, error) {
	admitMu.Lock()
	defer admitMu.Unlock()

	if !hasRoomFor(k8scache, key, int64(len(value))) {
		return false, nil
	}

	if err := k8scache.SetWithTTL(context.Background(), key, value, ttl); err != nil {
		return false, err
	}

	return true, nil
}

// hasRoomFor reports whether a response of size bytes stored under key fits in the cache limits.
// The response is not cached when it does not, so the cache never grows past its budget. Entries
// leave the cache when their TTL expires or when they are invalidated, which frees room again.
func hasRoomFor(k8scache cache.Cache[string], key string, size int64) bool {
	limitsMu.RLock()

	current := cacheLimits

	limitsMu.RUnlock()

	if size > current.maxEntryBytes {
		logger.Log(logger.LevelInfo, nil, nil,
			"k8s response for "+redactCacheKey(key)+" is larger than the cache entry limit and is not cached")

		return false
	}

	entries, err := k8scache.GetAll(context.Background(), nil)
	if err != nil {
		return false
	}

	var (
		total int64
		count int
	)

	for existingKey, value := range entries {
		// The new response replaces an existing one under the same key.
		if existingKey == key {
			continue
		}

		total += int64(len(value))
		count++
	}

	if count >= maxCachedEntries || total+size > current.maxTotalBytes {
		logger.Log(logger.LevelInfo, nil, nil,
			"the k8s response cache is full, the response for "+redactCacheKey(key)+" is not cached")

		return false
	}

	return true
}
