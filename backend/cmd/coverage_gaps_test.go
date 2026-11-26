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
	"encoding/base64"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

type errContextStore struct {
	kubeconfig.ContextStore
	addErr    error
	updateErr error
}

func (s *errContextStore) AddContextWithKeyAndTTL(
	ctx *kubeconfig.Context,
	key string,
	ttl time.Duration,
) error {
	if s.addErr != nil {
		return s.addErr
	}

	return s.ContextStore.AddContextWithKeyAndTTL(ctx, key, ttl)
}

func (s *errContextStore) UpdateTTL(key string, ttl time.Duration) error {
	if s.updateErr != nil {
		return s.updateErr
	}

	return s.ContextStore.UpdateTTL(key, ttl)
}

type failingEncodeWriter struct {
	header            http.Header
	status            int
	wroteHeader       bool
	attemptedStatuses []int
	writeCalls        int
}

func (w *failingEncodeWriter) Header() http.Header {
	if w.header == nil {
		w.header = make(http.Header)
	}

	return w.header
}

func (w *failingEncodeWriter) WriteHeader(code int) {
	w.attemptedStatuses = append(w.attemptedStatuses, code)
	if w.wroteHeader {
		return
	}

	w.status = code
	w.wroteHeader = true
}

func (w *failingEncodeWriter) Write(_ []byte) (int, error) {
	w.writeCalls++
	if !w.wroteHeader {
		// Model net/http's implicit 200 commitment on the first Write before an error occurs.
		w.status = http.StatusOK
		w.wroteHeader = true
	}

	return 0, errors.New("write failed")
}

func TestStatelessSetKeyInCacheAndErrors(t *testing.T) {
	base := kubeconfig.NewContextStore()
	cfg := newCmdTestConfig(t)
	cfg.KubeConfigStore = &errContextStore{
		ContextStore: base,
		addErr:       errors.New("add ttl failed"),
		updateErr:    errors.New("update ttl failed"),
	}

	kCtx := kubeconfig.Context{Name: "c1", Cluster: &api.Cluster{Server: "https://k8s.example.com"}}
	err := cfg.setKeyInCache("c1", kCtx)
	require.ErrorContains(t, err, "add ttl failed")

	// Seed entry directly into base store so setKeyInCache takes the UpdateTTL branch.
	require.NoError(t, base.AddContextWithKeyAndTTL(&kCtx, "c1", time.Minute))
	err = cfg.setKeyInCache("c1", kCtx)
	require.ErrorContains(t, err, "update ttl failed")
}

func TestResolveStatelessRequestContextErrors(t *testing.T) {
	t.Run("invalid base64 returns decode error", func(t *testing.T) {
		req := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/pods", nil),
			map[string]string{"clusterName": "c1"},
		)
		_, _, err := resolveStatelessRequestContext(req, "!!!not-base64!!!")
		require.Error(t, err)
	})

	t.Run("invalid kubeconfig YAML returns load error", func(t *testing.T) {
		badYAML := base64.StdEncoding.EncodeToString([]byte(":::not valid yaml::: ["))
		req := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/pods", nil),
			map[string]string{"clusterName": "c1"},
		)
		_, _, err := resolveStatelessRequestContext(req, badYAML)
		require.Error(t, err)
	})

	t.Run("valid kubeconfig with invalid headlamp_info returns error", func(t *testing.T) {
		kcYAML := `apiVersion: v1
kind: Config
clusters:
- name: c1
  cluster:
    server: https://k8s.example.com
contexts:
- name: c1
  context:
    cluster: c1
    user: u1
    extensions:
    - name: headlamp_info
      extension: "not-a-struct"
users:
- name: u1
  user:
    token: tok
`
		encoded := base64.StdEncoding.EncodeToString([]byte(kcYAML))
		req := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/pods", nil),
			map[string]string{"clusterName": "c1"},
		)

		_, _, err := resolveStatelessRequestContext(req, encoded)
		require.Error(t, err)
	})
}

func TestStatelessHandlerAndParseKubeConfigErrors(t *testing.T) {
	kcYAML := `apiVersion: v1
kind: Config
clusters:
- name: c1
  cluster:
    server: https://k8s.example.com
contexts:
- name: c1
  context:
    cluster: c1
    user: u1
users:
- name: u1
  user:
    token: tok
`
	encoded := base64.StdEncoding.EncodeToString([]byte(kcYAML))

	t.Run("handleStatelessReq propagates cache write error", func(t *testing.T) {
		cfg := newCmdTestConfig(t)
		cfg.EnableDynamicClusters = true
		cfg.KubeConfigStore = &errContextStore{
			ContextStore: kubeconfig.NewContextStore(),
			addErr:       errors.New("cache write failed"),
		}

		req := mux.SetURLVars(
			httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/pods", nil),
			map[string]string{"clusterName": "c1"},
		)
		req.Header.Set("KUBECONFIG", encoded)

		_, err := cfg.getContextKeyForRequest(req)
		require.ErrorContains(t, err, "cache write failed")
	})

	t.Run("parseKubeConfig logs and attempts 400 when response write fails", func(t *testing.T) {
		cfg := newCmdTestConfig(t)
		body := `{"kubeconfigs":["` + encoded + `"]}`
		req := httptest.NewRequestWithContext(
			context.Background(),
			http.MethodPost,
			"/parseKubeConfig",
			strings.NewReader(body),
		)
		w := &failingEncodeWriter{}

		cfg.parseKubeConfig(w, req)
		assert.Equal(t, http.StatusOK, w.status)
		assert.Equal(t, []int{http.StatusBadRequest}, w.attemptedStatuses)
		assert.Equal(t, 2, w.writeCalls)
	})
}

func TestCacheMiddlewareBranches(t *testing.T) {
	t.Run("disabled cache passes through directly", func(t *testing.T) {
		cfg := newCmdTestConfig(t)
		cfg.CacheEnabled = false

		called := false
		handler := CacheMiddleWare(cfg)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			called = true

			w.WriteHeader(http.StatusOK)
		}))

		rr := httptest.NewRecorder()
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/api/v1/pods", nil)
		handler.ServeHTTP(rr, req)
		assert.True(t, called)
		assert.Equal(t, http.StatusOK, rr.Code)
	})

	t.Run("websocket and non-k8s paths skip caching", func(t *testing.T) {
		cfg := newCmdTestConfig(t)
		cfg.CacheEnabled = true

		calls := 0
		handler := CacheMiddleWare(cfg)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			calls++

			w.WriteHeader(http.StatusOK)
		}))

		wsReq := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/api/v1/pods?watch=1", nil)
		wsReq.Header.Set("Connection", "upgrade")
		wsReq.Header.Set("Upgrade", "websocket")
		handler.ServeHTTP(httptest.NewRecorder(), wsReq)

		nonK8sReq := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/config", nil)
		handler.ServeHTTP(httptest.NewRecorder(), nonK8sReq)

		assert.Equal(t, 2, calls)
	})
}
