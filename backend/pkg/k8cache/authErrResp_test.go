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
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/k8cache"
	"github.com/stretchr/testify/assert"
)

func TestIsAuthBypassURL(t *testing.T) {
	tests := []struct {
		name     string
		urlPath  string
		expected bool
	}{
		{"No restricted paths", "/api/v1/resource", true},
		{"Direct version endpoint", "/version", false},
		{"Direct healthz endpoint", "/healthz", false},
		{"Proxied version endpoint", "/clusters/kind/version", false},
		{"Proxied healthz endpoint", "/clusters/kind/healthz", false},
		{"Resource named version", "/clusters/kind/api/v1/namespaces/ns/configmaps/version", true},
		{"Resource named healthz", "/clusters/kind/api/v1/namespaces/ns/configmaps/healthz", true},
		{"Direct selfsubjectrulesreviews v1 endpoint", "/apis/authorization.k8s.io/v1/selfsubjectrulesreviews", false},
		{"Direct selfsubjectaccessreviews v1 endpoint", "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews", false},
		{
			name:     "Proxied selfsubjectrulesreviews endpoint",
			urlPath:  "/clusters/kind/apis/authorization.k8s.io/v1/selfsubjectrulesreviews",
			expected: false,
		},
		{
			name:     "Proxied selfsubjectaccessreviews endpoint",
			urlPath:  "/clusters/kind/apis/authorization.k8s.io/v1/selfsubjectaccessreviews",
			expected: false,
		},
		{
			name:     "Resource named selfsubjectrulesreviews",
			urlPath:  "/clusters/kind/api/v1/namespaces/ns/configmaps/selfsubjectrulesreviews",
			expected: true,
		},
		{
			name:     "Resource named selfsubjectaccessreviews",
			urlPath:  "/clusters/kind/api/v1/namespaces/ns/configmaps/selfsubjectaccessreviews",
			expected: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := k8cache.IsAuthBypassURL(tt.urlPath)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsAuthBypassURLSelfSubjectReviewVersions(t *testing.T) {
	tests := []struct {
		name     string
		urlPath  string
		expected bool
	}{
		{
			name:     "v1beta1 access review",
			urlPath:  "/apis/authorization.k8s.io/v1beta1/selfsubjectaccessreviews",
			expected: false,
		},
		{
			name:     "future access review version",
			urlPath:  "/apis/authorization.k8s.io/v2/selfsubjectaccessreviews",
			expected: false,
		},
		{
			name:     "proxied future rules review version",
			urlPath:  "/clusters/kind/apis/authorization.k8s.io/v2/selfsubjectrulesreviews",
			expected: false,
		},
		{
			name:     "different API group",
			urlPath:  "/apis/apps/v1/selfsubjectaccessreviews",
			expected: true,
		},
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

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/apis/v1/resource", nil)

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

func TestReturnAuthErrorResponseReflectsActualScope(t *testing.T) {
	t.Run("resource paths", func(t *testing.T) {
		testReturnAuthErrorResponseScope(t, []authErrorScopeTestCase{
			{
				name:              "Namespaced, non-core resource",
				muxVars:           map[string]string{"api": "apis/apps/v1/namespaces/my-ns/deployments"},
				expectedGroup:     "apps",
				expectedNamespace: "my-ns",
			},
			{
				name:              "Cluster-scoped, core resource",
				muxVars:           map[string]string{"api": "api/v1/nodes"},
				expectedGroup:     "",
				expectedNamespace: "",
			},
		})
	})

	t.Run("non namespaced paths stay cluster scoped", func(t *testing.T) {
		testReturnAuthErrorResponseScope(t, []authErrorScopeTestCase{
			{
				name:              "Namespace resource stays cluster scoped",
				muxVars:           map[string]string{"api": "api/v1/namespaces/kube-system"},
				expectedGroup:     "",
				expectedNamespace: "",
			},
			{
				name:              "Namespace subresource stays cluster scoped",
				muxVars:           map[string]string{"api": "api/v1/namespaces/kube-system/status"},
				expectedGroup:     "",
				expectedNamespace: "",
			},
			{
				name:              "Non resource endpoint does not fabricate namespace",
				muxVars:           map[string]string{"api": "openapi/v2/namespaces/not-a-real-namespace"},
				expectedGroup:     "",
				expectedNamespace: "",
				expectedPath:      true,
			},
		})
	})
}

func TestReturnAuthErrorResponseUsesRequestPathForNonResourceEndpoints(t *testing.T) {
	rr := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	req = mux.SetURLVars(req, map[string]string{"api": "openapi/v2/namespaces/not-a-real-namespace"})

	err := k8cache.ReturnAuthErrorResponse(rr, req, "test-context")
	assert.NoError(t, err)

	var resp k8cache.AuthErrResponse

	err = json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)

	assert.Equal(t, "openapi/v2/namespaces/not-a-real-namespace", resp.Details.Kind)
	assert.Contains(t, resp.Message, "cannot access path")
	assert.NotContains(t, resp.Message, "unknown resource \"\"")
}

type authErrorScopeTestCase struct {
	name              string
	muxVars           map[string]string
	expectedGroup     string
	expectedNamespace string
	expectedPath      bool
}

func testReturnAuthErrorResponseScope(t *testing.T, tests []authErrorScopeTestCase) {
	t.Helper()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rr := httptest.NewRecorder()
			req := httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
			req = mux.SetURLVars(req, tc.muxVars)

			err := k8cache.ReturnAuthErrorResponse(rr, req, "test-context")
			assert.NoError(t, err)

			var resp k8cache.AuthErrResponse

			err = json.Unmarshal(rr.Body.Bytes(), &resp)
			assert.NoError(t, err)

			if tc.expectedPath {
				assert.Contains(t, resp.Message, "cannot access path")
			} else {
				assert.Contains(t, resp.Message, fmt.Sprintf("API group %q", tc.expectedGroup))
			}

			if tc.expectedNamespace != "" {
				assert.Contains(t, resp.Message, fmt.Sprintf("in the namespace %q", tc.expectedNamespace))
			} else {
				assert.Contains(t, resp.Message, "at the cluster scope")
			}
		})
	}
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
