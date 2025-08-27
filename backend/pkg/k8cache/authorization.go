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
	"strings"
	"sync"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"k8s.io/client-go/kubernetes"
)

var (
	clientsetCache = make(map[string]*kubernetes.Clientset)
	mu             sync.Mutex
)

// GetClientSet return *kubernetes.ClientSet and error which further used for creating
// SSAR requests to k8s server to authorize user. GetClientSet uses kubeconfig.Context and
// authentication bearer token  which will help to create clientSet based on the user's
// identity.
func GetClientSet(k *kubeconfig.Context, token string) (*kubernetes.Clientset, error) {
	contextKey := strings.Split(k.ClusterID, "+")
	if len(contextKey) < 2 {
		// log and handle gracefully
		return nil, fmt.Errorf("unexpected ClusterID format in getClientSet: %q", k.ClusterID)
	}

	cacheKey := fmt.Sprintf("%s-%s", contextKey[1], token)

	mu.Lock()
	defer mu.Unlock()

	if cs, found := clientsetCache[cacheKey]; found {
		return cs, nil
	}

	cs, err := k.ClientSetWithToken(token)
	if err != nil {
		return nil, fmt.Errorf("error while creating clientset for key %s: %w", cacheKey, err)
	}

	clientsetCache[cacheKey] = cs

	return cs, nil
}
