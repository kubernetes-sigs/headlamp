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
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

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

type CachedClientSet struct {
	clientset *kubernetes.Clientset
	lastUsed  time.Time
}

type inFlightEntry struct {
	waitCh chan struct{}
	cs     *kubernetes.Clientset
	err    error
}

type blockedPrefixEntry struct {
	blockedAt time.Time
}

type clientsetCacheShard struct {
	mu                       sync.Mutex
	clientsets               map[string]*CachedClientSet
	blockedClientsetPrefixes map[string]blockedPrefixEntry
	inFlight                 map[string]*inFlightEntry
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

	janitorMu      sync.Mutex
	janitorRunning bool
	stopCh         chan struct{}
	janitorWg      sync.WaitGroup
}

// NewClientsetCache constructs an isolated ClientsetCache with default TTL, janitor interval,
// and clientset creation logic, optionally overridden by functional options.
func NewClientsetCache(opts ...ClientsetCacheOption) *ClientsetCache {
	c := &ClientsetCache{
		ttl:             clientsetTTL,
		janitorInterval: janitorInterval,
		creator: func(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
			return k.ClientSetWithToken(token)
		},
	}

	for i := 0; i < numShards; i++ {
		c.shards[i].clientsets = make(map[string]*CachedClientSet)
		c.shards[i].blockedClientsetPrefixes = make(map[string]blockedPrefixEntry)
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

// WithInFlightWaitHook sets a wait hook invoked when a waiter begins blocking on in-flight creation.
func WithInFlightWaitHook(hook func()) ClientsetCacheOption {
	return func(c *ClientsetCache) {
		c.inFlightWaitHook = hook
	}
}

// SetClientsetCreator allows setting or overriding the clientset creator on an existing cache instance.
func (c *ClientsetCache) SetClientsetCreator(creator ClientsetCreatorFunc) {
	c.creator = creator
}

// SetInFlightWaitHook allows setting or overriding the in-flight wait hook on an existing cache instance.
func (c *ClientsetCache) SetInFlightWaitHook(hook func()) {
	c.inFlightWaitHook = hook
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

// clientsetCachePrefixFromCacheKey returns the Headlamp context store key prefix
// from a clientset cache key (everything before the final NUL separator).
func clientsetCachePrefixFromCacheKey(cacheKey string) string {
	if i := strings.LastIndex(cacheKey, "\x00"); i >= 0 {
		return cacheKey[:i]
	}

	return cacheKey
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

func (s *clientsetCacheShard) pruneBlockedPrefixesLocked(now time.Time, ttl time.Duration) {
	for prefix, entry := range s.blockedClientsetPrefixes {
		if s.hasActivityForPrefix(prefix) {
			continue
		}

		if now.Sub(entry.blockedAt) >= ttl {
			delete(s.blockedClientsetPrefixes, prefix)
		}
	}
}

// EvictExpired sweeps all shards sequentially (one lock at a time) and deletes
// entries whose lastUsed timestamp exceeds the cache TTL, and prunes eligible
// blocked prefixes. Returns the total number of evicted clientsets.
func (c *ClientsetCache) EvictExpired(customNow ...time.Time) int {
	now := time.Now()
	if len(customNow) > 0 && !customNow[0].IsZero() {
		now = customNow[0]
	}

	totalEvicted := 0
	totalRemaining := 0

	for i := range c.shards {
		shard := &c.shards[i]
		shard.mu.Lock()

		for key, cs := range shard.clientsets {
			if now.Sub(cs.lastUsed) > c.ttl {
				delete(shard.clientsets, key)

				totalEvicted++
			}
		}

		shard.pruneBlockedPrefixesLocked(now, c.ttl)
		totalRemaining += len(shard.clientsets)

		shard.mu.Unlock()
	}

	if totalEvicted > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("janitor: evicted %d expired clientset(s), %d remaining", totalEvicted, totalRemaining))
	}

	return totalEvicted
}

// Start launches the cache's background janitor goroutine, sweeping for expired
// entries at the configured interval until ctx is cancelled or Stop is called.
func (c *ClientsetCache) Start(ctx context.Context) {
	c.janitorMu.Lock()
	defer c.janitorMu.Unlock()

	if c.janitorRunning {
		return
	}

	c.janitorRunning = true
	c.stopCh = make(chan struct{})

	c.janitorWg.Add(1)
	go func() {
		defer c.janitorWg.Done()

		ticker := time.NewTicker(c.janitorInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-c.stopCh:
				return
			case now := <-ticker.C:
				c.EvictExpired(now)
			}
		}
	}()
}

// Stop terminates the janitor goroutine and waits for it to exit cleanly.
func (c *ClientsetCache) Stop() {
	c.janitorMu.Lock()
	if !c.janitorRunning {
		c.janitorMu.Unlock()
		return
	}

	c.janitorRunning = false
	close(c.stopCh)
	c.janitorMu.Unlock()

	c.janitorWg.Wait()
}

// Close stops the janitor and implements io.Closer.
func (c *ClientsetCache) Close() error {
	c.Stop()
	return nil
}

// EvictClientsetsForCluster removes cached authorization clientsets whose keys share
// the given prefix immediately when a kube context is removed, instead of waiting for
// TTL expiry. The prefix is the Headlamp context store key (the part before the token
// separator in clientset cache keys), which includes the user ID for stateless contexts.
// The prefix is marked blocked against re-caching until cleared by context synchronization.
func (c *ClientsetCache) EvictClientsetsForCluster(clientsetCachePrefix string) {
	if clientsetCachePrefix == "" {
		return
	}

	prefixWithNul := clientsetCachePrefix + "\x00"
	shard := c.shardForPrefix(clientsetCachePrefix)

	shard.mu.Lock()
	shard.blockedClientsetPrefixes[clientsetCachePrefix] = blockedPrefixEntry{blockedAt: time.Now()}

	evicted := 0

	for key := range shard.clientsets {
		if strings.HasPrefix(key, prefixWithNul) {
			delete(shard.clientsets, key)

			evicted++
		}
	}

	remaining := len(shard.clientsets)
	shard.mu.Unlock()

	if evicted > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("evicted %d clientset(s) for removed clientset cache prefix %s, %d remaining in shard",
				evicted, redactContextKey(clientsetCachePrefix), remaining))
	}
}

// ClearBlockedClientsetPrefixesForActiveContexts unblocks caching for contexts that are currently active.
func (c *ClientsetCache) ClearBlockedClientsetPrefixesForActiveContexts(activeContexts []string) {
	if c == nil {
		return
	}

	for _, contextKey := range activeContexts {
		prefix := clientsetCachePrefixFromContextKey(contextKey)
		shard := c.shardForPrefix(prefix)
		shard.mu.Lock()
		delete(shard.blockedClientsetPrefixes, prefix)
		shard.mu.Unlock()
	}
}

// CollectContextKeys populates keys with all context prefixes that currently have
// cached clientsets or in-flight creations.
func (c *ClientsetCache) CollectContextKeys(keys map[string]struct{}) {
	if c == nil {
		return
	}

	for i := range c.shards {
		shard := &c.shards[i]

		shard.mu.Lock()

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
	shard := c.shardForPrefix(prefix)

	shard.mu.Lock()
	defer shard.mu.Unlock()

	_, blocked := shard.blockedClientsetPrefixes[prefix]

	return blocked
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

	shard.clientsets[key] = &CachedClientSet{
		clientset: client,
		lastUsed:  lastUsed,
	}
}

// SeedBlockedPrefix marks a prefix as blocked at blockedAt for testing.
func (c *ClientsetCache) SeedBlockedPrefix(prefix string, blockedAt time.Time) {
	shard := c.shardForPrefix(prefix)

	shard.mu.Lock()
	defer shard.mu.Unlock()

	shard.blockedClientsetPrefixes[prefix] = blockedPrefixEntry{blockedAt: blockedAt}
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

func (s *clientsetCacheShard) getOrCreateInFlightOrCached(
	cacheKey, prefix string,
	ttl time.Duration,
) (*kubernetes.Clientset, *inFlightEntry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if cs, found := s.clientsets[cacheKey]; found {
		now := time.Now()
		if now.Sub(cs.lastUsed) <= ttl {
			cs.lastUsed = now

			return cs.clientset, nil, false
		}

		delete(s.clientsets, cacheKey)

		redactedContext := redactContextKey(prefix)
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("expired clientset for cluster %s was deleted", redactedContext))
	}

	if entry, ok := s.inFlight[cacheKey]; ok {
		return nil, entry, false
	}

	entry := &inFlightEntry{
		waitCh: make(chan struct{}),
	}
	s.inFlight[cacheKey] = entry

	return nil, entry, true
}

func (s *clientsetCacheShard) finishInFlight(
	cacheKey, prefix string,
	entry *inFlightEntry,
	cs *kubernetes.Clientset,
	createErr error,
	ttl time.Duration,
) (*kubernetes.Clientset, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry.cs = cs
	entry.err = createErr

	delete(s.inFlight, cacheKey)
	close(entry.waitCh)

	if createErr != nil {
		return nil, createErr
	}

	if _, blocked := s.blockedClientsetPrefixes[prefix]; blocked {
		return cs, nil
	}

	if existing, found := s.clientsets[cacheKey]; found {
		now := time.Now()
		if now.Sub(existing.lastUsed) <= ttl {
			existing.lastUsed = now

			return existing.clientset, nil
		}
	}

	s.clientsets[cacheKey] = &CachedClientSet{
		clientset: cs,
		lastUsed:  time.Now(),
	}

	return cs, nil
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
	if headlampContextKey == "" {
		return nil, fmt.Errorf("empty headlamp context key in GetClientSet")
	}

	contextKey := strings.Split(k.ClusterID, "+")
	if len(contextKey) < 2 {
		return nil, fmt.Errorf("unexpected ClusterID format in GetClientSet: %q", k.ClusterID)
	}

	cacheKey := headlampContextKey + "\x00" + token
	prefix := headlampContextKey
	shard := c.shardForPrefix(prefix)

	cached, entry, isCreator := shard.getOrCreateInFlightOrCached(cacheKey, prefix, c.ttl)
	if cached != nil {
		return cached, nil
	}

	if !isCreator {
		return c.waitForInFlightClientset(entry)
	}

	cs, rawErr := c.creator(k, token)

	var createErr error
	if rawErr != nil {
		createErr = fmt.Errorf("error while creating clientset for cluster %s: %w", contextKey[1], rawErr)
	}

	return shard.finishInFlight(cacheKey, prefix, entry, cs, createErr, c.ttl)
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

func getKubeVerb(r *http.Request, request apiResourceRequest) string {
	isWatch, _ := strconv.ParseBool(r.URL.Query().Get("watch"))

	switch r.Method {
	case "GET":
		if isWatch {
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

	return &authorizationv1.ResourceAttributes{
		Group:       request.group,
		Version:     request.version,
		Resource:    request.resource,
		Subresource: request.subresource,
		Namespace:   request.namespace,
		Name:        request.name,
		Verb:        kubeVerb,
	}, nil
}

// IsAllowed checks the user's permission to access the resource.
// If the user is authorized and has permission to view the resources, it returns true.
// Otherwise, it returns false if authorization fails.
func (c *ClientsetCache) IsAllowed(
	headlampContextKey string,
	k *kubeconfig.Context,
	r *http.Request,
) (bool, error) {
	token := auth.BearerTokenValue(r.Header.Get("Authorization"))

	clientset, err := c.GetClientSet(headlampContextKey, k, token)
	if err != nil {
		return false, err
	}

	resourceAttributes, err := getResourceAttributes(r)
	if err != nil {
		return false, err
	}

	review := &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: resourceAttributes,
		},
	}

	result, err := clientset.AuthorizationV1().SelfSubjectAccessReviews().Create(
		r.Context(),
		review,
		metav1.CreateOptions{},
	)
	if err != nil {
		return false, err
	}

	if result == nil {
		return false, fmt.Errorf("nil SelfSubjectAccessReview result")
	}

	return result.Status.Allowed, err
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

// ServeFromCacheOrForwardToK8s attempts to serve a Kubernetes resource from cache.
// If no cached value is found (or `isAllowed` is false), it forwards the request
// to the next handler and stores the response in the cache for future requests.
func ServeFromCacheOrForwardToK8s(k8scache cache.Cache[string], isAllowed bool, next http.Handler, key string,
	w http.ResponseWriter, r *http.Request, rcw *ResponseCapture,
) {
	served, _ := LoadFromCache(k8scache, isAllowed, key, w, r)
	if served {
		return
	}

	next.ServeHTTP(rcw, r)

	err := StoreK8sResponseInCache(k8scache, r.URL, rcw, key)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "error while storing in the cache")
		return
	}
}
