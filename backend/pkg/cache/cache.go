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
	"errors"
	"sync"
	"time"
)

// Cache is an interface for a cache
// that can be used to store and retrieve values.
type Cache[T any] interface {
	Set(ctx context.Context, key string, value T) error
	SetWithTTL(ctx context.Context, key string, value T, ttl time.Duration) error
	Delete(ctx context.Context, key string) error
	Get(ctx context.Context, key string) (T, error)
	GetAll(ctx context.Context, selectFunc Matcher) (map[string]T, error)
	UpdateTTL(ctx context.Context, key string, ttl time.Duration) error
}

// Matcher is a function that returns true if the key matches.
type Matcher func(key string) bool

var (
	ErrNotFound     = errors.New("key not found")
	cleanUpInterval = 10 * time.Second
)

type cacheValue[T any] struct {
	value     T
	expiresAt time.Time
}
type cache[T any] struct {
	store           map[string]cacheValue[T]
	lock            sync.RWMutex
	cleanUpInterval time.Duration
}

// New creates a new cache.
func New[T any]() Cache[T] {
	cache := &cache[T]{
		store:           make(map[string]cacheValue[T]),
		cleanUpInterval: cleanUpInterval,
	}

	go cache.cleanUp()

	return cache
}

// Set stores a value in the cache.
func (c *cache[T]) Set(ctx context.Context, key string, value T) error {
	return c.SetWithTTL(ctx, key, value, 0)
}

// SetWithTTL stores a value in the cache with a TTL.
func (c *cache[T]) SetWithTTL(ctx context.Context, key string, value T, ttl time.Duration) error {
	c.lock.Lock()
	defer c.lock.Unlock()

	expiresAt := time.Time{}
	if ttl != 0 {
		expiresAt = time.Now().Add(ttl)
	}

	c.store[key] = cacheValue[T]{
		value:     value,
		expiresAt: expiresAt,
	}

	return nil
}

// Delete removes a value from the cache.
func (c *cache[T]) Delete(ctx context.Context, key string) error {
	c.lock.Lock()
	defer c.lock.Unlock()

	delete(c.store, key)

	return nil
}

// Get retrieves a value from the cache.
func (c *cache[T]) Get(ctx context.Context, key string) (T, error) {
	c.lock.RLock()
	defer c.lock.RUnlock()

	value, ok := c.store[key]
	if !ok {
		return *new(T), ErrNotFound
	}

	if value.expiresAt.IsZero() || value.expiresAt.After(time.Now()) {
		return value.value, nil
	}

	return *new(T), ErrNotFound
}

// GetAll retrieves all values from the cache.
func (c *cache[T]) GetAll(ctx context.Context, selectFunc Matcher) (map[string]T, error) {
	c.lock.RLock()
	defer c.lock.RUnlock()

	values := make(map[string]T)

	for key, value := range c.store {
		if selectFunc != nil && !selectFunc(key) {
			continue
		}

		if (value.expiresAt.IsZero()) || (!value.expiresAt.IsZero() && value.expiresAt.After(time.Now())) {
			values[key] = value.value
		}
	}

	return values, nil
}

// cleanUp removes expired values from the cache.
func (c *cache[T]) cleanUp() {
	ticker := time.NewTicker(c.cleanUpInterval)
	defer ticker.Stop()

	for {
		<-ticker.C

		c.lock.Lock()
		for key, value := range c.store {
			if !value.expiresAt.IsZero() && value.expiresAt.Before(time.Now()) {
				delete(c.store, key)
			}
		}
		c.lock.Unlock()
	}
}

// UpdateTTL updates the TTL of a value in the cache.
func (c *cache[T]) UpdateTTL(ctx context.Context, key string, ttl time.Duration) error {
	c.lock.Lock()
	defer c.lock.Unlock()

	value, ok := c.store[key]
	if !ok {
		return ErrNotFound
	}

	if value.expiresAt.IsZero() || value.expiresAt.After(time.Now()) {
		value.expiresAt = time.Now().Add(ttl)
		c.store[key] = value
	}

	return nil
}
