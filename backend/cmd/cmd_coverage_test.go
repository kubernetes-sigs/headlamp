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
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/helm"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/plugins"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"helm.sh/helm/v3/pkg/cli"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/clientcmd/api"
)

func newCmdTestConfig(t *testing.T) *HeadlampConfig {
	t.Helper()

	conf, err := config.Parse([]string{})
	require.NoError(t, err)

	cfg := createHeadlampConfig(conf)
	cfg.KubeConfigStore = kubeconfig.NewContextStore()
	cfg.Multiplexer = NewMultiplexer(cfg.KubeConfigStore, false)

	_, err = initTelemetry(cfg)
	require.NoError(t, err)

	return cfg
}

func TestCreateHeadlampConfigAndLoadAdminSettings(t *testing.T) {
	settingsPath := filepath.Join(t.TempDir(), "settings.json")
	require.NoError(t, os.WriteFile(settingsPath, []byte(`{"theme":"dark"}`), 0o600))

	cfg := createHeadlampConfig(&config.Config{
		Port:                    4466,
		OidcClientID:            "cid",
		OidcScopes:              "openid,email",
		ProxyURLs:               "https://example.com/*",
		ProxyAuthEnabled:        true,
		ProxyAuthUsernameHeader: "X-User",
		SettingsPath:            settingsPath,
	})

	assert.Equal(t, "cid", cfg.OidcClientID)
	assert.Equal(t, []string{"openid", "email"}, cfg.OidcScopes)
	assert.True(t, cfg.ProxyAuthEnabled)
	assert.Equal(t, "X-User", cfg.ProxyAuthUsernameHeader)
	assert.JSONEq(t, `{"theme":"dark"}`, string(cfg.AdminSettings))
	assert.Len(t, cfg.compiledProxyURLs, 1)

	_, err := loadAdminSettings(filepath.Join(t.TempDir(), "missing.json"))
	require.Error(t, err)

	badJSON := filepath.Join(t.TempDir(), "bad.json")
	require.NoError(t, os.WriteFile(badJSON, []byte(`{bad`), 0o600))
	_, err = loadAdminSettings(badJSON)
	require.ErrorContains(t, err, "not valid JSON")
}

func TestGetContextKeyAndKContextErrorsAndStartError(t *testing.T) {
	cfg := newCmdTestConfig(t)

	rr := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters//pods", nil)
	span, key, kctx, err := GetContextKeyAndKContext(rr, req, cfg)
	require.Error(t, err)
	assert.Nil(t, span)
	assert.Empty(t, key)
	assert.Nil(t, kctx)
	assert.Equal(t, http.StatusNotFound, rr.Code)

	rr2 := httptest.NewRecorder()
	req2 := mux.SetURLVars(
		httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/missing/pods", nil),
		map[string]string{"clusterName": "missing"},
	)
	span, key, kctx, err = GetContextKeyAndKContext(rr2, req2, cfg)
	require.Error(t, err)
	assert.Nil(t, span)
	assert.Empty(t, key)
	assert.Nil(t, kctx)
	assert.Equal(t, http.StatusNotFound, rr2.Code)

	nonFatal := errors.New("non-fatal startup error")
	HandleServerStartError(&nonFatal)
}

func TestAddPluginListRoute(t *testing.T) {
	cfg := newCmdTestConfig(t)
	r := mux.NewRouter()
	addPluginListRoute(cfg, r)

	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/plugins", nil))
	require.Equal(t, http.StatusOK, rr.Code)
	assert.JSONEq(t, "[]", rr.Body.String())

	refresh, err := cfg.Cache.Get(context.Background(), plugins.PluginCanSendRefreshKey)
	require.NoError(t, err)
	assert.Equal(t, true, refresh)

	require.NoError(t, cfg.Cache.Set(context.Background(), plugins.PluginListKey, []plugins.PluginMetadata{
		{Name: "p1", Path: "/plugins/p1"},
	}))

	rr2 := httptest.NewRecorder()
	r.ServeHTTP(rr2, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/plugins", nil))
	require.Equal(t, http.StatusOK, rr2.Code)
	assert.Contains(t, rr2.Body.String(), `"p1"`)
}

func TestGlobalOidcConfigAndCopyStaticFiles(t *testing.T) {
	cfg := newCmdTestConfig(t)
	cfg.OidcClientID = "cid"
	cfg.OidcSkipTLSVerify = true
	cfg.OidcCACert = "CERT"

	oidcCfg := globalOidcConfig(cfg)
	require.NotNil(t, oidcCfg.CACert)
	assert.Equal(t, "CERT", *oidcCfg.CACert)
	assert.Equal(t, "cid", oidcCfg.ClientID)
	require.NotNil(t, oidcCfg.SkipTLSVerify)
	assert.True(t, *oidcCfg.SkipTLSVerify)

	srcDir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(srcDir, "index.html"), []byte("ok"), 0o600))
	cfg.StaticDir = srcDir
	require.NoError(t, copyStaticFiles(cfg))

	copiedDir := cfg.StaticDir

	t.Cleanup(func() { _ = os.RemoveAll(copiedDir) })

	copied, err := os.ReadFile(filepath.Join(copiedDir, "index.html")) //nolint:gosec // test reads temp dir created above
	require.NoError(t, err)
	assert.Equal(t, "ok", string(copied))

	cfg.StaticDir = filepath.Join(t.TempDir(), "does-not-exist")
	require.Error(t, copyStaticFiles(cfg))
}

func TestSetupGracefulShutdownServerDone(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	serverDone := make(chan struct{})
	setupGracefulShutdown(&http.Server{ReadHeaderTimeout: time.Second}, cancel, serverDone)
	close(serverDone)

	require.Eventually(t, func() bool {
		return ctx.Err() != nil
	}, time.Second, 10*time.Millisecond)
}

func TestDispatchHelmRoute(t *testing.T) {
	cfg := newCmdTestConfig(t)

	helmDir := t.TempDir()
	helmSettings := cli.New()
	helmSettings.RepositoryConfig = filepath.Join(helmDir, "repositories.yaml")
	helmSettings.RepositoryCache = filepath.Join(helmDir, "cache")
	require.NoError(t, os.MkdirAll(helmSettings.RepositoryCache, 0o750))
	require.NoError(t, os.WriteFile(helmSettings.RepositoryConfig, []byte("repositories: []\n"), 0o600))

	h, err := helm.NewHandlerWithSettings(cfg.Cache, helmSettings)
	require.NoError(t, err)

	require.Empty(t, cfg.updateCustomContextToCache(&api.Config{
		Clusters: map[string]*api.Cluster{"c1": {Server: "http://127.0.0.1:1"}},
		Contexts: map[string]*api.Context{"c1": {Cluster: "c1"}},
	}, "c1", "c1", kubeConfigSource))

	routes := []struct {
		method      string
		clusterName string
		path        string
		want        int
	}{
		{http.MethodGet, "c1", "/clusters/c1/helm/releases/list", http.StatusInternalServerError},
		{http.MethodPost, "c1", "/clusters/c1/helm/release/install", http.StatusBadRequest},
		{http.MethodGet, "c1", "/clusters/c1/helm/release/history", http.StatusBadRequest},
		{http.MethodDelete, "c1", "/clusters/c1/helm/releases/uninstall", http.StatusBadRequest},
		{http.MethodPut, "c1", "/clusters/c1/helm/releases/rollback", http.StatusBadRequest},
		{http.MethodPut, "c1", "/clusters/c1/helm/releases/upgrade", http.StatusBadRequest},
		{http.MethodGet, "c1", "/clusters/c1/helm/releases", http.StatusBadRequest},
		{http.MethodGet, "c1", "/clusters/c1/helm/action/status", http.StatusBadRequest},
		{http.MethodGet, "missing", "/clusters/missing/helm/releases/list", http.StatusNotFound},
		{http.MethodGet, "missing", "/clusters/missing/helm/repositories", http.StatusOK},
		{http.MethodPost, "missing", "/clusters/missing/helm/repositories", http.StatusBadRequest},
		{http.MethodDelete, "missing", "/clusters/missing/helm/repositories/remove", http.StatusBadRequest},
		{http.MethodPut, "missing", "/clusters/missing/helm/repositories/update", http.StatusBadRequest},
		{http.MethodGet, "missing", "/clusters/missing/helm/charts", http.StatusOK},
		{http.MethodGet, "missing", "/clusters/missing/helm/unknown", http.StatusNotFound},
	}

	for _, tc := range routes {
		req := httptest.NewRequestWithContext(context.Background(), tc.method, tc.path, nil)
		ctx, span := telemetry.CreateSpan(context.Background(), req, "helm", "test")
		rr := httptest.NewRecorder()
		cfg.dispatchHelmRoute(ctx, span, rr, req, tc.path, tc.clusterName, h)
		span.End()
		assert.Equal(t, tc.want, rr.Code, "%s %s", tc.method, tc.path)
	}
}

func TestClusterHelpersAndManualConfig(t *testing.T) {
	extBytes, err := json.Marshal(kubeconfig.CustomObject{CustomName: "friendly"})
	require.NoError(t, err)

	contexts := []kubeconfig.Context{
		{
			Name:    "raw",
			Cluster: &api.Cluster{Server: "https://k8s.example.com"},
			KubeContext: &api.Context{
				Extensions: map[string]runtime.Object{
					"headlamp_info": &runtime.Unknown{Raw: extBytes},
				},
			},
		},
		{
			Name:    "bad",
			Cluster: &api.Cluster{Server: "https://k8s2.example.com"},
			KubeContext: &api.Context{
				Extensions: map[string]runtime.Object{
					"headlamp_info": &runtime.Unknown{Raw: []byte(`{invalid`)},
				},
			},
		},
	}

	clusters, errs := parseCustomNameClusters(contexts)
	require.Len(t, clusters, 1)
	assert.Equal(t, "friendly", clusters[0].Name)
	require.Len(t, errs, 1)
}

func TestClusterSetupAndCacheHelpers(t *testing.T) {
	cfg := newCmdTestConfig(t)

	name, server := "manual-c", "https://manual.example.com"
	manualContexts, manualErrs := cfg.processManualConfig(ClusterReq{
		Name:                  &name,
		Server:                &server,
		InsecureSkipTLSVerify: true,
	})
	assert.Empty(t, manualErrs)
	require.Len(t, manualContexts, 1)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/cluster", nil)

	ctx, span := telemetry.CreateSpan(context.Background(), req, "c", "t")
	defer span.End()

	rr := httptest.NewRecorder()
	assert.Nil(t, cfg.handleSetupErrors(nil, ctx, rr, span))
	assert.Len(t, cfg.handleSetupErrors([]error{errors.New("boom")}, ctx, rr, span), 1)
	assert.Equal(t, http.StatusBadRequest, rr.Code)

	emptyErrs := cfg.updateCustomContextToCache(&api.Config{}, "missing", "missing", kubeConfigSource)
	require.NotEmpty(t, emptyErrs)

	validAPIConfig := &api.Config{
		Clusters: map[string]*api.Cluster{"c1": {Server: "https://c1.example.com"}},
		Contexts: map[string]*api.Context{"c1": {Cluster: "c1"}},
	}
	updateErrs := cfg.updateCustomContextToCache(validAPIConfig, "c1", "c1", kubeConfigSource)
	assert.Empty(t, updateErrs)

	gotCtx, getErr := cfg.KubeConfigStore.GetContext("c1")
	require.NoError(t, getErr)
	assert.Equal(t, "c1", gotCtx.Name)
}

func newTestWSClient(t *testing.T) (*WSConnLock, <-chan Message) {
	t.Helper()

	upgrader := websocket.Upgrader{}
	received := make(chan Message, 4)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = conn.Close() }()

		for {
			var msg Message
			if err := conn.ReadJSON(&msg); err != nil {
				return
			}

			received <- msg
		}
	}))
	t.Cleanup(srv.Close)

	wsURL := "ws" + srv.URL[len("http"):]

	wsConn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)

	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}

	t.Cleanup(func() { _ = wsConn.Close() })

	return &WSConnLock{conn: wsConn}, received
}

func assertWSErrorMessage(t *testing.T, received <-chan Message, substr string) {
	t.Helper()

	select {
	case msg := <-received:
		assert.Equal(t, "ERROR", msg.Type)
		assert.Equal(t, "c1", msg.ClusterID)
		assert.Equal(t, "/p", msg.Path)
		assert.Equal(t, "u1", msg.UserID)

		if substr != "" {
			assert.Contains(t, msg.Data, substr)
		} else {
			assert.NotEmpty(t, msg.Data)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for error response")
	}
}

func TestMultiplexerProcessClientMessage(t *testing.T) {
	clientConn, received := newTestWSClient(t)
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/wsMultiplexer", nil)

	targetKey := m.createConnectionKey("c1", "/p", "u1")
	otherKey := m.createConnectionKey("c1", "/other", "u1")

	m.mutex.Lock()
	m.connections[targetKey] = &Connection{
		ClusterID: "c1", Path: "/p", UserID: "u1",
		Status: ConnectionStatus{State: StateConnected}, Done: make(chan struct{}),
	}
	m.connections[otherKey] = &Connection{
		ClusterID: "c1", Path: "/other", UserID: "u1",
		Status: ConnectionStatus{State: StateConnected}, Done: make(chan struct{}),
	}
	m.mutex.Unlock()

	m.processClientMessage(req, clientConn, Message{Type: "CLOSE", ClusterID: "c1", Path: "/p", UserID: "u1"})

	m.mutex.RLock()
	_, targetExists := m.connections[targetKey]
	_, otherExists := m.connections[otherKey]
	m.mutex.RUnlock()

	assert.False(t, targetExists)
	assert.True(t, otherExists)

	m.processClientMessage(req, clientConn, Message{Type: "PING", ClusterID: "c1", Path: "/p", UserID: "u1"})
	assertWSErrorMessage(t, received, "unsupported message type: PING")

	m.processClientMessage(req, clientConn, Message{Type: "REQUEST", ClusterID: "c1", Path: "/p", UserID: "u1"})
	assertWSErrorMessage(t, received, "")
}
