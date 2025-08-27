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
	"fmt"
	"io"
	"net/http"

	"strings"

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
