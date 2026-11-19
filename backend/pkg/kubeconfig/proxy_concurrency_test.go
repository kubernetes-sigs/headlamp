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

package kubeconfig_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func newProxyTestContext(server string) *kubeconfig.Context {
	return &kubeconfig.Context{
		Name:        "proxy-test",
		KubeContext: &api.Context{Cluster: "c", AuthInfo: "u"},
		Cluster:     &api.Cluster{Server: server},
		AuthInfo:    &api.AuthInfo{},
	}
}

// Run with -race: concurrent first requests must set the proxy up without racing on it.
func TestProxyRequestConcurrentFirstRequests(t *testing.T) {
	cluster := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer cluster.Close()

	ctx := newProxyTestContext(cluster.URL)

	const requests = 20

	var wg sync.WaitGroup

	codes := make([]int, requests)

	for i := 0; i < requests; i++ {
		wg.Add(1)

		go func(i int) {
			defer wg.Done()

			rec := httptest.NewRecorder()
			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/version", nil)

			assert.NoError(t, ctx.ProxyRequest(rec, req))

			codes[i] = rec.Code
		}(i)
	}

	wg.Wait()

	for _, code := range codes {
		assert.Equal(t, http.StatusOK, code)
	}
}

func TestProxyRequestRetriesAfterFailedSetup(t *testing.T) {
	cluster := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer cluster.Close()

	ctx := newProxyTestContext("http://[::1")

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/version", nil)

	require.Error(t, ctx.ProxyRequest(httptest.NewRecorder(), req))

	ctx.Cluster.Server = cluster.URL
	rec := httptest.NewRecorder()

	require.NoError(t, ctx.ProxyRequest(rec, req))
	assert.Equal(t, http.StatusOK, rec.Code)
}
