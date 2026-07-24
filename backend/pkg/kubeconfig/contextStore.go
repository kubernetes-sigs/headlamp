package kubeconfig

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	if headlampContext == nil {
		return errors.New("context cannot be nil")
	}

	name, _, err := effectiveContextName(headlampContext)
	if err != nil {
		return err
	}

	c.mu.Lock()

	existingContext, err := c.cache.Get(context.Background(), name)

	_, _, existingNameErr := effectiveContextName(existingContext)
	if existingNameErr != nil {
		c.mu.Unlock()

		return existingNameErr
	}

	if err == nil && !isSameLogicalContext(existingContext, headlampContext) {
		c.mu.Unlock()

		return ContextError{
			ContextName: name,
			Reason:      "duplicate effective context name",
		}
	}

	if err != nil && err != cache.ErrNotFound {
		c.mu.Unlock()

		return err
	}

	// Keep the stored context identifier consistent with the cache key.
	headlampContext.Name = name

	err = c.cache.Set(context.Background(), name, headlampContext)
	c.mu.Unlock()

	if err != nil {
		return err
	}

	c.notifyListeners()

	return err
}

func effectiveContextName(headlampContext *Context) (string, bool, error) {
	if headlampContext == nil {
		return "", false, nil
	}

	name := headlampContext.Name

	if headlampContext.KubeContext == nil || headlampContext.KubeContext.Extensions["headlamp_info"] == nil {
		return name, false, nil
	}

	info := headlampContext.KubeContext.Extensions["headlamp_info"]

	if typedInfo, ok := info.(*CustomObject); ok {
		if typedInfo != nil && typedInfo.CustomName != "" {
			return typedInfo.CustomName, true, nil
		}

		return name, false, nil
	}

	unknownBytes, err := json.Marshal(info)
	if err != nil {
		return "", false, err
	}

	var customObj CustomObject

	if err := json.Unmarshal(unknownBytes, &customObj); err != nil {
		return "", false, err
	}

	if customObj.CustomName != "" {
		name = customObj.CustomName

		return name, true, nil
	}

	return name, false, nil
}

func isSameLogicalContext(existingContext, newContext *Context) bool {
	if existingContext == nil || newContext == nil {
		return existingContext == newContext
	}

	if existingContext.ClusterID != "" && newContext.ClusterID != "" && existingContext.ClusterID == newContext.ClusterID {
		return true
	}

	return fallbackContextIdentity(existingContext) == fallbackContextIdentity(newContext)
}

func fallbackContextIdentity(headlampContext *Context) string {
	clusterServer := ""
	if headlampContext.Cluster != nil {
		clusterServer = headlampContext.Cluster.Server
	}

	kubeCluster := ""
	kubeAuthInfo := ""
	kubeNamespace := ""

	if headlampContext.KubeContext != nil {
		kubeCluster = headlampContext.KubeContext.Cluster
		kubeAuthInfo = headlampContext.KubeContext.AuthInfo
		kubeNamespace = headlampContext.KubeContext.Namespace
	}

	return fmt.Sprintf(
		"fallback:%d|%s|%s|%s|%s|%s",
		headlampContext.Source,
		headlampContext.KubeConfigPath,
		clusterServer,
		kubeCluster,
		kubeAuthInfo,
		kubeNamespace,
	)
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
	c.mu.Lock()

	err := c.cache.Delete(context.Background(), name)
	c.mu.Unlock()

	if err != nil {
		return err
	}

	c.notifyListeners()

	return err
}

// AddContextWithKeyAndTTL adds a context to the store with a ttl.
func (c *contextStore) AddContextWithKeyAndTTL(headlampContext *Context, key string, ttl time.Duration) error {
	if headlampContext == nil {
		return errors.New("context cannot be nil")
	}

	// Keep the stored context identifier consistent with the cache key.
	headlampContext.Name = key

	c.mu.Lock()

	err := c.cache.SetWithTTL(context.Background(), key, headlampContext, ttl)
	c.mu.Unlock()

	if err != nil {
		return err
	}

	c.notifyListeners()

	return err
}

// UpdateTTL updates the ttl of a context.
func (c *contextStore) UpdateTTL(key string, ttl time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.cache.UpdateTTL(context.Background(), key, ttl)
}
