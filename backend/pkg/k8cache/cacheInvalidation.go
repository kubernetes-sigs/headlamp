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
	"net/http"
	"net/http/httptest"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
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
