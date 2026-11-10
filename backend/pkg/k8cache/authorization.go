// Copyright 2025 The Kubernetes Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Package k8cache provides caching utilities for Kubernetes API responses.
// It includes middleware for intercepting cluster API requests, generating
// unique cache keys, storing and retrieving responses, and invalidating
// entries when resources change. The package aims to reduce redundant
// API calls, improve performance, and handle authorization gracefully
// while maintaining consistency across multiple Kubernetes contexts.
package k8cache

import (
	"container/list"
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"k8s.io/apimachinery/pkg/fields"

	authorizationv1 "k8s.io/api/authorization/v1"
	"k8s.io/client-go/kubernetes"
)

// clientsetTTL is how long an idle clientset stays in the cache before
// it becomes eligible for eviction.
const clientsetTTL = 10 * time.Minute

const unknownVerb = "unknown"

// janitorInterval is how often the background goroutine sweeps the
// cache for expired entries.
const janitorInterval = 5 * time.Minute

const numShards = 32

const (
	DefaultMaxClientsets = 256
	ssarTTL              = 30 * time.Second
	ssarRequestTimeout   = 30 * time.Second
	ssarCacheMaxEntries  = 1024
	ssarMaxInFlight      = 64
)

var errSSARWorkersAtCapacity = errors.New("SSAR worker capacity reached")

type CachedClientSet struct {
	clientset      *kubernetes.Clientset
	lastUsed       time.Time
	accessSequence uint64
}

type inFlightEntry struct {
	waitCh chan struct{}
	cs     *kubernetes.Clientset
	err    error
	// cachePrevented preserves a removal barrier observed at registration even if
	// the barrier expires before clientset creation completes.
	cachePrevented bool
}

type blockedPrefixEntry struct {
	blockedAt time.Time
}

type ssarCacheEntry struct {
	allowed      bool
	expiresAt    time.Time
	orderElement *list.Element
}

type ssarInFlightEntry struct {
	waitCh       chan struct{}
	allowed      bool
	err          error
	completed    bool
	workerActive bool
}

var (
	defaultMaxClientsets  = atomic.Int64{}
	maxClientsetsExplicit atomic.Bool
)

type clientsetCacheShard struct {
	mu         sync.Mutex
	clientsets map[string]*CachedClientSet
	inFlight   map[string]*inFlightEntry
}

// ClientsetCreatorFunc creates a Kubernetes clientset for a given context and token.
type ClientsetCreatorFunc func(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error)

// ClientsetCacheOption configures a ClientsetCache.
type ClientsetCacheOption func(*ClientsetCache)

// ClientsetCache is an instance-owned, sharded authorization clientset cache.
// It stores authenticated Kubernetes clientsets, coordinates in-flight creation de-duplication,
// tracks blocked prefixes during context removal, and manages an explicit janitor lifecycle.
type ClientsetCache struct {
	shards           [numShards]clientsetCacheShard
	ttl              time.Duration
	janitorInterval  time.Duration
	creator          ClientsetCreatorFunc
	inFlightWaitHook func()
	janitorLoopHook  func()
	janitorStopHook  func()
	janitorStartHook func()
	pruneShardHook   func(int)
	registrationHook func()
	beforeFinishHook func(string)

	blockedMu                sync.RWMutex
	blockedClientsetPrefixes map[string]blockedPrefixEntry
	registrationMu           sync.RWMutex
	capacityMu               sync.Mutex
	accessSequence           atomic.Uint64
	cachedCount              atomic.Int64
	maxClientsets            atomic.Int64
	ssarMu                   sync.RWMutex
	ssarCache                map[string]*ssarCacheEntry
	ssarCacheOrder           *list.List
	ssarInFlight             map[string]*ssarInFlightEntry
	ssarWorkerCount          int

	janitorMu      sync.Mutex
	janitorRunning bool
	stopCh         chan struct{}
	janitorDone    chan struct{}
	janitorWg      sync.WaitGroup
}

func getMaxClientsetsLimit() int {
	if maxClientsetsExplicit.Load() {
		return int(defaultMaxClientsets.Load())
	}

	if limitStr := os.Getenv("HEADLAMP_MAX_CLIENTSETS"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 {
			return limit
		}
	}

	return DefaultMaxClientsets
}

func SetMaxClientsets(limit int) error {
	if limit <= 0 {
		return fmt.Errorf("maximum clientsets must be greater than zero")
	}

	defaultMaxClientsets.Store(int64(limit))
	maxClientsetsExplicit.Store(true)

	return nil
}

func MaxClientsets() int {
	return getMaxClientsetsLimit()
}

func (c *ClientsetCache) SetMaxClientsets(limit int) {
	c.maxClientsets.Store(int64(limit))
	c.capacityMu.Lock()
	keys := c.evictLeastRecentlyUsedLocked(limit + 1)
	c.capacityMu.Unlock()
	logClientsetEvictions("capacity configuration", keys)
}

func (c *ClientsetCache) maxClientsetsLimit() int {
	if limit := c.maxClientsets.Load(); limit > 0 {
		return int(limit)
	}

	return DefaultMaxClientsets
}

func (c *ClientsetCache) MaxClientsetsForTesting() int {
	return c.maxClientsetsLimit()
}

func redactClientsetCacheKey(cacheKey string) string {
	if i := strings.LastIndex(cacheKey, "\x00"); i >= 0 {
		return redactContextKey(cacheKey[:i]) + "\x00[redacted]"
	}

	return redactContextKey(cacheKey)
}

func (c *ClientsetCache) evictLeastRecentlyUsedLocked(maxLimit int) []string {
	evicted := make([]string, 0)

	for {
		total := 0

		oldestKey := ""
		oldestShard := -1
		oldestSequence := uint64(0)
		foundOldest := false

		for i := range c.shards {
			shard := &c.shards[i]
			shard.mu.Lock()
			total += len(shard.clientsets)

			for key, cached := range shard.clientsets {
				if _, inFlight := shard.inFlight[key]; inFlight {
					continue
				}

				if !foundOldest || cached.accessSequence < oldestSequence {
					oldestKey = key
					oldestShard = i
					oldestSequence = cached.accessSequence
					foundOldest = true
				}
			}

			shard.mu.Unlock()
		}

		if total < maxLimit || oldestShard < 0 {
			return evicted
		}

		shard := &c.shards[oldestShard]
		shard.mu.Lock()

		current, found := shard.clientsets[oldestKey]

		deleted := found && current.accessSequence == oldestSequence
		if deleted {
			delete(shard.clientsets, oldestKey)
		}
		shard.mu.Unlock()

		if deleted {
			c.cachedCount.Add(-1)

			evicted = append(evicted, oldestKey)
		}
	}
}

func logClientsetEvictions(reason string, keys []string) {
	for _, key := range keys {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("telemetry: clientset cache eviction (%s) for key %s",
				reason, redactClientsetCacheKey(key)))
	}
}

// NewClientsetCache constructs an isolated ClientsetCache with default TTL, janitor interval,
// and clientset creation logic, optionally overridden by functional options.
func NewClientsetCache(opts ...ClientsetCacheOption) *ClientsetCache {
	c := &ClientsetCache{
		ttl:                      clientsetTTL,
		janitorInterval:          janitorInterval,
		blockedClientsetPrefixes: make(map[string]blockedPrefixEntry),
		creator: func(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
			return k.ClientSetWithToken(token)
		},
	}

	limit := DefaultMaxClientsets

	if value, ok := os.LookupEnv("HEADLAMP_MAX_CLIENTSETS"); ok {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	c.maxClientsets.Store(int64(limit))
	c.ssarCache = make(map[string]*ssarCacheEntry)
	c.ssarCacheOrder = list.New()
	c.ssarInFlight = make(map[string]*ssarInFlightEntry)

	for i := 0; i < numShards; i++ {
		c.shards[i].clientsets = make(map[string]*CachedClientSet)
		c.shards[i].inFlight = make(map[string]*inFlightEntry)
	}

	for _, opt := range opts {
		opt(c)
	}

	return c
}

// WithTTL sets a custom time-to-live for cached clientsets.
func WithTTL(ttl time.Duration) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.ttl = ttl
	}
}

// WithJanitorInterval sets a custom sweep interval for the background janitor.
func WithJanitorInterval(interval time.Duration) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.janitorInterval = interval
	}
}

// WithClientsetCreator sets a custom clientset creator function.
func WithClientsetCreator(creator ClientsetCreatorFunc) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.creator = creator
	}
}

func hashPrefix(prefix string) uint32 {
	var h uint32 = 2166136261
	for i := 0; i < len(prefix); i++ {
		h ^= uint32(prefix[i])
		h *= 16777619
	}

	return h
}

// shardForPrefix returns the shard responsible for the given context prefix.
func (c *ClientsetCache) shardForPrefix(prefix string) *clientsetCacheShard {
	idx := hashPrefix(prefix) % numShards
	return &c.shards[idx]
}

// clientsetCachePrefixFromCacheKey returns the connection revision prefix from a
// clientset cache key (everything before the final NUL separator).
func clientsetCachePrefixFromCacheKey(cacheKey string) string {
	if i := strings.LastIndex(cacheKey, "\x00"); i >= 0 {
		return cacheKey[:i]
	}

	return cacheKey
}

func (s *clientsetCacheShard) ensureInitializedLocked() {
	if s.clientsets == nil {
		s.clientsets = make(map[string]*CachedClientSet)
	}

	if s.inFlight == nil {
		s.inFlight = make(map[string]*inFlightEntry)
	}
}

func (s *clientsetCacheShard) hasActivityForPrefix(prefix string) bool {
	prefixWithNul := prefix + "\x00"

	for key := range s.clientsets {
		if strings.HasPrefix(key, prefixWithNul) {
			return true
		}
	}

	for key := range s.inFlight {
		if strings.HasPrefix(key, prefixWithNul) {
			return true
		}
	}

	return false
}

func (c *ClientsetCache) snapshotBlockedPrefixes() map[string]blockedPrefixEntry {
	c.blockedMu.RLock()
	defer c.blockedMu.RUnlock()

	blockedPrefixes := make(map[string]blockedPrefixEntry, len(c.blockedClientsetPrefixes))
	for prefix, entry := range c.blockedClientsetPrefixes {
		blockedPrefixes[prefix] = entry
	}

	return blockedPrefixes
}

func (c *ClientsetCache) pruneBlockedPrefixes(
	now time.Time,
	ttl time.Duration,
	blockedPrefixes map[string]blockedPrefixEntry,
) {
	c.registrationMu.Lock()
	defer c.registrationMu.Unlock()

	activePrefixes := make(map[string]struct{})

	for i := range c.shards {
		shard := &c.shards[i]
		shard.mu.Lock()

		for prefix := range blockedPrefixes {
			if shard.hasActivityForPrefix(prefix) {
				activePrefixes[prefix] = struct{}{}
			}
		}

		shard.mu.Unlock()
	}

	c.blockedMu.Lock()
	defer c.blockedMu.Unlock()

	for prefix, snapshot := range blockedPrefixes {
		entry, exists := c.blockedClientsetPrefixes[prefix]
		if !exists || entry.blockedAt != snapshot.blockedAt || now.Sub(entry.blockedAt) < ttl {
			continue
		}

		if _, active := activePrefixes[prefix]; !active {
			delete(c.blockedClientsetPrefixes, prefix)
		}
	}
}

// EvictExpired sweeps all shards sequentially (one lock at a time) and deletes
// entries whose lastUsed timestamp exceeds the cache TTL, and prunes eligible
// blocked prefixes. Returns the total number of evicted clientsets.
func (c *ClientsetCache) EvictExpired(customNow ...time.Time) int {
	if c == nil {
		return 0
	}

	ttl := c.ttl
	if ttl <= 0 {
		ttl = clientsetTTL
	}

	now := time.Now()
	if len(customNow) > 0 && !customNow[0].IsZero() {
		now = customNow[0]
	}

	totalEvicted := 0
	totalRemaining := 0
	evictedKeys := make([]string, 0)
	blockedPrefixes := c.snapshotBlockedPrefixes()

	for i := range c.shards {
		shard := &c.shards[i]
		shard.mu.Lock()
		shard.ensureInitializedLocked()

		for key, cs := range shard.clientsets {
			if now.Sub(cs.lastUsed) > ttl {
				delete(shard.clientsets, key)
				c.cachedCount.Add(-1)

				totalEvicted++

				evictedKeys = append(evictedKeys, key)
			}
		}

		totalRemaining += len(shard.clientsets)

		shard.mu.Unlock()

		if c.pruneShardHook != nil {
			c.pruneShardHook(i)
		}
	}

	c.pruneBlockedPrefixes(now, ttl, blockedPrefixes)
	logClientsetEvictions("expired/janitor", evictedKeys)
	c.evictExpiredSSARResults(now)

	if totalEvicted > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("janitor: evicted %d expired clientset(s), %d remaining", totalEvicted, totalRemaining))
	}

	return totalEvicted
}

// Start launches the cache's background janitor goroutine, sweeping for expired
// entries at the configured interval until ctx is cancelled or Stop is called.
func (c *ClientsetCache) Start(ctx context.Context) {
	if c == nil {
		return
	}

	if ctx == nil {
		ctx = context.Background()
	}

	if c.janitorStartHook != nil {
		c.janitorStartHook()
	}

	c.janitorMu.Lock()
	defer c.janitorMu.Unlock()

	if c.janitorRunning {
		select {
		case <-c.janitorDone:
			c.janitorWg.Wait()
			c.janitorRunning = false
			c.stopCh = nil
			c.janitorDone = nil
		default:
			return
		}
	}

	interval := c.janitorInterval
	if interval <= 0 {
		interval = janitorInterval
	}

	stopCh := make(chan struct{})
	doneCh := make(chan struct{})
	c.stopCh = stopCh
	c.janitorDone = doneCh
	c.janitorRunning = true

	c.janitorWg.Add(1)
	go c.runJanitor(ctx, interval, stopCh, doneCh, c.janitorLoopHook)
}

func (c *ClientsetCache) runJanitor(
	ctx context.Context,
	interval time.Duration,
	runStopCh <-chan struct{},
	runDoneCh chan<- struct{},
	runLoopHook func(),
) {
	defer func() {
		close(runDoneCh)
		c.janitorWg.Done()
	}()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-runStopCh:
			return
		case now := <-ticker.C:
			if runLoopHook != nil {
				runLoopHook()
			}

			c.EvictExpired(now)
		}
	}
}

// Stop terminates the janitor goroutine and waits for it to exit cleanly.
func (c *ClientsetCache) Stop() {
	if c == nil {
		return
	}

	c.janitorMu.Lock()
	defer c.janitorMu.Unlock()

	if !c.janitorRunning {
		return
	}

	c.janitorRunning = false
	if c.stopCh != nil {
		close(c.stopCh)
		c.stopCh = nil
	}

	if c.janitorStopHook != nil {
		c.janitorStopHook()
	}

	c.janitorWg.Wait()
	c.janitorDone = nil
}

// Close stops the janitor and implements io.Closer.
func (c *ClientsetCache) Close() error {
	if c == nil {
		return nil
	}

	c.Stop()

	return nil
}

// EvictClientsetsForCluster removes cached authorization clientsets whose keys share
// the given prefix immediately when a kube context is removed, instead of waiting for
// TTL expiry. The prefix is the Headlamp context store key (the part before the token
// separator in clientset cache keys), which includes the user ID for stateless contexts.
// The prefix is marked blocked against re-caching until cleared by context synchronization.
func (c *ClientsetCache) EvictClientsetsForCluster(clientsetCachePrefix string) {
	if c == nil || clientsetCachePrefix == "" {
		return
	}

	c.blockedMu.Lock()
	c.blockedClientsetPrefixes[clientsetCachePrefix] = blockedPrefixEntry{blockedAt: time.Now()}
	c.blockedMu.Unlock()

	prefixWithNul := clientsetCachePrefix + "\x00"
	evicted := 0
	evictedKeys := make([]string, 0)

	for i := range c.shards {
		shard := &c.shards[i]
		shard.mu.Lock()
		shard.ensureInitializedLocked()

		for key := range shard.clientsets {
			if strings.HasPrefix(key, prefixWithNul) {
				delete(shard.clientsets, key)
				c.cachedCount.Add(-1)

				evicted++

				evictedKeys = append(evictedKeys, key)
			}
		}

		shard.mu.Unlock()
	}

	logClientsetEvictions("context cleanup", evictedKeys)
	c.evictSSARCacheForPrefix(clientsetCachePrefix)

	if evicted > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("evicted %d clientset(s) for removed clientset cache prefix %s",
				evicted, redactContextKey(clientsetCachePrefix)))
	}
}

// ClearBlockedClientsetPrefixesForActiveContexts unblocks caching for contexts that are currently active.
func (c *ClientsetCache) ClearBlockedClientsetPrefixesForActiveContexts(activeContexts []string) {
	if c == nil {
		return
	}

	c.blockedMu.Lock()
	defer c.blockedMu.Unlock()

	for blocked := range c.blockedClientsetPrefixes {
		for _, contextKey := range activeContexts {
			prefix := clientsetCachePrefixFromContextKey(contextKey)
			if prefix == blocked || strings.HasPrefix(prefix, blocked+"\x00") {
				delete(c.blockedClientsetPrefixes, blocked)

				break
			}
		}
	}
}

// CollectContextKeys populates keys with all context prefixes that currently have
// cached clientsets or in-flight creations.
func (c *ClientsetCache) CollectContextKeys(keys map[string]struct{}) {
	if c == nil || keys == nil {
		return
	}

	for i := range c.shards {
		shard := &c.shards[i]

		shard.mu.Lock()
		shard.ensureInitializedLocked()

		for cacheKey := range shard.clientsets {
			if prefix := clientsetCachePrefixFromCacheKey(cacheKey); prefix != "" {
				keys[prefix] = struct{}{}
			}
		}

		for cacheKey := range shard.inFlight {
			if prefix := clientsetCachePrefixFromCacheKey(cacheKey); prefix != "" {
				keys[prefix] = struct{}{}
			}
		}

		shard.mu.Unlock()
	}
}

// Len returns the total number of cached clientsets across all shards.
func (c *ClientsetCache) Len() int {
	if c == nil {
		return 0
	}

	total := 0

	for i := range c.shards {
		c.shards[i].mu.Lock()
		total += len(c.shards[i].clientsets)
		c.shards[i].mu.Unlock()
	}

	return total
}

// InFlightLen returns the total number of in-flight creations across all shards.
func (c *ClientsetCache) InFlightLen() int {
	if c == nil {
		return 0
	}

	total := 0

	for i := range c.shards {
		c.shards[i].mu.Lock()
		total += len(c.shards[i].inFlight)
		c.shards[i].mu.Unlock()
	}

	return total
}

// IsPrefixBlocked reports whether the given context prefix is blocked against caching.
func (c *ClientsetCache) IsPrefixBlocked(prefix string) bool {
	if c == nil {
		return false
	}

	c.blockedMu.RLock()
	defer c.blockedMu.RUnlock()

	return c.isPrefixBlockedLocked(prefix)
}

func (c *ClientsetCache) isPrefixBlockedLocked(prefix string) bool {
	for blocked := range c.blockedClientsetPrefixes {
		if prefix == blocked || strings.HasPrefix(prefix, blocked+"\x00") {
			return true
		}
	}

	return false
}

func (c *ClientsetCache) lookupClientsetOrInFlightLocked(
	s *clientsetCacheShard,
	cacheKey, prefix string,
	ttl time.Duration,
) (*kubernetes.Clientset, *inFlightEntry, bool) {
	if cs, found := s.clientsets[cacheKey]; found {
		now := time.Now()
		if now.Sub(cs.lastUsed) <= ttl {
			cs.lastUsed = now
			cs.accessSequence = c.accessSequence.Add(1)

			return cs.clientset, nil, true
		}

		delete(s.clientsets, cacheKey)
		c.cachedCount.Add(-1)
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("expired clientset for cluster %s was deleted", redactContextKey(prefix)))
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("telemetry: clientset cache eviction (expired/access) for key %s",
				redactClientsetCacheKey(cacheKey)))
	}

	if entry, ok := s.inFlight[cacheKey]; ok {
		return nil, entry, true
	}

	return nil, nil, false
}

func (c *ClientsetCache) getOrCreateInFlightOrCached(
	s *clientsetCacheShard,
	cacheKey, prefix string,
	ttl time.Duration,
) (*kubernetes.Clientset, *inFlightEntry, bool) {
	s.mu.Lock()
	s.ensureInitializedLocked()

	cs, entry, found := c.lookupClientsetOrInFlightLocked(s, cacheKey, prefix, ttl)
	s.mu.Unlock()

	if found {
		if cs != nil {
			return cs, nil, false
		}

		return nil, entry, false
	}

	c.registrationMu.RLock()
	defer c.registrationMu.RUnlock()

	c.blockedMu.RLock()
	defer c.blockedMu.RUnlock()

	if c.registrationHook != nil {
		c.registrationHook()
	}

	s.mu.Lock()
	s.ensureInitializedLocked()

	cs, entry, found = c.lookupClientsetOrInFlightLocked(s, cacheKey, prefix, ttl)
	if found {
		s.mu.Unlock()

		if cs != nil {
			return cs, nil, false
		}

		return nil, entry, false
	}

	entry = &inFlightEntry{
		waitCh:         make(chan struct{}),
		cachePrevented: c.isPrefixBlockedLocked(prefix),
	}
	s.inFlight[cacheKey] = entry

	s.mu.Unlock()

	return nil, entry, true
}

//nolint:funlen // Keeps registration, capacity, barrier, and in-flight completion ordering explicit.
func (c *ClientsetCache) finishInFlight(
	s *clientsetCacheShard,
	cacheKey, prefix string,
	entry *inFlightEntry,
	cs *kubernetes.Clientset,
	createErr error,
	ttl time.Duration,
) (*kubernetes.Clientset, error) {
	c.registrationMu.RLock()
	defer c.registrationMu.RUnlock()

	c.blockedMu.RLock()
	defer c.blockedMu.RUnlock()

	cachePrevented := entry.cachePrevented || c.isPrefixBlockedLocked(prefix)
	c.capacityMu.Lock()
	limit := c.maxClientsetsLimit()
	evictedKeys := make([]string, 0)
	canInsert := false

	if createErr == nil && !cachePrevented {
		canInsert = c.cachedCount.Load() < int64(limit)
		if !canInsert {
			evictedKeys = c.evictLeastRecentlyUsedLocked(limit)
			canInsert = c.cachedCount.Load() < int64(limit)
		}
	}

	s.mu.Lock()
	s.ensureInitializedLocked()

	stored := false
	result := cs

	if existing, found := s.clientsets[cacheKey]; found {
		now := time.Now()
		if now.Sub(existing.lastUsed) <= ttl {
			existing.lastUsed = now
			existing.accessSequence = c.accessSequence.Add(1)
			stored = true
			result = existing.clientset
		} else {
			delete(s.clientsets, cacheKey)
			c.cachedCount.Add(-1)
		}
	}

	if !stored && createErr == nil && !cachePrevented && canInsert {
		c.cachedCount.Add(1)
		s.clientsets[cacheKey] = &CachedClientSet{
			clientset:      cs,
			lastUsed:       time.Now(),
			accessSequence: c.accessSequence.Add(1),
		}
		stored = true
	}

	s.mu.Unlock()
	c.capacityMu.Unlock()

	if c.beforeFinishHook != nil {
		c.beforeFinishHook(cacheKey)
	}

	s.mu.Lock()
	completeInFlightLocked(s, cacheKey, entry, cs, createErr)
	s.mu.Unlock()

	limit = c.maxClientsetsLimit()

	if createErr != nil || !stored || c.cachedCount.Load() > int64(limit) {
		c.capacityMu.Lock()
		evictedKeys = append(evictedKeys,
			c.evictLeastRecentlyUsedLocked(limit+1)...)
		c.capacityMu.Unlock()
	}

	logClientsetEvictions("LRU capacity", evictedKeys)

	if stored && createErr == nil {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("telemetry: clientset cache miss (stored new clientset) for key %s",
				redactClientsetCacheKey(cacheKey)))
	}

	return result, createErr
}

func completeInFlightLocked(
	s *clientsetCacheShard,
	cacheKey string,
	entry *inFlightEntry,
	cs *kubernetes.Clientset,
	err error,
) {
	entry.cs = cs
	entry.err = err

	delete(s.inFlight, cacheKey)
	close(entry.waitCh)
}

func (c *ClientsetCache) waitForInFlightClientset(entry *inFlightEntry) (*kubernetes.Clientset, error) {
	if c.inFlightWaitHook != nil {
		c.inFlightWaitHook()
	}

	<-entry.waitCh

	return entry.cs, entry.err
}

// GetClientSet returns *kubernetes.Clientset and error for the given headlampContextKey and token.
// If an entry is cached and not expired, it is returned. If an in-flight creation is already in
// progress for the same cache key, subsequent callers wait for the creator's result.
// If the context prefix has been removed and blocked, the newly created clientset is returned
// to current callers but not retained in the cache.
func (c *ClientsetCache) GetClientSet(
	headlampContextKey string,
	k *kubeconfig.Context,
	token string,
) (*kubernetes.Clientset, error) {
	if c == nil {
		return nil, fmt.Errorf("nil ClientsetCache in GetClientSet")
	}

	if headlampContextKey == "" {
		return nil, fmt.Errorf("empty headlamp context key in GetClientSet")
	}

	if k == nil {
		return nil, fmt.Errorf("nil kubeconfig context in GetClientSet")
	}

	contextCacheKey, err := ContextCacheKey(headlampContextKey, k)
	if err != nil {
		return nil, err
	}

	ttl := c.ttl
	if ttl <= 0 {
		ttl = clientsetTTL
	}

	cacheKey := contextCacheKey + "\x00" + token
	prefix := contextCacheKey
	shard := c.shardForPrefix(prefix)

	cached, entry, isCreator := c.getOrCreateInFlightOrCached(shard, cacheKey, prefix, ttl)
	if cached != nil {
		return cached, nil
	}

	if !isCreator {
		return c.waitForInFlightClientset(entry)
	}

	creator := c.creator
	if creator == nil {
		creator = func(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
			return k.ClientSetWithToken(token)
		}
	}

	cs, rawErr := creator(k, token)

	var createErr error
	if rawErr != nil {
		createErr = fmt.Errorf("error while creating clientset for cluster %s: %w", k.Name, rawErr)
	}

	return c.finishInFlight(shard, cacheKey, prefix, entry, cs, createErr, ttl)
}

// GetClientSet retrieves or creates a clientset using the specified ClientsetCache instance.
func GetClientSet(
	cache *ClientsetCache,
	headlampContextKey string,
	k *kubeconfig.Context,
	token string,
) (*kubernetes.Clientset, error) {
	if cache == nil {
		return nil, fmt.Errorf("nil ClientsetCache in GetClientSet")
	}

	return cache.GetClientSet(headlampContextKey, k, token)
}

// EvictClientsetsForCluster removes cached authorization clientsets using the specified cache instance.
func EvictClientsetsForCluster(cache *ClientsetCache, clientsetCachePrefix string) {
	if cache == nil {
		return
	}

	cache.EvictClientsetsForCluster(clientsetCachePrefix)
}

// ClearBlockedClientsetPrefixesForActiveContexts clears blocked prefixes for active contexts on the given cache.
func ClearBlockedClientsetPrefixesForActiveContexts(cache *ClientsetCache, activeContexts []string) {
	if cache == nil {
		return
	}

	cache.ClearBlockedClientsetPrefixesForActiveContexts(activeContexts)
}

type apiResourceRequest struct {
	group       string
	version     string
	namespace   string
	resource    string
	name        string
	subresource string
}

func isNamespaceSubresource(subresource string) bool {
	return subresource == "status" || subresource == "finalize"
}

func parseAPIResourceRequest(apiPath string) (apiResourceRequest, bool) {
	parts := strings.Split(strings.Trim(apiPath, "/"), "/")
	if len(parts) < 3 {
		return apiResourceRequest{}, false
	}

	request := apiResourceRequest{}
	resourceIndex := 0

	switch parts[0] {
	case apiPathSegment:
		request.version = parts[1]
		resourceIndex = 2
	case apisPathSegment:
		if len(parts) < 4 {
			return apiResourceRequest{}, false
		}

		request.group = parts[1]
		request.version = parts[2]
		resourceIndex = 3
	default:
		return apiResourceRequest{}, false
	}

	if parts[resourceIndex] == namespacePathSegment &&
		len(parts) == resourceIndex+3 &&
		isNamespaceSubresource(parts[resourceIndex+2]) {
		request.resource = namespacePathSegment
		request.name = parts[resourceIndex+1]
		request.subresource = parts[resourceIndex+2]

		return request, true
	}

	if parts[resourceIndex] == namespacePathSegment && len(parts) > resourceIndex+2 {
		request.namespace = parts[resourceIndex+1]
		resourceIndex += 2
	}

	request.resource = parts[resourceIndex]
	if len(parts) > resourceIndex+1 {
		request.name = parts[resourceIndex+1]
	}

	if len(parts) > resourceIndex+2 {
		request.subresource = parts[resourceIndex+2]
	}

	return request, true
}

// IsWatchRequest reports whether r asks the API server to stream changes rather than
// return a complete response.
func IsWatchRequest(r *http.Request) bool {
	isWatch, _ := strconv.ParseBool(r.URL.Query().Get("watch"))

	return isWatch
}

func getKubeVerb(r *http.Request, request apiResourceRequest) string {
	switch r.Method {
	case "GET":
		if IsWatchRequest(r) {
			return "watch"
		}

		if request.name == "" {
			return "list"
		}

		return "get"
	default:
		return unknownVerb
	}
}

// GetKindAndVerb extracts the Kubernetes resource kind and intended verb (e.g., get, watch)
// from the incoming HTTP request.
func GetKindAndVerb(r *http.Request) (string, string) {
	apiPath, ok := mux.Vars(r)["api"]
	if !ok || apiPath == "" {
		return "", unknownVerb
	}

	request, ok := parseAPIResourceRequest(apiPath)
	if !ok {
		return "", unknownVerb
	}

	return request.resource, getKubeVerb(r, request)
}

func getResourceAttributes(r *http.Request) (*authorizationv1.ResourceAttributes, error) {
	apiPath, ok := mux.Vars(r)["api"]
	if !ok || apiPath == "" {
		return nil, fmt.Errorf("could not determine resource or verb from request")
	}

	request, ok := parseAPIResourceRequest(apiPath)
	if !ok {
		return nil, fmt.Errorf("could not determine resource or verb from request")
	}

	kubeVerb := getKubeVerb(r, request)
	if request.resource == "" || kubeVerb == "" {
		return nil, fmt.Errorf("could not determine resource or verb from request")
	}

	attributes := &authorizationv1.ResourceAttributes{
		Group: request.group, Version: request.version, Resource: request.resource,
		Subresource: request.subresource, Namespace: request.namespace, Name: request.name, Verb: kubeVerb,
	}

	query := r.URL.Query()

	if selector := query.Get("fieldSelector"); selector != "" {
		parsed, err := fields.ParseSelector(selector)
		if err != nil {
			return nil, err
		}

		attributes.FieldSelector = &authorizationv1.FieldSelectorAttributes{RawSelector: selector}
		if attributes.Name == "" {
			attributes.Name, _ = parsed.RequiresExactMatch("metadata.name")
		}
	}

	if selector := query.Get("labelSelector"); selector != "" {
		attributes.LabelSelector = &authorizationv1.LabelSelectorAttributes{RawSelector: selector}
	}

	return attributes, nil
}

// IsAllowed checks the user's permission to access the resource.
// If the user is authorized and has permission to view the resources, it returns true.
// Otherwise, it returns false if authorization fails.
func (c *ClientsetCache) IsAllowed(
	headlampContextKey string,
	k *kubeconfig.Context,
	r *http.Request,
) (bool, error) {
	if c == nil {
		return false, fmt.Errorf("nil ClientsetCache in IsAllowed")
	}

	if k == nil {
		return false, fmt.Errorf("nil kubeconfig context in IsAllowed")
	}

	if r == nil {
		return false, fmt.Errorf("nil http.Request in IsAllowed")
	}

	return c.isAllowedCached(headlampContextKey, k, r)
}

// IsAllowed checks user permission using the specified ClientsetCache instance.
func IsAllowed(
	cache *ClientsetCache,
	headlampContextKey string,
	k *kubeconfig.Context,
	r *http.Request,
) (bool, error) {
	if cache == nil {
		return false, fmt.Errorf("nil ClientsetCache in IsAllowed")
	}

	return cache.IsAllowed(headlampContextKey, k, r)
}
