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
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
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

var (
	clientsetCache = make(map[string]*CachedClientSet)
	mu             sync.Mutex
	janitorOnce    sync.Once

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
	mu.Lock()

	now := time.Now()
	evicted := 0

	for key, cs := range clientsetCache {
		if now.Sub(cs.lastUsed) > clientsetTTL {
			delete(clientsetCache, key)

			evicted++
		}
	}

	remaining := len(clientsetCache)

	mu.Unlock()

	if evicted > 0 {
		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("janitor: evicted %d expired clientset(s), %d remaining", evicted, remaining))
	}
}

// getCachedClientSet retrieves a clientset from the cache if it's valid and not expired.
func getCachedClientSet(cacheKey string) (*kubernetes.Clientset, bool) {
	mu.Lock()

	cs, found := clientsetCache[cacheKey]
	if !found {
		mu.Unlock()
		return nil, false
	}

	now := time.Now()

	if now.Sub(cs.lastUsed) > clientsetTTL {
		delete(clientsetCache, cacheKey)

		// Extract cluster name from cacheKey (format: "clusterName\x00token")
		clusterName := strings.Split(cacheKey, "\x00")[0]
		mu.Unlock()

		logger.Log(logger.LevelInfo, nil, nil,
			fmt.Sprintf("expired clientset for cluster %s was deleted", clusterName))

		return nil, false
	}

	cs.lastUsed = now
	mu.Unlock()

	return cs.clientset, true
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

	// Double-check: another goroutine might have created a clientset for the same key
	// while we were unlocked (though inFlight should prevent this for the same key,
	// it's good practice for general double-checked locking).
	if existing, found := clientsetCache[cacheKey]; found {
		now := time.Now()
		if now.Sub(existing.lastUsed) <= clientsetTTL {
			// Reuse the existing one and discard ours.
			existing.lastUsed = now

			return existing.clientset, nil
		}
	}

	clientsetCache[cacheKey] = &CachedClientSet{
		clientset: cs,
		lastUsed:  time.Now(),
	}

	return cs, nil
}

// GetClientSet returns *kubernetes.ClientSet and error which is further used for creating
// SSAR requests to k8s server to authorize user. GetClientSet uses kubeconfig.Context and
// authentication bearer token which will help to create clientSet based on the user's
// identity.
func GetClientSet(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
	contextKey := strings.Split(k.ClusterID, "+")
	if len(contextKey) < 2 {
		return nil, fmt.Errorf("unexpected ClusterID format in getClientSet: %q", k.ClusterID)
	}

	startJanitor()

	cacheKey := contextKey[1] + "\x00" + token

	// Check cache first
	if cs, found := getCachedClientSet(cacheKey); found {
		return cs, nil
	}

	mu.Lock()

	// Re-check cache under lock before deciding to create
	if cs, found := clientsetCache[cacheKey]; found {
		now := time.Now()
		if now.Sub(cs.lastUsed) <= clientsetTTL {
			cs.lastUsed = now
			mu.Unlock()

			return cs.clientset, nil
		}
	}

	// If another goroutine is already creating this clientset, wait for it.
	if entry, ok := inFlight[cacheKey]; ok {
		mu.Unlock()

		hookMu.RLock()

		waitHook := testingInFlightWait

		hookMu.RUnlock()

		waitHook()
		<-entry.waitCh

		// Return the shared result.
		return entry.cs, entry.err
	}

	// We are the one to create it.
	entry := &inFlightEntry{
		waitCh: make(chan struct{}),
	}
	inFlight[cacheKey] = entry

	mu.Unlock()

	cs, err := createAndCacheClientSet(k, token, cacheKey, contextKey)

	mu.Lock()

	entry.cs = cs
	entry.err = err

	delete(inFlight, cacheKey)
	close(entry.waitCh)

	mu.Unlock()

	return cs, err
}

// GetKindAndVerb extracts the Kubernetes resource kind and intended verb (e.g., get, watch)
// from the incoming HTTP request.
func GetKindAndVerb(r *http.Request) (string, string) {
	apiPath, ok := mux.Vars(r)["api"]
	if !ok || apiPath == "" {
		return "", "unknown"
	}

	parts := strings.Split(apiPath, "/")
	last := parts[len(parts)-1]

	var kubeVerb string

	isWatch, _ := strconv.ParseBool(r.URL.Query().Get("watch"))

	switch r.Method {
	case "GET":
		if isWatch {
			kubeVerb = "watch"
		} else {
			kubeVerb = "get"
		}
	default:
		kubeVerb = "unknown"
	}

	return last, kubeVerb
}

// IsAllowed checks the user's permission to access the resource.
// If the user is authorized and has permission to view the resources, it returns true.
// Otherwise, it returns false if authorization fails.
func IsAllowed(
	k *kubeconfig.Context,
	r *http.Request,
) (bool, error) {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	token = strings.TrimSpace(token)

	clientset, err := GetClientSet(k, token)
	if err != nil {
		return false, err
	}

	last, kubeVerb := GetKindAndVerb(r)
	if last == "" || kubeVerb == "" {
		return false, fmt.Errorf("could not determine resource or verb from request")
	}

	review := &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authorizationv1.ResourceAttributes{
				Resource: last,
				Verb:     kubeVerb,
			},
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

	err := StoreK8sResponseInCache(k8scache, r.URL, rcw, r, key)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "error while storing in the cache")
		return
	}
}
