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
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	watchCache "k8s.io/client-go/tools/cache"
)

// DeleteKeys deletes keys from the cache if data is present
// in cache, this delete keys having namespace non-empty and
// also empty namespace.
func DeleteKeys(key string, k8scache cache.Cache[string]) {
	resourceIndexMu.Lock()
	defer resourceIndexMu.Unlock()

	deleteKeysLocked(key, k8scache)
}

func deleteKeysLocked(key string, k8scache cache.Cache[string]) {
	_ = k8scache.Delete(context.Background(), key)
	unindexCacheKeyLocked(key)

	keyPart := strings.Split(key, "+")
	if len(keyPart) < 4 {
		return // malformed key; nothing to namespace-strip
	}

	nsIdx := len(keyPart) - 2
	keyPart[nsIdx] = ""
	allNsKey := strings.Join(keyPart, "+")
	_ = k8scache.Delete(context.Background(), allNsKey)
	unindexCacheKeyLocked(allNsKey)
}

// handleNonGetInvalidation handle request which are modifying eg. POST/DELETE/PUT and delete keys if
// the data is present in the cache, if present PURGE the keys from the cache and make a fresh new
// request to k8s server and store into the cache, the cache has now latest changes.
func HandleNonGETCacheInvalidation(k8scache cache.Cache[string], w http.ResponseWriter, r *http.Request,
	next http.Handler, contextKey string,
) error {
	// Skip cache invalidation if this is a GET request or the path is not allowed for auth error handling.
	if r.Method == http.MethodGet || !IsAuthBypassURL(r.URL.Path) {
		return nil
	}

	key, err := GenerateKey(r.URL, contextKey)
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "could not generate cache key; skipping invalidation")

		next.ServeHTTP(w, r)

		return ErrHandled
	}

	DeleteKeys(key, k8scache)

	if apiGroup, apiVersion, gErr := GetAPIGroup(r.URL.Path); gErr == nil {
		namespace, kind := extractNamespaceAndResourcePath(r.URL)
		if resource, name := extractBaseResourceAndName(kind); resource != "" {
			gvr := schema.GroupVersionResource{
				Group:    apiGroup,
				Version:  apiVersion,
				Resource: resource,
			}
			invalidateCacheKeysForResourceEvent(gvr, namespace, name, contextKey, k8scache)
		}
	}

	freshURL := *r.URL

	freshReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, freshURL.String(), nil) //nolint:gosec
	if err != nil {
		return err
	}

	freshReq.Header = r.Header.Clone()
	next.ServeHTTP(w, r)

	rr := httptest.NewRecorder()
	freshRcw := NewResponseCapture(rr)
	next.ServeHTTP(freshRcw, freshReq)

	if err := StoreK8sResponseInCache(k8scache, freshReq.URL, freshRcw, key); err != nil {
		return err
	}

	return ErrHandled
}

// ErrHandled indicates the request was fully handled by cache invalidation; middleware must return.
var ErrHandled = errors.New("handled by cache invalidation")

// SkipWebSocket skip all the websocket requests coming from the client/ frontend to ensure
// real time data updation in the frontend.
func SkipWebSocket(r *http.Request, next http.Handler, w http.ResponseWriter) bool {
	if strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade") {
		logger.Log(logger.LevelInfo, nil, nil, "skipping websocket url")
		next.ServeHTTP(w, r)

		return true
	}

	return false
}

// returnGVRList returns list+watch GroupVersionResources filtered to an allowlisted set of
// API resource names (e.g. pods, deployments) used for cache invalidation watchers.
func returnGVRList(apiResourceLists []*metav1.APIResourceList) []schema.GroupVersionResource {
	skipKinds := map[string]bool{
		"Lease": true,
		"Event": true,
	}

	var gvrList []schema.GroupVersionResource

	for _, apiResource := range apiResourceLists {
		for _, resource := range apiResource.APIResources {
			if strings.Contains(resource.Name, "/") || skipKinds[resource.Kind] {
				continue
			}

			if slices.Contains(resource.Verbs, "list") && slices.Contains(resource.Verbs, "watch") {
				gv, err := schema.ParseGroupVersion(apiResource.GroupVersion)
				if err != nil {
					continue
				}

				gvrList = append(gvrList, schema.GroupVersionResource{
					Group:    gv.Group,
					Version:  gv.Version,
					Resource: resource.Name,
				})
			}
		}
	}

	filtered := filterImportantResources(gvrList)

	return filtered
}

// filterImportantResources filters the provided list of GroupVersionResources to
// include only those that are deemed important for caching and watching.
func filterImportantResources(gvrList []schema.GroupVersionResource) []schema.GroupVersionResource {
	allowed := map[string]struct{}{
		"pods":         {},
		"services":     {},
		"deployments":  {},
		"replicasets":  {},
		"statefulsets": {},
		"daemonsets":   {},
		"nodes":        {},
		"configmaps":   {},
		"secrets":      {},
		"jobs":         {},
		"cronjobs":     {},
	}

	filtered := make([]schema.GroupVersionResource, 0, len(allowed))

	for _, gvr := range gvrList {
		if _, ok := allowed[gvr.Resource]; ok {
			filtered = append(filtered, gvr)
		}
	}

	return filtered
}

// Corrected CheckForChanges.
var (
	watcherRegistry sync.Map
	contextCancel   sync.Map
)

// CheckForChanges lets 1 go routine to run for a contextKey which prevents
// running go routines for every requests which can become performance issue if
// there are many resource and events are going on.
func CheckForChanges(
	k8scache cache.Cache[string],
	contextKey string,
	kContext kubeconfig.Context,
) {
	if _, loaded := watcherRegistry.LoadOrStore(contextKey, struct{}{}); loaded {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())

	contextCancel.Store(contextKey, cancel)

	go runWatcher(ctx, k8scache, contextKey, kContext)
}

// SyncWatchers stops watchers for contexts that are no longer active and purges
// their cached API responses and authorization clientsets.
// activeContexts is a list of currently valid context keys.
func SyncWatchers(k8scache cache.Cache[string], activeContexts []string) {
	clearBlockedClientsetPrefixesForActiveContexts(activeContexts)

	activeMap := make(map[string]bool, len(activeContexts))
	for _, ctx := range activeContexts {
		activeMap[ctx] = true
	}

	cleaned := make(map[string]struct{})

	contextCancel.Range(func(key, value interface{}) bool {
		contextKey, ok := key.(string)
		if !ok {
			return true
		}

		if !activeMap[contextKey] {
			if cancel, ok := value.(context.CancelFunc); ok {
				logger.Log(logger.LevelInfo, nil, nil, "canceling watcher for removed context: "+redactContextKey(contextKey))
				cancel()
				watcherRegistry.Delete(contextKey)
				contextCancel.Delete(contextKey)
				cleanupRemovedContext(k8scache, contextKey)
				cleaned[contextKey] = struct{}{}
			}
		}

		return true
	})

	for contextKey := range collectCachedContextKeys(k8scache) {
		if activeMap[contextKey] {
			continue
		}

		if _, alreadyCleaned := cleaned[contextKey]; alreadyCleaned {
			continue
		}

		cleanupRemovedContext(k8scache, contextKey)
	}
}

// runWatcher is a long-lived goroutine that sets up and runs Kubernetes informers.
// It watches for resource changes and invalidates corresponding cache entries.
// This function will only exit when its context is cancelled.
func runWatcher(
	ctx context.Context,
	k8scache cache.Cache[string],
	contextKey string,
	kContext kubeconfig.Context,
) {
	defer func() {
		watcherRegistry.Delete(contextKey)
		contextCancel.Delete(contextKey)
	}()

	logger.Log(logger.LevelInfo, nil, nil, "running runWatcher for watching k8s resource: "+redactContextKey(contextKey))

	config, err := kContext.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "error getting REST config for context:")
		return
	}

	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "error creating dynamic client for context: "+redactContextKey(contextKey))
		return
	}

	discoveryClient := discovery.NewDiscoveryClientForConfigOrDie(config)

	apiResourceLists, err := discoveryClient.ServerPreferredResources()
	if apiResourceLists == nil && err != nil {
		logger.Log(logger.LevelError, nil, err, "error fetching resource list for context: "+redactContextKey(contextKey))
		return
	}

	gvrList := returnGVRList(apiResourceLists)
	factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(dynamicClient, 0, "", nil)

	RunInformerToWatch(gvrList, factory, contextKey, k8scache)

	factory.Start(ctx.Done())

	factory.WaitForCacheSync(ctx.Done())

	<-ctx.Done()
	logger.Log(logger.LevelInfo, nil, nil, "Watcher for context "+redactContextKey(contextKey)+" is shutting down...")
}

// RunInformerToWatch registers informers for the provided resources and watches
// for add, update, and delete events. When a change is observed, it invalidates
// the related cache entries for the given context.
func RunInformerToWatch(gvrList []schema.GroupVersionResource,
	factory dynamicinformer.DynamicSharedInformerFactory,
	contextKey string, k8scache cache.Cache[string],
) {
	for _, gvr := range gvrList {
		informer := factory.ForResource(gvr).Informer()

		// hasSynced gates cache invalidation so that events from the informer's
		// initial list-and-watch sync do not trigger unnecessary evictions.
		hasSynced := informer.HasSynced

		if _, err := informer.AddEventHandler(watchCache.ResourceEventHandlerFuncs{
			AddFunc: func(obj interface{}) { // resources which are added in the informers, like creation of a resource.
				handleKeyGenerationAndDeletion(obj, gvr, contextKey, k8scache, hasSynced)
			},
			UpdateFunc: func(oldObj, newObj interface{}) { // resources which are updated
				// or changed, like pods configurations was changed.
				handleKeyGenerationAndDeletion(newObj, gvr, contextKey, k8scache, hasSynced)
			},
			DeleteFunc: func(obj interface{}) { // resources which are removed from the informers,
				// deletion of pods or any other resources.
				handleKeyGenerationAndDeletion(obj, gvr, contextKey, k8scache, hasSynced)
			},
		}); err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to add event handler for resource: "+gvr.Resource)
			return
		}
	}
}

// handleKeyGenerationAndDeletion generates a cache key from the GVR and deletes
// the corresponding entry from the cache so that stale data is not served.
//
// hasSynced must be informer.HasSynced. Cache eviction is skipped until the
// informer's initial list-and-watch sync is complete.
func handleKeyGenerationAndDeletion(obj interface{}, gvr schema.GroupVersionResource,
	contextKey string, k8scache cache.Cache[string], hasSynced func() bool,
) {
	unstructuredObj, ok := obj.(*unstructured.Unstructured)
	if !ok {
		// Handle tombstones for Delete events where the object is unknown.
		if tombstone, isTombstone := obj.(watchCache.DeletedFinalStateUnknown); isTombstone {
			unstructuredObj, ok = tombstone.Obj.(*unstructured.Unstructured)
		}
	}

	if !ok {
		logger.Log(logger.LevelError, nil, nil, "unexpected object type")
		return
	}

	// Skip cache invalidation until the informer has completed its initial
	// list-and-watch sync, preventing unnecessary evictions during startup.
	if !hasSynced() {
		return
	}

	invalidateCacheKeysForResourceEvent(
		gvr,
		unstructuredObj.GetNamespace(),
		unstructuredObj.GetName(),
		contextKey,
		k8scache,
	)
}

var (
	resourceIndexMu sync.RWMutex
	// resourceKeyIndex maps bucketKey (contextKey + "+" + group + "+" + resource + "+" + namespace)
	// to a map of cacheKey -> expiresAt time.Time.
	resourceKeyIndex = make(map[string]map[string]time.Time)

	indexJanitorOnce sync.Once
)

func startIndexJanitor() {
	indexJanitorOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(5 * time.Minute)
			defer ticker.Stop()

			for range ticker.C {
				resourceIndexMu.Lock()
				evictExpiredIndexEntriesLocked(time.Now())
				resourceIndexMu.Unlock()
			}
		}()
	})
}

func evictExpiredIndexEntriesLocked(now time.Time) {
	for bucketKey, bucket := range resourceKeyIndex {
		for key, exp := range bucket {
			if !exp.IsZero() && !now.Before(exp) {
				delete(bucket, key)
			}
		}

		if len(bucket) == 0 {
			delete(resourceKeyIndex, bucketKey)
		}
	}
}

func buildIndexBucketKey(contextKey, group, resource, namespace string) string {
	return escapeCacheKeySegment(contextKey) + "+" +
		escapeCacheKeySegment(group) + "+" +
		escapeCacheKeySegment(resource) + "+" +
		escapeCacheKeySegment(namespace)
}

func extractBaseResourceAndName(kindPart string) (string, string) {
	if idx := strings.Index(kindPart, "?"); idx != -1 {
		kindPart = kindPart[:idx]
	}

	parts := strings.Split(kindPart, "/")
	if len(parts) == 0 || parts[0] == "" {
		return "", ""
	}

	resource := parts[0]

	name := ""
	if len(parts) > 1 {
		name = parts[1]
	}

	return resource, name
}

func extractBaseResource(kindPart string) string {
	resource, _ := extractBaseResourceAndName(kindPart)
	return resource
}

func indexCacheKeyLocked(key string, expiresAt time.Time) {
	startIndexJanitor()

	group, _, kind, namespace, contextKey, ok := parseCacheKey(key)
	if !ok || contextKey == "" {
		return
	}

	resource := extractBaseResource(kind)
	if resource == "" {
		return
	}

	bucketKey := buildIndexBucketKey(contextKey, group, resource, namespace)

	bucket, exists := resourceKeyIndex[bucketKey]
	if !exists {
		bucket = make(map[string]time.Time)
		resourceKeyIndex[bucketKey] = bucket
	}

	if currExp, found := bucket[key]; !found || expiresAt.After(currExp) {
		bucket[key] = expiresAt
	}
}

func indexCacheKey(key string) {
	resourceIndexMu.Lock()
	defer resourceIndexMu.Unlock()

	indexCacheKeyLocked(key, time.Time{})
}

func unindexCacheKeyLocked(key string) {
	unindexIfExpiredLocked(key, time.Time{})
}

func unindexIfExpired(key string) {
	resourceIndexMu.Lock()
	defer resourceIndexMu.Unlock()

	unindexIfExpiredLocked(key, time.Now())
}

func unindexIfExpiredLocked(key string, now time.Time) {
	group, _, kind, namespace, contextKey, ok := parseCacheKey(key)
	if !ok || contextKey == "" {
		return
	}

	resource := extractBaseResource(kind)
	if resource == "" {
		return
	}

	bucketKey := buildIndexBucketKey(contextKey, group, resource, namespace)

	bucket, exists := resourceKeyIndex[bucketKey]
	if !exists {
		return
	}

	exp, found := bucket[key]
	if !found {
		return
	}

	// If now is non-zero, this is an expiration event. Synchronize check:
	// only unindex if the entry has truly expired. If a newer response
	// replaced this key, exp will be after now, so we keep the replacement.
	if !now.IsZero() && !exp.IsZero() && now.Before(exp) {
		return
	}

	delete(bucket, key)

	if len(bucket) == 0 {
		delete(resourceKeyIndex, bucketKey)
	}
}

func purgeIndexForContext(contextKey string) {
	escapedContext := escapeCacheKeySegment(contextKey)
	prefix := escapedContext + "+"

	resourceIndexMu.Lock()
	defer resourceIndexMu.Unlock()

	for bucketKey := range resourceKeyIndex {
		if strings.HasPrefix(bucketKey, prefix) {
			delete(resourceKeyIndex, bucketKey)
		}
	}
}

func matchesResourceInvalidation(k string, gvr schema.GroupVersionResource, namespace, name, contextKey string) bool {
	group, _, kindPart, keyNs, keyCtx, ok := parseCacheKey(k)
	if !ok {
		return false
	}

	if keyCtx != contextKey {
		return false
	}

	if group != gvr.Group {
		return false
	}

	// Namespace matching: events in a namespace invalidate that namespace
	// and cluster-wide (empty namespace) queries for that resource.
	if keyNs != "" && keyNs != namespace {
		return false
	}

	// If list query for this resource: e.g. pods or pods?labelSelector=...
	if kindPart == gvr.Resource || strings.HasPrefix(kindPart, gvr.Resource+"?") {
		return true
	}

	if name == "" {
		return false
	}

	// If named resource GET or subresource: e.g. pods/web, pods/web/log, pods/web?...
	// Boundary check: must match exact target, or be followed by '/' or '?'
	targetNamedResource := gvr.Resource + "/" + name
	if kindPart == targetNamedResource ||
		strings.HasPrefix(kindPart, targetNamedResource+"/") ||
		strings.HasPrefix(kindPart, targetNamedResource+"?") {
		return true
	}

	// Legacy named key (without resource prefix): name, name/..., name?...
	if kindPart == name ||
		strings.HasPrefix(kindPart, name+"/") ||
		strings.HasPrefix(kindPart, name+"?") {
		return true
	}

	return false
}

func getKeysForResourceInvalidationLocked(
	gvr schema.GroupVersionResource,
	namespace, name, contextKey string,
) []string {
	var candidateKeys []string

	collectCandidates := func(bucketKey string) {
		bucket, exists := resourceKeyIndex[bucketKey]
		if !exists {
			return
		}

		now := time.Now()

		for k, exp := range bucket {
			if !exp.IsZero() && !now.Before(exp) {
				delete(bucket, k)

				continue
			}

			candidateKeys = append(candidateKeys, k)
		}

		if len(bucket) == 0 {
			delete(resourceKeyIndex, bucketKey)
		}
	}

	nsBucket := buildIndexBucketKey(contextKey, gvr.Group, gvr.Resource, namespace)
	collectCandidates(nsBucket)

	if namespace != "" {
		allNsBucket := buildIndexBucketKey(contextKey, gvr.Group, gvr.Resource, "")
		collectCandidates(allNsBucket)
	}

	var toDelete []string

	for _, k := range candidateKeys {
		if matchesResourceInvalidation(k, gvr, namespace, name, contextKey) {
			toDelete = append(toDelete, k)
		}
	}

	return toDelete
}

// invalidateCacheKeysForResourceEvent evicts cached list responses (including the
// all-namespace list variant via deleteKeysLocked) and cached named GET and subresource responses.
func invalidateCacheKeysForResourceEvent(
	gvr schema.GroupVersionResource,
	namespace, name, contextKey string,
	k8scache cache.Cache[string],
) {
	resourceIndexMu.Lock()
	defer resourceIndexMu.Unlock()

	listKey := buildCacheKey(gvr.Group, gvr.Version, gvr.Resource, namespace, contextKey)

	logger.Log(logger.LevelInfo, nil, nil,
		redactCacheKey(listKey)+" and related cache keys will be deleted from the cache")

	deleteKeysLocked(listKey, k8scache)

	// Also evict legacy 4-segment list key for backward compatibility.
	legacyListKey := buildLegacyCacheKey(gvr.Group, gvr.Resource, namespace, contextKey)
	deleteKeysLocked(legacyListKey, k8scache)

	if name != "" {
		// Evict named key (+version+name+ns+ctx) and legacy named key (+name+ns+ctx).
		namedKey := buildCacheKey(gvr.Group, gvr.Version, name, namespace, contextKey)
		if err := k8scache.Delete(context.Background(), namedKey); err != nil {
			logger.Log(logger.LevelError, nil, err, "error while deleting key")
		}

		unindexCacheKeyLocked(namedKey)

		legacyNamedKey := buildLegacyCacheKey(gvr.Group, name, namespace, contextKey)
		if err := k8scache.Delete(context.Background(), legacyNamedKey); err != nil {
			logger.Log(logger.LevelError, nil, err, "error while deleting key")
		}

		unindexCacheKeyLocked(legacyNamedKey)

		// Evict canonical resource-qualified named key (+version+resource/name+ns+ctx)
		// and legacy resource-qualified named key (+resource/name+ns+ctx).
		namedResourceKey := buildCacheKey(gvr.Group, gvr.Version, gvr.Resource+"/"+name, namespace, contextKey)
		if err := k8scache.Delete(context.Background(), namedResourceKey); err != nil {
			logger.Log(logger.LevelError, nil, err, "error while deleting key")
		}

		unindexCacheKeyLocked(namedResourceKey)

		legacyNamedResourceKey := buildLegacyCacheKey(gvr.Group, gvr.Resource+"/"+name, namespace, contextKey)
		if err := k8scache.Delete(context.Background(), legacyNamedResourceKey); err != nil {
			logger.Log(logger.LevelError, nil, err, "error while deleting key")
		}

		unindexCacheKeyLocked(legacyNamedResourceKey)
	}

	// Invalidate any cached list queries with query parameters (e.g. ?labelSelector=...),
	// multiple served-version entries, or subresource entries matching this resource.
	keysToDelete := getKeysForResourceInvalidationLocked(gvr, namespace, name, contextKey)

	for _, k := range keysToDelete {
		_ = k8scache.Delete(context.Background(), k)
		unindexCacheKeyLocked(k)
	}
}
