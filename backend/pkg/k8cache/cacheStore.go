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
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const (
	apiPathSegment       = "api"
	apisPathSegment      = "apis"
	namespacePathSegment = "namespaces"
)

func kubernetesAPIPathIndex(parts []string) int {
	if len(parts) > 1 && (parts[1] == apiPathSegment || parts[1] == apisPathSegment) {
		return 1
	}

	if len(parts) > 3 && parts[1] == "clusters" && (parts[3] == apiPathSegment || parts[3] == apisPathSegment) {
		return 3
	}

	return -1
}

// IsKubernetesAPIPath returns true when path targets a Kubernetes API endpoint
// under /api or /apis (either directly, or proxied via /clusters/{name}/...).
func IsKubernetesAPIPath(path string) bool {
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

	switch parts[apiIdx] {
	case apiPathSegment:
		// Core API group
		apiGroup = ""

		if len(parts) > apiIdx+1 {
			version = parts[apiIdx+1]
		}
	case apisPathSegment:
		// Named API group
		if len(parts) > apiIdx+1 {
			apiGroup = parts[apiIdx+1]
		}

		if len(parts) > apiIdx+2 {
			version = parts[apiIdx+2]
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
		if urls[i] == namespacePathSegment {
			namespace = urls[i+1]
			break
		}
	}

	if n > 2 {
		kind = urls[n-1]
	}

	return namespace, kind
}

// apiRelativePath returns path starting at its /api or /apis segment, dropping any
// /clusters/{name} prefix.
func apiRelativePath(path string) (string, bool) {
	path = strings.TrimRight(path, "/")
	parts := strings.Split(path, "/")

	apiIdx := kubernetesAPIPathIndex(parts)
	if apiIdx == -1 {
		return "", false
	}

	offset := 0
	for i := 0; i < apiIdx; i++ {
		offset += len(parts[i]) + 1
	}

	return path[offset:], true
}

// canonicalQuery normalizes a raw query string so that semantically equal queries
// produce one cache entry. Queries that fail to parse are used verbatim.
func canonicalQuery(rawQuery string) string {
	if rawQuery == "" {
		return ""
	}

	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		return rawQuery
	}

	return values.Encode()
}

// requestVariant returns the cache key segment distinguishing requests that address the
// same object: its subresource and the query parameters selecting what is returned.
func requestVariant(subresource, rawQuery string) string {
	h := sha256.New()
	_, _ = io.WriteString(h, subresource)
	_, _ = io.WriteString(h, "\n")
	_, _ = io.WriteString(h, canonicalQuery(rawQuery))

	var (
		sum     [sha256.Size]byte
		encoded [2 * sha256.Size]byte
	)

	hex.Encode(encoded[:], h.Sum(sum[:0]))

	return string(encoded[:])
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

// cacheKeyPrefix joins apiGroup, resource, namespace, contextID, and name into the portion
// shared by every cached variant of one object (or, when name is empty, of one resource
// list). Each field is percent-escaped so that the only "+" characters left in the prefix
// are the delimiters themselves and the encoding round-trips uniquely back to its inputs.
// This matters most for the context field, since kubeconfig context names are not
// restricted by Kubernetes naming rules and may legitimately contain "+" (or "%").
//
// The trailing delimiter is load-bearing: invalidation matches on this prefix, and an
// unterminated prefix would also match longer resource, context, or name values.
func cacheKeyPrefix(apiGroup, resource, namespace, contextID, name string) string {
	return joinEscapedCacheKeyPrefix(
		escapeCacheKeySegment(apiGroup),
		escapeCacheKeySegment(resource),
		escapeCacheKeySegment(namespace),
		escapeCacheKeySegment(contextID),
		escapeCacheKeySegment(name),
	)
}

// joinEscapedCacheKeyPrefix lays out a prefix from segments that are already escaped, for
// callers rebuilding a prefix out of an existing key.
func joinEscapedCacheKeyPrefix(apiGroup, resource, namespace, contextID, name string) string {
	return apiGroup + "+" + resource + "+" + namespace + "+" + contextID + "+" + name + "+"
}

// buildCacheKey appends variant to the prefix built from apiGroup, resource, namespace,
// contextID, and name.
//
// This function is the single source of truth for constructing cache keys.
// Any code that parses or otherwise manipulates the key format (e.g. the
// namespace stripping in cache invalidation) must stay consistent with this
// encoding to avoid the two sides silently drifting out of sync.
func buildCacheKey(apiGroup, resource, namespace, contextID, name, variant string) string {
	return cacheKeyPrefix(apiGroup, resource, namespace, contextID, name) + variant
}

// cacheKeyFields resolves the request into the Kubernetes resource it addresses. Discovery
// paths such as /api or /apis/{group} carry no resource, so they fall back to the trailing
// path segment to stay cacheable.
func cacheKeyFields(u *url.URL) (request apiResourceRequest, ok bool) {
	apiPath, ok := apiRelativePath(u.Path)
	if !ok {
		return apiResourceRequest{}, false
	}

	if request, ok := parseAPIResourceRequest(apiPath); ok {
		return request, true
	}

	// GetAPIGroup only fails on paths apiRelativePath has already rejected.
	apiGroup, _, _ := GetAPIGroup(u.Path)

	_, kind := ExtractNamespace(u.Path)

	return apiResourceRequest{group: apiGroup, resource: kind}, true
}

// ShouldBypassCache reports whether a request must neither be served from nor stored in the
// response cache. Alongside non-API and self-subject review paths, this covers watch
// requests, whose responses are open-ended streams, and subresources such as pod logs, which
// change without an event on their parent object and would otherwise be served stale.
func ShouldBypassCache(r *http.Request) bool {
	if !IsKubernetesAPIPath(r.URL.Path) || IsSelfSubjectReviewAPIPath(r.URL.Path) {
		return true
	}

	if IsWatchRequest(r) {
		return true
	}

	request, ok := cacheKeyFields(r.URL)

	return !ok || request.subresource != ""
}

// GenerateKey function helps to generate a unique key based on the request from the client
// The function accepts url( which includes all the information of request ) and contextID which
// helps to differentiate in multiple contexts.
func GenerateKey(url *url.URL, contextID string) (string, error) {
	request, ok := cacheKeyFields(url)
	if !ok {
		return "", fmt.Errorf("invalid url format")
	}

	return buildCacheKey(
		request.group, request.resource, request.namespace, contextID, request.name,
		requestVariant(request.subresource, url.RawQuery),
	), nil
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

		if err = k8scache.SetWithTTL(context.Background(), key, string(jsonBytes), 10*time.Minute); err != nil {
			return err
		}

		logger.Log(logger.LevelInfo, nil, nil, "k8s resource was stored with the key "+redactCacheKey(key))
	}

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

// redactCacheKey returns a redacted version of the cache key (which contains the context key
// in its fourth segment).
func redactCacheKey(key string) string {
	parts := strings.SplitN(key, "+", 6)

	if len(parts) >= 4 {
		parts[3] = redactContextKey(parts[3])

		return strings.Join(parts, "+")
	}

	return key
}

// redactCacheKeyPrefix redacts a key prefix, whose trailing delimiter would otherwise be
// reported as an empty trailing segment.
func redactCacheKeyPrefix(prefix string) string {
	return redactCacheKey(strings.TrimSuffix(prefix, "+"))
}
