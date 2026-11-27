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

package kubeconfig

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"sync"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

// ContextChangeListener is a function that is called when contexts change.
type ContextChangeListener func()

// ContextStore is an interface for storing and retrieving contexts.
type ContextStore interface {
	AddContext(headlampContext *Context) error
	UpdateContextIfCurrent(expected, updated *Context) error
	GetContexts() ([]*Context, error)
	GetContext(name string) (*Context, error)
	RemoveContext(name string) error
	AddContextWithKeyAndTTL(headlampContext *Context, key string, ttl time.Duration) error
	UpdateTTL(key string, ttl time.Duration) error
	AddListener(listener ContextChangeListener)
	GetContextKeys() ([]string, error)
	// ReplaceContext stores newContext under name, or removes the context stored
	// under name if newContext is nil, but only if the context stored under name
	// is still old, or there is none if old is nil. It reports whether it did.
	ReplaceContext(name string, old, newContext *Context) (bool, error)
}

type contextStore struct {
	cache     cache.Cache[*Context]
	listeners []ContextChangeListener
	mu        sync.RWMutex
	// writeMu serializes changes to the stored contexts, so that ReplaceContext
	// checks and changes them atomically.
	writeMu sync.Mutex
}

// NewContextStore creates a new ContextStore.
func NewContextStore() ContextStore {
	c := cache.New[*Context]()

	cs := &contextStore{
		cache: c,
	}

	c.SetOnEvicted(func(key string, value *Context) {
		cs.notifyListeners()
	})

	return cs
}

func (c *contextStore) AddListener(listener ContextChangeListener) {
	if listener == nil {
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	c.listeners = append(c.listeners, listener)
}

func (c *contextStore) notifyListeners() {
	c.mu.RLock()
	listeners := make([]ContextChangeListener, len(c.listeners))
	copy(listeners, c.listeners)
	c.mu.RUnlock()

	for _, listener := range listeners {
		func() {
			defer func() {
				if r := recover(); r != nil {
					logger.Log(logger.LevelError, nil, r, "contextStore: ContextChangeListener panicked")
				}
			}()

			listener()
		}()
	}
}

// AddContext adds a context to the store.
func (c *contextStore) AddContext(headlampContext *Context) error {
	name, err := storeName(headlampContext)
	if err != nil {
		return err
	}

	// Keep the stored context identifier consistent with the cache key.
	headlampContext.Name = name

	c.writeMu.Lock()
	err = c.cache.Set(context.Background(), name, headlampContext)
	c.writeMu.Unlock()

	if err == nil {
		c.notifyListeners()
	}

	return err
}

// storeName returns the name AddContext stores the context under: the custom
// name set in its headlamp_info extension, if any, or else its name.
func storeName(headlampContext *Context) (string, error) {
	name := headlampContext.Name

	if headlampContext.KubeContext != nil && headlampContext.KubeContext.Extensions["headlamp_info"] != nil {
		info := headlampContext.KubeContext.Extensions["headlamp_info"]
		// Convert the runtime.Unknown object to a byte slice
		unknownBytes, err := json.Marshal(info)
		if err != nil {
			return "", err
		}

		// Now, decode the byte slice into your desired struct
		var customObj CustomObject

		err = json.Unmarshal(unknownBytes, &customObj)
		if err != nil {
			return "", err
		}

		// If the custom name is set, use it as the context name
		if customObj.CustomName != "" {
			name = customObj.CustomName
		}
	}

	return name, nil
}

// UpdateContextIfCurrent cannot recreate an entry removed or replaced during a save.
func (c *contextStore) UpdateContextIfCurrent(expected, updated *Context) error {
	err := c.cache.UpdateIf(context.Background(), expected.Name, updated, func(current *Context) bool {
		return current == expected
	})
	if err == nil {
		c.notifyListeners()
	}

	return err
}

// GetContexts returns all contexts in the store.
func (c *contextStore) GetContexts() ([]*Context, error) {
	contexts := []*Context{}

	contextMap, err := c.cache.GetAll(context.Background(), nil)
	if err != nil {
		return nil, err
	}

	keys := make([]string, 0, len(contextMap))
	for key := range contextMap {
		keys = append(keys, key)
	}

	slices.Sort(keys)

	for _, key := range keys {
		contexts = append(contexts, contextMap[key])
	}

	return contexts, nil
}

// GetContextKeys returns all context keys in the store.
func (c *contextStore) GetContextKeys() ([]string, error) {
	var keys []string

	contextMap, err := c.cache.GetAll(context.Background(), nil)
	if err != nil {
		return nil, err
	}

	for key := range contextMap {
		keys = append(keys, key)
	}

	slices.Sort(keys)

	return keys, nil
}

// GetContext returns a context from the store.
func (c *contextStore) GetContext(name string) (*Context, error) {
	context, err := c.cache.Get(context.Background(), name)
	if err != nil {
		return nil, err
	}

	return context, nil
}

// RemoveContext removes a context from the store.
func (c *contextStore) RemoveContext(name string) error {
	c.writeMu.Lock()
	err := c.cache.Delete(context.Background(), name)
	c.writeMu.Unlock()

	if err == nil {
		c.notifyListeners()
	}

	return err
}

// AddContextWithKeyAndTTL adds a context to the store with a ttl.
func (c *contextStore) AddContextWithKeyAndTTL(headlampContext *Context, key string, ttl time.Duration) error {
	// Keep the stored context identifier consistent with the cache key.
	headlampContext.Name = key

	c.writeMu.Lock()
	err := c.cache.SetWithTTL(context.Background(), key, headlampContext, ttl)
	c.writeMu.Unlock()

	if err == nil {
		c.notifyListeners()
	}

	return err
}

// ReplaceContext stores newContext under name, or removes the context stored
// under name if newContext is nil, but only if the context stored under name is
// still old, or there is none if old is nil. It reports whether it did.
func (c *contextStore) ReplaceContext(name string, old, newContext *Context) (bool, error) {
	c.writeMu.Lock()

	current, err := c.cache.Get(context.Background(), name)
	if errors.Is(err, cache.ErrNotFound) {
		current, err = nil, nil
	}

	if err == nil && current != old {
		c.writeMu.Unlock()

		return false, nil
	}

	if err == nil {
		if newContext == nil {
			err = c.cache.Delete(context.Background(), name)
		} else {
			// Keep the stored context identifier consistent with the cache key.
			newContext.Name = name
			err = c.cache.Set(context.Background(), name, newContext)
		}
	}

	c.writeMu.Unlock()

	if err != nil {
		return false, err
	}

	c.notifyListeners()

	return true, nil
}

// UpdateTTL updates the ttl of a context.
func (c *contextStore) UpdateTTL(key string, ttl time.Duration) error {
	return c.cache.UpdateTTL(context.Background(), key, ttl)
}
