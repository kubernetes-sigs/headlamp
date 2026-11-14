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
package k8cache

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/clientcmd/api"
)

// ContextCacheKey binds cached responses, authorization clients and watchers to
// the same connection settings, while preserving stateless users' store keys.
func ContextCacheKey(contextKey string, k *kubeconfig.Context) (string, error) {
	if contextKey == "" || k == nil {
		return "", fmt.Errorf("context key and context are required for caching")
	}

	var cluster api.Cluster
	if k.Cluster != nil {
		cluster = *k.Cluster
	}

	var authInfo api.AuthInfo

	var execDetails struct {
		Config                  runtime.Object
		StdinUnavailable        bool
		StdinUnavailableMessage string
		PluginPolicy            api.PluginPolicy
	}

	if k.AuthInfo != nil {
		authInfo = *k.AuthInfo
		if authInfo.Exec != nil {
			execDetails.Config = authInfo.Exec.Config
			execDetails.StdinUnavailable = authInfo.Exec.StdinUnavailable
			execDetails.StdinUnavailableMessage = authInfo.Exec.StdinUnavailableMessage
			execDetails.PluginPolicy = authInfo.Exec.PluginPolicy
		}
	}

	namespace := ""
	if k.KubeContext != nil {
		namespace = k.KubeContext.Namespace
	}

	connection, err := json.Marshal(struct {
		Cluster   api.Cluster
		AuthInfo  api.AuthInfo
		Source    int
		Namespace string
		// These exec settings are excluded from AuthInfo's JSON.
		ExecDetails any
	}{cluster, authInfo, k.Source, namespace, execDetails})
	if err != nil {
		// Serialization errors may contain credential values supplied by an exec plugin.
		return "", fmt.Errorf("could not identify connection settings for caching")
	}

	return fmt.Sprintf("%s\x00%x", contextKey, sha256.Sum256(connection)), nil
}

// CacheKey identifies a representation of an API request within one connection.
// Credentials deliberately do not participate: every cache hit is authorized.
type CacheKey struct {
	Context string
	Path    string
	Query   string
	Accept  string
}

// apiRequestPath returns the Kubernetes API path without any /clusters/{name} prefix.
func apiRequestPath(u *url.URL) (string, bool) {
	parts := strings.Split(strings.TrimRight(u.Path, "/"), "/")

	index := kubernetesAPIPathIndex(parts)
	if index < 0 {
		return "", false
	}

	return "/" + strings.Join(parts[index:], "/"), true
}

// requestedResource parses the API resource addressed by u.
func requestedResource(u *url.URL) (apiResourceRequest, bool) {
	path, ok := apiRequestPath(u)
	if !ok {
		return apiResourceRequest{}, false
	}

	return parseAPIResourceRequest(path)
}

// requestKey encodes the connection, API path, normalized query and Accept header of a
// request as a cache key.
func requestKey(u *url.URL, contextID, accept string) (string, error) {
	path, ok := apiRequestPath(u)
	if !ok {
		return "", fmt.Errorf("invalid Kubernetes API path")
	}

	query, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		return "", fmt.Errorf("invalid Kubernetes API query")
	}

	key, err := json.Marshal(CacheKey{Context: contextID, Path: path, Query: query.Encode(), Accept: accept})

	return string(key), err
}

// GenerateKey identifies an API URL using the default response representation.
func GenerateKey(u *url.URL, contextID string) (string, error) {
	return requestKey(u, contextID, "")
}

// GenerateRequestKey includes content negotiation as well as the complete API URL.
func GenerateRequestKey(r *http.Request, contextID string) (string, error) {
	return requestKey(r.URL, contextID, r.Header.Get("Accept"))
}

// parseCacheKey decodes a key created by requestKey. It reports false for a key without
// a connection or path.
func parseCacheKey(key string) (CacheKey, bool) {
	var parsed CacheKey

	err := json.Unmarshal([]byte(key), &parsed)

	return parsed, err == nil && parsed.Context != "" && parsed.Path != ""
}

// CacheableRequest excludes requests whose identity or freshness cannot be
// represented by a shared, watch-invalidated resource response.
func CacheableRequest(r *http.Request) bool {
	if r.Method != http.MethodGet || (r.Body != nil && r.Body != http.NoBody) {
		return false
	}

	for key := range r.Header {
		if strings.HasPrefix(strings.ToLower(key), "impersonate-") {
			return false
		}
	}

	for _, header := range []string{
		"Range", "If-Range", "If-Match", "If-None-Match", "If-Modified-Since", "If-Unmodified-Since",
	} {
		if r.Header.Get(header) != "" {
			return false
		}
	}

	if auth := r.Header.Get("Authorization"); auth != "" && !strings.HasPrefix(auth, "Bearer ") {
		return false
	}

	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		return false
	}

	watching, _ := strconv.ParseBool(query.Get("watch"))
	if watching || query.Get("sendInitialEvents") != "" || query.Get("continue") != "" ||
		query.Get("limit") != "" || query.Get("resourceVersionMatch") != "" ||
		(query.Get("resourceVersion") != "" && query.Get("resourceVersion") != "0") {
		return false
	}

	cacheControl := strings.ToLower(r.Header.Get("Cache-Control"))
	if strings.Contains(cacheControl, "no-cache") || strings.Contains(cacheControl, "no-store") {
		return false
	}

	resource, ok := requestedResource(r.URL)
	if !ok || resource.subresource != "" {
		return false
	}

	return (resource.group != "authorization.k8s.io" && resource.group != "authentication.k8s.io") ||
		!strings.HasPrefix(resource.resource, "selfsubject")
}
