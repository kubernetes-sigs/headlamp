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
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"

	authorizationv1 "k8s.io/api/authorization/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/client-go/kubernetes"
)

// clientsetTTL is how long an idle clientset stays in the cache before
// it becomes eligible for eviction.
const clientsetTTL = 10 * time.Minute

const unknownVerb = "unknown"

// DefaultMaxClientsets bounds the total number of cached clientsets to prevent
// memory exhaustion from high volumes of unique tokens.
const DefaultMaxClientsets = 256

const defaultMaxClientsets = DefaultMaxClientsets

// janitorInterval is how often the background goroutine sweeps the
// cache for expired entries.
const janitorInterval = 5 * time.Minute

const (
	// ssarTTL is how long a cached SelfSubjectAccessReview result is
	// considered valid before a fresh API call is required.
	ssarTTL             = 30 * time.Second
	ssarRequestTimeout  = 30 * time.Second
	ssarCacheMaxEntries = 1024
	ssarMaxInFlight     = 64
)

var errSSARWorkersAtCapacity = errors.New("SSAR worker capacity reached")

type CachedClientSet struct {
	clientset *kubernetes.Clientset
	lastUsed  time.Time
}

type inFlightEntry struct {
	waitCh chan struct{}
	cs     *kubernetes.Clientset
	err    error
}

type lruEntry struct {
	key string
	cs  *CachedClientSet
}

type blockedPrefixEntry struct {
	blockedAt time.Time
}

// ssarCacheEntry holds a cached SelfSubjectAccessReview result.
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
	clientsetCache        = make(map[string]*list.Element)
	clientsetLRUList      = list.New()
	maxClientsets         = defaultMaxClientsets
	maxClientsetsExplicit bool
	// blockedClientsetPrefixes holds context keys whose clientsets must not be
	// re-cached after context removal. Entries are cleared when SyncWatchers sees
	// the context active again, or by the janitor once clientsetTTL has elapsed
	// and no clientset or in-flight entries remain for the prefix. The janitor is
	// started by GetClientSet and EvictClientsetsForCluster.
	blockedClientsetPrefixes = make(map[string]blockedPrefixEntry)
	mu                       sync.Mutex
	janitorOnce              sync.Once

	// inFlight keeps track of clientsets currently being created to avoid redundant work.
	inFlight = make(map[string]*inFlightEntry)

	// hookMu protects testingInFlightWait and clientsetCreator from concurrent access.
	hookMu sync.RWMutex

	// testingInFlightWait is a hook for testing synchronization.
	testingInFlightWait = func() {}

	// testingBeforeFinishInFlight is a hook called before finishInFlightClientset for testing synchronization.
	testingBeforeFinishInFlight = func(cacheKey string) {}

	// clientsetCreator is a hook for testing de-duplication.
	clientsetCreator = func(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
		return k.ClientSetWithToken(token)
	}
)

func getMaxClientsetsLimit() int {
	if limitStr := os.Getenv("HEADLAMP_MAX_CLIENTSETS"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 {
			return limit
		}
	}

	return maxClientsets
}

// effectiveMaxClientsetsLocked returns the active cache capacity limit.
// An explicit limit set via SetMaxClientsets (other than the default) or
// SetMaxClientsetsForTesting takes precedence; otherwise HEADLAMP_MAX_CLIENTSETS
// is honored when set, falling back to maxClientsets. mu must be held.
func effectiveMaxClientsetsLocked() int {
	if maxClientsetsExplicit {
		return maxClientsets
	}

	return getMaxClientsetsLimit()
}

// ssarCache holds cached SelfSubjectAccessReview results to avoid
// redundant authorization API calls for the same user/resource/verb.
var (
	ssarCache       = make(map[string]*ssarCacheEntry)
	ssarCacheOrder  = list.New()
	ssarInFlight    = make(map[string]*ssarInFlightEntry)
	ssarWorkerCount int
	ssarMu          sync.RWMutex
)

// startJanitor launches a background goroutine (exactly once) that
// periodically scans clientsetCache and removes entries whose lastUsed
// timestamp exceeds clientsetTTL. This prevents unbounded memory growth
// when users with unique tokens never revisit the same cache key.
func startJanitor() {
	janitorOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(janitorInterval)
			defer ticker.Stop()

			for range ticker.C {
				evictExpiredClientsets()
			}
		}()
	})
}

// evictExpiredClientsets walks the cache under the lock and deletes
// every entry older than clientsetTTL. It also sweeps expired SSAR
// cache entries.
func evictExpiredClientsets() {
	logger.Log(logger.LevelInfo, nil, nil, "telemetry: cache-janitor started sweep")

	mu.Lock()

	now := time.Now()
	evicted := 0
	evictedKeys := make([]string, 0)

	for elem := clientsetLRUList.Back(); elem != nil; {
		prev := elem.Prev()
		entry := elem.Value.(*lruEntry)

		if now.Sub(entry.cs.lastUsed) > clientsetTTL {
			delete(clientsetCache, entry.key)
			clientsetLRUList.Remove(elem)

			evicted++

			evictedKeys = append(evictedKeys, entry.key)
		}

		elem = prev
	}

	pruneBlockedClientsetPrefixesLocked(now)

	remaining := len(clientsetCache)

	mu.Unlock()

	for _, key := range evictedKeys {
		logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
			"telemetry: clientset cache eviction (expired/janitor) for key %s",
			redactClientsetCacheKey(key),
		))
	}

	logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
		"telemetry: cache-janitor completed sweep: evicted %d expired clientsets",
		evicted,
	))

	if evicted > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("janitor: evicted %d expired clientset(s), %d remaining", evicted, remaining))
	}

	evictExpiredSSARResults(now)
}

// hasClientsetActivityForPrefix reports whether any clientset or in-flight entry
// exists for the given prefix. mu must be held.
func hasClientsetActivityForPrefix(prefix string) bool {
	prefixWithNul := prefix + "\x00"

	for key := range clientsetCache {
		if strings.HasPrefix(key, prefixWithNul) {
			return true
		}
	}

	for key := range inFlight {
		if strings.HasPrefix(key, prefixWithNul) {
			return true
		}
	}

	return false
}

// pruneBlockedClientsetPrefixesLocked drops stale block entries so removed contexts that
// never return do not accumulate unbounded entries over long process lifetimes.
// mu must be held.
func pruneBlockedClientsetPrefixesLocked(now time.Time) {
	for prefix, entry := range blockedClientsetPrefixes {
		if hasClientsetActivityForPrefix(prefix) {
			continue
		}

		if now.Sub(entry.blockedAt) >= clientsetTTL {
			delete(blockedClientsetPrefixes, prefix)
		}
	}
}

// EvictClientsetsForCluster removes cached authorization clientsets whose keys share
// the given prefix immediately when a kube context is removed, instead of waiting for
// TTL expiry. The prefix can identify a store key (including the user ID for
// stateless contexts) or a specific connection revision returned by ContextCacheKey.
// It also evicts any cached SSAR results for the same prefix.
func EvictClientsetsForCluster(clientsetCachePrefix string) {
	if clientsetCachePrefix == "" {
		return
	}

	startJanitor()

	prefix := clientsetCachePrefix + "\x00"

	mu.Lock()

	blockedClientsetPrefixes[clientsetCachePrefix] = blockedPrefixEntry{blockedAt: time.Now()}

	evicted := 0
	evictedKeys := make([]string, 0)

	for elem := clientsetLRUList.Front(); elem != nil; {
		next := elem.Next()
		entry := elem.Value.(*lruEntry)

		if strings.HasPrefix(entry.key, prefix) {
			delete(clientsetCache, entry.key)
			clientsetLRUList.Remove(elem)

			evicted++

			evictedKeys = append(evictedKeys, entry.key)
		}

		elem = next
	}

	remaining := len(clientsetCache)

	mu.Unlock()

	for _, key := range evictedKeys {
		logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
			"telemetry: clientset cache eviction (context cleanup) for key %s",
			redactClientsetCacheKey(key),
		))
	}

	if evicted > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("evicted %d clientset(s) for removed clientset cache prefix %s, %d remaining",
				evicted, redactContextKey(clientsetCachePrefix), remaining))
	}

	evictSSARCacheForPrefix(clientsetCachePrefix)
}

// clientsetCachePrefixFromCacheKey returns the connection revision prefix from a
// clientset cache key (everything before the final NUL separator).
func clientsetCachePrefixFromCacheKey(cacheKey string) string {
	if i := strings.LastIndex(cacheKey, "\x00"); i >= 0 {
		return cacheKey[:i]
	}

	return cacheKey
}

// clearBlockedClientsetPrefixesForActiveContexts allows clientset caching again for
// contexts that are currently active (for example after a cluster is re-added).

// redactClientsetCacheKey returns a redacted version of a clientset cache key.
func redactClientsetCacheKey(cacheKey string) string {
	if i := strings.LastIndex(cacheKey, "\x00"); i >= 0 {
		return redactContextKey(cacheKey[:i]) + "\x00[redacted]"
	}

	return redactContextKey(cacheKey)
}

func clearBlockedClientsetPrefixesForActiveContexts(activeContexts []string) {
	mu.Lock()
	defer mu.Unlock()

	for _, contextKey := range activeContexts {
		for prefix := range blockedClientsetPrefixes {
			if contextKey == prefix || strings.HasPrefix(contextKey, prefix+"\x00") {
				delete(blockedClientsetPrefixes, prefix)
			}
		}
	}
}

// isClientsetPrefixBlockedLocked also checks a connection revision's store key.
// mu must be held.
func isClientsetPrefixBlockedLocked(prefix string) bool {
	for blocked := range blockedClientsetPrefixes {
		if prefix == blocked || strings.HasPrefix(prefix, blocked+"\x00") {
			return true
		}
	}

	return false
}

// getCachedClientSet retrieves a clientset from the cache if it's valid and not expired.
func getCachedClientSet(cacheKey string) (*kubernetes.Clientset, bool) {
	mu.Lock()

	elem, found := clientsetCache[cacheKey]
	if !found {
		mu.Unlock()
		logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
			"telemetry: clientset cache miss for key %s",
			redactClientsetCacheKey(cacheKey),
		))

		return nil, false
	}

	entry := elem.Value.(*lruEntry)
	now := time.Now()

	if now.Sub(entry.cs.lastUsed) > clientsetTTL {
		delete(clientsetCache, cacheKey)
		clientsetLRUList.Remove(elem)

		redactedContext := redactContextKey(clientsetCachePrefixFromCacheKey(cacheKey))
		redactedKey := redactClientsetCacheKey(cacheKey)
		mu.Unlock()

		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("expired clientset for cluster %s was deleted", redactedContext))

		logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
			"telemetry: clientset cache eviction (expired/access) for key %s",
			redactedKey,
		))

		return nil, false
	}

	entry.cs.lastUsed = now

	clientsetLRUList.MoveToFront(elem)

	cs := entry.cs.clientset
	mu.Unlock()

	return cs, true
}

func getCachedClientSetLocked(cacheKey string) (*kubernetes.Clientset, bool) {
	elem, found := clientsetCache[cacheKey]
	if !found {
		return nil, false
	}

	entry := elem.Value.(*lruEntry)
	now := time.Now()

	if now.Sub(entry.cs.lastUsed) > clientsetTTL {
		delete(clientsetCache, cacheKey)
		clientsetLRUList.Remove(elem)

		return nil, false
	}

	entry.cs.lastUsed = now

	clientsetLRUList.MoveToFront(elem)

	return entry.cs.clientset, true
}

// enforceClientsetCapacityLimit evicts the least recently used clientset(s) if we are at/over capacity
// and returns their keys for logging after mu is released. mu must be held.
func enforceClientsetCapacityLimit() []string {
	evictedKeys := make([]string, 0)

	maxLimit := effectiveMaxClientsetsLocked()
	if maxLimit <= 0 {
		return evictedKeys
	}

	for len(clientsetCache) >= maxLimit && clientsetLRUList.Len() > 0 {
		evictedKey, ok := evictOldestClientsetLocked()
		if !ok {
			break
		}

		evictedKeys = append(evictedKeys, evictedKey)
	}

	return evictedKeys
}

func logClientsetEvictions(reason string, keys []string) {
	for _, key := range keys {
		logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
			"telemetry: clientset cache eviction (%s) for key %s",
			reason,
			redactClientsetCacheKey(key),
		))
	}
}

// evictOldestClientsetLocked removes the least recently used clientset from clientsetCache
// and clientsetLRUList, skipping any entries that are currently being created in inFlight.
// It returns the evicted key and whether an entry was evicted. mu must be held.
func evictOldestClientsetLocked() (string, bool) {
	for elem := clientsetLRUList.Back(); elem != nil; elem = elem.Prev() {
		entry := elem.Value.(*lruEntry)
		// Avoid evicting entries that are currently being created.
		if _, creating := inFlight[entry.key]; creating {
			continue
		}

		delete(clientsetCache, entry.key)
		clientsetLRUList.Remove(elem)

		return entry.key, true
	}

	return "", false
}

// trimClientsetCacheLocked evicts the least recently used clientsets until the cache
// size is within the effective maxClientsets limit, skipping entries currently in inFlight.
// It stops if no more entries can be safely evicted. mu must be held.
func trimClientsetCacheLocked() {
	maxLimit := effectiveMaxClientsetsLocked()
	if maxLimit <= 0 {
		return
	}

	for len(clientsetCache) > maxLimit {
		if _, evicted := evictOldestClientsetLocked(); !evicted {
			break
		}
	}
}

// SetMaxClientsets sets the maximum number of clientsets allowed in the authorization cache.
// limit must be greater than 0; otherwise, an error is returned and the limit remains unchanged.
// If the new limit is smaller than the current number of cached entries, the oldest eligible
// entries are evicted until the cache size is within the new limit.
func SetMaxClientsets(limit int) error {
	if limit <= 0 {
		return fmt.Errorf("max clientsets must be greater than 0, got %d", limit)
	}

	mu.Lock()
	defer mu.Unlock()

	maxClientsets = limit
	maxClientsetsExplicit = true

	trimClientsetCacheLocked()

	return nil
}

// MaxClientsets returns the current maximum capacity of the authorization clientset cache.
func MaxClientsets() int {
	mu.Lock()
	defer mu.Unlock()

	return effectiveMaxClientsetsLocked()
}

// evictClientsetIfMatch removes a cached clientset by context key and token only if
// the cached entry matches the provided clientset pointer. This prevents a delayed 401
// response from an older request from evicting a newer clientset created under the same key.
func evictClientsetIfMatch(headlampContextKey, token string, cs *kubernetes.Clientset) {
	mu.Lock()
	defer mu.Unlock()

	exactKey := headlampContextKey + "\x00" + token
	if elem, found := clientsetCache[exactKey]; found {
		entry := elem.Value.(*lruEntry)
		if entry.cs.clientset == cs {
			delete(clientsetCache, exactKey)
			clientsetLRUList.Remove(elem)
		}

		return
	}

	prefix := headlampContextKey + "\x00"
	suffix := "\x00" + token

	for key, elem := range clientsetCache {
		entry := elem.Value.(*lruEntry)
		if strings.HasPrefix(key, prefix) && strings.HasSuffix(key, suffix) && entry.cs.clientset == cs {
			delete(clientsetCache, key)
			clientsetLRUList.Remove(elem)

			return
		}
	}
}

// createAndCacheClientSet creates a new clientset and stores it in the cache.
func createAndCacheClientSet(
	k *kubeconfig.Context,
	token, cacheKey string,
) (*kubernetes.Clientset, error) {
	hookMu.RLock()

	creator := clientsetCreator

	hookMu.RUnlock()

	cs, err := creator(k, token)
	if err != nil {
		return nil, fmt.Errorf("error while creating clientset for cluster %s: %w", k.Name, err)
	}

	mu.Lock()

	if existingCS, found := getCachedClientSetLocked(cacheKey); found {
		mu.Unlock()

		return existingCS, nil
	}

	prefix := clientsetCachePrefixFromCacheKey(cacheKey)
	if isClientsetPrefixBlockedLocked(prefix) {
		mu.Unlock()

		return cs, nil
	}

	evictedKeys := enforceClientsetCapacityLimit()

	maxLimit := effectiveMaxClientsetsLocked()
	if _, exists := clientsetCache[cacheKey]; !exists && maxLimit > 0 && len(clientsetCache) >= maxLimit {
		// All cached entries are currently in-flight; return cs without caching
		// to strictly preserve the capacity limit without evicting active creations.
		mu.Unlock()
		logClientsetEvictions("LRU capacity", evictedKeys)

		return cs, nil
	}

	cachedCS := &CachedClientSet{clientset: cs, lastUsed: time.Now()}
	elem := clientsetLRUList.PushFront(&lruEntry{key: cacheKey, cs: cachedCS})
	clientsetCache[cacheKey] = elem

	redactedKey := redactClientsetCacheKey(cacheKey)
	mu.Unlock()

	logClientsetEvictions("LRU capacity", evictedKeys)
	logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
		"telemetry: clientset cache miss (stored new clientset) for key %s",
		redactedKey,
	))

	return cs, nil
}

// waitForInFlightClientset waits for another goroutine to finish creating a
// clientset for the same cache key. It blocks on entry.waitCh until
// finishInFlightClientset closes it, then returns the clientset and error
// stored on entry. The caller must not hold mu.
func waitForInFlightClientset(entry *inFlightEntry) (*kubernetes.Clientset, error) {
	hookMu.RLock()

	waitHook := testingInFlightWait

	hookMu.RUnlock()

	waitHook()
	<-entry.waitCh

	return entry.cs, entry.err
}

// finishInFlightClientset records the clientset creation outcome on entry,
// removes cacheKey from the inFlight map, and closes entry.waitCh so any
// goroutines blocked in waitForInFlightClientset can proceed. It also trims
// the cache to ensure no excess entries remain after a limit reduction.
// mu must not be held; this function acquires mu internally.
func finishInFlightClientset(cacheKey string, entry *inFlightEntry, cs *kubernetes.Clientset, err error) {
	mu.Lock()

	entry.cs = cs
	entry.err = err

	delete(inFlight, cacheKey)
	close(entry.waitCh)

	trimClientsetCacheLocked()

	mu.Unlock()
}

// GetClientSet returns *kubernetes.ClientSet and error which is further used for creating
// SSAR requests to k8s server to authorize user. GetClientSet uses kubeconfig.Context and
// authentication bearer token which will help to create clientSet based on the user's
// identity. headlampContextKey is the key used in the kubeconfig store (for stateless
// clusters this includes the user ID, e.g. "cluster\x00userID").
func GetClientSet(headlampContextKey string, k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
	if headlampContextKey == "" {
		return nil, fmt.Errorf("empty headlamp context key in GetClientSet")
	}

	startJanitor()

	contextCacheKey, err := ContextCacheKey(headlampContextKey, k)
	if err != nil {
		return nil, err
	}

	cacheKey := contextCacheKey + "\x00" + token

	// Check cache first
	if cs, found := getCachedClientSet(cacheKey); found {
		return cs, nil
	}

	mu.Lock()

	// Re-check cache under lock before deciding to create.
	if cs, found := getCachedClientSetLocked(cacheKey); found {
		mu.Unlock()

		return cs, nil
	}

	// If another goroutine is already creating this clientset, wait for it.
	if entry, ok := inFlight[cacheKey]; ok {
		mu.Unlock()

		return waitForInFlightClientset(entry)
	}

	// We are the one to create it.
	entry := &inFlightEntry{
		waitCh: make(chan struct{}),
	}
	inFlight[cacheKey] = entry

	mu.Unlock()

	cs, err := createAndCacheClientSet(k, token, cacheKey)

	invokeTestingBeforeFinishInFlight(cacheKey)

	finishInFlightClientset(cacheKey, entry, cs, err)

	return cs, err
}

func invokeTestingBeforeFinishInFlight(cacheKey string) {
	hookMu.RLock()

	fn := testingBeforeFinishInFlight

	hookMu.RUnlock()

	fn(cacheKey)
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
//
// Results are cached for ssarTTL (30 s) to avoid redundant
// SelfSubjectAccessReview API calls for the same user/resource/verb.
func IsAllowed(
	headlampContextKey string,
	k *kubeconfig.Context,
	r *http.Request,
) (bool, error) {
	token := auth.BearerTokenValue(r.Header.Get("Authorization"))

	resourceAttributes, err := getResourceAttributes(r)
	if err != nil {
		return false, err
	}

	// Only cache SSAR results for read verbs (get, list, watch).
	// Non-GET requests produce verb="unknown" which is meaningless to cache.
	// Ambient credentials may rotate without changing ContextCacheKey, so
	// cache only when the current bearer token is explicitly known.
	cacheable := token != "" && isSSARCacheable(resourceAttributes.Verb)

	if !cacheable {
		return requestSSAR(r.Context(), headlampContextKey, k, token, resourceAttributes)
	}

	contextCacheKey, err := ContextCacheKey(headlampContextKey, k)
	if err != nil {
		return false, err
	}

	ssarKey := buildSSARCacheKey(contextCacheKey, token, resourceAttributes)

	allowed, found, inFlight, leader := acquireSSARRequest(ssarKey)
	if found {
		return allowed, nil
	}

	if inFlight == nil {
		return false, errSSARWorkersAtCapacity
	}

	if leader {
		startSSARRequest(r.Context(), ssarKey, inFlight, ssarRequestTimeout, func(ctx context.Context) (bool, error) {
			return requestSSAR(ctx, headlampContextKey, k, token, resourceAttributes)
		})
	}

	return waitForSSARRequest(r.Context(), inFlight)
}

func requestSSAR(
	ctx context.Context,
	headlampContextKey string,
	k *kubeconfig.Context,
	token string,
	resourceAttributes *authorizationv1.ResourceAttributes,
) (bool, error) {
	clientset, err := GetClientSet(headlampContextKey, k, token)
	if err != nil {
		return false, err
	}

	review := &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: resourceAttributes,
		},
	}

	result, err := clientset.AuthorizationV1().SelfSubjectAccessReviews().Create(
		ctx,
		review,
		metav1.CreateOptions{},
	)
	if err != nil {
		if apierrors.IsUnauthorized(err) {
			evictClientsetIfMatch(headlampContextKey, token, clientset)
		}

		return false, err
	}

	if result == nil {
		return false, fmt.Errorf("nil SelfSubjectAccessReview result")
	}

	if result.Status.EvaluationError != "" {
		return false, fmt.Errorf("SelfSubjectAccessReview evaluation error: %s", result.Status.EvaluationError)
	}

	return result.Status.Allowed, nil
}

// isSSARCacheable reports whether an SSAR result for the given verb
// should be cached. Only read verbs (get, list, watch) produce stable,
// meaningful results worth caching. Non-GET HTTP methods map to
// verb="unknown" which is not useful to cache.
func isSSARCacheable(verb string) bool {
	switch verb {
	case "get", "list", "watch":
		return true
	default:
		return false
	}
}

// buildSSARCacheKey produces a unique cache key for an SSAR result
// based on the cluster context, user token, and resource attributes.
// All fields that affect the authorization outcome are included so
// that name-scoped or subresource-scoped RBAC rules produce distinct
// cache entries.
func buildSSARCacheKey(
	contextCacheKey, token string,
	attrs *authorizationv1.ResourceAttributes,
) string {
	fieldSelector := ""
	if attrs.FieldSelector != nil {
		fieldSelector = attrs.FieldSelector.RawSelector
	}

	labelSelector := ""
	if attrs.LabelSelector != nil {
		labelSelector = attrs.LabelSelector.RawSelector
	}

	return strings.Join([]string{
		contextCacheKey,
		token,
		attrs.Group,
		attrs.Version,
		attrs.Resource,
		attrs.Subresource,
		attrs.Verb,
		attrs.Namespace,
		attrs.Name,
		fieldSelector,
		labelSelector,
	}, "\x00")
}

func ssarCachePrefixFromCacheKey(cacheKey string) string {
	prefix := cacheKey

	for range 10 {
		separator := strings.LastIndex(prefix, "\x00")
		if separator < 0 {
			return ""
		}

		prefix = prefix[:separator]
	}

	return prefix
}

// getSSARCacheResult returns the cached SSAR result for the given key.
// The second return value is false if no valid (non-expired) entry exists.
func getSSARCacheResult(key string) (bool, bool) {
	now := time.Now()

	ssarMu.Lock()

	entry, found := ssarCache[key]
	if !found {
		ssarMu.Unlock()
		return false, false
	}

	if !now.Before(entry.expiresAt) {
		deleteSSARCacheEntryLocked(key)
		ssarMu.Unlock()

		return false, false
	}

	allowed := entry.allowed
	ssarMu.Unlock()

	return allowed, true
}

func acquireSSARRequest(key string) (bool, bool, *ssarInFlightEntry, bool) {
	now := time.Now()

	ssarMu.Lock()

	defer ssarMu.Unlock()

	if entry, found := ssarCache[key]; found {
		if now.Before(entry.expiresAt) {
			return entry.allowed, true, nil, false
		}

		deleteSSARCacheEntryLocked(key)
	}

	if entry, found := ssarInFlight[key]; found {
		return false, false, entry, false
	}

	if ssarWorkerCount >= ssarMaxInFlight {
		return false, false, nil, false
	}

	entry := &ssarInFlightEntry{
		waitCh:       make(chan struct{}),
		workerActive: true,
	}
	ssarInFlight[key] = entry
	ssarWorkerCount++

	return false, false, entry, true
}

func waitForSSARRequest(ctx context.Context, entry *ssarInFlightEntry) (bool, error) {
	select {
	case <-entry.waitCh:
		return entry.allowed, entry.err
	case <-ctx.Done():
		return false, ctx.Err()
	}
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
			finishSSARRequest(key, entry, allowed, err)
			close(requestDone)
		}()

		select {
		case <-requestDone:
			return
		case <-ctx.Done():
			timeoutSSARRequest(entry, ctx.Err())
		}
	}()
}

func finishSSARRequest(key string, entry *ssarInFlightEntry, allowed bool, err error) {
	if entry == nil {
		return
	}

	mu.Lock()

	blocked := isClientsetPrefixBlockedLocked(key)

	ssarMu.Lock()

	current, attached := ssarInFlight[key]

	if entry.completed {
		finishSSARWorkerLocked(entry)

		if attached && current == entry {
			delete(ssarInFlight, key)
		}
		ssarMu.Unlock()
		mu.Unlock()

		return
	}

	entry.allowed = allowed
	entry.err = err
	entry.completed = true
	finishSSARWorkerLocked(entry)

	if err == nil && !blocked && attached && current == entry {
		storeSSARCacheResultLocked(key, allowed)
	}

	if attached && current == entry {
		delete(ssarInFlight, key)
	}

	close(entry.waitCh)

	ssarMu.Unlock()
	mu.Unlock()
}

func finishSSARWorkerLocked(entry *ssarInFlightEntry) {
	if !entry.workerActive {
		return
	}

	entry.workerActive = false

	if ssarWorkerCount > 0 {
		ssarWorkerCount--
	}
}

func timeoutSSARRequest(entry *ssarInFlightEntry, err error) {
	ssarMu.Lock()

	if entry.completed {
		ssarMu.Unlock()

		return
	}

	entry.allowed = false
	entry.err = err
	entry.completed = true
	close(entry.waitCh)

	// Keep the current entry attached until its worker exits. This releases
	// callers to fallback immediately without spawning retry workers.
	ssarMu.Unlock()
}

// storeSSARCacheResult stores an SSAR result in the cache with the
// configured TTL.
func storeSSARCacheResult(key string, allowed bool) {
	ssarMu.Lock()

	storeSSARCacheResultLocked(key, allowed)

	ssarMu.Unlock()
}

func storeSSARCacheResultLocked(key string, allowed bool) {
	if _, found := ssarCache[key]; found {
		deleteSSARCacheEntryLocked(key)
	}

	for len(ssarCache) >= ssarCacheMaxEntries {
		element := ssarCacheOrder.Front()
		if element == nil {
			break
		}

		oldestKey, ok := element.Value.(string)
		if !ok {
			ssarCacheOrder.Remove(element)

			continue
		}

		deleteSSARCacheEntryLocked(oldestKey)
	}

	entry := &ssarCacheEntry{
		allowed:   allowed,
		expiresAt: time.Now().Add(ssarTTL),
	}
	entry.orderElement = ssarCacheOrder.PushBack(key)
	ssarCache[key] = entry
}

func deleteSSARCacheEntryLocked(key string) {
	entry, found := ssarCache[key]
	if !found {
		return
	}

	if entry.orderElement != nil {
		ssarCacheOrder.Remove(entry.orderElement)
	}

	delete(ssarCache, key)
}

// evictSSARCacheForPrefix removes all cached SSAR results whose keys
// start with the given context prefix. Called when a cluster context is
// removed so stale authorization decisions are not served.
func evictSSARCacheForPrefix(prefix string) {
	ssarPrefix := prefix + "\x00"

	ssarMu.Lock()

	evicted := 0

	for key := range ssarCache {
		if strings.HasPrefix(key, ssarPrefix) {
			deleteSSARCacheEntryLocked(key)

			evicted++
		}
	}

	for key := range ssarInFlight {
		if strings.HasPrefix(key, ssarPrefix) {
			delete(ssarInFlight, key)
		}
	}

	ssarMu.Unlock()

	if evicted > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("evicted %d cached SSAR result(s) for prefix %s",
				evicted, redactContextKey(prefix)))
	}
}

// evictExpiredSSARResults removes all SSAR cache entries that have
// passed their expiration time. Called by the janitor.
func evictExpiredSSARResults(now time.Time) {
	ssarMu.Lock()

	evicted := 0

	for key, entry := range ssarCache {
		if now.After(entry.expiresAt) {
			deleteSSARCacheEntryLocked(key)

			evicted++
		}
	}

	remaining := len(ssarCache)

	ssarMu.Unlock()

	if evicted > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("janitor: evicted %d expired SSAR result(s), %d remaining", evicted, remaining))
	}
}
