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
	"fmt"
	"net/http"
	"os"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"time"
	"unsafe"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	authorizationv1 "k8s.io/api/authorization/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// clientsetTTL is how long an idle clientset stays in the cache before
// it becomes eligible for eviction.
const clientsetTTL = 10 * time.Minute

const unknownVerb = "unknown"

// janitorInterval is how often the background goroutine sweeps the
// cache for expired entries.
const janitorInterval = 5 * time.Minute

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

var (
	clientsetCache   = make(map[string]*list.Element)
	clientsetLRUList = list.New()

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

	return 100 // default limit
}

func closeClientsetIdleConnections(cs *kubernetes.Clientset) {
	if cs == nil {
		return
	}

	closeRESTClientConnections(cs.CoreV1().RESTClient())
}

func closeRESTClientConnections(rc rest.Interface) {
	if rc == nil {
		return
	}

	restClient, ok := rc.(*rest.RESTClient)
	if !ok || restClient == nil || restClient.Client == nil {
		return
	}

	if restClient.Client.Transport != nil {
		closeTransportIdleConnections(restClient.Client.Transport)
	}
}

func closeTransportIdleConnections(tr http.RoundTripper) {
	if tr == nil {
		return
	}

	type closeIdler interface {
		CloseIdleConnections()
	}

	if ci, ok := tr.(closeIdler); ok {
		ci.CloseIdleConnections()

		return
	}

	val := reflect.ValueOf(tr)
	// govet inline sometimes flags reflect.Ptr here; this explicit check is intentional.
	if val.Kind() != reflect.Ptr { //nolint:govet
		return
	}

	elem := val.Elem()
	if elem.Kind() != reflect.Struct {
		return
	}

	for i := 0; i < elem.NumField(); i++ {
		f := elem.Type().Field(i)
		fieldVal := elem.Field(i)

		if f.Type.String() == "http.RoundTripper" {
			ptr := unsafe.Pointer(fieldVal.UnsafeAddr()) //nolint:gosec
			rtPtr := (*http.RoundTripper)(ptr)

			if rtPtr != nil && *rtPtr != nil {
				closeTransportIdleConnections(*rtPtr)
			}
		}
	}
}

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
// every entry older than clientsetTTL.
func evictExpiredClientsets() {
	logger.Log(logger.LevelInfo, nil, nil, "telemetry: cache-janitor started sweep")

	mu.Lock()

	now := time.Now()
	evicted := 0

	for elem := clientsetLRUList.Back(); elem != nil; {
		prev := elem.Prev()
		entry := elem.Value.(*lruEntry)

		if now.Sub(entry.cs.lastUsed) > clientsetTTL {
			closeClientsetIdleConnections(entry.cs.clientset)
			delete(clientsetCache, entry.key)
			clientsetLRUList.Remove(elem)

			evicted++

			logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
				"telemetry: clientset cache eviction (expired/janitor) for key %s",
				redactClientsetCacheKey(entry.key),
			))
		}

		elem = prev
	}

	pruneBlockedClientsetPrefixesLocked(now)

	remaining := len(clientsetCache)

	mu.Unlock()

	logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
		"telemetry: cache-janitor completed sweep: evicted %d expired clientsets",
		evicted,
	))

	if evicted > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("janitor: evicted %d expired clientset(s), %d remaining", evicted, remaining))
	}
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
// TTL expiry. The prefix is the Headlamp context store key (the part before the token
// separator in clientset cache keys), which includes the user ID for stateless contexts.
func EvictClientsetsForCluster(clientsetCachePrefix string) {
	if clientsetCachePrefix == "" {
		return
	}

	startJanitor()

	prefix := clientsetCachePrefix + "\x00"

	mu.Lock()

	blockedClientsetPrefixes[clientsetCachePrefix] = blockedPrefixEntry{blockedAt: time.Now()}

	evicted := 0

	for elem := clientsetLRUList.Front(); elem != nil; {
		next := elem.Next()
		entry := elem.Value.(*lruEntry)

		if strings.HasPrefix(entry.key, prefix) {
			closeClientsetIdleConnections(entry.cs.clientset)
			delete(clientsetCache, entry.key)
			clientsetLRUList.Remove(elem)

			evicted++

			logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
				"telemetry: clientset cache eviction (context cleanup) for key %s",
				redactClientsetCacheKey(entry.key),
			))
		}

		elem = next
	}

	remaining := len(clientsetCache)

	mu.Unlock()

	if evicted > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("evicted %d clientset(s) for removed clientset cache prefix %s, %d remaining",
				evicted, redactContextKey(clientsetCachePrefix), remaining))
	}
}

// clientsetCachePrefixFromCacheKey returns the Headlamp context store key prefix
// from a clientset cache key (everything before the final NUL separator).
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
		delete(blockedClientsetPrefixes, clientsetCachePrefixFromContextKey(contextKey))
	}
}

// getCachedClientSet retrieves a clientset from the cache if it's valid and not expired.
func getCachedClientSet(cacheKey string) (*kubernetes.Clientset, bool) {
	mu.Lock()
	defer mu.Unlock()

	elem, found := clientsetCache[cacheKey]
	if !found {
		logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
			"telemetry: clientset cache miss for key %s",
			redactClientsetCacheKey(cacheKey),
		))

		return nil, false
	}

	entry := elem.Value.(*lruEntry)
	now := time.Now()

	if now.Sub(entry.cs.lastUsed) > clientsetTTL {
		closeClientsetIdleConnections(entry.cs.clientset)
		delete(clientsetCache, cacheKey)
		clientsetLRUList.Remove(elem)

		redactedContext := redactContextKey(clientsetCachePrefixFromCacheKey(cacheKey))
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("expired clientset for cluster %s was deleted", redactedContext))

		logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
			"telemetry: clientset cache eviction (expired/access) for key %s",
			redactClientsetCacheKey(cacheKey),
		))

		return nil, false
	}

	entry.cs.lastUsed = now

	clientsetLRUList.MoveToFront(elem)

	logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
		"telemetry: clientset cache hit for key %s",
		redactClientsetCacheKey(cacheKey),
	))

	return entry.cs.clientset, true
}

// enforceClientsetCapacityLimit evicts the least recently used clientset(s) if we are at/over capacity.
// mu must be held.
func enforceClientsetCapacityLimit() {
	maxLimit := getMaxClientsetsLimit()
	for len(clientsetCache) >= maxLimit && clientsetLRUList.Len() > 0 {
		tailElem := clientsetLRUList.Back()
		if tailElem != nil {
			tailEntry := tailElem.Value.(*lruEntry)
			closeClientsetIdleConnections(tailEntry.cs.clientset)
			delete(clientsetCache, tailEntry.key)
			clientsetLRUList.Remove(tailElem)

			logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
				"telemetry: clientset cache eviction (LRU capacity) for key %s",
				redactClientsetCacheKey(tailEntry.key),
			))
		}
	}
}

// createAndCacheClientSet creates a new clientset and stores it in the cache.
func createAndCacheClientSet(
	k *kubeconfig.Context,
	token, cacheKey string,
	contextKey []string,
) (*kubernetes.Clientset, error) {
	hookMu.RLock()

	creator := clientsetCreator

	hookMu.RUnlock()

	cs, err := creator(k, token)
	if err != nil {
		return nil, fmt.Errorf("error while creating clientset for cluster %s: %w", contextKey[1], err)
	}

	mu.Lock()
	defer mu.Unlock()

	if existingElem, found := clientsetCache[cacheKey]; found {
		existingEntry := existingElem.Value.(*lruEntry)

		if time.Since(existingEntry.cs.lastUsed) <= clientsetTTL {
			existingEntry.cs.lastUsed = time.Now()

			clientsetLRUList.MoveToFront(existingElem)

			logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
				"telemetry: clientset cache hit (duplicate create) for key %s",
				redactClientsetCacheKey(cacheKey),
			))

			closeClientsetIdleConnections(cs)

			return existingEntry.cs.clientset, nil
		}
	}

	prefix := clientsetCachePrefixFromCacheKey(cacheKey)
	if _, blocked := blockedClientsetPrefixes[prefix]; blocked {
		return cs, nil
	}

	enforceClientsetCapacityLimit()

	cachedCS := &CachedClientSet{clientset: cs, lastUsed: time.Now()}
	elem := clientsetLRUList.PushFront(&lruEntry{key: cacheKey, cs: cachedCS})
	clientsetCache[cacheKey] = elem

	logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
		"telemetry: clientset cache miss (stored new clientset) for key %s",
		redactClientsetCacheKey(cacheKey),
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
// goroutines blocked in waitForInFlightClientset can proceed. mu must not be
// held; this function acquires mu internally.
func finishInFlightClientset(cacheKey string, entry *inFlightEntry, cs *kubernetes.Clientset, err error) {
	mu.Lock()

	entry.cs = cs
	entry.err = err

	delete(inFlight, cacheKey)
	close(entry.waitCh)

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

	contextKey := strings.Split(k.ClusterID, "+")
	if len(contextKey) < 2 {
		return nil, fmt.Errorf("unexpected ClusterID format in GetClientSet: %q", k.ClusterID)
	}

	startJanitor()

	cacheKey := headlampContextKey + "\x00" + token

	// Check cache first
	if cs, found := getCachedClientSet(cacheKey); found {
		return cs, nil
	}

	mu.Lock()

	// Re-check cache under lock before deciding to create
	if elem, found := clientsetCache[cacheKey]; found {
		entry := elem.Value.(*lruEntry)
		now := time.Now()

		if now.Sub(entry.cs.lastUsed) <= clientsetTTL {
			entry.cs.lastUsed = now

			clientsetLRUList.MoveToFront(elem)

			mu.Unlock()

			logger.Log(logger.LevelInfo, nil, nil, fmt.Sprintf(
				"telemetry: clientset cache hit (under lock) for key %s",
				redactClientsetCacheKey(cacheKey),
			))

			return entry.cs.clientset, nil
		}
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

	cs, err := createAndCacheClientSet(k, token, cacheKey, contextKey)

	finishInFlightClientset(cacheKey, entry, cs, err)

	return cs, err
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
func IsAllowed(
	headlampContextKey string,
	k *kubeconfig.Context,
	r *http.Request,
) (bool, error) {
	token := auth.BearerTokenValue(r.Header.Get("Authorization"))

	clientset, err := GetClientSet(headlampContextKey, k, token)
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
