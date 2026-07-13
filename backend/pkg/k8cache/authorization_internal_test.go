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
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
)

type resourceAttributesTestCase struct {
	name                string
	urlPath             string
	apiPath             string
	expectedGroup       string
	expectedVersion     string
	expectedNamespace   string
	expectedResource    string
	expectedName        string
	expectedSubresource string
	expectedVerb        string
}

func TestGetResourceAttributesForNamedResource(t *testing.T) {
	tests := []resourceAttributesTestCase{
		{
			name:              "named namespaced core resource",
			urlPath:           "/clusters/named-resource-test/api/v1/namespaces/default/pods/nginx",
			apiPath:           "api/v1/namespaces/default/pods/nginx",
			expectedVersion:   "v1",
			expectedNamespace: "default",
			expectedResource:  "pods",
			expectedName:      "nginx",
			expectedVerb:      "get",
		},
		{
			name:                "named resource with subresource",
			urlPath:             "/clusters/named-resource-test/api/v1/namespaces/default/pods/nginx/log",
			apiPath:             "api/v1/namespaces/default/pods/nginx/log",
			expectedVersion:     "v1",
			expectedNamespace:   "default",
			expectedResource:    "pods",
			expectedName:        "nginx",
			expectedSubresource: "log",
			expectedVerb:        "get",
		},
		{
			name:              "named namespaced API group resource",
			urlPath:           "/clusters/named-resource-test/apis/apps/v1/namespaces/default/deployments/frontend",
			apiPath:           "apis/apps/v1/namespaces/default/deployments/frontend",
			expectedGroup:     "apps",
			expectedVersion:   "v1",
			expectedNamespace: "default",
			expectedResource:  "deployments",
			expectedName:      "frontend",
			expectedVerb:      "get",
		},
		{
			name:              "namespaced collection",
			urlPath:           "/clusters/named-resource-test/api/v1/namespaces/default/pods",
			apiPath:           "api/v1/namespaces/default/pods",
			expectedVersion:   "v1",
			expectedNamespace: "default",
			expectedResource:  "pods",
			expectedVerb:      "list",
		},
	}

	runResourceAttributesTests(t, tests)
}

func TestGetResourceAttributesForNamespaceResource(t *testing.T) {
	tests := []resourceAttributesTestCase{
		{
			name:             "named namespace",
			urlPath:          "/clusters/named-resource-test/api/v1/namespaces/default",
			apiPath:          "api/v1/namespaces/default",
			expectedVersion:  "v1",
			expectedResource: "namespaces",
			expectedName:     "default",
			expectedVerb:     "get",
		},
		{
			name:                "namespace status subresource",
			urlPath:             "/clusters/named-resource-test/api/v1/namespaces/default/status",
			apiPath:             "api/v1/namespaces/default/status",
			expectedVersion:     "v1",
			expectedResource:    "namespaces",
			expectedName:        "default",
			expectedSubresource: "status",
			expectedVerb:        "get",
		},
		{
			name:                "namespace finalize subresource",
			urlPath:             "/clusters/named-resource-test/api/v1/namespaces/default/finalize",
			apiPath:             "api/v1/namespaces/default/finalize",
			expectedVersion:     "v1",
			expectedResource:    "namespaces",
			expectedName:        "default",
			expectedSubresource: "finalize",
			expectedVerb:        "get",
		},
	}

	runResourceAttributesTests(t, tests)
}

func runResourceAttributesTests(t *testing.T, tests []resourceAttributesTestCase) {
	t.Helper()

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, tc.urlPath, nil)
			req = mux.SetURLVars(req, map[string]string{
				"api": tc.apiPath,
			})

			attributes, err := getResourceAttributes(req)
			assert.NoError(t, err)

			assert.Equal(t, tc.expectedGroup, attributes.Group)
			assert.Equal(t, tc.expectedVersion, attributes.Version)
			assert.Equal(t, tc.expectedNamespace, attributes.Namespace)
			assert.Equal(t, tc.expectedResource, attributes.Resource)
			assert.Equal(t, tc.expectedName, attributes.Name)
			assert.Equal(t, tc.expectedSubresource, attributes.Subresource)
			assert.Equal(t, tc.expectedVerb, attributes.Verb)
		})
	}
}
