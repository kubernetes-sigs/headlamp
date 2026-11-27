/*
Copyright 2026 The Kubernetes Authors.

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

package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestDisconnectClusterEndpoint(t *testing.T) {
	store := kubeconfig.NewContextStore()
	kCtx := &kubeconfig.Context{
		Name:        "c1",
		KubeContext: &api.Context{Cluster: "c1", AuthInfo: "u1"},
		Cluster:     &api.Cluster{Server: "https://127.0.0.1:6443"},
		AuthInfo:    &api.AuthInfo{Token: "tok"},
	}
	require.NoError(t, kCtx.SetupProxy())
	require.NoError(t, store.AddContext(kCtx))

	hc := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore: store,
			},
			Cache: cache.New[interface{}](),
		},
	}

	h := newRemainingTestHandler(t, hc)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/clusters/c1/connection", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), `"disconnected"`)

	reqMissing := httptest.NewRequestWithContext(
		context.Background(), http.MethodDelete, "/clusters/missing/connection", nil,
	)
	recMissing := httptest.NewRecorder()
	h.ServeHTTP(recMissing, reqMissing)
	assert.Equal(t, http.StatusNotFound, recMissing.Code)
}
