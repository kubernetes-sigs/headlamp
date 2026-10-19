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

package k8cache_test

import (
	"context"
	"fmt"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func storeBody(t *testing.T, c cache.Cache[string], key string, size int) {
	t.Helper()

	rcw := k8cache.NewResponseCapture(httptest.NewRecorder())
	_, err := rcw.Write([]byte(strings.Repeat("a", size)))
	require.NoError(t, err)

	require.NoError(t, k8cache.StoreK8sResponseInCache(c, &url.URL{Path: "/api/v1/pods"}, rcw, key))
}

func cached(t *testing.T, c cache.Cache[string], key string) bool {
	t.Helper()

	_, err := c.Get(context.Background(), key)

	return err == nil
}

func TestStoreK8sResponseInCache_SkipsResponseOverEntryLimit(t *testing.T) {
	k8cache.SetLimits(1000, 1<<20)
	t.Cleanup(func() { k8cache.SetLimits(0, 0) })

	c := cache.New[string]()

	t.Cleanup(func() { _ = c.Close() })

	storeBody(t, c, "small", 100)
	storeBody(t, c, "large", 2000)

	assert.True(t, cached(t, c, "small"))
	assert.False(t, cached(t, c, "large"), "a response over the entry limit must not be cached")
}

func TestStoreK8sResponseInCache_StopsAtTotalBudget(t *testing.T) {
	k8cache.SetLimits(10_000, 2000)
	t.Cleanup(func() { k8cache.SetLimits(0, 0) })

	c := cache.New[string]()

	t.Cleanup(func() { _ = c.Close() })

	storeBody(t, c, "first", 900)
	storeBody(t, c, "second", 900)
	storeBody(t, c, "third", 900)

	assert.True(t, cached(t, c, "first"))
	assert.True(t, cached(t, c, "second"))
	assert.False(t, cached(t, c, "third"), "a response that does not fit in the budget must not be cached")

	all, err := c.GetAll(context.Background(), nil)
	require.NoError(t, err)

	var total int
	for _, value := range all {
		total += len(value)
	}

	assert.LessOrEqual(t, total, 2000)
}

func TestStoreK8sResponseInCache_ReplacingAKeyDoesNotCountTwice(t *testing.T) {
	k8cache.SetLimits(10_000, 1500)
	t.Cleanup(func() { k8cache.SetLimits(0, 0) })

	c := cache.New[string]()

	t.Cleanup(func() { _ = c.Close() })

	storeBody(t, c, "pods", 900)
	storeBody(t, c, "pods", 1000)

	assert.True(t, cached(t, c, "pods"))
	value, err := c.Get(context.Background(), "pods")
	require.NoError(t, err)
	assert.Contains(t, value, strings.Repeat("a", 1000))
}

func TestSetLimits_NonPositiveKeepsDefaults(t *testing.T) {
	k8cache.SetLimits(0, -1)

	c := cache.New[string]()

	t.Cleanup(func() { _ = c.Close() })

	storeBody(t, c, "typical", 100_000)
	assert.True(t, cached(t, c, "typical"))
}

func TestStoreK8sResponseInCache_EntryCountBoundary(t *testing.T) {
	k8cache.SetLimits(10_000, 1<<30)
	t.Cleanup(func() { k8cache.SetLimits(0, 0) })

	c := cache.New[string]()

	t.Cleanup(func() { _ = c.Close() })

	const maxEntries = 1024

	for i := range maxEntries {
		storeBody(t, c, fmt.Sprintf("key-%d", i), 1)
	}

	storeBody(t, c, "one-too-many", 1)
	assert.False(t, cached(t, c, "one-too-many"), "a new key past the entry cap must not be cached")

	storeBody(t, c, "key-0", 2)

	value, err := c.Get(context.Background(), "key-0")
	require.NoError(t, err)
	assert.Contains(t, value, "aa", "an existing key can be replaced at capacity")

	require.NoError(t, c.Delete(context.Background(), "key-1"))
	storeBody(t, c, "after-delete", 1)
	assert.True(t, cached(t, c, "after-delete"), "deleting an entry frees room for a new key")
}

func TestStoreK8sResponseInCache_ConcurrentWritersStayWithinLimits(t *testing.T) {
	const (
		bodySize   = 900
		totalLimit = 5000
		writers    = 64
	)

	k8cache.SetLimits(10_000, totalLimit)
	t.Cleanup(func() { k8cache.SetLimits(0, 0) })

	c := cache.New[string]()

	t.Cleanup(func() { _ = c.Close() })

	var wg sync.WaitGroup

	for i := range writers {
		wg.Add(1)

		go func() {
			defer wg.Done()

			storeBody(t, c, fmt.Sprintf("key-%d", i), bodySize)
		}()
	}

	wg.Wait()

	all, err := c.GetAll(context.Background(), nil)
	require.NoError(t, err)

	var total int
	for _, value := range all {
		total += len(value)
	}

	assert.LessOrEqual(t, total, totalLimit, "concurrent writers must not overshoot the total budget")
	assert.NotEmpty(t, all)
}
