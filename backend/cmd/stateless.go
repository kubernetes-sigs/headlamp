/*
Copyright 2025 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"k8s.io/apimachinery/pkg/runtime"
)

// MarshalCustomObject marshals the runtime.Unknown object into a CustomObject.
func MarshalCustomObject(info runtime.Object, contextName string) (kubeconfig.CustomObject, error) {
	unknownBytes, err := json.Marshal(info)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": contextName},
			err, "unmarshaling context data")

		return kubeconfig.CustomObject{}, err
	}

	var customObj kubeconfig.CustomObject

	err = json.Unmarshal(unknownBytes, &customObj)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"cluster": contextName},
			err, "unmarshaling into CustomObject")

		return kubeconfig.CustomObject{}, err
	}

	return customObj, nil
}

// setKeyInCache sets the context in the cache with the given key.
func (c *HeadlampConfig) setKeyInCache(key string, context kubeconfig.Context) error {
	_, err := c.KubeConfigStore.GetContext(key)
	if err != nil && err.Error() == "key not found" {
		// Stateless clusters are marked internal so they are not visible to other users.
		// They are stored in the proxy cache and accessed through the /config endpoint.
		context.Internal = true
		if err = c.KubeConfigStore.AddContextWithKeyAndTTL(&context, key, ContextCacheTTL); err != nil {
			logger.Log(logger.LevelError, map[string]string{"key": key},
				err, "adding context to cache")

			return err
		}
	} else {
		if err = c.KubeConfigStore.UpdateTTL(key, ContextUpdateCacheTTL); err != nil {
			logger.Log(logger.LevelError, map[string]string{"key": key},
				err, "updating context ttl")

			return err
		}
	}

	return nil
}

func loadContextsOrError(kubeConfig string) ([]kubeconfig.Context, error) {
	contexts, contextLoadErrors, err := kubeconfig.LoadContextsFromBase64String(kubeConfig, kubeconfig.DynamicCluster)
	if len(contextLoadErrors) > 0 {
		for _, contextError := range contextLoadErrors {
			logger.Log(logger.LevelError, nil, contextError.Error, "loading contexts from kubeconfig")
		}

		if err != nil {
			logger.Log(logger.LevelError, nil, err, "loading contexts from kubeconfig")

			return nil, err
		}

		if len(contexts) == 0 {
			return nil, fmt.Errorf("failed to load any valid contexts from kubeconfig")
		}
	}

	if len(contexts) == 0 {
		logger.Log(logger.LevelError, nil, nil, "no contexts found in kubeconfig")

		return nil, fmt.Errorf("no contexts found in kubeconfig")
	}

	return contexts, nil
}

// processStatelessContext resolves the cache key for a single context entry and
// stores it via setKeyInCache. Returns the resolved key (empty string means skipped)
// and any error.
//
// Each context starts fresh from baseKey (clusterName+userID). This differs from the
// original implementation where the key variable persisted across loop iterations, meaning
// a context with headlamp_info but an empty CustomName would accidentally inherit the key
// mutated by a previous iteration. The new behavior is intentional: every context is
// independently keyed, which prevents cross-context cache collisions.
func (c *HeadlampConfig) processStatelessContext(
	ctx kubeconfig.Context, baseKey, clusterName, userID string,
) (string, error) {
	key := baseKey

	info := ctx.KubeContext.Extensions["headlamp_info"]
	if info != nil {
		customObj, err := MarshalCustomObject(info, ctx.Name)
		if err != nil {
			logger.Log(logger.LevelError, map[string]string{"cluster": ctx.Name},
				err, "marshaling custom object")

			return "", err
		}

		if customObj.CustomName != "" {
			key = customObj.CustomName + userID
		}
	} else if ctx.Name != clusterName {
		return "", nil
	}

	if err := c.setKeyInCache(key, ctx); err != nil {
		return "", err
	}

	return key, nil
}

// handleStatelessReq handles stateless cluster requests when a kubeconfig is provided
// via header and dynamic clusters are enabled. It returns the context key used to store
// the context in the cache.
func (c *HeadlampConfig) handleStatelessReq(r *http.Request, kubeConfig string) (string, error) {
	userID := r.Header.Get("X-HEADLAMP-USER-ID")
	clusterName := mux.Vars(r)["clusterName"]

	contexts, err := loadContextsOrError(kubeConfig)
	if err != nil {
		return "", err
	}

	baseKey := clusterName + userID

	var contextKey string

	for _, ctx := range contexts {
		key, err := c.processStatelessContext(ctx, baseKey, clusterName, userID)
		if err != nil {
			return "", err
		}

		if key != "" {
			contextKey = key
		}
	}

	return contextKey, nil
}

// parseKubeConfig parses the kubeconfig and returns a list of contexts and errors.
// Input is a list of base64 encoded kubeconfigs. Output is a list of clusters.
// Input: {"kubeconfigs": ["base64 encoded kubeconfig 1", "base64 encoded kubeconfig 2"]}
// Output: {"clusters": [{"name": "cluster 1", "server": "https://cluster1.server.com",
// "authType": "token"}, {"name": "cluster 2", "server": "https://cluster2.server.com", "authType": "token"}]}.
func (c *HeadlampConfig) parseKubeConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var kubeconfigReq KubeconfigRequest

	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&kubeconfigReq); err != nil {
		logger.Log(logger.LevelError, nil, err, "decoding config")

		http.Error(w, "Invalid JSON request body", http.StatusBadRequest)

		return
	}

	kubeconfigs := kubeconfigReq.Kubeconfigs
	if len(kubeconfigs) == 0 {
		http.Error(w, "kubeconfigs is required", http.StatusBadRequest)

		return
	}

	contexts, setupErrors := parseClusterFromKubeConfig(kubeconfigs)
	if len(setupErrors) > 0 {
		logger.Log(logger.LevelError, nil, setupErrors, "setting up contexts from kubeconfig")

		http.Error(w, "setting up contexts from kubeconfig", http.StatusBadRequest)

		return
	}

	clientConfig := clientConfig{
		Clusters:                contexts,
		IsDynamicClusterEnabled: c.EnableDynamicClusters,
		AllowKubeconfigChanges:  c.AllowKubeconfigChanges,
		DefaultLightTheme:       c.DefaultLightTheme,
		DefaultDarkTheme:        c.DefaultDarkTheme,
		ForceTheme:              c.ForceTheme,
	}

	if err := json.NewEncoder(w).Encode(&clientConfig); err != nil {
		logger.Log(logger.LevelError, nil, err, "encoding config")

		http.Error(w, "Invalid JSON request body", http.StatusBadRequest)
	}
}

// websocketConnContextKey handles websocket requests. It returns the context key
// used to store the context in the cache. The key is unique per user and is found
// in the "base64url.headlamp.authorization.k8s.io" websocket subprotocol.
func websocketConnContextKey(r *http.Request, clusterName string) string {
	const expectedSubmatches = 2

	var contextKey string

	pattern := `base64url\.headlamp\.authorization\.k8s\.io\.([a-zA-Z0-9_-]+)`
	re := regexp.MustCompile(pattern)
	matches := re.FindStringSubmatch(r.Header.Get("Sec-Websocket-Protocol"))

	if len(matches) >= expectedSubmatches {
		contextKey = clusterName + matches[1]
	} else {
		contextKey = clusterName
	}

	protocols := strings.Split(r.Header.Get("Sec-Websocket-Protocol"), ", ")

	var updatedProtocols []string

	for _, protocol := range protocols {
		if !strings.HasPrefix(protocol, "base64url.headlamp.authorization.k8s.io.") {
			updatedProtocols = append(updatedProtocols, protocol)
		}
	}

	updatedProtocol := strings.Join(updatedProtocols, ", ")

	r.Header.Del("Sec-Websocket-Protocol")
	r.Header.Add("Sec-Websocket-Protocol", updatedProtocol)

	return contextKey
}

// getContextKeyForRequest returns the context key for the request. The key is unique
// per user and is used to look up the context in the cache. For stateless clusters it
// is a combination of cluster name and user ID; for normal clusters it is the cluster name.
func (c *HeadlampConfig) getContextKeyForRequest(r *http.Request) (string, error) {
	var contextKey string

	clusterName := mux.Vars(r)["clusterName"]

	kubeConfig := r.Header.Get("KUBECONFIG")

	if kubeConfig != "" && c.EnableDynamicClusters {
		key, err := c.handleStatelessReq(r, kubeConfig)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "handling stateless request")

			return "", err
		}

		contextKey = key
	} else {
		contextKey = clusterName
	}

	if r.Header.Get("Upgrade") == "websocket" {
		contextKey = websocketConnContextKey(r, clusterName)
	}

	return contextKey, nil
}
