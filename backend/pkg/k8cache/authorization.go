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

type CachedClientSet struct {
	clientset *kubernetes.Clientset
	lastUsed  time.Time
}

var (
	clientsetCache = make(map[string]*CachedClientSet)
	mu             sync.Mutex
)

// GetClientSet return *kubernetes.ClientSet and error which further used for creating
// SSAR requests to k8s server to authorize user. GetClientSet uses kubeconfig.Context and
// authentication bearer token  which will help to create clientSet based on the user's
// identity.
func GetClientSet(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
	contextKey := strings.Split(k.ClusterID, "+")
	if len(contextKey) < 2 {
		return nil, fmt.Errorf("unexpected ClusterID format in getClientSet: %q", k.ClusterID)
	}

	cacheKey := fmt.Sprintf("%s-%s", contextKey[1], token)

	mu.Lock()
	defer mu.Unlock()

	if cs, found := clientsetCache[cacheKey]; found {
		now := time.Now()

		if now.Sub(cs.lastUsed) > 10*time.Minute { // If the clientset was expired then delete
			// the existing clientset resulting only fresh clientset.
			delete(clientsetCache, cacheKey)
			logger.Log(logger.LevelInfo, nil, nil, "clientset "+cacheKey+" was deleted")
		} else {
			return cs.clientset, nil // If the clientset is not expired then return directly.
		}
	}

	cs, err := k.ClientSetWithToken(token)
	if err != nil {
		return nil, fmt.Errorf("error while creating clientset for key %s: %w", cacheKey, err)
	}

	clientsetCache[cacheKey] = &CachedClientSet{
		clientset: cs,
		lastUsed:  time.Now(),
	}

	return cs, nil
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
