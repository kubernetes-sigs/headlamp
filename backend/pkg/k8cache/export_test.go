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

package k8cache

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	authorizationv1 "k8s.io/api/authorization/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes"
)

var defaultClientsetCache = NewClientsetCache()

func ExpireSSARForTesting() {
	defaultClientsetCache.ssarMu.Lock()
	for _, entry := range defaultClientsetCache.ssarCache {
		entry.expiresAt = time.Now().Add(-ssarTTL)
	}
	defaultClientsetCache.ssarMu.Unlock()
}

func GetClientSetForTesting(
	headlampContextKey string,
	k *kubeconfig.Context,
	token string,
) (*kubernetes.Clientset, error) {
	return defaultClientsetCache.GetClientSet(headlampContextKey, k, token)
}

func IsAllowedForTesting(headlampContextKey string, k *kubeconfig.Context, r *http.Request) (bool, error) {
	return defaultClientsetCache.IsAllowed(headlampContextKey, k, r)
}

func requestSSAR(
	ctx context.Context,
	key string,
	k *kubeconfig.Context,
	token string,
	attrs *authorizationv1.ResourceAttributes,
) (bool, error) {
	return defaultClientsetCache.requestSSAR(ctx, key, k, token, attrs)
}

func acquireSSARRequest(key string) (bool, bool, *ssarInFlightEntry, bool) {
	return defaultClientsetCache.acquireSSARRequest(key)
}

func startSSARRequest(
	parent context.Context,
	key string,
	entry *ssarInFlightEntry,
	timeout time.Duration,
	request func(context.Context) (bool, error),
) {
	go func() {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(parent), timeout)
		defer cancel()

		requestDone := make(chan struct{})

		go func() {
			allowed, err := request(ctx)
			defaultClientsetCache.finishSSARRequest(key, entry, allowed, err)
			close(requestDone)
		}()

		select {
		case <-requestDone:
		case <-ctx.Done():
			defaultClientsetCache.timeoutSSARRequest(entry, ctx.Err())
		}
	}()
}

func finishSSARRequest(key string, entry *ssarInFlightEntry, allowed bool, err error) {
	defaultClientsetCache.finishSSARRequest(key, entry, allowed, err)
}

func getSSARCacheResult(key string) (bool, bool) {
	return defaultClientsetCache.getSSARCacheResult(key)
}

func storeSSARCacheResult(key string, allowed bool) {
	defaultClientsetCache.storeSSARCacheResult(key, allowed)
}

func evictSSARCacheForPrefix(prefix string) {
	defaultClientsetCache.evictSSARCacheForPrefix(prefix)
}

func evictExpiredSSARResults(now time.Time) {
	defaultClientsetCache.evictExpiredSSARResults(now)
}

// ExportedRedactContextKey exposes redactContextKey for testing.
func ExportedRedactContextKey(key string) string {
	return redactContextKey(key)
}

// ExportedRedactCacheKey exposes redactCacheKey for testing.
func ExportedRedactCacheKey(key string) string {
	return redactCacheKey(key)
}

// ExportedEncodeResponse exposes encodeResponse for testing.
func ExportedEncodeResponse(r *ResponseCapture) (string, error) {
	return encodeResponse(r, 0)
}

// ExportedInvalidateCacheKeysForResourceEvent exposes invalidateCacheKeysForResourceEvent for testing.
func ExportedInvalidateCacheKeysForResourceEvent(
	gvr schema.GroupVersionResource,
	namespace, name, contextKey string,
	k8scache cache.Cache[string],
) {
	invalidateCacheKeysForResourceEvent(gvr, namespace, name, contextKey, k8scache)
}

// ExportedCacheKeyBelongsToContext exposes cacheKeyBelongsToContext for testing.
func ExportedCacheKeyBelongsToContext(key, contextKey string) bool {
	return cacheKeyBelongsToContext(key, contextKey)
}

// WithInFlightWaitHook sets a wait hook invoked when a waiter begins blocking on in-flight creation for testing.
func WithInFlightWaitHook(hook func()) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.inFlightWaitHook = hook
	}
}

// WithJanitorLoopHook sets an unexported testing hook invoked on each janitor tick for testing.
func WithJanitorLoopHook(hook func()) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.janitorLoopHook = hook
	}
}

func WithPruneShardHook(hook func(int)) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.pruneShardHook = hook
	}
}

func WithRegistrationHook(hook func()) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.registrationHook = hook
	}
}

// WithJanitorStopHook sets an unexported testing hook invoked inside Stop() while holding janitorMu.
func WithJanitorStopHook(hook func()) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.janitorStopHook = hook
	}
}

// SetJanitorStopHook allows setting or overriding the janitor stop hook for testing.
func (c *ClientsetCache) SetJanitorStopHook(hook func()) {
	if c == nil {
		return
	}

	c.janitorMu.Lock()
	defer c.janitorMu.Unlock()

	c.janitorStopHook = hook
}

// WithJanitorStartHook sets an unexported testing hook invoked inside Start() before acquiring janitorMu.
func WithJanitorStartHook(hook func()) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.janitorStartHook = hook
	}
}

// SetJanitorStartHook allows setting or overriding the janitor start hook for testing.
func (c *ClientsetCache) SetJanitorStartHook(hook func()) {
	if c == nil {
		return
	}

	c.janitorMu.Lock()
	defer c.janitorMu.Unlock()

	c.janitorStartHook = hook
}

// JanitorDone returns the done channel of the current janitor goroutine for testing.
func (c *ClientsetCache) JanitorDone() <-chan struct{} {
	if c == nil {
		return nil
	}

	c.janitorMu.Lock()
	defer c.janitorMu.Unlock()

	return c.janitorDone
}

// SetClientsetCreator allows setting or overriding the clientset creator on an existing cache instance for testing.
func (c *ClientsetCache) SetClientsetCreator(creator ClientsetCreatorFunc) {
	if c == nil {
		return
	}

	c.creator = creator
}

// SetInFlightWaitHook allows setting or overriding the in-flight wait hook on an existing cache instance for testing.
func (c *ClientsetCache) SetInFlightWaitHook(hook func()) {
	if c == nil {
		return
	}

	c.inFlightWaitHook = hook
}

func (c *ClientsetCache) ShardForPrefixForTesting(prefix string) int {
	return int(hashPrefix(prefix) % numShards)
}

func (c *ClientsetCache) ShardCountForTesting() int {
	return numShards
}

func (c *ClientsetCache) LockShardForTesting(index int) {
	c.shards[index].mu.Lock()
}

func (c *ClientsetCache) UnlockShardForTesting(index int) {
	c.shards[index].mu.Unlock()
}

// SeedClientset inserts a clientset directly into the appropriate shard for testing.
func (c *ClientsetCache) SeedClientset(key string, lastUsed time.Time, cs ...*kubernetes.Clientset) {
	prefix := clientsetCachePrefixFromCacheKey(key)
	shard := c.shardForPrefix(prefix)

	shard.mu.Lock()
	defer shard.mu.Unlock()

	var client *kubernetes.Clientset
	if len(cs) > 0 && cs[0] != nil {
		client = cs[0]
	} else {
		client = &kubernetes.Clientset{}
	}

	_, existed := shard.clientsets[key]
	shard.clientsets[key] = &CachedClientSet{
		clientset:      client,
		lastUsed:       lastUsed,
		accessSequence: c.accessSequence.Add(1),
	}

	if !existed {
		c.cachedCount.Add(1)
	}
}

// SeedBlockedPrefix marks a prefix as blocked at blockedAt for testing.
func (c *ClientsetCache) SeedBlockedPrefix(prefix string, blockedAt time.Time) {
	c.blockedMu.Lock()
	defer c.blockedMu.Unlock()

	c.blockedClientsetPrefixes[prefix] = blockedPrefixEntry{blockedAt: blockedAt}
}

// SeedInFlight registers an in-flight entry for testing.
func (c *ClientsetCache) SeedInFlight(cacheKey string) chan struct{} {
	prefix := clientsetCachePrefixFromCacheKey(cacheKey)
	shard := c.shardForPrefix(prefix)

	shard.mu.Lock()
	defer shard.mu.Unlock()

	waitCh := make(chan struct{})
	shard.inFlight[cacheKey] = &inFlightEntry{
		waitCh: waitCh,
	}

	return waitCh
}

func (c *ClientsetCache) StoreSSARForTesting(key string, allowed bool) {
	c.storeSSARCacheResult(key, allowed)
}

func (c *ClientsetCache) GetSSARForTesting(key string) (bool, bool) {
	return c.getSSARCacheResult(key)
}

func SetMaxClientsetsForTesting(limit int) func() {
	previous := defaultMaxClientsets.Load()
	explicit := maxClientsetsExplicit.Load()

	defaultMaxClientsets.Store(int64(limit))
	maxClientsetsExplicit.Store(true)
	defaultClientsetCache.SetMaxClientsets(limit)

	return func() {
		defaultMaxClientsets.Store(previous)
		maxClientsetsExplicit.Store(explicit)
		defaultClientsetCache.maxClientsets.Store(previous)
	}
}

func SetMaxClientsetsForTestingGlobal(limit int) error {
	if limit <= 0 {
		return fmt.Errorf("max clientsets must be greater than 0")
	}

	defaultMaxClientsets.Store(int64(limit))
	maxClientsetsExplicit.Store(true)
	defaultClientsetCache.SetMaxClientsets(limit)

	return nil
}

func MaxClientsetsForTesting() int {
	return getMaxClientsetsLimit()
}

func ResetInFlight() {
	defaultClientsetCache = NewClientsetCache()
}

func ResetClientsetCache() {
	defaultClientsetCache = NewClientsetCache()

	defaultMaxClientsets.Store(0)
	maxClientsetsExplicit.Store(false)
}

func ClientsetCacheLen() int {
	return defaultClientsetCache.Len()
}

func SeedClientsetCacheWithClientset(key string, cs *kubernetes.Clientset, lastUsed time.Time) {
	defaultClientsetCache.SeedClientset(key, lastUsed, cs)
}

func SeedClientsetCache(key string, lastUsed time.Time) {
	defaultClientsetCache.SeedClientset(key, lastUsed)
}

func SeedInFlightClientsetKey(cacheKey string) {
	defaultClientsetCache.SeedInFlight(cacheKey)
}

func FinishInFlightClientsetForTesting(
	cacheKey string,
	cs *kubernetes.Clientset,
	err error,
) {
	prefix := clientsetCachePrefixFromCacheKey(cacheKey)
	shard := defaultClientsetCache.shardForPrefix(prefix)
	shard.mu.Lock()
	entry := shard.inFlight[cacheKey]
	shard.mu.Unlock()

	_, _ = defaultClientsetCache.finishInFlight(shard, cacheKey, prefix, entry, cs, err, clientsetTTL)
}

func GetCachedClientsetForTesting(headlampContextKey, token string) *kubernetes.Clientset {
	suffix := "\x00" + token
	prefix := headlampContextKey + "\x00"

	for i := range defaultClientsetCache.shards {
		shard := &defaultClientsetCache.shards[i]
		shard.mu.Lock()
		for key, cached := range shard.clientsets {
			if strings.HasPrefix(key, prefix) && strings.HasSuffix(key, suffix) {
				shard.mu.Unlock()
				return cached.clientset
			}
		}
		shard.mu.Unlock()
	}

	return nil
}

func SetClientsetCreator(creator ClientsetCreatorFunc) func() {
	previous := defaultClientsetCache.creator
	defaultClientsetCache.creator = creator

	return func() {
		defaultClientsetCache.creator = previous
	}
}

func SetTestingBeforeFinishInFlight(hook func(string)) func() {
	previous := defaultClientsetCache.beforeFinishHook
	defaultClientsetCache.beforeFinishHook = hook

	return func() {
		defaultClientsetCache.beforeFinishHook = previous
	}
}

func HasCachedClientset(headlampContextKey, token string) bool {
	return defaultClientsetCache.hasCachedClientset(headlampContextKey, token)
}

func (c *ClientsetCache) hasCachedClientset(headlampContextKey, token string) bool {
	suffix := "\x00" + token
	prefix := headlampContextKey + "\x00"

	for i := range c.shards {
		shard := &c.shards[i]
		shard.mu.Lock()

		for key := range shard.clientsets {
			if strings.HasPrefix(key, prefix) && strings.HasSuffix(key, suffix) {
				shard.mu.Unlock()

				return true
			}
		}

		shard.mu.Unlock()
	}

	return false
}
