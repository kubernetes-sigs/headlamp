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
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/terminal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func newTestTerminalStore(t *testing.T) kubeconfig.ContextStore {
	t.Helper()

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:        "c1",
		KubeContext: &api.Context{Cluster: "c1", AuthInfo: "u1"},
		Cluster:     &api.Cluster{Server: "https://127.0.0.1:6443"},
		AuthInfo:    &api.AuthInfo{Token: "tok"},
	}))

	return store
}

func TestGetConfigClusterTerminalEnabled(t *testing.T) {
	cfg := newCmdTestConfig(t)
	cfg.EnableClusterTerminal = true

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/config", nil)
	cfg.getConfig(rec, req)

	var resp clientConfig
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))

	if runtime.GOOS == "windows" {
		assert.False(t, resp.ClusterTerminalEnabled)
	} else {
		assert.True(t, resp.ClusterTerminalEnabled)
	}

	cfg.UseInCluster = true
	cfg.UnsafeUseServiceAccountToken = true

	rec2 := httptest.NewRecorder()
	cfg.getConfig(rec2, req)

	var resp2 clientConfig
	require.NoError(t, json.Unmarshal(rec2.Body.Bytes(), &resp2))
	assert.False(t, resp2.ClusterTerminalEnabled)
}

func TestWSTerminalDisabledAndRefusals(t *testing.T) {
	store := newTestTerminalStore(t)

	t.Run("disabled flag returns 404", func(t *testing.T) {
		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore:       store,
					EnableClusterTerminal: false,
				},
				Cache: cache.New[interface{}](),
			},
		}
		h := newRemainingTestHandler(t, hc)

		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/wsTerminal?cluster=c1", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("local mode requires configured HEADLAMP_BACKEND_TOKEN", func(t *testing.T) {
		t.Setenv("HEADLAMP_BACKEND_TOKEN", "")

		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore:       store,
					EnableClusterTerminal: true,
				},
				Cache: cache.New[interface{}](),
			},
		}
		h := newRemainingTestHandler(t, hc)

		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/wsTerminal?cluster=c1", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("unsafe-use-service-account-token is refused with 403", func(t *testing.T) {
		hc := &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					KubeConfigStore:              store,
					UseInCluster:                 true,
					UnsafeUseServiceAccountToken: true,
					EnableClusterTerminal:        true,
				},
				Cache: cache.New[interface{}](),
			},
		}
		h := newRemainingTestHandler(t, hc)

		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/wsTerminal?cluster=c1", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusForbidden, rec.Code)
	})
}

func TestWSTerminalOriginCheck(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "http://127.0.0.1:4466/wsTerminal", nil)
	req.Host = "127.0.0.1:4466"
	req.Header.Set("Origin", "https://evil.example.com")
	assert.False(t, checkTerminalWebSocketOrigin(req))

	req.Header.Set("Origin", "http://127.0.0.1:4466")
	assert.True(t, checkTerminalWebSocketOrigin(req))
}

func dialTestTerminalWS(t *testing.T, srvURL, token string) *websocket.Conn {
	t.Helper()

	wsURL := "ws" + strings.TrimPrefix(srvURL, "http") + "/wsTerminal?cluster=c1"

	headers := http.Header{}
	headers.Set("Origin", srvURL)
	headers.Set("X-HEADLAMP_BACKEND-TOKEN", token)

	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil && resp != nil {
		t.Logf("handshake status: %d", resp.StatusCode)
	}

	require.NoError(t, err)

	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}

	t.Cleanup(func() {
		_ = conn.Close()
	})

	return conn
}

func TestWSTerminalLocalSessionEndToEnd(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("local PTY not supported on Windows")
	}

	hc := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore:       newTestTerminalStore(t),
				EnableClusterTerminal: true,
			},
			Cache: cache.New[interface{}](),
		},
	}

	srv := httptest.NewServer(newRemainingTestHandler(t, hc))
	t.Cleanup(srv.Close)

	t.Setenv("HEADLAMP_BACKEND_TOKEN", "local-secret-token")

	conn := dialTestTerminalWS(t, srv.URL, "local-secret-token")

	resizePayload := append([]byte{termChannelResize}, []byte(`{"Width":80,"Height":24}`)...)
	require.NoError(t, conn.WriteMessage(websocket.BinaryMessage, resizePayload))

	cmdPayload := append([]byte{termChannelData}, []byte("echo WS_TERM_OK\n")...)
	require.NoError(t, conn.WriteMessage(websocket.BinaryMessage, cmdPayload))

	require.NoError(t, conn.SetReadDeadline(time.Now().Add(3*time.Second)))

	var output strings.Builder

	for !strings.Contains(output.String(), "WS_TERM_OK") {
		_, msg, readErr := conn.ReadMessage()
		require.NoError(t, readErr)

		if len(msg) > 1 && msg[0] == termChannelData {
			output.Write(msg[1:])
		}
	}

	assert.Contains(t, output.String(), "WS_TERM_OK")
}

func TestNormalizeClusterCredentialsResolvesTerminalSessionToken(t *testing.T) {
	cfg := newCmdTestConfig(t)
	cfg.TerminalTokens = terminal.NewSessionTokenStore()

	sessionTok, err := cfg.TerminalTokens.Issue("real-oidc-token", "c1", "alice", time.Minute)
	require.NoError(t, err)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/c1/api/v1/pods", nil)
	req.Header.Set("Authorization", "Bearer "+sessionTok)

	kCtx := &kubeconfig.Context{Name: "c1"}
	cfg.normalizeClusterCredentials(req, "c1", kCtx)
	assert.Equal(t, "Bearer real-oidc-token", req.Header.Get("Authorization"))
}
