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

package portforward //nolint:testpackage // Covers unexported store, request, and handler error branches.

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

type failingPortForwardCache struct {
	cache.Cache[interface{}]
	setErr    error
	deleteErr error
	getAllErr error
}

func (f *failingPortForwardCache) Set(ctx context.Context, key string, val interface{}) error {
	if f.setErr != nil {
		return f.setErr
	}

	return f.Cache.Set(ctx, key, val)
}

func (f *failingPortForwardCache) Delete(ctx context.Context, key string) error {
	if f.deleteErr != nil {
		return f.deleteErr
	}

	return f.Cache.Delete(ctx, key)
}

func (f *failingPortForwardCache) GetAll(ctx context.Context, m cache.Matcher) (map[string]interface{}, error) {
	if f.getAllErr != nil {
		return nil, f.getAllErr
	}

	return f.Cache.GetAll(ctx, m)
}

type failingResponseWriter struct {
	header            http.Header
	status            int
	wroteHeader       bool
	attemptedStatuses []int
	writeCalls        int
}

func (w *failingResponseWriter) Header() http.Header {
	if w.header == nil {
		w.header = make(http.Header)
	}

	return w.header
}

func (w *failingResponseWriter) WriteHeader(code int) {
	w.attemptedStatuses = append(w.attemptedStatuses, code)
	if w.wroteHeader {
		return
	}

	w.status = code
	w.wroteHeader = true
}

func (w *failingResponseWriter) Write(_ []byte) (int, error) {
	w.writeCalls++
	if !w.wroteHeader {
		// Model net/http's implicit 200 commitment on the first Write before an error occurs.
		w.status = http.StatusOK
		w.wroteHeader = true
	}

	return 0, errors.New("write failed")
}

func TestStoreCacheErrorPaths(t *testing.T) {
	t.Run("portforwardstore logs and tolerates Set failure", func(t *testing.T) {
		fc := &failingPortForwardCache{
			Cache:  cache.New[interface{}](),
			setErr: errors.New("set boom"),
		}

		portforwardstore(fc, portForward{ID: "pf1", cacheKey: "c1"})
	})

	t.Run("stopOrDeletePortForward returns Delete error", func(t *testing.T) {
		base := cache.New[interface{}]()
		stopCh := make(chan struct{})
		pf := portForward{
			ID: "pf-del-err", Cluster: "c1", cacheKey: "c1",
			closeChan: stopCh, mu: &sync.Mutex{}, Status: RUNNING,
		}
		portforwardstore(base, pf)

		fc := &failingPortForwardCache{
			Cache:     base,
			deleteErr: errors.New("delete boom"),
		}

		err := stopOrDeletePortForward(fc, "c1", "pf-del-err", false)
		require.ErrorContains(t, err, "delete boom")
	})

	t.Run("getPortForwardList returns nil when GetAll fails", func(t *testing.T) {
		fc := &failingPortForwardCache{
			Cache:     cache.New[interface{}](),
			getAllErr: errors.New("getall boom"),
		}

		assert.Nil(t, getPortForwardList(fc, "c1"))
	})
}

func TestHandlerResponseEncodeErrors(t *testing.T) {
	c := cache.New[interface{}]()
	portforwardstore(c, portForward{
		ID: "pf-json", Pod: "p1", Cluster: "c1", cacheKey: "c1",
		Namespace: "default", Port: "8080", TargetPort: "80", Status: RUNNING,
	})

	t.Run("GetPortForwards handles write error", func(t *testing.T) {
		w := &failingResponseWriter{}
		r := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/portforward/list", nil),
			map[string]string{"clusterName": "c1"},
		)

		GetPortForwards(c, "c1", w, r)
		assert.Equal(t, http.StatusOK, w.status)
		assert.Equal(t, []int{http.StatusInternalServerError}, w.attemptedStatuses)
		assert.Equal(t, 2, w.writeCalls)
	})

	t.Run("GetPortForwardByID handles write error", func(t *testing.T) {
		w := &failingResponseWriter{}
		r := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/portforward?id=pf-json", nil),
			map[string]string{"clusterName": "c1"},
		)

		GetPortForwardByID(c, "c1", w, r)
		assert.Equal(t, http.StatusOK, w.status)
		assert.Equal(t, []int{http.StatusInternalServerError}, w.attemptedStatuses)
		assert.Equal(t, 2, w.writeCalls)
	})
}

func TestRequestContextAuthAndMethodErrors(t *testing.T) {
	t.Run("preparePortForwardTrust returns 503 when pinPortForwardAuthority fails", func(t *testing.T) {
		badCtx := &kubeconfig.Context{
			Name:    "bad",
			Cluster: &api.Cluster{Server: "https://k8s.example.com"},
			AuthInfo: &api.AuthInfo{
				AuthProvider: &api.AuthProviderConfig{
					Config: map[string]string{"api-proxy": "://bad-proxy"},
				},
			},
		}
		rr := httptest.NewRecorder()

		auth, ok := preparePortForwardTrust(badCtx, "tok", false, rr)
		assert.False(t, ok)
		assert.Nil(t, auth)
		assert.Equal(t, http.StatusServiceUnavailable, rr.Code)
	})

	t.Run("handleRequestContext returns 503 when ClientSetWithToken fails", func(t *testing.T) {
		badCtx := &kubeconfig.Context{
			Name:        "bad-client",
			KubeContext: &api.Context{Cluster: "bad-client", AuthInfo: "u1"},
			Cluster:     &api.Cluster{Server: "https://example.com"},
			AuthInfo:    &api.AuthInfo{TokenFile: "/nonexistent/token/file"},
		}

		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/portforward/list", nil)

		rr := httptest.NewRecorder()
		handleRequestContext(badCtx, cache.New[interface{}](), false, "bad-client", true, true, rr, req)
		assert.Equal(t, http.StatusServiceUnavailable, rr.Code)
	})
}

func TestRequestContextUnsupportedMethodReturns405(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(
			`{"apiVersion":"authentication.k8s.io/v1","kind":"SelfSubjectReview",` +
				`"status":{"userInfo":{"username":"alice"}}}`))
	}))
	defer srv.Close()

	kCtx := &kubeconfig.Context{
		Name:        "c1",
		KubeContext: &api.Context{Cluster: "c1", AuthInfo: "u1"},
		Cluster:     &api.Cluster{Server: srv.URL},
		AuthInfo:    &api.AuthInfo{Token: "tok"},
	}

	req := mux.SetURLVars(
		httptest.NewRequestWithContext(context.Background(), http.MethodPatch, "/portforward", nil),
		map[string]string{"clusterName": "c1"},
	)
	req.Header.Set("Authorization", "Bearer tok")

	rr := httptest.NewRecorder()
	handleRequestContext(kCtx, cache.New[interface{}](), false, "c1", true, false, rr, req)

	assert.Equal(t, http.StatusMethodNotAllowed, rr.Code)
	assert.Equal(t, "GET, POST, DELETE", rr.Header().Get("Allow"))
}

func TestStartPortForwardPermissionAndInitErrors(t *testing.T) {
	k8sSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":{"allowed":false,"reason":"forbidden by RBAC"}}`))
	}))
	defer k8sSrv.Close()

	kCtx := &kubeconfig.Context{
		Name:        "c1",
		KubeContext: &api.Context{Cluster: "c1", AuthInfo: "u1"},
		Cluster:     &api.Cluster{Server: k8sSrv.URL},
		AuthInfo:    &api.AuthInfo{Token: "tok"},
	}

	err := startPortForward(kCtx, cache.New[interface{}](), portForwardRequest{
		ID:         "pf-rbac-deny",
		Namespace:  "default",
		Pod:        "pod-1",
		Port:       "8080",
		TargetPort: "80",
	}, "tok", "c1", "c1")
	require.ErrorContains(t, err, "forbidden by RBAC")
}
