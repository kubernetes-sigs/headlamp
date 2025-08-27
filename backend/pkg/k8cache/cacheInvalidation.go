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
	_ = k8scache.Delete(context.Background(), key)
	keyPart := strings.Split(key, "+")
	keyPart[2] = ""
	key = strings.Join(keyPart, "+")
	_ = k8scache.Delete(context.Background(), key)
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

	key, _ := GenerateKey(r.URL, contextKey)
	DeleteKeys(key, k8scache)

	freshURL := *r.URL

	freshReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, freshURL.String(), nil)
	if err != nil {
		return err
	}

	freshReq.Header = r.Header.Clone()
	next.ServeHTTP(w, r)

	rr := httptest.NewRecorder()
	freshRcw := NewResponseCapture(rr)
	next.ServeHTTP(freshRcw, freshReq)

	if err := StoreK8sResponseInCache(k8scache, freshReq.URL, freshRcw, freshReq, key); err != nil {
		return err
	}

	return nil
}

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

// returnGVRList return gvrList which is group, version, resource which is all the supported resources
// that are supported by the k8s server.
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

	return gvrList
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
	if _, loaded := watcherRegistry.Load(contextKey); loaded {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())

	contextCancel.Store(contextKey, cancel)

	watcherRegistry.Store(contextKey, struct{}{})

	go runWatcher(ctx, k8scache, contextKey, kContext)
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
	logger.Log(logger.LevelInfo, nil, nil, "running runWatcher for watching k8s resource: "+contextKey)

	config, err := kContext.RESTConfig()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "error getting REST config for context:")
		return
	}

	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "error creating dynamic client for context: "+contextKey)
		return
	}

	discoveryClient := discovery.NewDiscoveryClientForConfigOrDie(config)

	apiResourceLists, err := discoveryClient.ServerPreferredResources()
	if apiResourceLists == nil && err != nil {
		logger.Log(logger.LevelError, nil, err, "error fetching resource list for context: "+contextKey)
		return
	}

	gvrList := returnGVRList(apiResourceLists)
	factory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(dynamicClient, 0, "", nil)

	RunInformerToWatch(gvrList, factory, contextKey, k8scache)

	factory.Start(ctx.Done())

	factory.WaitForCacheSync(ctx.Done())

	<-ctx.Done()
	logger.Log(logger.LevelInfo, nil, nil, "Watcher for context "+contextKey+" is shutting down...")
}

// runInformerToWatch watches changes such as Addition, Deletion and Updation of a resource
// and if so capture the data into the key and store all unique keys, and return unique
// keys which will be delete in runWatcher.
func RunInformerToWatch(gvrList []schema.GroupVersionResource,
	factory dynamicinformer.DynamicSharedInformerFactory,
	contextKey string, k8scache cache.Cache[string],
) {
	for _, gvr := range gvrList {
		informer := factory.ForResource(gvr).Informer()

		if _, err := informer.AddEventHandler(watchCache.ResourceEventHandlerFuncs{
			AddFunc: func(obj interface{}) { // resources which are added in the informers, like creation of a resource.
				handleKeyGenerationAndDeletion(obj, gvr, contextKey, k8scache)
			},
			UpdateFunc: func(oldObj, newObj interface{}) { // resources which are updated
				// or changed, like pods configurations was changed.
				handleKeyGenerationAndDeletion(newObj, gvr, contextKey, k8scache)
			},
			DeleteFunc: func(obj interface{}) { // resources which are removed from the informers,
				// deletion of pods or any other resources.
				handleKeyGenerationAndDeletion(obj, gvr, contextKey, k8scache)
			},
		}); err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to add event handler for resource: "+gvr.Resource)
			return
		}
	}
}

// handleKeyGeneration generation key by using gvr's value, which will be used further for deletion of key in cache
// so if the key match it will delete the key from cache.
func handleKeyGenerationAndDeletion(obj interface{}, gvr schema.GroupVersionResource,
	contextKey string, k8scache cache.Cache[string],
) {
	unstructuredObj, ok := obj.(*unstructured.Unstructured)
	if !ok {
		logger.Log(logger.LevelError, nil, nil, "unexpected object type")
		return
	}

	if time.Since(unstructuredObj.GetCreationTimestamp().Time) > time.Minute { // this will let only latest changes rather
		//  than all the all the resource that are just added into informers, as it will
		// cause unnecessary watching of resources that doesn't required to be watched.
		return
	}

	namespace := unstructuredObj.GetNamespace()
	key := fmt.Sprintf("%s+%s+%s+%s", gvr.Group, gvr.Resource, namespace, contextKey) // Generation key using gvr's value

	logger.Log(logger.LevelInfo, nil, nil, key+" will going to be deleted from the cache")

	if err := k8scache.Delete(context.Background(), key); err != nil { // key is deleting from the cache
		logger.Log(logger.LevelError, nil, err, "error while deleting key")
		return
	}
}
