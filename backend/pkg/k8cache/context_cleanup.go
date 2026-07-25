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
	"fmt"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

// cacheKeyBelongsToContext reports whether a k8cache entry key belongs to the
// given Headlamp context. Keys use the format group+resource+namespace+context.
func cacheKeyBelongsToContext(key, contextKey string) bool {
	if contextKey == "" {
		return false
	}

	parts := strings.SplitN(key, "+", 4)
	if len(parts) < 4 {
		return false
	}

	return parts[3] == escapeCacheKeySegment(contextKey)
}

// PurgeCacheForContext removes all cached API responses for a removed context.
func PurgeCacheForContext(k8scache cache.Cache[string], contextKey string) {
	if k8scache == nil || contextKey == "" {
		return
	}

	keys, err := k8scache.GetAll(context.Background(), func(key string) bool {
		return cacheKeyBelongsToContext(key, contextKey)
	})
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err,
			"failed to list cache keys for context cleanup: "+redactContextKey(contextKey))

		return
	}

	for key := range keys {
		if err := k8scache.Delete(context.Background(), key); err != nil {
			logger.Log(logger.LevelWarn, nil, err,
				"failed to delete cache key during context cleanup: "+redactCacheKey(key))
		}
	}

	if len(keys) > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("purged %d k8cache entries for removed context %s",
				len(keys), redactContextKey(contextKey)))
	}
}

// collectCachedContextKeys returns Headlamp context keys that still have k8cache,
// clientset cache, or in-flight clientset creation entries.
func collectCachedContextKeys(k8scache cache.Cache[string]) map[string]struct{} {
	keys := make(map[string]struct{})

	mu.Lock()

	for cacheKey := range clientsetCache {
		if prefix := clientsetCachePrefixFromCacheKey(cacheKey); prefix != "" {
			keys[prefix] = struct{}{}
		}
	}

	for cacheKey := range inFlight {
		if prefix := clientsetCachePrefixFromCacheKey(cacheKey); prefix != "" {
			keys[prefix] = struct{}{}
		}
	}

	mu.Unlock()

	if k8scache == nil {
		return keys
	}

	allKeys, err := k8scache.GetAll(context.Background(), nil)
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "failed to list cache keys during context cleanup")

		return keys
	}

	for key := range allKeys {
		parts := strings.SplitN(key, "+", 4)
		if len(parts) == 4 && parts[3] != "" {
			keys[unescapeCacheKeySegment(parts[3])] = struct{}{}
		}
	}

	return keys
}

// clientsetCachePrefixFromContextKey returns the Headlamp context store key used as
// the prefix for clientset cache keys. For stateless contexts this includes the user
// ID (e.g. "cluster\x00userID"); for regular contexts it is the cluster name alone.
func clientsetCachePrefixFromContextKey(contextKey string) string {
	return contextKey
}

// cleanupRemovedContext drops cached API responses and auth clientsets for a
// context that is no longer active.
func cleanupRemovedContext(k8scache cache.Cache[string], contextKey string) {
	PurgeCacheForContext(k8scache, contextKey)
	EvictClientsetsForCluster(clientsetCachePrefixFromContextKey(contextKey))
}
