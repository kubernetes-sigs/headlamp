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
	"strings"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

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

		defer reader.Close()

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
	parts := strings.Split(path, "/")

	if len(parts) < 4 {
		return "", "", fmt.Errorf("invalid url format")
	}

	if parts[3] == "api" {
		// Core API group
		apiGroup = ""
		version = parts[4]
	} else if parts[3] == "apis" {
		// Named API group
		apiGroup = parts[4]
		version = parts[5]
	}

	return
}

// ExtractNamespace extracts the namespace from the parameter from the given raw URL. This is used to make
// cache key more specific to a particular namespace.
func ExtractNamespace(rawURL string) (string, string) {
	if idx := strings.Index(rawURL, "?"); idx != -1 {
		rawURL = rawURL[:idx]
	}

	rawURL = strings.TrimSuffix(rawURL, "/")

	var namespace, kind string

	urls := strings.Split(rawURL, "/")
	n := len(urls)

	for i := 0; i < n-1; i++ {
		if urls[i] == "namespaces" {
			namespace = urls[i+1]
			break
		}
	}

	if len(urls) > 2 {
		kind = urls[n-1]
	}

	return namespace, kind
}

// GenerateKey function helps to generate a unique key based on the request from the client
// The function accepts url( which includes all the information of request ) and contextID which
// helps to differentiate in multiple contexts.
func GenerateKey(url *url.URL, contextID string) (string, error) {
	namespace, kind := ExtractNamespace(url.Path)

	apiGroup, _, err := GetAPIGroup(url.Path)
	if err != nil {
		return "", err
	}

	k := CacheKey{
		Kind:      kind,
		Namespace: namespace,
		Context:   contextID,
	}

	// Create a stable representation
	raw := fmt.Sprintf("%s+%s+%s+%s", apiGroup, k.Kind, k.Namespace, k.Context)

	return raw, nil
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

		logger.Log(logger.LevelInfo, nil, nil, "serving from the cache with key "+key)

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
	r *http.Request,
	key string,
) error {
	capturedHeaders := rcw.Header()
	encoding := capturedHeaders.Get("Content-Encoding")
	bodyBytes := rcw.Body.Bytes()

	dcmpBody, err := GetResponseBody(bodyBytes, encoding)
	if err != nil {
		return err
	}

	headersToCache := FilterHeaderForCache(capturedHeaders, encoding)
	if !strings.Contains(url.Path, "selfsubjectrulesreviews") {
		cachedData := CachedResponseData{
			StatusCode: rcw.StatusCode,
			Headers:    headersToCache,
			Body:       dcmpBody,
		}

		jsonBytes, err := json.Marshal(cachedData)
		if err != nil {
			return err
		}

		if !strings.Contains(string(jsonBytes), "Failure") {
			if err = k8scache.SetWithTTL(context.Background(), key, string(jsonBytes), 10*time.Minute); err != nil {
				return err
			}

			logger.Log(logger.LevelInfo, nil, nil, "k8s resource was stored with the key "+key)
		}
	}

	return nil
}
