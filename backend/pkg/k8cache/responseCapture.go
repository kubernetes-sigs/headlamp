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
	"net/http"
)

// ResponseCapture is a struct that will capture statusCode, Headers and Body
// while the response is coming from the K8s clusters.
type ResponseCapture struct {
	http.ResponseWriter
	StatusCode int
	Body       *bytes.Buffer
}

// WriteHeader sets the status code and delegates to the underlying ResponseWriter.
func (r *ResponseCapture) WriteHeader(code int) {
	r.StatusCode = code
	r.ResponseWriter.WriteHeader(code)
}

// Write stores the response body and writes it to the underlying ResponseWriter.
func (r *ResponseCapture) Write(b []byte) (int, error) {
	if _, err := r.Body.Write(b); err != nil {
		return 0, err
	}

	return r.ResponseWriter.Write(b)
}

// NewResponseCapture initializes ResponseCapture with a http.ResponseWriter and empty bytes.Buffer for the body.
func NewResponseCapture(w http.ResponseWriter) *ResponseCapture {
	return &ResponseCapture{
		ResponseWriter: w,
		Body:           &bytes.Buffer{},
		StatusCode:     http.StatusOK,
	}
}
