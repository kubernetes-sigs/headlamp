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
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const (
	apiPathSegment       = "api"
	apisPathSegment      = "apis"
	namespacePathSegment = "namespaces"
)

func unescapeSegment(s string) string {
	if u, err := url.PathUnescape(s); err == nil {
		return u
	}

	return s
}

func kubernetesAPIPathIndex(parts []string) int {
	if len(parts) > 1 {
		s1 := unescapeSegment(parts[1])
		if s1 == apiPathSegment || s1 == apisPathSegment {
			return 1
		}
	}

	if len(parts) > 3 && unescapeSegment(parts[1]) == "clusters" {
		s3 := unescapeSegment(parts[3])
		if s3 == apiPathSegment || s3 == apisPathSegment {
			return 3
		}
	}

	return -1
}

// IsKubernetesAPIPath returns true when path targets a Kubernetes API endpoint
// under /api or /apis (either directly, or proxied via /clusters/{name}/...).
func IsKubernetesAPIPath(path string) bool {
	if idx := strings.Index(path, "?"); idx != -1 {
		path = path[:idx]
	}

	path = strings.TrimRight(path, "/")
	parts := strings.Split(path, "/")

	return kubernetesAPIPathIndex(parts) != -1
}

// CachedResponseData stores information such as StatusCode, Headers, and Body.
// It helps cache responses efficiently and serve them from the cache.
type CachedResponseData struct {
	StatusCode int         `json:"statusCode"`
	Headers    http.Header `json:"headers"`
	Body       string      `json:"body"`
}

// GetResponseBody decompresses a gzip-encoded response body and returns it as a string.
// If the encoding is not gzip, it returns the raw body as a string.
func GetResponseBody(bodyBytes []byte, encoding string) (string, error) {
	var dcmpBody []byte

	if encoding == "gzip" {
		reader, err := gzip.NewReader(bytes.NewReader(bodyBytes))
		if err != nil {
			return "", fmt.Errorf("failed to create gzip reader: %w", err)
		}

		defer func() { _ = reader.Close() }()

		decompressedBody, err := io.ReadAll(reader)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to decompress body")
			return "", fmt.Errorf("failed to decompress body: %w", err)
		}

		dcmpBody = decompressedBody
	} else {
		dcmpBody = bodyBytes
	}

	return string(dcmpBody), nil
}

// GetAPIGroup parses the URL path and returns the apiGroup and version.
func GetAPIGroup(path string) (apiGroup, version string, err error) {
	path = strings.TrimRight(path, "/")
	parts := strings.Split(path, "/")
	apiIdx := kubernetesAPIPathIndex(parts)

	if apiIdx == -1 {
		return "", "", fmt.Errorf("invalid url format")
	}

	switch unescapeSegment(parts[apiIdx]) {
	case apiPathSegment:
		// Core API group
		apiGroup = ""

		if len(parts) > apiIdx+1 {
			version = unescapeSegment(parts[apiIdx+1])
		}
	case apisPathSegment:
		// Named API group
		if len(parts) > apiIdx+1 {
			apiGroup = unescapeSegment(parts[apiIdx+1])
		}

		if len(parts) > apiIdx+2 {
			version = unescapeSegment(parts[apiIdx+2])
		}
	}

	return
}

// ExtractNamespace extracts the namespace from the parameter from the given raw URL. This is used to make
// cache key more specific to a particular namespace.
func ExtractNamespace(rawURL string) (string, string) {
	if idx := strings.Index(rawURL, "?"); idx != -1 {
		rawURL = rawURL[:idx]
	}

	rawURL = strings.TrimRight(rawURL, "/")

	var namespace, kind string

	urls := strings.Split(rawURL, "/")

	n := len(urls)

	apiIdx := kubernetesAPIPathIndex(urls)
	if apiIdx == -1 {
		return "", ""
	}

	for i := 0; i < n-1; i++ {
		if unescapeSegment(urls[i]) == namespacePathSegment {
			namespace = unescapeSegment(urls[i+1])
			break
		}
	}

	if n > 2 {
		kind = unescapeSegment(urls[n-1])
	}

	return namespace, kind
}

// escapeCacheKeySegment percent-escapes "%" and "+" so cache key segments can
// be joined with "+" delimiters without ambiguity. "%" is escaped first so the
// encoding is injective (see buildCacheKey).
func escapeCacheKeySegment(s string) string {
	s = strings.ReplaceAll(s, "%", "%25")
	s = strings.ReplaceAll(s, "+", "%2B")

	return s
}

// unescapeCacheKeySegment reverses escapeCacheKeySegment.
func unescapeCacheKeySegment(s string) string {
	s = strings.ReplaceAll(s, "%2B", "+")
	s = strings.ReplaceAll(s, "%25", "%")

	return s
}

// buildCacheKey joins apiGroup, apiVersion, kind, namespace, and contextID into a single
// cache key using "+" as the delimiter. Each field is percent-escaped so
// that the only "+" characters left in the key are the delimiters
// themselves and the encoding round-trips uniquely back to its inputs.
// This matters most for the context field, since kubeconfig context names
// are not restricted by Kubernetes naming rules and may legitimately
// contain "+" (or "%").
//
// This function is the single source of truth for constructing cache keys.
// Any code that parses or otherwise manipulates the key format (e.g. the
// namespace stripping in cache invalidation) must stay consistent with this
// encoding to avoid the two sides silently drifting out of sync.
func buildCacheKey(apiGroup, apiVersion, kind, namespace, contextID string) string {
	return escapeCacheKeySegment(apiGroup) + "+" +
		escapeCacheKeySegment(apiVersion) + "+" +
		escapeCacheKeySegment(kind) + "+" +
		escapeCacheKeySegment(namespace) + "+" +
		escapeCacheKeySegment(contextID)
}

// buildLegacyCacheKey constructs a 4-segment cache key (without apiVersion)
// for backward compatibility with callers and tests expecting the legacy format.
func buildLegacyCacheKey(apiGroup, kind, namespace, contextID string) string {
	return escapeCacheKeySegment(apiGroup) + "+" +
		escapeCacheKeySegment(kind) + "+" +
		escapeCacheKeySegment(namespace) + "+" +
		escapeCacheKeySegment(contextID)
}

// parseCacheKey splits a canonical cache key back into its components:
// (apiGroup, apiVersion, kind, namespace, contextID).
// It also supports legacy 4-segment keys for backward compatibility.
//
//nolint:unparam // apiVersion is part of the canonical cache key tuple for identity round-tripping.
func parseCacheKey(key string) (apiGroup, apiVersion, kind, namespace, contextID string, ok bool) {
	parts := strings.Split(key, "+")
	if len(parts) == 5 {
		return unescapeCacheKeySegment(parts[0]),
			unescapeCacheKeySegment(parts[1]),
			unescapeCacheKeySegment(parts[2]),
			unescapeCacheKeySegment(parts[3]),
			unescapeCacheKeySegment(parts[4]),
			true
	}

	if len(parts) == 4 {
		return unescapeCacheKeySegment(parts[0]),
			"",
			unescapeCacheKeySegment(parts[1]),
			unescapeCacheKeySegment(parts[2]),
			unescapeCacheKeySegment(parts[3]),
			true
	}

	return "", "", "", "", "", false
}

func parseContextKeyFromCacheKey(key string) (string, bool) {
	parts := strings.Split(key, "+")
	if len(parts) == 5 {
		return unescapeCacheKeySegment(parts[4]), true
	}

	if len(parts) == 4 {
		return unescapeCacheKeySegment(parts[3]), true
	}

	return "", false
}

func formatResourcePath(segments []string) string {
	if len(segments) == 0 {
		return ""
	}

	proxyIdx := -1

	for i, seg := range segments {
		if unescapeSegment(seg) == "proxy" {
			proxyIdx = i
			break
		}
	}

	result := make([]string, len(segments))
	if proxyIdx == -1 {
		for i, seg := range segments {
			result[i] = unescapeSegment(seg)
		}
	} else {
		for i := 0; i <= proxyIdx; i++ {
			result[i] = unescapeSegment(segments[i])
		}

		for i := proxyIdx + 1; i < len(segments); i++ {
			result[i] = segments[i]
		}
	}

	return strings.Join(result, "/")
}

func parseNamespacedResourcePath(resParts []string, apiPart string) (string, string) {
	switch len(resParts) {
	case 1:
		return "", namespacePathSegment
	case 2:
		return "", formatResourcePath(resParts)
	default:
		// Core namespace subresources (e.g. /api/v1/namespaces/{name}/status or /finalize)
		// are cluster-scoped subresources of the Namespace resource under the core API.
		isCoreNamespaceSubresource := apiPart == apiPathSegment &&
			unescapeSegment(resParts[0]) == namespacePathSegment &&
			(unescapeSegment(resParts[2]) == "status" || unescapeSegment(resParts[2]) == "finalize")
		if isCoreNamespaceSubresource {
			return "", formatResourcePath(resParts)
		}

		return unescapeSegment(resParts[1]), formatResourcePath(resParts[2:])
	}
}

func isProxySubresourcePath(resourcePath string) bool {
	clean := resourcePath
	if idx := strings.Index(clean, "?"); idx != -1 {
		clean = clean[:idx]
	}

	return strings.Contains("/"+clean+"/", "/proxy/") || strings.HasSuffix(clean, "/proxy")
}

func parseResourceParts(parts []string, apiPart string, apiIdx int) (string, string) {
	switch {
	case len(parts) == apiIdx+1:
		return "", apiPart
	case apiPart == apisPathSegment && len(parts) == apiIdx+2:
		return "", unescapeSegment(parts[apiIdx+1])
	}

	resStart := apiIdx + 2
	if apiPart == apisPathSegment {
		resStart = apiIdx + 3
	}

	if resStart >= len(parts) {
		return "", ""
	}

	resParts := parts[resStart:]
	if len(resParts) > 0 && unescapeSegment(resParts[0]) == namespacePathSegment {
		return parseNamespacedResourcePath(resParts, apiPart)
	}

	return "", formatResourcePath(resParts)
}

// extractNamespaceAndResourcePath extracts the namespace and canonical resource path
// (including resource name, subresources, and canonicalized query parameters) from the URL.
func extractNamespaceAndResourcePath(u *url.URL) (string, string) {
	if u == nil {
		return "", ""
	}

	path := u.EscapedPath()
	if path == "" {
		path = u.Path
	}

	rawQuery := u.RawQuery

	hasTrailingSlash := strings.HasSuffix(path, "/")
	path = strings.TrimRight(path, "/")
	parts := strings.Split(path, "/")

	apiIdx := kubernetesAPIPathIndex(parts)
	if apiIdx == -1 {
		return "", ""
	}

	apiPart := unescapeSegment(parts[apiIdx])
	namespace, resourcePath := parseResourceParts(parts, apiPart, apiIdx)

	if hasTrailingSlash && isProxySubresourcePath(resourcePath) {
		resourcePath += "/"
	}

	if rawQuery != "" {
		if parsedQuery, err := url.ParseQuery(rawQuery); err == nil {
			if canonicalQuery := parsedQuery.Encode(); canonicalQuery != "" {
				resourcePath += "?" + canonicalQuery
			}
		} else {
			resourcePath += "?" + rawQuery
		}
	}

	return namespace, resourcePath
}

// ShouldSkipCache reports whether a request should bypass the cache.
// Streaming endpoints (watch=true, follow=true) and interactive
// subresources (exec, attach, portforward) are not cached.
func ShouldSkipCache(r *http.Request) bool {
	if r == nil || r.URL == nil {
		return false
	}

	query := r.URL.Query()

	if isWatch, _ := strconv.ParseBool(query.Get("watch")); isWatch {
		return true
	}

	if isFollow, _ := strconv.ParseBool(query.Get("follow")); isFollow {
		return true
	}

	return isInteractiveSubresource(r.URL)
}

func isInteractiveSubresource(u *url.URL) bool {
	if u == nil {
		return false
	}

	_, resourcePath := extractNamespaceAndResourcePath(u)
	if idx := strings.Index(resourcePath, "?"); idx != -1 {
		resourcePath = resourcePath[:idx]
	}

	parts := strings.Split(strings.Trim(resourcePath, "/"), "/")
	if len(parts) < 3 {
		return false
	}

	for _, sub := range parts[2:] {
		if sub == "exec" || sub == "attach" || sub == "portforward" {
			return true
		}
	}

	return false
}

// GenerateKey function helps to generate a unique key based on the request from the client.
// The function accepts url (which includes all the information of request) and contextID which
// helps to differentiate in multiple contexts.
func GenerateKey(url *url.URL, contextID string) (string, error) {
	if url == nil {
		return "", fmt.Errorf("invalid url format")
	}

	path := url.EscapedPath()
	if path == "" {
		path = url.Path
	}

	if !IsKubernetesAPIPath(path) {
		return "", fmt.Errorf("invalid url format")
	}

	apiGroup, apiVersion, err := GetAPIGroup(path)
	if err != nil {
		return "", err
	}

	namespace, kind := extractNamespaceAndResourcePath(url)

	k := CacheKey{
		Kind:      kind,
		Namespace: namespace,
		Context:   contextID,
	}

	return buildCacheKey(apiGroup, apiVersion, k.Kind, k.Namespace, k.Context), nil
}

// SetHeader function help to serve response from cache to ensure the client
// receives correct metadata about the response.
func SetHeader(cacheData CachedResponseData, w http.ResponseWriter) {
	for idx, header := range cacheData.Headers {
		w.Header()[idx] = header
	}

	w.Header().Set("X-HEADLAMP-CACHE", "true")
	w.WriteHeader(cacheData.StatusCode)
}

const gzipEncoding = "gzip"

// FilterHeaderForCache ensures that the cached headers accurately reflect the state of the
// decompressed body that is being stored, and prevents client side decompression
// issues serving from cache.
func FilterHeaderForCache(responseHeaders http.Header, encoding string) http.Header {
	cacheHeader := make(http.Header)

	for idx, header := range responseHeaders {
		if strings.EqualFold(idx, "Content-Encoding") && encoding == gzipEncoding {
			continue
		}

		cacheHeader[idx] = append(cacheHeader[idx], header...)
	}

	return cacheHeader
}

// LoadFromCache checks if a cached resource exists and the user has permission to view it.
// If found, it writes the cached data to the ResponseWriter and returns (true, nil).
// If not found or on error, it returns (false, error).
func LoadFromCache(k8scache cache.Cache[string], isAllowed bool,
	key string, w http.ResponseWriter, r *http.Request,
) (bool, error) {
	k8Resource, err := k8scache.Get(context.Background(), key)
	if err == nil && strings.TrimSpace(k8Resource) != "" && isAllowed {
		var cachedData CachedResponseData
		if err := json.Unmarshal([]byte(k8Resource), &cachedData); err != nil {
			return false, err
		}

		SetHeader(cachedData, w)

		_, writeErr := w.Write([]byte(cachedData.Body))
		if writeErr != nil {
			return false, writeErr
		}

		logger.Log(logger.LevelInfo, nil, nil, "serving from the cache with key "+redactCacheKey(key))

		return true, nil
	}

	return false, nil
}

// StoreK8sResponseInCache ensures if the key was not found inside the cache then this will make actual call to k8's
// and this will capture the response body and convert the captured response to string.
// After converting it will store the response with the key and TTL of 10*min.
func StoreK8sResponseInCache(k8scache cache.Cache[string],
	url *url.URL,
	rcw *ResponseCapture,
	key string,
) error {
	if rcw.StatusCode >= 500 {
		return nil
	}

	capturedHeaders := rcw.Header()
	encoding := capturedHeaders.Get("Content-Encoding")
	bodyBytes := rcw.Body.Bytes()

	dcmpBody, err := GetResponseBody(bodyBytes, encoding)
	if err != nil {
		return err
	}

	headersToCache := FilterHeaderForCache(capturedHeaders, encoding)

	if !strings.Contains(url.Path, "selfsubjectrulesreviews") {
		// Check the decompressed body for Kubernetes error status before
		// marshalling the full CachedResponseData. This avoids allocating
		// the JSON envelope for responses that will be discarded anyway.
		if strings.Contains(dcmpBody, "Failure") {
			return nil
		}

		cachedData := CachedResponseData{
			StatusCode: rcw.StatusCode,
			Headers:    headersToCache,
			Body:       dcmpBody,
		}

		jsonBytes, err := json.Marshal(cachedData)
		if err != nil {
			return err
		}

		if err = setAndIndexCacheEntry(k8scache, key, jsonBytes, 10*time.Minute); err != nil {
			return err
		}

		logger.Log(logger.LevelInfo, nil, nil, "k8s resource was stored with the key "+redactCacheKey(key))
	}

	return nil
}

var (
	registeredCachesMu sync.Mutex
	registeredCaches   = make(map[cache.Cache[string]]struct{})
)

func registerCacheEvictionCallback(c cache.Cache[string]) {
	if c == nil {
		return
	}

	registeredCachesMu.Lock()
	defer registeredCachesMu.Unlock()

	if _, exists := registeredCaches[c]; !exists {
		c.SetOnEvicted(func(key string, _ string) {
			unindexIfExpired(key)
		})

		registeredCaches[c] = struct{}{}
	}
}

func setAndIndexCacheEntry(k8scache cache.Cache[string], key string, jsonBytes []byte, ttl time.Duration) error {
	resourceIndexMu.Lock()
	defer resourceIndexMu.Unlock()

	registerCacheEvictionCallback(k8scache)

	if err := k8scache.SetWithTTL(context.Background(), key, string(jsonBytes), ttl); err != nil {
		return err
	}

	indexCacheKeyLocked(key, time.Now().Add(ttl))

	return nil
}

// redactContextKey returns a redacted version of the context key to avoid leaking PII/sensitive info in logs.
func redactContextKey(key string) string {
	if key == "" {
		return ""
	}

	if len(key) <= 3 {
		return "[redacted]"
	}

	return key[:3] + "...[redacted]"
}

// redactCacheKey returns a redacted version of the cache key where sensitive
// query parameter values and context names are masked for logging.
func redactCacheKey(key string) string {
	parts := strings.Split(key, "+")
	if len(parts) >= 4 {
		parts[len(parts)-1] = redactContextKey(parts[len(parts)-1])
	}

	for i, part := range parts {
		if idx := strings.Index(part, "?"); idx != -1 {
			base := part[:idx]
			rawQuery := part[idx+1:]

			if parsedQuery, err := url.ParseQuery(rawQuery); err == nil && len(parsedQuery) > 0 {
				redactedQuery := make(url.Values, len(parsedQuery))
				for k := range parsedQuery {
					redactedQuery[k] = []string{"[redacted]"}
				}

				parts[i] = base + "?" + redactedQuery.Encode()
			} else {
				parts[i] = base + "?[redacted]"
			}
		}
	}

	return strings.Join(parts, "+")
}
