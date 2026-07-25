package kubeconfig

import (
	"context"
	"encoding/json"
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
	GetContexts() ([]*Context, error)
	GetContext(name string) (*Context, error)
	RemoveContext(name string) error
	AddContextWithKeyAndTTL(headlampContext *Context, key string, ttl time.Duration) error
	UpdateTTL(key string, ttl time.Duration) error
	AddListener(listener ContextChangeListener)
	GetContextKeys() ([]string, error)
}

type contextStore struct {
	cache     cache.Cache[*Context]
	listeners []ContextChangeListener
	mu        sync.RWMutex
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
	name := headlampContext.Name

	if headlampContext.KubeContext != nil && headlampContext.KubeContext.Extensions["headlamp_info"] != nil {
		info := headlampContext.KubeContext.Extensions["headlamp_info"]
		// Convert the runtime.Unknown object to a byte slice
		unknownBytes, err := json.Marshal(info)
		if err != nil {
			return err
		}

		// Now, decode the byte slice into your desired struct
		var customObj CustomObject

		err = json.Unmarshal(unknownBytes, &customObj)
		if err != nil {
			return err
		}

		// If the custom name is set, use it as the context name
		if customObj.CustomName != "" {
			name = customObj.CustomName
		}
	}

	// Keep the stored context identifier consistent with the cache key.
	headlampContext.Name = name

	err := c.cache.Set(context.Background(), name, headlampContext)
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

	for _, ctx := range contextMap {
		contexts = append(contexts, ctx)
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
	err := c.cache.Delete(context.Background(), name)
	if err == nil {
		c.notifyListeners()
	}

	return err
}

// AddContextWithKeyAndTTL adds a context to the store with a ttl.
func (c *contextStore) AddContextWithKeyAndTTL(headlampContext *Context, key string, ttl time.Duration) error {
	// Keep the stored context identifier consistent with the cache key.
	headlampContext.Name = key

	err := c.cache.SetWithTTL(context.Background(), key, headlampContext, ttl)
	if err == nil {
		c.notifyListeners()
	}

	return err
}

// UpdateTTL updates the ttl of a context.
func (c *contextStore) UpdateTTL(key string, ttl time.Duration) error {
	return c.cache.UpdateTTL(context.Background(), key, ttl)
}
