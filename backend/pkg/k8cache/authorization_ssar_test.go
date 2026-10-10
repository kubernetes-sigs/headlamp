//nolint:testpackage
package k8cache

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

//nolint:funlen
func TestSSARCache(t *testing.T) {
	// Reset the cache before starting
	ssarMu.Lock()
	ssarCache = make(map[string]cachedSSAR)
	ssarMu.Unlock()

	defer func() {
		ssarMu.Lock()
		ssarCache = make(map[string]cachedSSAR)
		ssarMu.Unlock()
	}()

	t.Run("cache hits and key isolation", func(t *testing.T) {
		key1 := "cluster1\x00token1\x00group/v1/pods//default/mypod/get"
		key2 := "cluster1\x00token1\x00group/v1/pods//default/otherpod/get"

		// Initial misses
		allowed, hit := checkSSARCache(key1)
		assert.False(t, hit)
		assert.False(t, allowed)

		// Populate
		updateSSARCache("cluster1", key1, true, time.Now())
		updateSSARCache("cluster1", key2, false, time.Now())

		// Hits
		allowed, hit = checkSSARCache(key1)
		assert.True(t, hit)
		assert.True(t, allowed)

		allowed, hit = checkSSARCache(key2)
		assert.True(t, hit)
		assert.False(t, allowed)
	})

	t.Run("expiry", func(t *testing.T) {
		key := "cluster2\x00token2\x00group/v1/pods//default/mypod/get"
		updateSSARCache("cluster2", key, true, time.Now())

		// Simulate time passing beyond TTL
		ssarMu.Lock()
		cached := ssarCache[key]
		cached.insertedAt = time.Now().Add(-(ssarCacheTTL + 1*time.Second))
		ssarCache[key] = cached
		ssarMu.Unlock()

		allowed, hit := checkSSARCache(key)
		assert.False(t, hit, "expected cache miss after expiry")
		assert.False(t, allowed)
	})

	t.Run("concurrent misses and updates", func(t *testing.T) {
		key := "cluster3\x00token3\x00group/v1/pods//default/mypod/get"

		var wg sync.WaitGroup

		for i := 0; i < 50; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				_, _ = checkSSARCache(key)
				updateSSARCache("cluster3", key, true, time.Now())
			}()
		}

		wg.Wait()

		allowed, hit := checkSSARCache(key)
		assert.True(t, hit)
		assert.True(t, allowed)
	})

	t.Run("eviction by prefix", func(t *testing.T) {
		key1 := "cluster_to_evict\x00token1\x00group/v1/pods//default/mypod/get"
		key2 := "cluster_kept\x00token2\x00group/v1/pods//default/mypod/get"

		updateSSARCache("cluster_to_evict", key1, true, time.Now())
		updateSSARCache("cluster_kept", key2, false, time.Now())

		EvictClientsetsForCluster("cluster_to_evict")

		_, hit1 := checkSSARCache(key1)
		assert.False(t, hit1, "expected key1 to be evicted")

		_, hit2 := checkSSARCache(key2)
		assert.True(t, hit2, "expected key2 to be kept")
	})

	t.Run("evictExpiredSSARs", func(t *testing.T) {
		key := "cluster4\x00token4\x00group/v1/pods//default/mypod/get"
		updateSSARCache("cluster4", key, true, time.Now())

		ssarMu.Lock()
		cached := ssarCache[key]
		cached.insertedAt = time.Now().Add(-(ssarCacheTTL + 1*time.Second))
		ssarCache[key] = cached
		ssarMu.Unlock()

		evictExpiredSSARs(time.Now())

		ssarMu.Lock()
		_, exists := ssarCache[key]
		ssarMu.Unlock()
		assert.False(t, exists, "expected entry to be swept by evictExpiredSSARs")
	})
}
