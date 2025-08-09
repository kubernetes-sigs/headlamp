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
	"bytes"
	"net/http"
)

// CachedResponseData is a struct that will capture statusCode, Headers and Body
// while the response is coming from the K8s clusters.
type responseCapture struct {
	http.ResponseWriter
	StatusCode int
	Body       *bytes.Buffer
}

// WriteHeader write the headers that to the Headers property in CachedResponseData struct.
func (r *responseCapture) WriteHeader(code int) {
	r.StatusCode = code
	r.ResponseWriter.WriteHeader(code)
}

// Write help to write the body of the response data into the CacheResponseData struct.
func (r *responseCapture) Write(b []byte) (int, error) {
	r.Body.Write(b)
	return r.ResponseWriter.Write(b)
}

// CreateResponseCapture initializes responseCapture with a http.ResponseWriter and empty bytes.Buffer for the body.
func CreateResponseCapture(w http.ResponseWriter) *responseCapture {
	return &responseCapture{
		ResponseWriter: w,
		Body:           &bytes.Buffer{},
		StatusCode:     http.StatusOK,
	}
}
