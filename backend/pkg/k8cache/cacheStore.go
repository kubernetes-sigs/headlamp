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
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

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
	Generation uint64      `json:"generation,omitempty"`
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
		if encoding == gzipEncoding &&
			(strings.EqualFold(idx, "Content-Encoding") || strings.EqualFold(idx, "Content-Length")) {
			continue
		}

		cacheHeader[idx] = append(cacheHeader[idx], header...)
	}

	return cacheHeader
}

// encodeResponse serializes a cacheable response tagged with the generation of
// the watch it was read under. It returns "" for responses that must not be shared.
func encodeResponse(rcw *ResponseCapture, generation uint64) (string, error) {
	if rcw.StatusCode != http.StatusOK {
		return "", nil
	}

	headers := rcw.Header()
	// Kubernetes marks authenticated responses private; this cache reauthorizes every hit.
	// An explicit no-store response is never retained.
	if strings.Contains(strings.ToLower(headers.Get("Cache-Control")), "no-store") {
		return "", nil
	}

	if headers.Get("Set-Cookie") != "" {
		return "", nil
	}

	for _, vary := range headers.Values("Vary") {
		for _, field := range strings.Split(vary, ",") {
			if field = strings.TrimSpace(field); field != "" &&
				!strings.EqualFold(field, "Accept") && !strings.EqualFold(field, "Accept-Encoding") {
				return "", nil
			}
		}
	}

	body, err := GetResponseBody(rcw.Body.Bytes(), headers.Get("Content-Encoding"))
	if err != nil {
		return "", err
	}

	// Resources carry an object-valued status; only a Status object has a string one.
	var object struct {
		Kind   string          `json:"kind"`
		Status json.RawMessage `json:"status"`
	}
	if json.Unmarshal([]byte(body), &object) != nil || object.Kind == "" {
		return "", nil
	}

	if object.Kind == "Status" {
		var status string
		if json.Unmarshal(object.Status, &status) == nil && status == "Failure" {
			return "", nil
		}
	}

	encoded, err := json.Marshal(CachedResponseData{
		Generation: generation, StatusCode: rcw.StatusCode,
		Headers: FilterHeaderForCache(headers, headers.Get("Content-Encoding")), Body: body,
	})

	return string(encoded), err
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

// redactCacheKey omits resource names, selectors and connection identifiers from logs.
func redactCacheKey(key string) string {
	if parsed, ok := parseCacheKey(key); ok {
		return "response for " + redactContextKey(parsed.Context)
	}

	return "[invalid cache key]"
}
