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
	"crypto/sha256"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/metadata"
	"k8s.io/client-go/rest"
)

const responseTTL = 10 * time.Minute

type resourceScope struct {
	Context                   string
	Resource                  schema.GroupVersionResource
	Namespace, Labels, Fields string
}

type resourceWatcher struct {
	scope         resourceScope
	cache         cache.Cache[string]
	cancel        context.CancelFunc
	done          chan struct{}
	generation    uint64
	ready, failed bool
	lastUsed      time.Time
	credential    [32]byte
	idleTimer     *time.Timer
}

var (
	watcherMu        sync.Mutex
	resourceWatchers = map[resourceScope]*resourceWatcher{}
	cacheGeneration  uint64
)

// CacheRead binds an in-flight GET to the generation of its shared watch.
// An event, disconnect or replacement invalidates both hits and late fills.
type CacheRead struct {
	watcher    *resourceWatcher
	key        string
	generation uint64
}

func scopeForKey(key string) (resourceScope, bool) {
	parsed, ok := parseCacheKey(key)
	if !ok {
		return resourceScope{}, false
	}

	request, ok := parseAPIResourceRequest(parsed.Path)
	if !ok || request.subresource != "" {
		return resourceScope{}, false
	}

	query, err := url.ParseQuery(parsed.Query)
	if err != nil {
		return resourceScope{}, false
	}

	selector, err := fields.ParseSelector(query.Get("fieldSelector"))
	if err != nil {
		return resourceScope{}, false
	}

	if request.name != "" {
		selector = fields.AndSelectors(selector, fields.OneTermEqualSelector("metadata.name", request.name))
	}

	return resourceScope{
		Context:   parsed.Context,
		Resource:  schema.GroupVersionResource{Group: request.group, Version: request.version, Resource: request.resource},
		Namespace: request.namespace, Labels: query.Get("labelSelector"), Fields: selector.String(),
	}, true
}

// BeginCacheRead shares a watch by resource scope, never by requesting user.
// The registered credential watches where possible; credential-free contexts
// borrow the requesting token without copying it into the context store.
func BeginCacheRead(c cache.Cache[string], key string, k *kubeconfig.Context, token string) *CacheRead {
	scope, ok := scopeForKey(key)
	if !ok {
		return nil
	}

	config, err := watcherConfig(k, token)
	if err != nil {
		return nil
	}

	credential := sha256.Sum256([]byte(config.BearerToken))

	watcherMu.Lock()
	defer watcherMu.Unlock()

	mu.Lock()
	blocked := isClientsetPrefixBlockedLocked(scope.Context)
	mu.Unlock()

	if blocked {
		return nil
	}

	current := resourceWatchers[scope]
	if current != nil && current.failed && current.credential != credential {
		retireLocked(current)

		current = nil
	}

	if current == nil {
		ctx, cancel := context.WithCancel(context.Background())
		current = &resourceWatcher{
			scope: scope, cache: c, cancel: cancel, done: make(chan struct{}),
			lastUsed: time.Now(), credential: credential,
		}

		resourceWatchers[scope] = current

		current.idleTimer = time.AfterFunc(responseTTL, func() { current.stopIfIdle(time.Now()) })
		go current.run(ctx, config)
	}

	current.lastUsed = time.Now()
	current.idleTimer.Reset(responseTTL)

	return &CacheRead{watcher: current, key: key, generation: current.generation}
}

func watcherConfig(k *kubeconfig.Context, token string) (*rest.Config, error) {
	if k == nil {
		return nil, errors.New("cache context is required")
	}

	config, err := k.Copy().RESTConfig()
	if err != nil {
		return nil, err
	}

	stored := config.BearerToken != "" || config.BearerTokenFile != "" || config.Username != "" ||
		config.ExecProvider != nil || config.CertFile != "" || len(config.CertData) != 0 ||
		(config.AuthProvider != nil && (config.AuthProvider.Name != "oidc" ||
			config.AuthProvider.Config["id-token"] != "" || config.AuthProvider.Config["refresh-token"] != ""))
	if !stored {
		if token == "" && k.RequiresUserAuthentication() {
			return nil, errors.New("no credential for cache invalidation")
		}

		config.AuthProvider = nil
		config.BearerToken = token
	}

	return config, nil
}

func (r *CacheRead) validLocked() bool {
	return r != nil && resourceWatchers[r.watcher.scope] == r.watcher &&
		r.watcher.ready && r.generation == r.watcher.generation
}

// Ready reports whether a GET can safely participate in the shared cache.
func (r *CacheRead) Ready() bool {
	watcherMu.Lock()
	defer watcherMu.Unlock()

	return r.validLocked()
}

// Load serves a hit only while the same synchronized watch remains active.
func (r *CacheRead) Load(w http.ResponseWriter, request *http.Request) (bool, error) {
	watcherMu.Lock()
	if !r.validLocked() {
		watcherMu.Unlock()
		return false, nil
	}

	encoded, err := r.watcher.cache.Get(request.Context(), r.key)
	watcherMu.Unlock()

	if err != nil {
		return false, nil
	}

	var data CachedResponseData
	if err := json.Unmarshal([]byte(encoded), &data); err != nil {
		return false, err
	}

	if data.Generation != r.generation {
		return false, nil
	}

	SetHeader(data, w)
	_, err = io.WriteString(w, data.Body)

	return true, err
}

// Store cannot repopulate a generation invalidated while the GET was running.
func (r *CacheRead) Store(response *ResponseCapture) error {
	// Skip encoding a response whose watch was already invalidated; the check is repeated under the lock.
	if !r.Ready() {
		return nil
	}

	encoded, err := encodeResponse(response, r.generation)
	if err != nil || encoded == "" {
		return err
	}

	watcherMu.Lock()
	defer watcherMu.Unlock()

	if !r.validLocked() {
		return nil
	}

	return r.watcher.cache.SetWithTTL(context.Background(), r.key, encoded, responseTTL)
}

func (w *resourceWatcher) run(ctx context.Context, config *rest.Config) {
	defer close(w.done)
	defer func() {
		watcherMu.Lock()
		defer watcherMu.Unlock()

		w.idleTimer.Stop()

		if resourceWatchers[w.scope] == w {
			retireLocked(w)
		}
	}()

	client, err := metadata.NewForConfig(config)
	if err != nil {
		return
	}

	delay := time.Second

	for ctx.Err() == nil {
		err := w.watch(ctx, client)

		watcherMu.Lock()
		if resourceWatchers[w.scope] != w {
			watcherMu.Unlock()
			return
		}

		if w.ready {
			delay = time.Second
		}

		invalidateWatchLocked(w)
		w.failed = true
		watcherMu.Unlock()

		if ctx.Err() != nil {
			return
		}

		if err != nil {
			logger.Log(logger.LevelInfo, nil, nil, "cache invalidation watch unavailable; forwarding resource requests")
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}

		delay = min(delay*2, 30*time.Second)
	}
}

func (w *resourceWatcher) watch(ctx context.Context, client metadata.Interface) error {
	resource := client.Resource(w.scope.Resource).Namespace(w.scope.Namespace)
	// The list only supplies the snapshot resourceVersion to start watching from.
	options := metav1.ListOptions{LabelSelector: w.scope.Labels, FieldSelector: w.scope.Fields, Limit: 1}
	listCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	list, err := resource.List(listCtx, options)

	cancel()

	if err != nil {
		return err
	}

	if list.GetResourceVersion() == "" {
		return errors.New("resource list has no resourceVersion")
	}

	options.Limit = 0
	options.ResourceVersion = list.GetResourceVersion()
	options.AllowWatchBookmarks = true
	timeout := int64(300)
	options.TimeoutSeconds = &timeout

	stream, err := resource.Watch(ctx, options)
	if err != nil {
		return err
	}
	defer stream.Stop()

	watcherMu.Lock()
	if resourceWatchers[w.scope] != w || ctx.Err() != nil {
		watcherMu.Unlock()
		return ctx.Err()
	}

	w.fenceLocked()
	w.ready, w.failed = true, false
	watcherMu.Unlock()

	return w.consume(ctx, stream)
}

func (w *resourceWatcher) consume(ctx context.Context, stream watch.Interface) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case event, open := <-stream.ResultChan():
			if !open {
				return nil
			}

			switch event.Type {
			case watch.Bookmark:
			case watch.Added, watch.Modified, watch.Deleted:
				object, err := meta.Accessor(event.Object)
				if err != nil {
					return err
				}

				invalidateCacheKeysForResourceEvent(
					w.scope.Resource, object.GetNamespace(), object.GetName(), w.scope.Context, w.cache,
				)
			case watch.Error:
				return errors.New("resource watch failed")
			default:
				return errors.New("unexpected resource watch event")
			}
		}
	}
}

func (w *resourceWatcher) stopIfIdle(now time.Time) bool {
	watcherMu.Lock()
	defer watcherMu.Unlock()

	if resourceWatchers[w.scope] != w || now.Sub(w.lastUsed) < responseTTL {
		return false
	}

	retireLocked(w)

	return true
}

// fenceLocked moves w to a fresh generation, so earlier hits and in-flight fills are rejected.
func (w *resourceWatcher) fenceLocked() {
	cacheGeneration++
	w.generation = cacheGeneration
}

// retireLocked stops w and removes it from the registry together with its cached responses.
func retireLocked(w *resourceWatcher) {
	invalidateWatchLocked(w)
	w.cancel()
	delete(resourceWatchers, w.scope)
}

func invalidateWatchLocked(w *resourceWatcher) {
	wasReady := w.ready
	w.ready = false
	w.fenceLocked()

	// Responses are stored only while the watch is ready, so a watcher that never
	// synchronized (or already failed) has nothing to purge from the shared cache.
	if wasReady {
		purgeMatching(w.cache, func(key string) bool { scope, ok := scopeForKey(key); return ok && scope == w.scope })
	}
}

func purgeMatching(c cache.Cache[string], matches func(string) bool) {
	if c == nil {
		return
	}

	entries, err := c.GetAll(context.Background(), matches)
	if err != nil {
		return
	}

	for key := range entries {
		_ = c.Delete(context.Background(), key)
	}
}

func invalidateCacheKeysForResourceEvent(
	gvr schema.GroupVersionResource, namespace, name, contextKey string, c cache.Cache[string],
) {
	watcherMu.Lock()

	for scope, w := range resourceWatchers {
		if scope.Context == contextKey && scope.Resource.Group == gvr.Group && scope.Resource.Resource == gvr.Resource &&
			(namespace == "" || scope.Namespace == "" || scope.Namespace == namespace) {
			w.fenceLocked()
		}
	}

	watcherMu.Unlock()

	// Fenced entries are already unreachable (Load rejects other generations), so
	// the key scan only reclaims memory and does not need to block other requests.
	purgeMatching(c, func(key string) bool {
		parsed, ok := parseCacheKey(key)
		if !ok || parsed.Context != contextKey {
			return false
		}

		request, ok := parseAPIResourceRequest(parsed.Path)

		return ok && request.group == gvr.Group && request.resource == gvr.Resource &&
			(namespace == "" || request.namespace == "" || request.namespace == namespace) &&
			(name == "" || request.name == "" || request.name == name)
	})
}

// SyncWatchers removes every scope and authorization client for obsolete connections.
func SyncWatchers(c cache.Cache[string], activeContexts []string) {
	watcherMu.Lock()
	defer watcherMu.Unlock()

	clearBlockedClientsetPrefixesForActiveContexts(activeContexts)

	active := make(map[string]bool, len(activeContexts))
	for _, key := range activeContexts {
		active[key] = true
	}

	obsolete := collectCachedContextKeys(c)

	for scope, w := range resourceWatchers {
		if !active[scope.Context] {
			retireLocked(w)

			obsolete[scope.Context] = struct{}{}
		}
	}

	for key := range obsolete {
		if !active[key] {
			cleanupRemovedContext(c, key)
		}
	}
}

// HandleNonGETCacheInvalidation forwards a mutation exactly once, invalidating
// every affected response variant without issuing a synthetic GET.
func HandleNonGETCacheInvalidation(
	c cache.Cache[string], w http.ResponseWriter, r *http.Request, next http.Handler, contextKey string,
) error {
	if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
		return nil
	}

	resource, ok := requestedResource(r.URL)
	if !ok {
		next.ServeHTTP(w, r)
		return ErrHandled
	}

	invalidate := func() {
		gvr := schema.GroupVersionResource{Group: resource.group, Version: resource.version, Resource: resource.resource}
		invalidateCacheKeysForResourceEvent(gvr, resource.namespace, "", contextKey, c)
	}
	invalidate()
	next.ServeHTTP(w, r)
	invalidate()

	return ErrHandled
}

// ErrHandled indicates that the request was forwarded already.
var ErrHandled = errors.New("handled by invalidation")

// SkipWebSocket passes streaming upgrades directly to Kubernetes.
func SkipWebSocket(r *http.Request, next http.Handler, w http.ResponseWriter) bool {
	if strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade") {
		next.ServeHTTP(w, r)
		return true
	}

	return false
}
