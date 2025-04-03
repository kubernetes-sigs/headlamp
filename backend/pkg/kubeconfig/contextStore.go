package kubeconfig

import (
	"context"
	"encoding/json"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
)

// ContextStore is an interface for storing and retrieving contexts.
type ContextStore interface {
	AddContext(headlampContext *Context) error
	GetContexts() ([]*Context, error)
	GetContext(name string) (*Context, error)
	RemoveContext(name string) error
	AddContextWithKeyAndTTL(headlampContext *Context, key string, ttl time.Duration) error
	UpdateTTL(key string, ttl time.Duration) error
}

type contextStore struct {
	cache cache.Cache[*Context]
}

// NewContextStore creates a new ContextStore.
func NewContextStore() ContextStore {
	cache := cache.New[*Context]()

	return &contextStore{
		cache: cache,
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

	return c.cache.Set(context.Background(), name, headlampContext)
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
	return c.cache.Delete(context.Background(), name)
}

// AddContextWithTTL adds a context to the store with a ttl.
func (c *contextStore) AddContextWithKeyAndTTL(headlampContext *Context, key string, ttl time.Duration) error {
	return c.cache.SetWithTTL(context.Background(), key, headlampContext, ttl)
}

// UpdateTTL updates the ttl of a context.
func (c *contextStore) UpdateTTL(key string, ttl time.Duration) error {
	return c.cache.UpdateTTL(context.Background(), key, ttl)
}
