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

package cache_test

import (
	"context"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func testCache(ch cache.Cache[interface{}], t *testing.T) {
	t.Helper()
	t.Parallel()

	// set value
	err := ch.Set(context.Background(), "key1", "value1")
	require.NoError(t, err)

	// get value
	value, err := ch.Get(context.Background(), "key1")
	assert.NoError(t, err)
	assert.Equal(t, "value1", value)

	// get a value that doesn't exists
	value, err = ch.Get(context.Background(), "key2")
	assert.Error(t, err)
	assert.Nil(t, value)

	// delete value
	err = ch.Delete(context.Background(), "key1")
	assert.NoError(t, err)

	// set value with ttl
	err = ch.SetWithTTL(context.Background(), "ttlkey1", "value1", time.Second)
	require.NoError(t, err)

	// update ttl value
	err = ch.UpdateTTL(context.Background(), "ttlkey1", 4*time.Second)
	assert.NoError(t, err)

	// sleep for 2 seconds and check ttlkey is present or not
	time.Sleep(2 * time.Second)

	// get value with ttl after 2 seconds
	value, err = ch.Get(context.Background(), "ttlkey1")
	assert.NoError(t, err)
	assert.Equal(t, "value1", value)

	time.Sleep(10 * time.Second)

	// get value with ttl, it should not be present
	value, err = ch.Get(context.Background(), "ttlkey1")
	assert.Equal(t, cache.ErrNotFound, err)
	assert.Error(t, err)
	assert.Nil(t, value)
}

func TestCache(t *testing.T) {
	// create cache
	ch := cache.New[interface{}]()
	testCache(ch, t)
}

func TestCacheGetAll(t *testing.T) {
	// create cache
	ch := cache.New[interface{}]()

	// set value
	err := ch.Set(context.Background(), "key1", "value1")
	require.NoError(t, err)

	// set value
	err = ch.Set(context.Background(), "key2", "value2")
	require.NoError(t, err)

	// set value
	err = ch.Set(context.Background(), "key3", "value3")
	require.NoError(t, err)

	// get all values
	values, err := ch.GetAll(context.Background(), nil)
	assert.NoError(t, err)
	assert.Equal(t, 3, len(values))

	// get all values with selectFunc
	values, err = ch.GetAll(context.Background(), func(key string) bool {
		return key == "key1"
	})

	assert.NoError(t, err)
	assert.Equal(t, 1, len(values))
}

func TestCacheClose(t *testing.T) {
	ch := cache.New[interface{}]()
	err := ch.Close()
	assert.NoError(t, err)

	// verify that double closing does not panic
	err = ch.Close()
	assert.NoError(t, err)
}

func TestUpdateTTL(t *testing.T) {
	ctx := context.Background()

	t.Run("expired key returns ErrNotFound and is not refreshed", func(t *testing.T) {
		ch := cache.New[string]()

		t.Cleanup(func() { _ = ch.Close() })

		require.NoError(t, ch.SetWithTTL(ctx, "k", "v", 20*time.Millisecond))
		time.Sleep(40 * time.Millisecond)

		_, err := ch.Get(ctx, "k")
		assert.ErrorIs(t, err, cache.ErrNotFound)

		err = ch.UpdateTTL(ctx, "k", 5*time.Second)
		assert.ErrorIs(t, err, cache.ErrNotFound)

		_, err = ch.Get(ctx, "k")
		assert.ErrorIs(t, err, cache.ErrNotFound)
	})

	t.Run("missing key returns ErrNotFound", func(t *testing.T) {
		ch := cache.New[string]()

		t.Cleanup(func() { _ = ch.Close() })

		err := ch.UpdateTTL(ctx, "missing", time.Second)
		assert.ErrorIs(t, err, cache.ErrNotFound)
	})

	t.Run("live key TTL is extended", func(t *testing.T) {
		ch := cache.New[string]()

		t.Cleanup(func() { _ = ch.Close() })

		require.NoError(t, ch.SetWithTTL(ctx, "k", "v", 80*time.Millisecond))
		require.NoError(t, ch.UpdateTTL(ctx, "k", 2*time.Second))

		time.Sleep(150 * time.Millisecond)

		value, err := ch.Get(ctx, "k")
		assert.NoError(t, err)
		assert.Equal(t, "v", value)
	})

	t.Run("zero TTL clears expiry like SetWithTTL", func(t *testing.T) {
		ch := cache.New[string]()

		t.Cleanup(func() { _ = ch.Close() })

		require.NoError(t, ch.SetWithTTL(ctx, "k", "v", 50*time.Millisecond))
		require.NoError(t, ch.UpdateTTL(ctx, "k", 0))

		time.Sleep(80 * time.Millisecond)

		value, err := ch.Get(ctx, "k")
		assert.NoError(t, err)
		assert.Equal(t, "v", value)
	})
}
