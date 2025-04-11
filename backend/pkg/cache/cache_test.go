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
