package cache

import (
	"context"
	"testing"
	"time"
)

func TestCacheEvictionPanicRecovery(t *testing.T) {
	c := &cache[string]{
		store:           make(map[string]cacheValue[string]),
		cleanUpInterval: 10 * time.Millisecond,
		stop:            make(chan struct{}),
	}
	defer close(c.stop)

	go c.cleanUp()

	calledFirstTime := make(chan struct{})

	c.SetOnEvicted(func(key string, value string) {
		close(calledFirstTime)
		panic("simulated eviction callback panic")
	})

	_ = c.SetWithTTL(context.Background(), "panic-key", "val", 5*time.Millisecond)

	select {
	case <-calledFirstTime:
		// Success! The callback panicked and was successfully recovered.
	case <-time.After(500 * time.Millisecond):
		t.Fatal("onEvicted callback should have been called")
	}

	// Set another key to verify that the cache cleanup goroutine is still alive and functioning.
	calledSecondTime := make(chan struct{})

	c.SetOnEvicted(func(key string, value string) {
		close(calledSecondTime)
	})

	_ = c.SetWithTTL(context.Background(), "normal-key", "val2", 5*time.Millisecond)

	select {
	case <-calledSecondTime:
		// Success! The goroutine survived the panic and processed the second eviction.
	case <-time.After(500 * time.Millisecond):
		t.Fatal("cleanup goroutine died or stopped processing evictions after panic")
	}
}
