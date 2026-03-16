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

package k8cache_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
)

func TestIsAuthBypassUR(t *testing.T) {
	tests := []struct {
		name     string
		urlPath  string
		expected bool
	}{
		{"No restricted paths", "/api/v1/resource", true},
		{"Contains /version", "/version", false},
		{"Contains /healthz", "/healthz", false},
		{"Contains /selfsubjectrulesreviews", "/apis/selfsubjectrulesreviews", false},
		{"Contains /selfsubjectaccessreviews", "/apis/selfsubjectaccessreviews", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := k8cache.IsAuthBypassURL(tt.urlPath)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestReturnAuthErrorResponse(t *testing.T) {
	rr := httptest.NewRecorder()

	req := httptest.NewRequest("GET", "/apis/v1/resource", nil)

	err := k8cache.ReturnAuthErrorResponse(rr, req, "test-context")
	assert.NoError(t, err)

	assert.Equal(t, http.StatusForbidden, rr.Code)

	var resp k8cache.AuthErrResponse
	err = json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	assert.Equal(t, "Status", resp.Kind)
	assert.Equal(t, "v1", resp.APIVersion)
	assert.Equal(t, 403, resp.Code)
	assert.Contains(t, resp.Message, "is forbidden:")
	assert.Equal(t, "Forbidden", resp.Reason)
}

func TestWriteResponseToClient(t *testing.T) {
	recorder := httptest.NewRecorder()
	responseBody := []byte(`{"error":"forbidden"}`)

	err := k8cache.WriteResponseToClient(responseBody, recorder)
	assert.NoError(t, err)

	assert.Equal(t, http.StatusForbidden, recorder.Code)
	assert.Equal(t, "true", recorder.Header().Get("X-HEADLAMP-CACHE"))
	assert.Equal(t, responseBody, recorder.Body.Bytes())
}
