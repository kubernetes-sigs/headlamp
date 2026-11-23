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
