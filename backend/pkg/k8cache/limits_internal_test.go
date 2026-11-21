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
	"fmt"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func withLimits(t *testing.T, maxEntryBytes, maxTotalBytes int64) {
	t.Helper()

	SetLimits(maxEntryBytes, maxTotalBytes)
	t.Cleanup(func() { SetLimits(0, 0) })
}

func newLimitsCache(t *testing.T) cache.Cache[string] {
	t.Helper()

	c := cache.New[string]()

	t.Cleanup(func() { _ = c.Close() })

	return c
}

func storeSized(t *testing.T, c cache.Cache[string], key string, size int) bool {
	t.Helper()

	stored, err := storeWithinLimits(c, key, strings.Repeat("a", size), time.Minute)
	require.NoError(t, err)

	return stored
}

func isCached(c cache.Cache[string], key string) bool {
	_, err := c.Get(context.Background(), key)

	return err == nil
}

func totalCachedBytes(t *testing.T, c cache.Cache[string]) int {
	t.Helper()

	all, err := c.GetAll(context.Background(), nil)
	require.NoError(t, err)

	var total int
	for _, value := range all {
		total += len(value)
	}

	return total
}

func TestStoreWithinLimits_SkipsResponseOverEntryLimit(t *testing.T) {
	withLimits(t, 1000, 1<<20)

	c := newLimitsCache(t)

	assert.True(t, storeSized(t, c, "small", 100))
	assert.False(t, storeSized(t, c, "large", 2000))

	assert.True(t, isCached(c, "small"))
	assert.False(t, isCached(c, "large"), "a response over the entry limit must not be cached")
}

func TestStoreWithinLimits_StopsAtTotalBudget(t *testing.T) {
	withLimits(t, 10_000, 2000)

	c := newLimitsCache(t)

	storeSized(t, c, "first", 900)
	storeSized(t, c, "second", 900)
	storeSized(t, c, "third", 900)

	assert.True(t, isCached(c, "first"))
	assert.True(t, isCached(c, "second"))
	assert.False(t, isCached(c, "third"), "a response that does not fit in the budget must not be cached")
	assert.LessOrEqual(t, totalCachedBytes(t, c), 2000)
}

func TestStoreWithinLimits_ReplacingAKeyDoesNotCountTwice(t *testing.T) {
	withLimits(t, 10_000, 1500)

	c := newLimitsCache(t)

	storeSized(t, c, "pods", 900)
	storeSized(t, c, "pods", 1000)

	value, err := c.Get(context.Background(), "pods")
	require.NoError(t, err)
	assert.Contains(t, value, strings.Repeat("a", 1000))
}

func TestSetLimits_NonPositiveKeepsDefaults(t *testing.T) {
	SetLimits(0, -1)
	t.Cleanup(func() { SetLimits(0, 0) })

	c := newLimitsCache(t)

	assert.True(t, storeSized(t, c, "typical", 100_000))
}

func TestStoreWithinLimits_EntryCountBoundary(t *testing.T) {
	withLimits(t, 10_000, 1<<30)

	c := newLimitsCache(t)

	for i := range maxCachedEntries {
		storeSized(t, c, fmt.Sprintf("key-%d", i), 1)
	}

	storeSized(t, c, "one-too-many", 1)
	assert.False(t, isCached(c, "one-too-many"), "a new key past the entry cap must not be cached")

	storeSized(t, c, "key-0", 2)

	value, err := c.Get(context.Background(), "key-0")
	require.NoError(t, err)
	assert.Contains(t, value, "aa", "an existing key can be replaced at capacity")

	require.NoError(t, c.Delete(context.Background(), "key-1"))
	storeSized(t, c, "after-delete", 1)
	assert.True(t, isCached(c, "after-delete"), "deleting an entry frees room for a new key")
}

func TestStoreWithinLimits_ConcurrentWritersStayWithinLimits(t *testing.T) {
	const (
		bodySize   = 900
		totalLimit = 5000
		writers    = 64
	)

	withLimits(t, 10_000, totalLimit)

	c := newLimitsCache(t)

	var wg sync.WaitGroup

	for i := range writers {
		wg.Add(1)

		go func() {
			defer wg.Done()

			storeSized(t, c, fmt.Sprintf("key-%d", i), bodySize)
		}()
	}

	wg.Wait()

	assert.LessOrEqual(t, totalCachedBytes(t, c), totalLimit, "concurrent writers must not overshoot the total budget")
	assert.NotZero(t, totalCachedBytes(t, c))
}

// Expired responses are not listed by the cache, but they keep their memory until the periodic
// cleanup removes them. Admission must free them first, so that refilling the cache does not hold two
// generations of responses at once.
func TestStoreWithinLimits_FreesExpiredResponsesBeforeAdmission(t *testing.T) {
	withLimits(t, 10_000, 2000)

	c := newLimitsCache(t)

	var (
		mu      sync.Mutex
		evicted []string
	)

	c.SetOnEvicted(func(key string, _ string) {
		mu.Lock()
		defer mu.Unlock()

		evicted = append(evicted, key)
	})

	// two responses that fill the budget, and that expire quickly
	for _, key := range []string{"old-1", "old-2"} {
		require.NoError(t, c.SetWithTTL(context.Background(), key, strings.Repeat("a", 900), time.Millisecond))
	}

	time.Sleep(20 * time.Millisecond)

	assert.True(t, storeSized(t, c, "new", 900))

	mu.Lock()
	defer mu.Unlock()

	assert.ElementsMatch(t, []string{"old-1", "old-2"}, evicted,
		"the expired responses must be removed when a response is admitted, not left until the next cleanup")
	assert.True(t, isCached(c, "new"))
}

// An entry can expire after the cleanup in admission but before the room check. Until it is removed
// it still uses memory, so the room check must count it.
func TestHasRoomFor_CountsExpiredEntriesThatAreNotRemovedYet(t *testing.T) {
	withLimits(t, 10_000, 1000)

	c := newLimitsCache(t)

	require.NoError(t, c.SetWithTTL(context.Background(), "expired", strings.Repeat("a", 900), time.Millisecond))

	time.Sleep(20 * time.Millisecond)

	assert.False(t, hasRoomFor(c, "new", 900),
		"an expired entry that is still held must count against the budget")

	c.DeleteExpired()

	assert.True(t, hasRoomFor(c, "new", 900), "removing the expired entry frees its room")
}

func podListOfSize(size int) string {
	return `{"kind":"PodList","apiVersion":"v1","items":[],"padding":"` + strings.Repeat("a", size) + `"}`
}

// CacheRead.Store is the only place responses enter the cache, so it must go through the limits.
func TestCacheReadStore_SkipsResponseOverEntryLimit(t *testing.T) {
	withLimits(t, 1000, 1<<20)

	a, c, _, key := newWatchFixture(t, "/api/v1/namespaces/team/pods")
	read := readyRead(t, c, key, a.connection(), "user-a")

	response := NewResponseCapture(httptest.NewRecorder())
	_, err := response.Write([]byte(podListOfSize(2000)))
	require.NoError(t, err)

	require.NoError(t, read.Store(response))
	assert.False(t, isCached(c, key), "a response over the entry limit must not be cached")
}

func TestCacheReadStore_CachesResponseWithinLimits(t *testing.T) {
	withLimits(t, 1000, 1<<20)

	a, c, _, key := newWatchFixture(t, "/api/v1/namespaces/team/pods")
	read := readyRead(t, c, key, a.connection(), "user-a")

	response := NewResponseCapture(httptest.NewRecorder())
	_, err := response.Write([]byte(podListOfSize(10)))
	require.NoError(t, err)

	require.NoError(t, read.Store(response))
	assert.True(t, isCached(c, key))
}
