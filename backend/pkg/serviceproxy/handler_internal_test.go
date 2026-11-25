/*
Copyright 2025 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package serviceproxy

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestServiceProxyRequestHandlerErrors(t *testing.T) {
	t.Run("missing auth token returns 401", func(t *testing.T) {
		store := kubeconfig.NewContextStore()
		require.NoError(t, store.AddContext(&kubeconfig.Context{
			Name:        "c1",
			Source:      kubeconfig.InCluster,
			KubeContext: &api.Context{Cluster: "c1"},
			Cluster:     &api.Cluster{Server: "https://10.0.0.1"},
			AuthInfo:    &api.AuthInfo{TokenFile: "/tmp/sa-tok"}, //nolint:gosec // Test fixture path.
		}))

		req := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/serviceproxy/default/svc?request=/", nil),
			map[string]string{"clusterName": "c1", "namespace": "default", "name": "svc"},
		)
		rec := httptest.NewRecorder()
		RequestHandler(store, false, rec, req)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("invalid cluster server returns 404", func(t *testing.T) {
		store := kubeconfig.NewContextStore()
		require.NoError(t, store.AddContext(&kubeconfig.Context{
			Name:        "c1",
			KubeContext: &api.Context{Cluster: "c1"},
			Cluster:     &api.Cluster{Server: "://bad-url"},
		}))

		req := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/serviceproxy/default/svc?request=/", nil),
			map[string]string{"clusterName": "c1", "namespace": "default", "name": "svc"},
		)
		req.Header.Set("Authorization", "Bearer tok")

		rec := httptest.NewRecorder()
		RequestHandler(store, false, rec, req)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})
}
