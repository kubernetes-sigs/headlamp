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

package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd/api"
)

func newTestDialer() *websocket.Dialer {
	return &websocket.Dialer{
		NetDial:          net.Dial,
		HandshakeTimeout: 45 * time.Second,
		//nolint:gosec // Test dialer uses self-signed TLS certificates
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
}

func TestNewMultiplexer(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	assert.NotNil(t, m)
	assert.Equal(t, store, m.kubeConfigStore)
	assert.NotNil(t, m.connections)
	assert.NotNil(t, m.upgrader)
	assert.Equal(t, []string{MultiplexerProtocol}, m.upgrader.Subprotocols)
}

func TestHandleClientWebSocket(t *testing.T) {
	contextStore := kubeconfig.NewContextStore()
	m := NewMultiplexer(contextStore, false)

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.HandleClientWebSocket(w, r)
	}))
	defer server.Close()

	// Connect to test server
	dialer := newTestDialer()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	ws, resp, err := dialer.Dial(wsURL, nil)
	require.NoError(t, err)

	if resp != nil && resp.Body != nil {
		defer func() { _ = resp.Body.Close() }()
	}

	defer func() { _ = ws.Close() }()

	wsConn := NewWSConnLock(ws)

	// Test WATCH message
	watchMsg := Message{
		Type:      "WATCH",
		ClusterID: "test-cluster",
		Path:      "/api/v1/pods",
		UserID:    "test-user",
	}
	err = wsConn.WriteJSON(watchMsg)
	require.NoError(t, err)

	// Test CLOSE message
	closeMsg := Message{
		Type:      "CLOSE",
		ClusterID: "test-cluster",
		Path:      "/api/v1/pods",
		UserID:    "test-user",
	}
	err = wsConn.WriteJSON(closeMsg)
	require.NoError(t, err)
}

func TestGetClusterConfigWithFallback(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	// Add a mock cluster config
	err := store.AddContext(&kubeconfig.Context{
		Name: "test-cluster",
		Cluster: &api.Cluster{
			Server: "https://test-cluster.example.com",
		},
	})
	require.NoError(t, err)

	config, err := m.getClusterConfigWithFallback("test-cluster", "test-user")
	assert.NoError(t, err)
	assert.NotNil(t, config)

	// Test fallback
	config, err = m.getClusterConfigWithFallback("non-existent", "test-user")
	assert.Error(t, err)
	assert.Nil(t, config)
}

// TestGetClusterContextWithFallbackPrefersUploadedCluster checks that a cluster a
// user uploaded, which is stored under its stateless context key, is found, and is
// used over a shared cluster of the same name, as the cluster proxy does, since the
// frontend sends the user's other requests for that cluster there.
func TestGetClusterContextWithFallbackPrefersUploadedCluster(t *testing.T) {
	const (
		shared   = "https://shared.example.com"
		uploaded = "https://uploaded.example.com"
	)

	userKey := statelessContextKey("prod", "user")
	both := map[string]string{"prod": shared, userKey: uploaded}

	tests := []struct {
		name    string
		servers map[string]string
		userID  string
		want    string
	}{
		{"uploaded only", map[string]string{userKey: uploaded}, "user", uploaded},
		{"shared only", map[string]string{"prod": shared}, "user", shared},
		{"both", both, "user", uploaded},
		{"both, another user", both, "other", shared},
		{"no user", map[string]string{"prod": shared}, "", shared},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := kubeconfig.NewContextStore()
			for key, server := range tt.servers {
				require.NoError(t, store.AddContextWithKeyAndTTL(&kubeconfig.Context{
					Cluster: &api.Cluster{Server: server},
				}, key, time.Minute))
			}

			found, err := NewMultiplexer(store, false).getClusterContextWithFallback("prod", tt.userID)
			require.NoError(t, err)
			assert.Equal(t, tt.want, found.Cluster.Server)
		})
	}
}

func TestCreateConnection(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	clientConn, _ := createTestWebSocketConnection()

	// Add RequestID to the createConnection call
	conn := m.createConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn, nil)
	assert.NotNil(t, conn)
	assert.Equal(t, "test-cluster", conn.ClusterID)
	assert.Equal(t, "test-user", conn.UserID)
	assert.Equal(t, "/api/v1/pods", conn.Path)
	assert.Equal(t, StateConnecting, conn.Status.State)
}

func TestDialWebSocket(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all connections for testing
			},
		}

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Logf("Upgrade error: %v", err)
			return
		}

		defer func() { _ = ws.Close() }()
		// Echo incoming messages back to the client
		for {
			mt, message, err := ws.ReadMessage()
			if err != nil {
				break
			}

			err = ws.WriteMessage(mt, message)
			if err != nil {
				break
			}
		}
	}))

	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, err := m.dialWebSocket(wsURL, insecureTestConfig(server.URL), nil)

	assert.NoError(t, err)
	assert.NotNil(t, conn)

	if conn != nil {
		_ = conn.Close()
	}
}

func TestDialWebSocket_WithToken(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)

	var receivedAuth string

	// Create a test server that checks the Authorization header
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		}
		receivedAuth = r.Header.Get("Authorization")

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("WebSocket upgrade failed: %v", err)
		}

		defer func() { _ = ws.Close() }()
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	token := "my-test-token"
	conn, err := m.dialWebSocket(wsURL, insecureTestConfig(server.URL), &token)
	assert.NoError(t, err)
	assert.NotNil(t, conn)

	if conn != nil {
		_ = conn.Close()
	}

	assert.Equal(t, "Bearer "+token, receivedAuth)
}

func TestDialWebSocket_Errors(t *testing.T) {
	contextStore := kubeconfig.NewContextStore()
	m := NewMultiplexer(contextStore, false)

	// Test invalid URL

	ws, err := m.dialWebSocket("invalid-url", insecureTestConfig(""), nil)
	assert.Error(t, err)
	assert.Nil(t, ws)

	// Test unreachable URL
	ws, err = m.dialWebSocket("ws://localhost:12345", insecureTestConfig(""), nil)
	assert.Error(t, err)
	assert.Nil(t, ws)
}

// TestDialWebSocket_BadHandshakeLogging verifies that when a WebSocket dial fails
// due to a bad handshake (e.g., connecting to an HTTP server instead of a WebSocket),
// the error logging doesn't cause JSON marshaling errors from function fields in the response.
func TestDialWebSocket_BadHandshakeLogging(t *testing.T) {
	// Create an HTTP server that returns a non-WebSocket response
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Return a normal HTTP response instead of upgrading to WebSocket
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("Not a WebSocket server"))
	}))
	defer server.Close()

	// Capture log calls to verify no marshaling errors occur
	var marshalingError bool

	originalLogFunc := logger.SetLogFunc(func(level uint, str map[string]string, err interface{}, msg string) {
		// Verify that if err is not nil, it's not an *http.Response
		if _, isHTTPResp := err.(*http.Response); isHTTPResp {
			marshalingError = true
		}
	})
	defer logger.SetLogFunc(originalLogFunc)

	contextStore := kubeconfig.NewContextStore()
	m := NewMultiplexer(contextStore, false)

	// Convert HTTP URL to WebSocket URL
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// This should fail with a "bad handshake" error and log the response
	ws, err := m.dialWebSocket(wsURL, insecureTestConfig(""), nil)

	assert.Error(t, err)
	assert.Nil(t, ws)
	assert.Contains(t, err.Error(), "bad handshake")
	assert.False(t, marshalingError, "Logger should not receive non-serializable *http.Response")
}

// TestCreateWebSocketURL verifies that the createWebSocketURL function correctly converts
// HTTP/HTTPS schemes to WebSocket schemes (ws/wss).
func TestCreateWebSocketURL(t *testing.T) {
	tests := []struct {
		name     string
		host     string
		path     string
		query    string
		expected string
	}{
		{
			name:     "HTTPS to WSS",
			host:     "https://kubernetes.default.svc:443",
			path:     "/api/v1/namespaces/default/pods/test-pod/log",
			query:    "follow=true&container=test",
			expected: "wss://kubernetes.default.svc:443/api/v1/namespaces/default/pods/test-pod/log?follow=true&container=test",
		},
		{
			name:     "HTTP to WS",
			host:     "http://localhost:8080",
			path:     "/api/v1/pods",
			query:    "",
			expected: "ws://localhost:8080/api/v1/pods",
		},
		{
			name:     "HTTPS with path in host",
			host:     "https://example.com/k8s",
			path:     "/api/v1/pods",
			query:    "watch=true",
			expected: "wss://example.com/k8s/api/v1/pods?watch=true",
		},
		{
			name:     "HTTPS with trailing slash in host path",
			host:     "https://example.com/k8s/",
			path:     "/api/v1/pods",
			query:    "watch=true",
			expected: "wss://example.com/k8s/api/v1/pods?watch=true",
		},
		{
			name:     "HTTPS with multi-segment path prefix in host",
			host:     "https://k8s.example.com:443/dev-primary-cluster",
			path:     "/api/v1/namespaces/default/events",
			query:    "watch=1",
			expected: "wss://k8s.example.com:443/dev-primary-cluster/api/v1/namespaces/default/events?watch=1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := createWebSocketURL(tt.host, tt.path, tt.query)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestCreateWebSocketURLEdgeCases tests edge cases for WebSocket URL creation.
func TestCreateWebSocketURLEdgeCases(t *testing.T) {
	tests := []struct {
		name     string
		host     string
		path     string
		query    string
		expected string
	}{
		{
			name:     "WS scheme preserved",
			host:     "ws://localhost:8080",
			path:     "/api/v1/pods",
			query:    "",
			expected: "ws://localhost:8080/api/v1/pods",
		},
		{
			name:     "WSS scheme preserved",
			host:     "wss://kubernetes.default.svc:443",
			path:     "/api/v1/pods",
			query:    "",
			expected: "wss://kubernetes.default.svc:443/api/v1/pods",
		},
		{
			name:     "Empty scheme defaults to WSS",
			host:     "kubernetes.default.svc:443",
			path:     "/api/v1/pods",
			query:    "",
			expected: "wss://kubernetes.default.svc:443/api/v1/pods",
		},
		{
			name:     "Unknown scheme defaults to WSS",
			host:     "custom://kubernetes.default.svc:443",
			path:     "/api/v1/pods",
			query:    "",
			expected: "wss://kubernetes.default.svc:443/api/v1/pods",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := createWebSocketURL(tt.host, tt.path, tt.query)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestMonitorConnection(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	clientConn, clientServer := createTestWebSocketConnection()

	defer clientServer.Close()

	conn := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn)

	wsConn, wsServer := createTestWebSocketConnection()
	defer wsServer.Close()

	conn.WSConn = wsConn.conn

	done := make(chan struct{})

	go func() {
		m.monitorConnection(conn)
		close(done)
	}()

	time.Sleep(100 * time.Millisecond)

	select {
	case <-conn.Done:
	default:
		close(conn.Done)
	}

	<-done

	assert.Equal(t, StateClosed, conn.Status.State)
}

func TestUpdateStatus(t *testing.T) {
	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	conn := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn)

	// Test different state transitions
	states := []ConnectionState{
		StateConnecting,
		StateConnected,
		StateClosed,
		StateError,
	}

	for _, state := range states {
		conn.closed = false
		conn.closeOnce = sync.Once{}
		conn.Done = make(chan struct{})
		conn.updateStatus(state, nil)
		assert.Equal(t, state, conn.Status.State)
	}

	// Test concurrent updates
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)

		go func(i int) {
			defer wg.Done()

			state := states[i%len(states)]
			conn.updateStatus(state, nil)
		}(i)
	}

	wg.Wait()

	// Verify final state is valid
	assert.Contains(t, states, conn.Status.State)
}

func TestCleanupConnections(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	clientConn, clientServer := createTestWebSocketConnection()

	defer clientServer.Close()

	wsConn, wsServer := createTestWebSocketConnection()
	defer wsServer.Close()

	conn := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn)
	conn.WSConn = wsConn.conn

	connKey := m.createConnectionKey("test-cluster", "/api/v1/pods", "test-user")
	m.connections[connKey] = conn

	m.cleanupConnections()

	assert.Empty(t, m.connections)
	assert.Equal(t, StateClosed, conn.Status.State)
}

func TestCloseConnection(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	clientConn, clientServer := createTestWebSocketConnection()

	defer clientServer.Close()

	wsConn, wsServer := createTestWebSocketConnection()
	defer wsServer.Close()

	conn := createTestConnection("test-cluster-1", "test-user", "/api/v1/pods", "", clientConn)
	conn.WSConn = wsConn.conn

	connKey := m.createConnectionKey("test-cluster-1", "/api/v1/pods", "test-user")
	m.connections[connKey] = conn

	m.CloseConnection("test-cluster-1", "/api/v1/pods", "test-user")
	assert.Empty(t, m.connections)
	assert.True(t, conn.closed)
}

func TestCloseClientConnectionsClearsClientBeforeClosing(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	clientConn, clientServer := createTestWebSocketConnection()

	defer clientServer.Close()

	wsConn, wsServer := createTestWebSocketConnection()
	defer wsServer.Close()

	conn := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn)
	conn.WSConn = wsConn.conn

	connKey := m.createConnectionKey("test-cluster", "/api/v1/pods", "test-user")
	m.connections[connKey] = conn

	m.closeClientConnections(clientConn)

	assert.Empty(t, m.connections)
	assert.Nil(t, conn.Client)
	assert.Equal(t, StateClosed, conn.Status.State)
	assert.True(t, conn.closed)
}

func createTestConnection(
	clusterID,
	userID,
	path,
	query string,
	client *WSConnLock,
) *Connection {
	return &Connection{
		ClusterID: clusterID,
		UserID:    userID,
		Path:      path,
		Query:     query,
		Client:    client,
		Done:      make(chan struct{}),
		Status: ConnectionStatus{
			State:   StateConnecting,
			LastMsg: time.Now(),
		},
		mu:      sync.RWMutex{},
		writeMu: sync.Mutex{},
	}
}

func createTestWebSocketConn() (*websocket.Conn, *httptest.Server) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		}

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = ws.Close() }()

		for {
			messageType, message, err := ws.ReadMessage()
			if err != nil {
				break
			}

			err = ws.WriteMessage(messageType, message)
			if err != nil {
				break
			}
		}
	}))

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := newTestDialer()

	conn, resp, err := dialer.Dial(wsURL, nil)
	if err != nil {
		server.Close()

		return nil, nil
	}

	if resp != nil && resp.Body != nil {
		defer func() { _ = resp.Body.Close() }()
	}

	return conn, server
}

func createTestWebSocketConnection() (*WSConnLock, *httptest.Server) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		}

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		// Echo back any messages received
		go func() {
			for {
				messageType, message, err := ws.ReadMessage()
				if err != nil {
					break
				}

				if err := ws.WriteMessage(messageType, message); err != nil {
					break
				}
			}
		}()
	}))

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	dialer := newTestDialer()

	conn, resp, err := dialer.Dial(wsURL, nil)
	if err != nil {
		server.Close()
		return nil, nil
	}

	if resp != nil && resp.Body != nil {
		defer func() { _ = resp.Body.Close() }()
	}

	return NewWSConnLock(conn), server
}

func TestWSConnLock(t *testing.T) {
	wsConn, server := createTestWebSocketConnection()
	defer server.Close()

	// Test concurrent writes
	var wg sync.WaitGroup

	for i := 0; i < 10; i++ {
		wg.Add(1)

		go func(i int) {
			defer wg.Done()

			msg := fmt.Sprintf("message-%d", i)

			err := wsConn.WriteJSON(msg)
			assert.NoError(t, err)
		}(i)
	}

	wg.Wait()

	// Test ReadJSON
	var msg string

	err := wsConn.ReadJSON(&msg)
	assert.NoError(t, err)
	assert.Contains(t, msg, "message-")
}

func createMockKubeAPIServer() *httptest.Server {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		}

		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = c.Close() }()

		// Echo messages back
		for {
			_, msg, err := c.ReadMessage()
			if err != nil {
				break
			}

			if err := c.WriteMessage(websocket.TextMessage, msg); err != nil {
				break
			}
		}
	}))

	// Configure the test client to accept the test server's TLS certificate
	server.Client().Transport.(*http.Transport).TLSClientConfig = &tls.Config{
		InsecureSkipVerify: true, //nolint:gosec // Test server uses self-signed TLS certificates
	}

	return server
}

func TestGetOrCreateConnection(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	// Create a mock Kubernetes API server
	mockServer := createMockKubeAPIServer()
	defer mockServer.Close()

	// Add a mock cluster config with our test server URL
	err := store.AddContext(&kubeconfig.Context{
		Name: "test-cluster",
		Cluster: &api.Cluster{
			Server:                   mockServer.URL,
			InsecureSkipTLSVerify:    true,
			CertificateAuthorityData: nil,
		},
	})
	require.NoError(t, err)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	// Test getting a non-existent connection (should create new)
	msg := Message{
		ClusterID: "test-cluster",
		Path:      "/api/v1/pods",
		Query:     "watch=true",
		UserID:    "test-user",
	}

	token := "token"

	conn, err := m.getOrCreateConnection(msg, clientConn, &token)
	assert.NoError(t, err)
	assert.NotNil(t, conn)
	assert.Equal(t, "test-cluster", conn.ClusterID)
	assert.Equal(t, "test-user", conn.UserID)
	assert.Equal(t, "/api/v1/pods", conn.Path)
	assert.Equal(t, "watch=true", conn.Query)

	// Test getting an existing connection
	conn2, err := m.getOrCreateConnection(msg, clientConn, &token)
	assert.NoError(t, err)
	assert.Equal(t, conn, conn2, "Should return the same connection instance")

	// Test with invalid cluster
	msg.ClusterID = "non-existent-cluster"
	conn3, err := m.getOrCreateConnection(msg, clientConn, &token)
	assert.Error(t, err)
	assert.Nil(t, conn3)
}

func TestEstablishClusterConnection(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	// Create a mock Kubernetes API server
	mockServer := createMockKubeAPIServer()
	defer mockServer.Close()

	// Add a mock cluster config with our test server URL
	err := store.AddContext(&kubeconfig.Context{
		Name: "test-cluster",
		Cluster: &api.Cluster{
			Server:                   mockServer.URL,
			InsecureSkipTLSVerify:    true,
			CertificateAuthorityData: nil,
		},
	})
	require.NoError(t, err)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	// Test successful connection establishment
	conn, err := m.establishClusterConnection("test-cluster", "test-user", "/api/v1/pods", "watch=true", clientConn, nil)
	assert.NoError(t, err)
	assert.NotNil(t, conn)
	assert.Equal(t, "test-cluster", conn.ClusterID)
	assert.Equal(t, "test-user", conn.UserID)
	assert.Equal(t, "/api/v1/pods", conn.Path)
	assert.Equal(t, "watch=true", conn.Query)

	// Test with invalid cluster
	conn, err = m.establishClusterConnection("non-existent", "test-user", "/api/v1/pods", "watch=true", clientConn, nil)
	assert.Error(t, err)
	assert.Nil(t, conn)
}

func TestEstablishClusterConnectionUsesServiceAccountToken(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, true)
	tokenFile := writeTestTokenFile(t)

	var receivedAuth string

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")

		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		}

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Fatalf("WebSocket upgrade failed: %v", err)
		}

		defer func() { _ = ws.Close() }()
	}))
	defer mockServer.Close()

	err := store.AddContext(&kubeconfig.Context{
		Name: "test-cluster",
		Cluster: &api.Cluster{
			Server: mockServer.URL,
		},
		AuthInfo: &api.AuthInfo{TokenFile: tokenFile},
		Source:   kubeconfig.InCluster,
	})
	require.NoError(t, err)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	requestToken := "proxy-token"
	conn, err := m.establishClusterConnection(
		"test-cluster",
		"test-user",
		"/api/v1/pods",
		"watch=true",
		clientConn,
		&requestToken,
	)
	require.NoError(t, err)
	require.NotNil(t, conn)

	if conn.WSConn != nil {
		_ = conn.WSConn.Close()
	}

	close(conn.Done)

	assert.Equal(t, "Bearer "+testServiceAccountToken, receivedAuth)
	require.NotNil(t, conn.Token)
	assert.Equal(t, testServiceAccountToken, *conn.Token)
}

func TestReconnect(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	// Create a mock Kubernetes API server
	mockServer := createMockKubeAPIServer()
	defer mockServer.Close()

	// Add a mock cluster config with our test server URL
	err := store.AddContext(&kubeconfig.Context{
		Name: "test-cluster",
		Cluster: &api.Cluster{
			Server:                   mockServer.URL,
			InsecureSkipTLSVerify:    true,
			CertificateAuthorityData: nil,
		},
	})
	require.NoError(t, err)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	// Create initial connection
	conn := m.createConnection("test-cluster", "test-user", "/api/v1/services", "watch=true", clientConn, nil)
	wsConn, wsServer := createTestWebSocketConnection()

	defer wsServer.Close()

	conn.WSConn = wsConn.conn
	conn.Status.State = StateError // Simulate an error state

	// Test successful reconnection
	newConn, err := m.reconnect(conn)
	assert.NoError(t, err)
	assert.NotNil(t, newConn)
	assert.Equal(t, StateConnected, newConn.Status.State)
	assert.Equal(t, conn.ClusterID, newConn.ClusterID)
	assert.Equal(t, conn.UserID, newConn.UserID)
	assert.Equal(t, conn.Path, newConn.Path)
	assert.Equal(t, conn.Query, newConn.Query)

	// Test reconnection with invalid cluster
	conn.ClusterID = "non-existent"
	newConn, err = m.reconnect(conn)
	assert.Error(t, err)
	assert.Nil(t, newConn)
	assert.Contains(t, err.Error(), "getting context: key not found")

	// Test reconnection with closed connection
	conn = m.createConnection("test-cluster", "test-user", "/api/v1/pods", "watch=true", clientConn, nil)
	wsConn2, wsServer2 := createTestWebSocketConnection()

	defer wsServer2.Close()

	conn.WSConn = wsConn2.conn

	// Close the connection and wait for cleanup
	conn.closed = true // Mark connection as closed

	// Try to reconnect the closed connection
	newConn, err = m.reconnect(conn)
	assert.Error(t, err)
	assert.Nil(t, newConn)
}

func TestCreateWrapperMessage(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	conn := &Connection{
		ClusterID: "test-cluster",
		Path:      "/api/v1/pods",
		Query:     "watch=true",
		UserID:    "test-user",
	}

	// Test text message
	textMsg := []byte("Hello, World!")
	wrapperMsg := m.createWrapperMessage(conn, websocket.TextMessage, textMsg)
	assert.Equal(t, "test-cluster", wrapperMsg.ClusterID)
	assert.Equal(t, "/api/v1/pods", wrapperMsg.Path)
	assert.Equal(t, "watch=true", wrapperMsg.Query)
	assert.Equal(t, "test-user", wrapperMsg.UserID)
	assert.Equal(t, "Hello, World!", wrapperMsg.Data)
	assert.False(t, wrapperMsg.Binary)

	// Test binary message
	binaryMsg := []byte{0x01, 0x02, 0x03}
	wrapperMsg = m.createWrapperMessage(conn, websocket.BinaryMessage, binaryMsg)
	assert.Equal(t, "test-cluster", wrapperMsg.ClusterID)
	assert.Equal(t, "/api/v1/pods", wrapperMsg.Path)
	assert.Equal(t, "watch=true", wrapperMsg.Query)
	assert.Equal(t, "test-user", wrapperMsg.UserID)
	assert.Equal(t, "AQID", wrapperMsg.Data) // Base64 encoded
	assert.True(t, wrapperMsg.Binary)
}

func TestHandleConnectionError(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	clientConn, clientServer := createTestWebSocketConnection()

	defer clientServer.Close()

	msg := Message{
		ClusterID: "test-cluster",
		Path:      "/api/v1/pods",
		UserID:    "test-user",
	}

	testError := fmt.Errorf("test error")

	// Capture the error message sent to the client
	var receivedMsg Message

	done := make(chan bool)

	go func() {
		_, rawMsg, err := clientConn.ReadMessage()
		if err != nil {
			t.Errorf("Error reading message: %v", err)

			done <- true

			return
		}

		err = json.Unmarshal(rawMsg, &receivedMsg)
		if err != nil {
			t.Errorf("Error unmarshaling message: %v", err)

			done <- true

			return
		}

		done <- true
	}()

	m.handleConnectionError(clientConn, msg, testError)

	select {
	case <-done:
		assert.Equal(t, "ERROR", receivedMsg.Type)
		assert.Contains(t, receivedMsg.Data, `"error":"test error"`)
	case <-time.After(time.Second):
		t.Fatal("Test timed out")
	}
}

//nolint:funlen // Test covers echo server setup, websocket communication, and assertions
func TestReadClientMessage_InvalidMessage(t *testing.T) {
	contextStore := kubeconfig.NewContextStore()
	m := NewMultiplexer(contextStore, false)

	// Create a server that will echo messages back
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		}
		ws, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)

		defer func() { _ = ws.Close() }()

		// Echo messages back
		for {
			messageType, p, err := ws.ReadMessage()
			if err != nil {
				return
			}

			err = ws.WriteMessage(messageType, p)
			if err != nil {
				return
			}
		}
	}))
	defer server.Close()

	// Connect to the server
	dialer := newTestDialer()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	//nolint:bodyclose // Dialer HTTP response body is managed by websocket connection
	clientConn, _, err := dialer.Dial(wsURL, nil)
	require.NoError(t, err)

	defer func() { _ = clientConn.Close() }()

	// Test completely invalid JSON
	err = clientConn.WriteMessage(websocket.TextMessage, []byte("not json at all"))
	require.NoError(t, err)

	msg, isFatal, err := m.readClientMessage(clientConn)
	require.Error(t, err)
	assert.False(t, isFatal)
	assert.Equal(t, Message{}, msg)

	// Test JSON with invalid data type
	err = clientConn.WriteJSON(map[string]interface{}{
		"type": "INVALID",
		"data": 123, // data should be string
	})
	require.NoError(t, err)

	msg, isFatal, err = m.readClientMessage(clientConn)
	require.Error(t, err)
	assert.False(t, isFatal)
	assert.Equal(t, Message{}, msg)

	// Test empty JSON object
	err = clientConn.WriteMessage(websocket.TextMessage, []byte("{}"))
	require.NoError(t, err)

	msg, isFatal, err = m.readClientMessage(clientConn)
	// Empty message is valid JSON but will be unmarshaled into an empty Message struct
	require.NoError(t, err)
	assert.False(t, isFatal)
	assert.Equal(t, Message{}, msg)

	// Test missing required fields
	err = clientConn.WriteJSON(map[string]interface{}{
		"data": "some data",
		// Missing type field
	})
	require.NoError(t, err)

	msg, isFatal, err = m.readClientMessage(clientConn)
	// Missing fields are allowed by json.Unmarshal
	require.NoError(t, err)
	assert.False(t, isFatal)
	assert.Equal(t, Message{Data: "some data"}, msg)
}

func TestUpdateStatus_WithError(t *testing.T) {
	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	conn := &Connection{
		Status: ConnectionStatus{},
		Done:   make(chan struct{}),
		Client: clientConn,
	}

	// Test error state with message
	testErr := fmt.Errorf("test error")
	conn.updateStatus(StateError, testErr)
	assert.Equal(t, StateError, conn.Status.State)
	assert.Equal(t, testErr.Error(), conn.Status.Error)

	// Test state change without error
	conn.closed = false
	conn.closeOnce = sync.Once{}
	conn.Done = make(chan struct{})
	conn.updateStatus(StateConnected, nil)
	assert.Equal(t, StateConnected, conn.Status.State)
	assert.Empty(t, conn.Status.Error)

	// Test with closed connection - state should remain error
	conn.updateStatus(StateError, testErr)
	assert.Equal(t, StateError, conn.Status.State)
	assert.Equal(t, testErr.Error(), conn.Status.Error)

	select {
	case <-conn.Done:
	default:
		close(conn.Done)
	}

	conn.closed = true // Mark connection as closed

	// Try to update state after close - should not change
	conn.updateStatus(StateConnected, nil)
	assert.Equal(t, StateError, conn.Status.State)      // State should not change after close
	assert.Equal(t, testErr.Error(), conn.Status.Error) // Error should remain
}

func TestMonitorConnection_ReconnectFailure(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	// Add an invalid cluster config to force reconnection failure
	err := store.AddContext(&kubeconfig.Context{
		Name: "test-cluster",
		Cluster: &api.Cluster{
			Server: "https://invalid-server:8443",
		},
	})
	require.NoError(t, err)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	conn := m.createConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn, nil)
	wsConn, wsServer := createTestWebSocketConn()

	defer wsServer.Close()

	conn.WSConn = wsConn

	// Start monitoring
	done := make(chan struct{})

	go func() {
		m.monitorConnection(conn)
		close(done)
	}()

	// Force connection closure and error state
	conn.updateStatus(StateError, fmt.Errorf("forced error"))
	_ = conn.WSConn.Close()

	// Wait briefly to ensure error state is set
	time.Sleep(50 * time.Millisecond)

	// Verify connection is in error state
	assert.Equal(t, StateError, conn.Status.State)
	assert.NotEmpty(t, conn.Status.Error)

	select {
	case <-conn.Done:
	default:
		close(conn.Done)
	}

	<-done
}

func TestHandleClientWebSocket_InvalidMessages(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.HandleClientWebSocket(w, r)
	}))

	defer server.Close()

	// Test invalid JSON
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	ws, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)

	if resp != nil && resp.Body != nil {
		defer func() { _ = resp.Body.Close() }()
	}

	err = ws.WriteMessage(websocket.TextMessage, []byte("invalid json"))
	require.NoError(t, err)

	err = ws.WriteJSON(Message{
		Type:      "INVALID_TYPE",
		ClusterID: "test-cluster",
		Path:      "/api/v1/pods",
		UserID:    "test-user",
	})

	require.NoError(t, err)

	_, message, err := ws.ReadMessage()
	require.NoError(t, err)
	assert.Contains(t, string(message), "ERROR")

	_ = ws.Close()
}

func TestSendIfNewResourceVersion_VersionComparison(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	clientConn, clientServer := createTestWebSocketConnection()

	defer clientServer.Close()

	conn := &Connection{
		ClusterID: "test-cluster",
		Path:      "/api/v1/pods",
		UserID:    "test-user",
		Client:    clientConn,
	}

	// Initialize lastVersion pointer
	lastVersion := ""

	// Test initial version
	message := []byte(`{"metadata":{"resourceVersion":"100"}}`)
	err := m.sendIfNewResourceVersion(message, conn, clientConn, &lastVersion)
	require.NoError(t, err)
	assert.Equal(t, "100", lastVersion)

	// Test same version - should not send
	err = m.sendIfNewResourceVersion(message, conn, clientConn, &lastVersion)
	require.NoError(t, err)
	assert.Equal(t, "100", lastVersion)

	// Test newer version
	message = []byte(`{"metadata":{"resourceVersion":"200"}}`)
	err = m.sendIfNewResourceVersion(message, conn, clientConn, &lastVersion)
	require.NoError(t, err)
	assert.Equal(t, "200", lastVersion)

	// Test invalid JSON
	message = []byte(`invalid json`)
	err = m.sendIfNewResourceVersion(message, conn, clientConn, &lastVersion)
	assert.NoError(t, err)
	assert.Equal(t, "200", lastVersion) // Version should not change on error

	// Test missing resourceVersion
	message = []byte(`{"metadata":{}}`)
	err = m.sendIfNewResourceVersion(message, conn, clientConn, &lastVersion)
	require.NoError(t, err) // Should not error, but also not update version
	assert.Equal(t, "200", lastVersion)
}

func TestSendCompleteMessage_ClosedConnection(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	clientConn, clientServer := createTestWebSocketConnection()

	defer clientServer.Close()

	conn := &Connection{
		ClusterID: "test-cluster",
		Path:      "/api/v1/pods",
		UserID:    "test-user",
		Query:     "watch=true",
	}

	// Test successful complete message
	err := m.sendCompleteMessage(conn, clientConn)
	require.NoError(t, err)

	// Verify the message
	_, message, err := clientConn.ReadMessage()
	require.NoError(t, err)

	var msg Message

	err = json.Unmarshal(message, &msg)
	require.NoError(t, err)

	assert.Equal(t, "COMPLETE", msg.Type)
	assert.Equal(t, conn.ClusterID, msg.ClusterID)
	assert.Equal(t, conn.Path, msg.Path)
	assert.Equal(t, conn.Query, msg.Query)
	assert.Equal(t, conn.UserID, msg.UserID)

	// Test sending to closed connection
	_ = clientConn.Close()
	err = m.sendCompleteMessage(conn, clientConn)
	assert.NoError(t, err)
}

func TestSendCompleteMessage_ErrorConditions(t *testing.T) {
	tests := []struct {
		name          string
		setupConn     func(*Connection, *WSConnLock)
		expectedError bool
	}{
		{
			name: "connection already marked as closed",
			setupConn: func(conn *Connection, _ *WSConnLock) {
				conn.closed = true
			},
			expectedError: false,
		},
		{
			name: "normal closure",
			setupConn: func(_ *Connection, clientConn *WSConnLock) {
				//nolint:errcheck,gosec // Close message write error ignored in test cleanup helper
				clientConn.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
				_ = clientConn.Close()
			},
			expectedError: false,
		},
		{
			name: "unexpected close error",
			setupConn: func(_ *Connection, clientConn *WSConnLock) {
				//nolint:errcheck,gosec // Close message write error ignored in test cleanup helper
				clientConn.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseProtocolError, ""))
				_ = clientConn.Close()
			},
			expectedError: false, // All errors return nil now
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := NewMultiplexer(kubeconfig.NewContextStore(), false)
			clientConn, clientServer := createTestWebSocketConnection()

			defer clientServer.Close()

			conn := &Connection{
				ClusterID: "test-cluster",
				Path:      "/api/v1/pods",
				UserID:    "test-user",
				Query:     "watch=true",
			}

			tt.setupConn(conn, clientConn)
			err := m.sendCompleteMessage(conn, clientConn)

			if tt.expectedError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestGetOrCreateConnection_TokenRefresh(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	// Create a mock Kubernetes API server
	mockServer := createMockKubeAPIServer()
	defer mockServer.Close()

	// Add a mock cluster config with our test server URL
	err := store.AddContext(&kubeconfig.Context{
		Name: "test-cluster",
		Cluster: &api.Cluster{
			Server:                   mockServer.URL,
			InsecureSkipTLSVerify:    true,
			CertificateAuthorityData: nil,
		},
	})
	require.NoError(t, err)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	// Create initial connection with original token
	originalToken := "original-token"
	msg := Message{
		ClusterID: "test-cluster",
		Path:      "/api/v1/pods",
		Query:     "watch=true",
		UserID:    "test-user",
	}

	conn, err := m.getOrCreateConnection(msg, clientConn, &originalToken)
	assert.NoError(t, err)
	assert.NotNil(t, conn)
	assert.Equal(t, &originalToken, conn.Token)

	// Now send a new message with a new token
	newToken := "new-refreshed-token"

	// Get the same connection, but with a new token
	conn2, err := m.getOrCreateConnection(msg, clientConn, &newToken)
	assert.NoError(t, err)
	assert.Equal(t, conn, conn2, "Should return the same connection instance")

	// Verify the token was updated
	assert.Equal(t, &newToken, conn2.Token, "Token should be updated to the new value")
}

func TestGetOrCreateConnectionDoesNotOverwriteServiceAccountToken(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, true)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	serviceAccountToken := "service-account-token"
	conn := m.createConnection(
		"test-cluster",
		"test-user",
		"/api/v1/pods",
		"watch=true",
		clientConn,
		&serviceAccountToken,
	)
	conn.usesServiceAccountToken = true

	connKey := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID)
	m.connections[connKey] = conn

	// No context is stored to match a stateless context that expired while
	// the WebSocket stayed open.
	requestToken := "user-cookie-token"
	msg := Message{
		ClusterID: conn.ClusterID,
		Path:      conn.Path,
		Query:     conn.Query,
		UserID:    conn.UserID,
	}

	refreshedConn, err := m.getOrCreateConnection(msg, clientConn, &requestToken)
	require.NoError(t, err)
	assert.Equal(t, conn, refreshedConn)
	require.NotNil(t, refreshedConn.Token)
	assert.Equal(t, serviceAccountToken, *refreshedConn.Token)
}

func TestReconnect_WithToken(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	// Create a mock Kubernetes API server
	mockServer := createMockKubeAPIServer()
	defer mockServer.Close()

	// Add a mock cluster config with our test server URL
	err := store.AddContext(&kubeconfig.Context{
		Name: "test-cluster",
		Cluster: &api.Cluster{
			Server:                   mockServer.URL,
			InsecureSkipTLSVerify:    true,
			CertificateAuthorityData: nil,
		},
	})
	require.NoError(t, err)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	// Create initial connection with original token
	originalToken := "original-token"
	conn := m.createConnection("test-cluster", "test-user", "/api/v1/services", "watch=true", clientConn, &originalToken)
	wsConn, wsServer := createTestWebSocketConnection()

	defer wsServer.Close()

	conn.WSConn = wsConn.conn
	conn.Status.State = StateError // Simulate an error state

	// Add the connection to the multiplexer's connections map
	connKey := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID)
	m.connections[connKey] = conn

	// Test reconnection with the same token
	newConn, err := m.reconnect(conn)
	assert.NoError(t, err)
	assert.NotNil(t, newConn)
	assert.Equal(t, &originalToken, newConn.Token, "Token should be preserved during reconnection")

	// Now update the token and verify it's used in reconnection
	newToken := "new-refreshed-token"
	newConn.Token = &newToken // Update the token on the new connection

	// Close the connection to force another reconnection
	if newConn.WSConn != nil {
		_ = newConn.WSConn.Close()
	}

	newConn.Status.State = StateError

	// Update the connection in the multiplexer's map
	connKey = m.createConnectionKey(newConn.ClusterID, newConn.Path, newConn.UserID)
	m.connections[connKey] = newConn

	// Reconnect with the new token
	reconnConn, err := m.reconnect(newConn)
	assert.NoError(t, err)
	assert.NotNil(t, reconnConn)
	assert.Equal(t, &newToken, reconnConn.Token, "Updated token should be used during reconnection")
}

func TestMonitorConnection_Reconnect(t *testing.T) {
	contextStore := kubeconfig.NewContextStore()
	m := NewMultiplexer(contextStore, false)

	// Create a server that will accept the connection and then close it
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		}
		ws, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)

		defer func() { _ = ws.Close() }()

		// Keep connection alive briefly
		time.Sleep(100 * time.Millisecond)
	}))

	defer server.Close()

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	conn := createTestConnection("test-cluster", "test-user", "/api/v1/services", "", clientConn)

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	ws, err := m.dialWebSocket(wsURL, insecureTestConfig(""), nil)
	require.NoError(t, err)

	conn.WSConn = ws

	// Start monitoring in a goroutine
	go m.monitorConnection(conn)

	// Wait for state transitions
	time.Sleep(300 * time.Millisecond)

	// Verify connection status, it should be in error state or connecting
	assert.Contains(t, []ConnectionState{StateError, StateConnecting}, conn.Status.State)

	// Clean up
	select {
	case <-conn.Done:
	default:
		close(conn.Done)
	}
}

func TestWriteMessageToCluster(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	clusterConn, clusterServer := createTestWebSocketConnection()

	defer clusterServer.Close()

	conn := &Connection{
		ClusterID: "test-cluster",
		WSConn:    clusterConn.conn,
	}

	testMessage := []byte("Hello, Cluster!")

	// Capture the message sent to the cluster
	var receivedMessage []byte

	done := make(chan bool)

	go func() {
		_, receivedMessage, _ = clusterConn.conn.ReadMessage()

		done <- true
	}()

	err := m.writeMessageToCluster(conn, testMessage)
	assert.NoError(t, err)

	select {
	case <-done:
		assert.Equal(t, testMessage, receivedMessage)
	case <-time.After(time.Second):
		t.Fatal("Test timed out")
	}

	// Test error case
	_ = clusterConn.Close()

	err = m.writeMessageToCluster(conn, testMessage)

	assert.Error(t, err)
	assert.Equal(t, StateError, conn.Status.State)
}

func TestHandleClusterMessages(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	clientConn, clientServer := createTestWebSocketConnection()

	defer clientServer.Close()

	wsConn, wsServer := createTestWebSocketConnection()
	defer wsServer.Close()

	conn := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "watch=true", clientConn)
	conn.WSConn = wsConn.conn

	done := make(chan struct{})

	go func() {
		m.handleClusterMessages(conn)
		close(done)
	}()

	// Send a test message from the cluster
	testMessage := []byte(`{"metadata":{"resourceVersion":"1"},"kind":"Pod","apiVersion":"v1","metadata":{"name":"test-pod"}}`) //nolint:lll // Long JSON payload in test message
	err := wsConn.WriteMessage(websocket.TextMessage, testMessage)
	require.NoError(t, err)

	// Read the message from the client connection
	var msg Message

	err = clientConn.ReadJSON(&msg)
	require.NoError(t, err)

	assert.Equal(t, "test-cluster", msg.ClusterID)
	assert.Equal(t, "/api/v1/pods", msg.Path)
	assert.Equal(t, "watch=true", msg.Query)
	assert.Equal(t, "test-user", msg.UserID)

	// Close the connection
	_ = wsConn.Close()

	// Wait for handleClusterMessages to finish
	select {
	case <-done:
		// Function completed successfully
	case <-time.After(5 * time.Second):
		t.Fatal("Test timed out")
	}
}

func TestSendCompleteMessage(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	clientConn, clientServer := createTestWebSocketConnection()

	defer clientServer.Close()

	conn := createTestConnection("test-cluster-1", "test-user-1", "/api/v1/pods", "", clientConn)

	// Test sending complete message
	err := m.sendCompleteMessage(conn, clientConn)
	assert.NoError(t, err)

	// Verify the complete message was sent
	var msg Message

	err = clientConn.ReadJSON(&msg)
	require.NoError(t, err)
	assert.Equal(t, "COMPLETE", msg.Type)
	assert.Equal(t, conn.ClusterID, msg.ClusterID)
	assert.Equal(t, conn.Path, msg.Path)
	assert.Equal(t, conn.Query, msg.Query)
	assert.Equal(t, conn.UserID, msg.UserID)

	// Test sending to closed connection
	conn.closed = true
	err = m.sendCompleteMessage(conn, clientConn)
	assert.NoError(t, err) // Should return nil for closed connection
}

func TestSendDataMessage(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	clientConn, clientServer := createTestWebSocketConnection()

	defer clientServer.Close()

	conn := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn)

	// Test sending a text message
	textMsg := []byte("Hello, World!")
	err := m.sendDataMessage(conn, clientConn, websocket.TextMessage, textMsg)
	assert.NoError(t, err)

	// Verify text message
	var msg Message

	err = clientConn.ReadJSON(&msg)
	require.NoError(t, err)
	assert.Equal(t, string(textMsg), msg.Data)
	assert.False(t, msg.Binary)

	// Test sending a binary message
	binaryMsg := []byte{0x01, 0x02, 0x03}
	err = m.sendDataMessage(conn, clientConn, websocket.BinaryMessage, binaryMsg)
	assert.NoError(t, err)

	// Verify binary message
	err = clientConn.ReadJSON(&msg)
	require.NoError(t, err)
	assert.Equal(t, base64.StdEncoding.EncodeToString(binaryMsg), msg.Data)
	assert.True(t, msg.Binary)

	// Test sending to closed connection
	conn.closed = true
	err = m.sendDataMessage(conn, clientConn, websocket.TextMessage, textMsg)
	assert.NoError(t, err) // Should return nil even for closed connection
}

// runConcurrentLockStress fires updateStatus and sendDataMessage
// simultaneously for n iterations to surface lock-order deadlocks.
func runConcurrentLockStress(
	m *Multiplexer,
	conn *Connection,
	clientConn *WSConnLock,
	iterations int,
) <-chan struct{} {
	finished := make(chan struct{})

	go func() {
		defer close(finished)

		var start sync.WaitGroup

		for i := 0; i < iterations; i++ {
			start.Add(1)

			var wg sync.WaitGroup

			wg.Add(2)

			go func() {
				defer wg.Done()

				start.Wait()

				conn.updateStatus(StateConnected, nil)
			}()

			go func() {
				defer wg.Done()

				start.Wait()

				_ = m.sendDataMessage(conn, clientConn, websocket.TextMessage, []byte("test"))
			}()

			// Release both goroutines simultaneously.
			start.Done()

			wg.Wait()
		}
	}()

	return finished
}

// TestConcurrentUpdateStatusAndSendDataMessage is a regression test that verifies
// updateStatus and sendDataMessage can run concurrently without deadlocking.
//
// Before the fix, sendDataMessage acquired writeMu then mu (nested), while
// updateStatus acquired mu then writeMu, creating a lock-order inversion
// (ABBA deadlock). The fix changed sendDataMessage to acquire each lock
// sequentially (writeMu → unlock → mu → unlock), eliminating the nested
// acquisition entirely.
func TestConcurrentUpdateStatusAndSendDataMessage(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	conn := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn)

	// Drain messages from the client side so writes don't block on a full buffer.
	done := make(chan struct{})

	go func() {
		defer close(done)

		for {
			var msg json.RawMessage
			if err := clientConn.ReadJSON(&msg); err != nil {
				return
			}
		}
	}()

	// Clean up the reader goroutine so it does not leak after the test.
	t.Cleanup(func() {
		_ = clientConn.conn.Close()

		<-done
	})

	// Run updateStatus and sendDataMessage concurrently.
	// If the lock order is inverted, this will deadlock and the test will
	// exceed its timeout.
	finished := runConcurrentLockStress(m, conn, clientConn, 50)

	select {
	case <-finished:
		// Success: no deadlock.
	case <-time.After(5 * time.Second):
		t.Fatal("deadlock detected: concurrent updateStatus and sendDataMessage blocked for 5s")
	}
}

// =============================================================================
// Benchmarks — validate hot-path performance optimizations.
// =============================================================================

// newBenchmarkWSClient creates a mock WebSocket server and returns a connected
// WSConnLock for use in benchmarks. Registers cleanup on b.Cleanup.
func newBenchmarkWSClient(b *testing.B) *WSConnLock {
	b.Helper()

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{}

		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = c.Close() }()

		for {
			if _, _, err := c.ReadMessage(); err != nil {
				return
			}
		}
	}))

	b.Cleanup(mockServer.Close)

	wsURL := "ws" + strings.TrimPrefix(mockServer.URL, "http")

	wsConn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		b.Fatalf("failed to dial mock server: %v", err)
	}

	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}

	b.Cleanup(func() { _ = wsConn.Close() })

	return NewWSConnLock(wsConn)
}

// benchWatchEventMsg is a typical Kubernetes watch event message used in benchmarks.
var benchWatchEventMsg = []byte(`{
	"type": "MODIFIED",
	"object": {
		"apiVersion": "v1", "kind": "Pod",
		"metadata": {
			"name": "nginx-5d87f4f9b4-abc12", "namespace": "default",
			"resourceVersion": "123456", "uid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
			"labels": {"app": "nginx", "pod-template-hash": "5d87f4f9b4"}
		},
		"spec": {"containers": [{"name": "nginx", "image": "nginx:1.21"}]},
		"status": {"phase": "Running"}
	}
}`)

// BenchmarkSendIfNewResourceVersion measures the allocation overhead of
// extracting metadata.resourceVersion from a typical Kubernetes watch event.
// This is the hottest path in the multiplexer.

func BenchmarkSendIfNewResourceVersion(b *testing.B) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	conn := &Connection{
		ClusterID: "test-cluster",
		Path:      "/api/v1/namespaces/default/pods",
		Query:     "watch=true",
		UserID:    "user-1",
	}

	clientConn := newBenchmarkWSClient(b)
	lastRV := "123456"

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = m.sendIfNewResourceVersion(benchWatchEventMsg, conn, clientConn, &lastRV)
	}
}

// BenchmarkSendIfNewResourceVersion_DirectMetadata benchmarks the case where
// resourceVersion is at the top-level metadata (non-watch event format).
func BenchmarkSendIfNewResourceVersion_DirectMetadata(b *testing.B) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)

	directMsg := []byte(`{
		"apiVersion": "v1", "kind": "Pod",
		"metadata": {
			"name": "nginx", "namespace": "default",
			"resourceVersion": "789012",
			"uid": "f1e2d3c4-b5a6-0987-fedc-ba0987654321"
		}
	}`)

	conn := &Connection{
		ClusterID: "test-cluster",
		Path:      "/api/v1/namespaces/default/pods",
		UserID:    "user-1",
	}

	clientConn := newBenchmarkWSClient(b)
	lastRV := "789012"

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		_ = m.sendIfNewResourceVersion(directMsg, conn, clientConn, &lastRV)
	}
}

// benchConnectionKeySink prevents the compiler from optimizing away benchmark work.
var benchConnectionKeySink string

// BenchmarkCreateConnectionKey measures the allocation overhead of creating
// connection keys used for map lookups on every WebSocket message routing.
func BenchmarkCreateConnectionKey(b *testing.B) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)

	clusterID := "my-production-cluster"
	path := "/api/v1/namespaces/kube-system/pods"
	userID := "user-abc123-def456"

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		benchConnectionKeySink = m.createConnectionKey(clusterID, path, userID)
	}
}

func TestTerminalReconnectAndBuffering(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	mockServer := createMockKubeAPIServer()
	defer mockServer.Close()

	err := store.AddContext(&kubeconfig.Context{
		Name: "test-cluster",
		Cluster: &api.Cluster{
			Server:                mockServer.URL,
			InsecureSkipTLSVerify: true,
		},
	})
	require.NoError(t, err)

	clientConn1, clientServer1 := createTestWebSocketConnection()
	defer clientServer1.Close()

	msg := Message{
		ClusterID: "test-cluster",
		Path:      "/api/v1/namespaces/default/pods/my-pod/exec",
		Query:     "container=my-container&stdin=true&stdout=true&tty=true",
		UserID:    "test-user",
		Type:      "REQUEST",
	}

	token := "token"

	conn, err := m.getOrCreateConnection(msg, clientConn1, &token)
	require.NoError(t, err)

	t.Run("Establish initial connection", func(t *testing.T) {
		assert.NotNil(t, conn)
		conn.mu.RLock()
		client := conn.Client
		state := conn.Status.State
		conn.mu.RUnlock()
		assert.Equal(t, clientConn1, client)
		assert.Equal(t, StateConnected, state)
	})

	t.Run("Simulate disconnect and buffer", func(t *testing.T) {
		runSimulateDisconnectAndBufferTest(t, conn)
	})

	t.Run("Reconnect and flush", func(t *testing.T) {
		runReconnectAndFlushTest(t, m, conn, msg, token)
	})
}

func runSimulateDisconnectAndBufferTest(t *testing.T, conn *Connection) {
	conn.mu.Lock()
	conn.Client = nil
	conn.Status.State = StateClosed
	conn.mu.Unlock()

	err := conn.WSConn.WriteMessage(websocket.TextMessage, []byte("hello"))
	require.NoError(t, err)

	assert.Eventually(t, func() bool {
		conn.mu.RLock()
		defer conn.mu.RUnlock()

		return len(conn.Buffer) == 1 && string(conn.Buffer[0].Data) == "hello"
	}, 3*time.Second, 10*time.Millisecond)
}

func runReconnectAndFlushTest(t *testing.T, m *Multiplexer, conn *Connection, msg Message, token string) {
	clientConn2, clientServer2 := createTestWebSocketConnection()
	defer clientServer2.Close()

	flushed := make(chan []byte, 1)

	go func() {
		_, data, _ := clientConn2.conn.ReadMessage()

		flushed <- data
	}()

	conn2, err := m.getOrCreateConnection(msg, clientConn2, &token)
	require.NoError(t, err)
	assert.Equal(t, conn, conn2)
	conn.mu.RLock()
	client := conn.Client
	state := conn.Status.State
	conn.mu.RUnlock()
	assert.Equal(t, clientConn2, client)
	assert.Equal(t, StateConnected, state)

	conn.mu.RLock()
	isBufferNil := conn.Buffer == nil
	conn.mu.RUnlock()
	assert.True(t, isBufferNil)

	select {
	case data := <-flushed:
		assert.Contains(t, string(data), "hello")
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for buffered messages")
	}
}

func TestTerminalCloseConnectionWithQuery(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	clusterID := "test-cluster"
	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	query := "container=debugger&stdin=1&stderr=1&stdout=1&tty=1"
	userID := "test-user"

	connKey := m.createConnectionKey(clusterID, path, userID, query)
	conn := m.createConnection(clusterID, userID, path, query, clientConn, nil)

	m.mutex.Lock()
	m.connections[connKey] = conn
	m.mutex.Unlock()

	// Verify connection exists in registry
	m.mutex.RLock()
	_, exists := m.connections[connKey]
	m.mutex.RUnlock()
	assert.True(t, exists)

	// Close connection passing the query
	m.CloseConnection(clusterID, path, userID, query)

	// Verify connection is removed from registry and closed
	m.mutex.RLock()
	_, exists = m.connections[connKey]
	m.mutex.RUnlock()
	assert.False(t, exists)
	assert.True(t, conn.IsClosed())
}

func TestDisconnectedTerminalUpstreamClosePreservesBufferAndSendsComplete(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	clusterID := "test-cluster"
	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	query := "container=debugger&stdin=1&stderr=1&stdout=1&tty=1"
	userID := "test-user"

	connKey := m.createConnectionKey(clusterID, path, userID, query)

	// Create terminal connection without an active client (disconnected)
	conn := m.createConnection(clusterID, userID, path, query, nil, nil)
	conn.Buffer = []BufferedMessage{{Type: 2, Data: []byte("final output frame")}}
	conn.BufferBytes = len("final output frame")
	conn.Status.State = StateClosed

	m.mutex.Lock()
	m.connections[connKey] = conn
	m.mutex.Unlock()

	// Simulate handleClusterMessages exiting due to upstream K8s connection close while client is disconnected
	conn.mu.Lock()
	conn.upstreamClosed = true
	m.startCleanupTimer(conn)
	conn.mu.Unlock()

	// Connection should still be cached in m.connections during grace period
	m.mutex.RLock()
	_, exists := m.connections[connKey]
	m.mutex.RUnlock()
	assert.True(t, exists, "disconnected terminal connection must remain in cache during grace period")

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	// Reconnect to the cached terminal connection
	msg := Message{
		ClusterID: clusterID,
		Path:      path,
		Query:     query,
		UserID:    userID,
		Type:      "REQUEST",
	}

	reconnected, err := m.getOrCreateConnection(msg, clientConn, nil)
	require.NoError(t, err)
	assert.Equal(t, conn, reconnected)

	// Verify that buffered messages were flushed, COMPLETE message was sent, and connection cleaned up
	assert.Eventually(t, func() bool {
		m.mutex.RLock()
		_, inCache := m.connections[connKey]
		m.mutex.RUnlock()

		return !inCache && conn.IsClosed()
	}, 2*time.Second, 10*time.Millisecond)
}

func TestTerminalSendErrorAfterDetachBuffersFrame(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	failedClient, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	conn := m.createConnection("test-cluster", "test-user", path, "", failedClient, nil)

	// closeClientConnections detached the client after the frame's send began.
	conn.mu.Lock()
	conn.Client = nil
	conn.mu.Unlock()

	m.handleTerminalSendError(conn, failedClient, errors.New("write failed"), websocket.BinaryMessage, []byte("lost?"))

	conn.mu.RLock()
	defer conn.mu.RUnlock()

	require.Len(t, conn.Buffer, 1)
	assert.Equal(t, []byte("lost?"), conn.Buffer[0].Data)
}

func TestTerminalReattachRequiresOwnerToken(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)

	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	query := "container=debugger&stdin=1&stderr=1&stdout=1&tty=1"
	msg := Message{ClusterID: "test-cluster", Path: path, Query: query, UserID: "test-user", Type: "REQUEST"}

	ownerToken := "owner-token"
	conn := m.createConnection(msg.ClusterID, msg.UserID, path, query, nil, &ownerToken)
	conn.ownerToken = &ownerToken
	conn.Buffer = []BufferedMessage{{Type: websocket.BinaryMessage, Data: []byte("secret output")}}
	conn.BufferBytes = len("secret output")
	conn.Status.State = StateClosed

	m.mutex.Lock()
	m.connections[m.createConnectionKey(msg.ClusterID, path, msg.UserID, query)] = conn
	m.mutex.Unlock()

	otherToken := "other-token"

	for name, token := range map[string]*string{"no token": nil, "other token": &otherToken} {
		t.Run(name, func(t *testing.T) {
			clientConn, clientServer := createTestWebSocketConnection()
			defer clientServer.Close()

			_, err := m.getOrCreateConnection(msg, clientConn, token)
			require.Error(t, err)

			conn.mu.RLock()
			defer conn.mu.RUnlock()

			assert.Nil(t, conn.Client)
			require.Len(t, conn.Buffer, 1)
			assert.Equal(t, &ownerToken, conn.Token)
		})
	}

	t.Run("owner token", func(t *testing.T) {
		clientConn, clientServer := createTestWebSocketConnection()
		defer clientServer.Close()

		sameToken := "owner-token"

		reattached, err := m.getOrCreateConnection(msg, clientConn, &sameToken)
		require.NoError(t, err)
		assert.Equal(t, conn, reattached)

		conn.mu.RLock()
		defer conn.mu.RUnlock()

		assert.Equal(t, clientConn, conn.Client)
		assert.Empty(t, conn.Buffer)
	})
}

func TestReconnectKeepsServiceAccountConnectionOwner(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, true)
	tokenFile := writeTestTokenFile(t)

	mockServer := createMockKubeAPIServer()
	defer mockServer.Close()

	err := store.AddContext(&kubeconfig.Context{
		Name:     "test-cluster",
		Cluster:  &api.Cluster{Server: mockServer.URL, InsecureSkipTLSVerify: true},
		AuthInfo: &api.AuthInfo{TokenFile: tokenFile},
		Source:   kubeconfig.InCluster,
	})
	require.NoError(t, err)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	requestToken := "proxy-token"
	path := "/api/v1/namespaces/default/pods/test-pod/exec"

	conn, err := m.establishClusterConnection("test-cluster", "test-user", path, "tty=1", clientConn, &requestToken)
	require.NoError(t, err)

	newConn, err := m.reconnect(conn)
	require.NoError(t, err)

	defer close(newConn.Done)

	require.NotNil(t, newConn.Token)
	assert.Equal(t, testServiceAccountToken, *newConn.Token)
	assert.True(t, newConn.isOwnedBy(&requestToken))
}

// TestEndedTerminalUpstreamIsNotReconnected checks that a terminal whose
// upstream stream ended while its client was detached is only kept for its
// buffered output: the monitor must not ping or reconnect it, which would
// replace the cached session or leave it in an error state the grace period
// never cleans up.
func TestEndedTerminalUpstreamIsNotReconnected(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	m.heartbeatInterval = 10 * time.Millisecond

	clusterConn, clusterServer := createTestWebSocketConnection()
	defer clusterServer.Close()

	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	query := "container=debugger&stdin=1&stderr=1&stdout=1&tty=1"
	connKey := m.createConnectionKey("test-cluster", path, "test-user", query)

	conn := m.createConnection("test-cluster", "test-user", path, query, nil, nil)
	conn.WSConn = clusterConn.conn
	conn.Buffer = []BufferedMessage{{Type: websocket.BinaryMessage, Data: []byte("final output")}}
	conn.Status.State = StateClosed

	m.mutex.Lock()
	m.connections[connKey] = conn
	m.mutex.Unlock()

	// The upstream stream ended, so its socket is closed and pings fail.
	require.NoError(t, conn.WSConn.Close())

	conn.mu.Lock()
	conn.upstreamClosed = true
	m.startCleanupTimer(conn)
	conn.mu.Unlock()

	go m.monitorConnection(conn)

	t.Cleanup(func() { m.cleanupConnection(conn) })

	// Let several heartbeats pass.
	time.Sleep(100 * time.Millisecond)

	conn.mu.RLock()
	state, buffered := conn.Status.State, len(conn.Buffer)
	conn.mu.RUnlock()

	m.mutex.RLock()
	cached := m.connections[connKey]
	m.mutex.RUnlock()

	assert.Equal(t, StateClosed, state, "an ended upstream must not be pinged or reconnected")
	assert.Equal(t, 1, buffered, "the buffered output must be kept for the client")
	assert.Same(t, conn, cached, "the cached session must not be replaced")
}

// TestDetachedTerminalExpiresAfterGracePeriod checks that a terminal whose
// client disconnects is kept for the grace period and then removed and closed.
func TestDetachedTerminalExpiresAfterGracePeriod(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	m.terminalGracePeriod = 50 * time.Millisecond

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	connKey := m.createConnectionKey("test-cluster", path, "test-user", "")
	conn := m.createConnection("test-cluster", "test-user", path, "", clientConn, nil)

	m.mutex.Lock()
	m.connections[connKey] = conn
	m.mutex.Unlock()

	m.closeClientConnections(clientConn)

	m.mutex.RLock()
	_, cached := m.connections[connKey]
	m.mutex.RUnlock()
	require.True(t, cached, "a detached terminal must be kept during the grace period")
	require.False(t, conn.IsClosed())

	assert.Eventually(t, func() bool {
		m.mutex.RLock()
		_, cached := m.connections[connKey]
		m.mutex.RUnlock()

		return !cached && conn.IsClosed()
	}, 2*time.Second, 10*time.Millisecond, "the terminal must be removed and closed once the grace period expires")
}

// TestTerminalReattachCancelsGracePeriod checks that a client reattaching
// during the grace period cancels its deadline, so the resumed session is not
// closed when the deadline would have expired.
func TestTerminalReattachCancelsGracePeriod(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	// Long enough that the reattach below happens well before it expires.
	m.terminalGracePeriod = 500 * time.Millisecond

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	msg := Message{ClusterID: "test-cluster", Path: path, UserID: "test-user", Type: "REQUEST"}
	connKey := m.createConnectionKey(msg.ClusterID, path, msg.UserID, "")
	conn := m.createConnection(msg.ClusterID, msg.UserID, path, "", clientConn, nil)

	m.mutex.Lock()
	m.connections[connKey] = conn
	m.mutex.Unlock()

	m.closeClientConnections(clientConn)

	newClient, newClientServer := createTestWebSocketConnection()
	defer newClientServer.Close()

	reattached, err := m.getOrCreateConnection(msg, newClient, nil)
	require.NoError(t, err)
	require.Same(t, conn, reattached)

	// Wait past the original deadline.
	time.Sleep(2 * m.terminalGracePeriod)

	m.mutex.RLock()
	cached := m.connections[connKey]
	m.mutex.RUnlock()

	assert.Same(t, conn, cached, "the resumed session must stay cached")
	assert.False(t, conn.IsClosed(), "the old deadline must not close the resumed session")

	conn.mu.RLock()
	defer conn.mu.RUnlock()

	assert.Same(t, newClient, conn.Client)
}

// TestDetachedTerminalWithFailedHeartbeatExpires checks that a detached
// terminal whose upstream fails its heartbeat is still cleaned up when the
// grace period expires.
func TestDetachedTerminalWithFailedHeartbeatExpires(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	m.heartbeatInterval = 10 * time.Millisecond
	m.terminalGracePeriod = 100 * time.Millisecond

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	clusterConn, clusterServer := createTestWebSocketConnection()
	defer clusterServer.Close()

	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	connKey := m.createConnectionKey("test-cluster", path, "test-user", "")
	conn := m.createConnection("test-cluster", "test-user", path, "", clientConn, nil)
	conn.WSConn = clusterConn.conn

	m.mutex.Lock()
	m.connections[connKey] = conn
	m.mutex.Unlock()

	go m.monitorConnection(conn)

	m.closeClientConnections(clientConn)

	// The link to the cluster drops, so pings fail and reconnecting fails too.
	require.NoError(t, conn.WSConn.Close())

	assert.Eventually(t, func() bool {
		m.mutex.RLock()
		_, cached := m.connections[connKey]
		m.mutex.RUnlock()

		return !cached && conn.IsClosed()
	}, 2*time.Second, 10*time.Millisecond, "the terminal must be removed and closed once the grace period expires")
}

// TestDetachedTerminalIsNotReconnected checks that a detached terminal whose
// heartbeat fails is not reconnected even when the cluster is reachable. A
// reconnect would run a new exec without a reader in place of the session, and
// that replacement would outlive the grace period.
func TestDetachedTerminalIsNotReconnected(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)
	m.heartbeatInterval = 10 * time.Millisecond
	m.terminalGracePeriod = 100 * time.Millisecond

	mockServer := createMockKubeAPIServer()
	defer mockServer.Close()

	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:    "test-cluster",
		Cluster: &api.Cluster{Server: mockServer.URL, InsecureSkipTLSVerify: true},
	}))

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	clusterConn, clusterServer := createTestWebSocketConnection()
	defer clusterServer.Close()

	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	connKey := m.createConnectionKey("test-cluster", path, "test-user", "")
	conn := m.createConnection("test-cluster", "test-user", path, "", clientConn, nil)
	conn.WSConn = clusterConn.conn

	m.mutex.Lock()
	m.connections[connKey] = conn
	m.mutex.Unlock()

	go m.monitorConnection(conn)

	m.closeClientConnections(clientConn)

	// Pings fail, while a reconnect to the cluster would succeed.
	require.NoError(t, conn.WSConn.Close())

	assert.Eventually(t, func() bool {
		m.mutex.RLock()
		_, cached := m.connections[connKey]
		m.mutex.RUnlock()

		return !cached && conn.IsClosed()
	}, 2*time.Second, 10*time.Millisecond, "the session must not be replaced, and must end with the grace period")
}

// TestDialWebSocketNegotiatesChannelProtocolForTerminals checks that exec and
// attach streams request the Kubernetes channel protocols, which the API
// server needs to tell stdin, stdout, stderr and resize frames apart, while
// other streams such as watches request none.
func TestDialWebSocketNegotiatesChannelProtocolForTerminals(t *testing.T) {
	requested := make(chan string, 2)

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requested <- r.Header.Get("Sec-WebSocket-Protocol")

		upgrader := websocket.Upgrader{
			Subprotocols: []string{"v4.channel.k8s.io"},
			CheckOrigin:  func(*http.Request) bool { return true },
		}

		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		_ = c.Close()
	}))
	defer server.Close()

	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	base := "wss" + strings.TrimPrefix(server.URL, "https")

	attachURL := base + "/api/v1/namespaces/default/pods/p/attach?container=c&stdin=1"

	attach, err := m.dialWebSocket(attachURL, insecureTestConfig(""), nil)
	require.NoError(t, err)

	defer func() { _ = attach.Close() }()

	assert.Contains(t, <-requested, "v4.channel.k8s.io")
	assert.Equal(t, "v4.channel.k8s.io", attach.Subprotocol())

	watch, err := m.dialWebSocket(base+"/api/v1/pods?watch=1", insecureTestConfig(""), nil)
	require.NoError(t, err)

	defer func() { _ = watch.Close() }()

	assert.Empty(t, <-requested)
}

// TestTerminalInputIsDecodedForTheCluster checks that terminal input the
// client sends as base64-encoded binary data reaches the cluster as the
// original bytes, and that a REQUEST without data writes nothing, as an empty
// frame is not a valid message on a channel stream.
func TestTerminalInputIsDecodedForTheCluster(t *testing.T) { //nolint:funlen // Cluster and client setup.
	type frame struct {
		messageType int
		data        []byte
	}

	received := make(chan frame, 4)

	cluster := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = c.Close() }()

		for {
			messageType, data, err := c.ReadMessage()
			if err != nil {
				return
			}

			received <- frame{messageType, data}
		}
	}))
	defer cluster.Close()

	m := NewMultiplexer(kubeconfig.NewContextStore(), false)

	clusterConn, resp, err := newTestDialer().Dial("ws"+strings.TrimPrefix(cluster.URL, "http"), nil)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	msg := Message{ClusterID: "test-cluster", Path: path, UserID: "test-user", Type: "REQUEST"}
	conn := m.createConnection(msg.ClusterID, msg.UserID, path, "", clientConn, nil)
	conn.WSConn = clusterConn
	conn.Status.State = StateConnected

	m.mutex.Lock()
	m.connections[m.createConnectionKey(msg.ClusterID, path, msg.UserID, "")] = conn
	m.mutex.Unlock()

	t.Cleanup(func() { m.cleanupConnection(conn) })

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/wsMultiplexer", nil)

	// A REQUEST that only (re)attaches carries no data.
	m.processClientMessage(req, clientConn, msg)

	input := msg
	input.Data = base64.StdEncoding.EncodeToString([]byte("\x00ls\r"))
	input.Binary = true
	m.processClientMessage(req, clientConn, input)

	select {
	case got := <-received:
		assert.Equal(t, websocket.BinaryMessage, got.messageType)
		assert.Equal(t, []byte("\x00ls\r"), got.data, "the first frame must be the decoded input, not an empty frame")
	case <-time.After(2 * time.Second):
		t.Fatal("the input never reached the cluster")
	}
}

// TestTerminalThroughMultiplexerSurvivesReconnect runs a terminal session the way
// the node shell and pod debug terminals do: through the multiplexer's client
// endpoint, with base64-encoded binary input. Output produced after the client
// drops is buffered and delivered once a new client connection reattaches.
func TestTerminalThroughMultiplexerSurvivesReconnect(t *testing.T) { //nolint:funlen // Full session lifecycle.
	// The API server echoes each frame of input back a little later.
	cluster := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			Subprotocols: []string{"v4.channel.k8s.io"},
			CheckOrigin:  func(*http.Request) bool { return true },
		}

		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil || c.Subprotocol() != "v4.channel.k8s.io" {
			return
		}

		defer func() { _ = c.Close() }()

		for {
			_, data, err := c.ReadMessage()
			if err != nil {
				return
			}

			time.Sleep(100 * time.Millisecond)

			if err := c.WriteMessage(websocket.BinaryMessage, data); err != nil {
				return
			}
		}
	}))
	defer cluster.Close()

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:    "test-cluster",
		Cluster: &api.Cluster{Server: cluster.URL, InsecureSkipTLSVerify: true},
	}))

	m := NewMultiplexer(store, false)

	server := httptest.NewServer(http.HandlerFunc(m.HandleClientWebSocket))
	defer server.Close()

	dialer := websocket.Dialer{Subprotocols: []string{MultiplexerProtocol}}
	request := Message{
		ClusterID: "test-cluster",
		Path:      "/api/v1/namespaces/default/pods/test-pod/attach",
		Query:     "container=c&stdin=1&stdout=1&tty=1",
		UserID:    "test-user",
		Type:      "REQUEST",
	}
	input := func(text string) Message {
		msg := request
		msg.Data = base64.StdEncoding.EncodeToString([]byte(text))
		msg.Binary = true

		return msg
	}
	readOutput := func(client *websocket.Conn) string {
		require.NoError(t, client.SetReadDeadline(time.Now().Add(5*time.Second)))

		for {
			var msg Message
			require.NoError(t, client.ReadJSON(&msg))

			if msg.Binary {
				data, err := base64.StdEncoding.DecodeString(msg.Data)
				require.NoError(t, err)

				return string(data)
			}
		}
	}

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	first, resp, err := dialer.Dial(wsURL, nil)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())
	require.NoError(t, first.WriteJSON(request))
	require.NoError(t, first.WriteJSON(input("\x00a")))
	assert.Equal(t, "\x00a", readOutput(first))

	// The browser drops right after sending more input, so its output arrives
	// while the session is detached.
	require.NoError(t, first.WriteJSON(input("\x00b")))
	require.NoError(t, first.Close())
	time.Sleep(300 * time.Millisecond)

	second, resp, err := dialer.Dial(wsURL, nil)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	defer func() { _ = second.Close() }()

	require.NoError(t, second.WriteJSON(request))
	assert.Equal(t, "\x00b", readOutput(second), "output from while the client was away must be delivered")
}

// TestDialWebSocketUsesContextCredentials checks that cluster connections carry
// the context's credentials, as the cluster proxy does, with a token from the
// request taking precedence over the context's own.
func TestDialWebSocketUsesContextCredentials(t *testing.T) {
	type headers struct{ authorization, impersonateUser string }

	seen := make(chan headers, 2)

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- headers{r.Header.Get("Authorization"), r.Header.Get("Impersonate-User")}

		upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		_ = c.Close()
	}))
	defer server.Close()

	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	config := &rest.Config{
		Host:            server.URL,
		BearerToken:     "context-token",
		Impersonate:     rest.ImpersonationConfig{UserName: "alice"},
		TLSClientConfig: rest.TLSClientConfig{Insecure: true},
	}
	wsURL := "wss" + strings.TrimPrefix(server.URL, "https") + "/api/v1/pods?watch=1"

	conn, err := m.dialWebSocket(wsURL, config, nil)
	require.NoError(t, err)
	require.NoError(t, conn.Close())
	assert.Equal(t, headers{"Bearer context-token", "alice"}, <-seen)

	requestToken := "request-token"
	conn, err = m.dialWebSocket(wsURL, config, &requestToken)
	require.NoError(t, err)
	require.NoError(t, conn.Close())
	assert.Equal(t, headers{"Bearer request-token", "alice"}, <-seen)
}

// insecureTestConfig returns a REST config for a test server with a self-signed certificate.
func insecureTestConfig(host string) *rest.Config {
	return &rest.Config{Host: host, TLSClientConfig: rest.TLSClientConfig{Insecure: true}}
}

// TestClusterWritesAreSerialized checks that heartbeats and input from clients
// can write to a cluster connection at the same time. gorilla/websocket allows
// a single writer and panics on concurrent writes.
func TestClusterWritesAreSerialized(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	m.heartbeatInterval = time.Millisecond

	clusterConn, clusterServer := createTestWebSocketConnection()
	defer clusterServer.Close()

	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	conn := m.createConnection("test-cluster", "test-user", path, "", nil, nil)
	conn.WSConn = clusterConn.conn

	go m.monitorConnection(conn)

	t.Cleanup(func() { m.cleanupConnection(conn) })

	var wg sync.WaitGroup

	for i := 0; i < 20; i++ {
		wg.Add(1)

		go func() {
			defer wg.Done()

			for j := 0; j < 20; j++ {
				_ = m.writeMessageToCluster(conn, []byte("\x00input"))
			}
		}()
	}

	wg.Wait()
}

// newTerminalAPIServer returns an API server for terminal tests. It echoes input
// back, drops the connection without a close frame on "\x00break", does the same
// after writing "\x00late output" a little later on "\x00late", and ends the
// stream normally on "\x00exit".
func newTerminalAPIServer(t *testing.T) *httptest.Server {
	t.Helper()

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Tokens are "<user>" or "<user>-<n>", so a refreshed token keeps its user.
		if r.URL.Path == "/apis/authentication.k8s.io/v1/selfsubjectreviews" {
			user, _, _ := strings.Cut(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), "-")
			w.Header().Set("Content-Type", "application/json")
			//nolint:gosec // The test server answers with JSON it builds itself.
			_, _ = fmt.Fprintf(w, `{"apiVersion":"authentication.k8s.io/v1","kind":"SelfSubjectReview",`+
				`"status":{"userInfo":{"username":%q,"uid":%q}}}`, user, "uid-"+user)

			return
		}

		upgrader := websocket.Upgrader{
			Subprotocols: []string{"v4.channel.k8s.io"},
			CheckOrigin:  func(*http.Request) bool { return true },
		}

		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = c.Close() }()

		for {
			_, data, err := c.ReadMessage()
			if err != nil {
				return
			}

			switch string(data) {
			case "\x00break":
				_ = c.UnderlyingConn().Close()

				return
			case "\x00late":
				time.Sleep(100 * time.Millisecond)

				_ = c.WriteMessage(websocket.BinaryMessage, []byte("\x00late output"))
				_ = c.UnderlyingConn().Close()

				return
			case "\x00exit":
				_ = c.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))

				return
			default:
				_ = c.WriteMessage(websocket.BinaryMessage, data)
			}
		}
	}))
	t.Cleanup(server.Close)

	return server
}

// terminalClient opens a client connection to the multiplexer for one attach session.
type terminalClient struct {
	t    *testing.T
	conn *websocket.Conn
	msg  Message
}

func newTerminalClient(t *testing.T, multiplexerURL string) *terminalClient {
	t.Helper()

	return newTerminalClientWithToken(t, multiplexerURL, "")
}

// newTerminalClientWithToken opens the session as the user the auth cookie token identifies.
func newTerminalClientWithToken(t *testing.T, multiplexerURL, token string) *terminalClient {
	t.Helper()

	dialer := websocket.Dialer{Subprotocols: []string{MultiplexerProtocol}}

	var header http.Header
	if token != "" {
		header = http.Header{"Cookie": {"headlamp-auth-test-cluster.0=" + token}}
	}

	conn, resp, err := dialer.Dial(multiplexerURL, header)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	t.Cleanup(func() { _ = conn.Close() })

	client := &terminalClient{t: t, conn: conn, msg: Message{
		ClusterID: "test-cluster",
		Path:      "/api/v1/namespaces/default/pods/test-pod/attach",
		Query:     "container=c&stdin=1&stdout=1&tty=1",
		UserID:    "test-user",
		Type:      "REQUEST",
	}}
	require.NoError(t, conn.WriteJSON(client.msg))

	return client
}

func (c *terminalClient) send(text string) {
	msg := c.msg
	msg.Data = base64.StdEncoding.EncodeToString([]byte(text))
	msg.Binary = true
	require.NoError(c.t, c.conn.WriteJSON(msg))
}

// next returns the next message other than a status update that only reports progress.
func (c *terminalClient) next() Message {
	require.NoError(c.t, c.conn.SetReadDeadline(time.Now().Add(5*time.Second)))

	for {
		var msg Message
		require.NoError(c.t, c.conn.ReadJSON(&msg))

		if msg.Type == "STATUS" && !strings.Contains(msg.Data, `"closed"`) {
			continue
		}

		return msg
	}
}

func newTerminalMultiplexer(t *testing.T) (*Multiplexer, string) {
	t.Helper()

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:    "test-cluster",
		Cluster: &api.Cluster{Server: newTerminalAPIServer(t).URL, InsecureSkipTLSVerify: true},
	}))

	m := NewMultiplexer(store, false)
	server := httptest.NewServer(http.HandlerFunc(m.HandleClientWebSocket))
	t.Cleanup(server.Close)

	return m, "ws" + strings.TrimPrefix(server.URL, "http")
}

// sessionOwnerToken waits for the terminal session the test opened and returns the
// token it was opened with.
func sessionOwnerToken(t *testing.T, m *Multiplexer) string {
	t.Helper()

	var token string

	require.Eventually(t, func() bool {
		m.mutex.RLock()
		defer m.mutex.RUnlock()

		for _, conn := range m.connections {
			conn.mu.RLock()

			if conn.ownerToken != nil {
				token = *conn.ownerToken
			}

			conn.mu.RUnlock()
		}

		return token != ""
	}, 5*time.Second, 10*time.Millisecond)

	return token
}

// dialTerminal opens the test terminal session through the multiplexer at url,
// and returns the cookies the upgrade response set.
func dialTerminal(t *testing.T, url string, header http.Header) []*http.Cookie {
	t.Helper()

	dialer := websocket.Dialer{Subprotocols: []string{MultiplexerProtocol}}

	conn, resp, err := dialer.Dial(url, header)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	t.Cleanup(func() { _ = conn.Close() })

	require.NoError(t, conn.WriteJSON(Message{
		ClusterID: "test-cluster",
		Path:      "/api/v1/namespaces/default/pods/test-pod/attach",
		UserID:    "test-user",
		Type:      "REQUEST",
	}))

	return resp.Cookies()
}

// TestTerminalUsesProxyAuthTokenHeader checks that behind an authenticating proxy,
// a terminal is opened with the token the proxy passes in its configured header,
// ahead of the auth cookie, as the cluster proxy does.
func TestTerminalUsesProxyAuthTokenHeader(t *testing.T) {
	m, url := newTerminalMultiplexer(t)
	m.proxyAuthTokenHeader = "X-Forwarded-Access-Token"

	dialTerminal(t, url, http.Header{
		"X-Forwarded-Access-Token": {"proxy-user"},
		"Cookie":                   {"headlamp-auth-test-cluster.0=cookie-user"},
	})

	assert.Equal(t, "proxy-user", sessionOwnerToken(t, m))
}

// serveClusterMultiplexer serves m under the cluster's path, as the backend does,
// behind middleware, and returns its URL for the test cluster.
func serveClusterMultiplexer(t *testing.T, m *Multiplexer, middleware func(http.Handler) http.Handler) string {
	t.Helper()

	router := mux.NewRouter()
	router.Handle("/clusters/{clusterName}/wsMultiplexer", middleware(http.HandlerFunc(m.HandleClientWebSocket)))

	server := httptest.NewServer(router)
	t.Cleanup(server.Close)

	return "ws" + strings.TrimPrefix(server.URL, "http") + "/clusters/test-cluster/wsMultiplexer"
}

// TestClusterMultiplexerUsesRefreshedToken checks that when the OIDC refresh
// middleware renews the token while the multiplexer's connection is upgraded,
// the browser gets the renewed cookie, as a refresh token may be used only once,
// and the multiplexer opens streams with the renewed token.
func TestClusterMultiplexerUsesRefreshedToken(t *testing.T) {
	m, _ := newTerminalMultiplexer(t)

	refresh := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			require.NoError(t, auth.SetTokenCookie(w, r, "test-cluster", "refreshed-user", "", 0))
			r.Header.Set("Authorization", "Bearer refreshed-user")
			next.ServeHTTP(w, r)
		})
	}

	cookies := dialTerminal(t, serveClusterMultiplexer(t, m, refresh),
		http.Header{"Cookie": {"headlamp-auth-test-cluster.0=stale-user"}})

	assert.True(t, slices.ContainsFunc(cookies, func(c *http.Cookie) bool {
		return c.Name == "headlamp-auth-test-cluster.0" && c.Value == "refreshed-user"
	}), "the renewed cookie must reach the browser: %v", cookies)
	assert.Equal(t, "refreshed-user", sessionOwnerToken(t, m))
}

// TestClusterMultiplexerRejectsOtherClusters checks that the multiplexer served
// under a cluster's path only serves that cluster's streams, as the auth cookies
// of clusters whose names differ only in characters cookie names can't hold are
// told apart by their path alone.
func TestClusterMultiplexerRejectsOtherClusters(t *testing.T) {
	m, _ := newTerminalMultiplexer(t)
	require.NoError(t, m.kubeConfigStore.AddContext(&kubeconfig.Context{
		Name:    "other-cluster",
		Cluster: &api.Cluster{Server: newTerminalAPIServer(t).URL, InsecureSkipTLSVerify: true},
	}))

	url := serveClusterMultiplexer(t, m, func(next http.Handler) http.Handler { return next })
	dialer := websocket.Dialer{Subprotocols: []string{MultiplexerProtocol}}

	conn, resp, err := dialer.Dial(url, nil)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	defer func() { _ = conn.Close() }()

	require.NoError(t, conn.WriteJSON(Message{
		ClusterID: "other-cluster",
		Path:      "/api/v1/namespaces/default/pods/test-pod/attach",
		UserID:    "test-user",
		Type:      "REQUEST",
	}))

	require.NoError(t, conn.SetReadDeadline(time.Now().Add(5*time.Second)))

	var msg Message
	require.NoError(t, conn.ReadJSON(&msg))
	assert.Equal(t, "ERROR", msg.Type)
	assert.Equal(t, "other-cluster", msg.ClusterID)

	m.mutex.RLock()
	defer m.mutex.RUnlock()

	assert.Empty(t, m.connections)
}

// TestTerminalUpstreamBreakIsReportedAsError checks that a terminal whose
// connection to the API server breaks while attached is reported as an error,
// which the client retries, while a stream that ends normally is reported as
// closed, which the client does not retry.
func TestTerminalUpstreamBreakIsReportedAsError(t *testing.T) {
	_, url := newTerminalMultiplexer(t)

	broken := newTerminalClient(t, url)
	broken.send("\x00hi")
	assert.True(t, broken.next().Binary)
	broken.send("\x00break")
	assert.Equal(t, "ERROR", broken.next().Type, "a broken upstream must be retried")

	ended := newTerminalClient(t, url)
	ended.send("\x00hi")
	assert.True(t, ended.next().Binary)
	ended.send("\x00exit")

	msg := ended.next()
	assert.Equal(t, "STATUS", msg.Type, "a stream that ended normally must not be retried")
	assert.Contains(t, msg.Data, `"closed"`)
}

// TestDetachedTerminalUpstreamBreakIsReportedOnReattach checks that when the
// connection to the API server breaks while the client is away, the client
// reattaching gets the buffered output and then an error, so it attaches anew.
func TestDetachedTerminalUpstreamBreakIsReportedOnReattach(t *testing.T) {
	_, url := newTerminalMultiplexer(t)

	first := newTerminalClient(t, url)
	first.send("\x00hi")
	assert.True(t, first.next().Binary)
	// The output and the break both come after the client has gone.
	first.send("\x00late")
	require.NoError(t, first.conn.Close())
	time.Sleep(300 * time.Millisecond)

	second := newTerminalClient(t, url)

	output := second.next()
	require.True(t, output.Binary)

	data, err := base64.StdEncoding.DecodeString(output.Data)
	require.NoError(t, err)
	assert.Equal(t, "\x00late output", string(data))
	assert.Equal(t, "ERROR", second.next().Type)
}

// TestTerminalReattachTakesOverFromOldClient checks that the owner reattaching
// takes the session over from a client that is still attached, which after a
// network drop may be dead without the backend knowing yet. The old client is
// told the session moved, and the new one that it is connected.
func TestTerminalReattachTakesOverFromOldClient(t *testing.T) {
	_, url := newTerminalMultiplexer(t)

	first := newTerminalClient(t, url)
	first.send("\x00hi")
	assert.True(t, first.next().Binary)

	second := newTerminalClient(t, url)

	moved := first.next()
	assert.Equal(t, "STATUS", moved.Type, "the old client must be told the session moved")
	assert.Contains(t, moved.Data, sessionMovedMessage)

	require.NoError(t, second.conn.SetReadDeadline(time.Now().Add(5*time.Second)))

	var status Message
	require.NoError(t, second.conn.ReadJSON(&status))
	assert.Equal(t, "STATUS", status.Type)
	assert.Contains(t, status.Data, `"connected"`)

	second.send("\x00again")

	output := second.next()
	require.True(t, output.Binary)

	data, err := base64.StdEncoding.DecodeString(output.Data)
	require.NoError(t, err)
	assert.Equal(t, "\x00again", string(data))
}

// TestTerminalInputFromReplacedClientDoesNotTakeOver checks that input the client
// a reattach replaced sent before it learned of that, which arrives after the
// takeover has ended, is dropped instead of taking the session back. Only a
// request without data opens or reattaches a session.
func TestTerminalInputFromReplacedClientDoesNotTakeOver(t *testing.T) {
	_, url := newTerminalMultiplexer(t)

	first := newTerminalClient(t, url)
	first.send("\x00hi")
	assert.True(t, first.next().Binary)

	second := newTerminalClient(t, url)
	assert.Contains(t, first.next().Data, sessionMovedMessage)

	require.NoError(t, second.conn.SetReadDeadline(time.Now().Add(5*time.Second)))

	var status Message
	require.NoError(t, second.conn.ReadJSON(&status))
	require.Contains(t, status.Data, `"connected"`)

	// A keystroke the first client sent before it was told the session moved.
	first.send("\x00stale")
	time.Sleep(200 * time.Millisecond)

	second.send("\x00again")

	output := second.next()
	require.True(t, output.Binary, "the session must stay with the second client: %+v", output)

	data, err := base64.StdEncoding.DecodeString(output.Data)
	require.NoError(t, err)
	assert.Equal(t, "\x00again", string(data), "the stale input must not reach the session")
}

// newTakeoverConnection returns a cached terminal session that a new client is
// taking over: it is flushing, and Client is still the old client.
func newTakeoverConnection(t *testing.T, m *Multiplexer) (*Connection, *WSConnLock) {
	t.Helper()

	oldClient, oldServer := createTestWebSocketConnection()
	t.Cleanup(oldServer.Close)

	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	conn := m.createConnection("test-cluster", "test-user", path, "", oldClient, nil)
	conn.Status.State = StateConnected
	conn.isFlushing = true

	m.mutex.Lock()
	m.connections[m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, conn.Query)] = conn
	m.mutex.Unlock()

	return conn, oldClient
}

// TestTerminalReattachIsBusyDuringTakeover checks that while a new client drains
// a session it is taking over, a request from the old client, which is still the
// session's Client while the earlier buffer is flushed, does not start a second drain.
func TestTerminalReattachIsBusyDuringTakeover(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	conn, oldClient := newTakeoverConnection(t, m)
	conn.Buffer = []BufferedMessage{{Type: websocket.BinaryMessage, Data: []byte("pending")}}

	assert.False(t, m.handleTerminalReconnect(conn, oldClient, true), "the session must be busy")

	conn.mu.RLock()
	defer conn.mu.RUnlock()

	assert.True(t, conn.isFlushing)
	assert.Equal(t, oldClient, conn.Client)
	assert.Len(t, conn.Buffer, 1, "the buffer belongs to the drain in progress")
}

// TestTerminalUpstreamEndDuringTakeoverReachesNewClient checks that when the
// upstream stream ends while a new client is taking over the session, the
// session is kept until that client's drain tells it the stream is complete.
func TestTerminalUpstreamEndDuringTakeoverReachesNewClient(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	conn, _ := newTakeoverConnection(t, m)

	close(conn.Done)
	m.handleClusterMessages(conn)
	require.False(t, conn.IsClosed(), "the session must be kept for the drain in progress")

	newClient, newServer := createTestWebSocketConnection()
	defer newServer.Close()

	require.True(t, m.drainBufferedMessages(conn, newClient))
	require.NoError(t, newClient.conn.SetReadDeadline(time.Now().Add(5*time.Second)))

	for {
		var msg Message
		require.NoError(t, newClient.conn.ReadJSON(&msg))

		if msg.Type == "COMPLETE" {
			break
		}
	}

	assert.True(t, conn.IsClosed())
}

// TestTerminalDrainEndsWhileOutputKeepsArriving checks that a client draining a
// session attaches even while output keeps arriving faster than it is sent, so
// the drain, which runs in the client's read loop, cannot keep its requests, such
// as Ctrl+C or CLOSE, from being read.
func TestTerminalDrainEndsWhileOutputKeepsArriving(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	conn := m.createConnection("test-cluster", "test-user", path, "", nil, nil)
	conn.isFlushing = true

	for range 50 {
		conn.Buffer = append(conn.Buffer, BufferedMessage{Type: websocket.BinaryMessage, Data: []byte("out")})
	}

	// For every frame the client receives, two more arrive from the cluster, which
	// are buffered while the session is still draining.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = ws.Close() }()

		for {
			if _, _, err := ws.ReadMessage(); err != nil {
				return
			}

			conn.mu.Lock()
			if conn.isFlushing {
				conn.enforceBufferCaps([]BufferedMessage{
					{Type: websocket.BinaryMessage, Data: []byte("more")},
					{Type: websocket.BinaryMessage, Data: []byte("more")},
				}, false)
			}
			conn.mu.Unlock()
		}
	}))
	defer server.Close()

	ws, resp, err := newTestDialer().Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	client := NewWSConnLock(ws)
	defer func() { _ = client.Close() }()

	attached := make(chan bool, 1)

	go func() { attached <- m.drainBufferedMessages(conn, client) }()

	select {
	case ok := <-attached:
		assert.True(t, ok)
	case <-time.After(5 * time.Second):
		t.Fatal("the drain did not end while output kept arriving")
	}

	conn.mu.RLock()
	defer conn.mu.RUnlock()

	assert.Equal(t, client, conn.Client)
	assert.False(t, conn.isFlushing)
	assert.Nil(t, conn.drained, "the session must be free for a later takeover")
}

// TestTerminalDrainDoesNotHoldSessionLockWhileWriting checks that a client slow to
// read what a session drains to it does not hold the session's lock meanwhile, as
// other clients disconnecting take it while holding the multiplexer's lock.
func TestTerminalDrainDoesNotHoldSessionLockWhileWriting(t *testing.T) { //nolint:funlen // Slow client setup.
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	conn := m.createConnection("test-cluster", "test-user", path, "", nil, nil)
	conn.isFlushing = true

	// More than the socket buffers hold, so the writes wait for the client to read.
	for range 5 {
		conn.Buffer = append(conn.Buffer,
			BufferedMessage{Type: websocket.BinaryMessage, Data: bytes.Repeat([]byte("x"), 1<<20)})
	}

	m.mutex.Lock()
	m.connections[m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, conn.Query)] = conn
	m.mutex.Unlock()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = ws.Close() }()

		time.Sleep(time.Second)

		for {
			if _, _, err := ws.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer server.Close()

	ws, resp, err := newTestDialer().Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	client := NewWSConnLock(ws)
	defer func() { _ = client.Close() }()

	attached := make(chan bool, 1)

	go func() { attached <- m.drainBufferedMessages(conn, client) }()

	time.Sleep(200 * time.Millisecond)

	// Another client disconnecting looks at every session.
	closed := make(chan struct{})

	go func() {
		m.closeClientConnections(NewWSConnLock(nil))
		close(closed)
	}()

	select {
	case <-closed:
	case <-time.After(300 * time.Millisecond):
		t.Error("another client disconnecting waited for the drain")
	}

	select {
	case ok := <-attached:
		assert.True(t, ok)
	case <-time.After(10 * time.Second):
		t.Fatal("the drain did not end")
	}
}

// TestTerminalUpstreamBreakDuringDrainFollowsOutput checks that when the cluster
// stream breaks while a drain is still writing to the client, the client gets the
// error after all of the drained output, as it ends the session when it gets it.
func TestTerminalUpstreamBreakDuringDrainFollowsOutput(t *testing.T) { //nolint:funlen // Slow client setup.
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	conn := m.createConnection("test-cluster", "test-user", path, "", nil, nil)
	conn.isFlushing = true

	// More than the socket buffers hold, so the writes wait for the client to read.
	for range 5 {
		conn.Buffer = append(conn.Buffer,
			BufferedMessage{Type: websocket.BinaryMessage, Data: bytes.Repeat([]byte("x"), 1<<20)})
	}

	received := make(chan []string, 1)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = ws.Close() }()

		time.Sleep(time.Second)

		var types []string

		for {
			_ = ws.SetReadDeadline(time.Now().Add(2 * time.Second))

			var msg Message

			if err := ws.ReadJSON(&msg); err != nil {
				received <- types
				return
			}

			types = append(types, msg.Type)
		}
	}))
	defer server.Close()

	ws, resp, err := newTestDialer().Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	client := NewWSConnLock(ws)
	defer func() { _ = client.Close() }()

	go m.drainBufferedMessages(conn, client)

	time.Sleep(200 * time.Millisecond)

	// The cluster stream breaks while the drain is still writing.
	conn.mu.Lock()
	conn.upstreamErr = errors.New("connection reset")
	conn.mu.Unlock()
	close(conn.Done)
	m.handleClusterMessages(conn)

	var types []string
	select {
	case types = <-received:
	case <-time.After(10 * time.Second):
		t.Fatal("the client did not finish reading")
	}

	require.Contains(t, types, "ERROR")
	errorAt := slices.Index(types, "ERROR")
	assert.Equal(t, 5, strings.Count(strings.Join(types[:errorAt], ","), "DATA"),
		"the error must follow all of the drained output: %v", types)
}

// dialSlowReader returns a client that starts reading only once read is closed, so
// writes of more than the socket buffers hold wait for it meanwhile.
func dialSlowReader(t *testing.T, read <-chan struct{}) *WSConnLock {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := (&websocket.Upgrader{}).Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = ws.Close() }()

		<-read

		for {
			if _, _, err := ws.ReadMessage(); err != nil {
				return
			}
		}
	}))
	t.Cleanup(server.Close)

	ws, resp, err := newTestDialer().Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	client := NewWSConnLock(ws)

	t.Cleanup(func() { _ = client.Close() })

	return client
}

// TestTerminalReattachIsBusyWhileDrainWrites checks that a session stays reserved
// while a client that took it over is still being sent the drained output, so a
// request from the client it replaced cannot take the session back meanwhile.
func TestTerminalReattachIsBusyWhileDrainWrites(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	conn, oldClient := newTakeoverConnection(t, m)

	// Far more than the socket buffers hold, so the writes wait for the client to read.
	for range 32 {
		conn.Buffer = append(conn.Buffer,
			BufferedMessage{Type: websocket.BinaryMessage, Data: bytes.Repeat([]byte("x"), 1<<20)})
	}

	read := make(chan struct{})
	newClient := dialSlowReader(t, read)
	attached := make(chan bool, 1)

	go func() { attached <- m.drainBufferedMessages(conn, newClient) }()

	time.Sleep(200 * time.Millisecond)

	reattached := make(chan bool, 1)

	go func() { reattached <- m.handleTerminalReconnect(conn, oldClient, true) }()

	select {
	case ok := <-reattached:
		assert.False(t, ok, "the session must be busy until the drain ends")
	case <-time.After(5 * time.Second):
		t.Error("the reattach waited for the drain")
	}

	select {
	case <-attached:
		t.Fatal("the drain ended before the client read, so the test did not block it")
	default:
	}

	close(read)

	select {
	case ok := <-attached:
		assert.True(t, ok)
	case <-time.After(10 * time.Second):
		t.Fatal("the drain did not end")
	}

	conn.mu.RLock()
	defer conn.mu.RUnlock()

	assert.Equal(t, newClient, conn.Client)
}

// TestTerminalHeartbeatFailureIsReportedAsError checks that an attached client is
// told when a terminal's heartbeat fails, by the error its cluster reader reports
// once the heartbeat closes the connection, so the client attaches again.
func TestTerminalHeartbeatFailureIsReportedAsError(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	m.heartbeatInterval = 10 * time.Millisecond

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	clusterConn, clusterServer := createTestWebSocketConnection()
	defer clusterServer.Close()

	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	conn := m.createConnection("test-cluster", "test-user", path, "", clientConn, nil)
	conn.WSConn = clusterConn.conn
	conn.Status.State = StateConnected

	m.mutex.Lock()
	m.connections[m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, conn.Query)] = conn
	m.mutex.Unlock()

	// Writes to the cluster fail, so the heartbeat does, while reads still wait.
	tcpConn, ok := clusterConn.conn.UnderlyingConn().(*net.TCPConn)
	require.True(t, ok)
	require.NoError(t, tcpConn.CloseWrite())

	go m.handleClusterMessages(conn)
	go m.monitorConnection(conn)

	require.NoError(t, clientConn.conn.SetReadDeadline(time.Now().Add(5*time.Second)))

	for {
		var msg Message
		require.NoError(t, clientConn.ReadJSON(&msg))

		if msg.Type == "ERROR" {
			break
		}
	}
}

// TestTerminalHeartbeatFailureDuringDrainDoesNotHoldSessionLock checks that a
// failed heartbeat while a slow client is being drained to does not wait for the
// drain holding the session's lock, which another client disconnecting needs
// while it holds the multiplexer's lock, which opening any session needs.
func TestTerminalHeartbeatFailureDuringDrainDoesNotHoldSessionLock(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	m.heartbeatInterval = 10 * time.Millisecond
	conn, _ := newTakeoverConnection(t, m)

	// Far more than the socket buffers hold, so the writes wait for the client to read.
	for range 32 {
		conn.Buffer = append(conn.Buffer,
			BufferedMessage{Type: websocket.BinaryMessage, Data: bytes.Repeat([]byte("x"), 1<<20)})
	}

	// The link to the cluster is down, so the heartbeat fails.
	clusterConn, clusterServer := createTestWebSocketConnection()
	defer clusterServer.Close()

	conn.WSConn = clusterConn.conn
	require.NoError(t, conn.WSConn.Close())

	read := make(chan struct{})
	defer close(read)

	go m.drainBufferedMessages(conn, dialSlowReader(t, read))

	time.Sleep(200 * time.Millisecond)

	go m.monitorConnection(conn)

	time.Sleep(200 * time.Millisecond)

	closed := make(chan struct{})

	go func() {
		m.closeClientConnections(NewWSConnLock(nil))
		close(closed)
	}()

	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Error("another client disconnecting waited for the drain")
	}
}

// TestTerminalTakeoverDoesNotHoldSessionLockWhileOldWriteStalls checks that a
// takeover waiting for a write to the client it replaces, which may take until the
// write times out if that client stopped reading, does not hold the session's lock
// meanwhile, which another client disconnecting needs while it holds the
// multiplexer's lock, which opening any session needs.
func TestTerminalTakeoverDoesNotHoldSessionLockWhileOldWriteStalls(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	conn, _ := newTakeoverConnection(t, m)
	conn.isFlushing = false

	newClient, newServer := createTestWebSocketConnection()
	defer newServer.Close()

	// A write to the old client holds the write lock.
	conn.writeMu.Lock()

	reattached := make(chan bool, 1)

	go func() { reattached <- m.handleTerminalReconnect(conn, newClient, true) }()

	time.Sleep(200 * time.Millisecond)

	closed := make(chan struct{})

	go func() {
		m.closeClientConnections(NewWSConnLock(nil))
		close(closed)
	}()

	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Error("another client disconnecting waited for the write to the old client")
	}

	conn.writeMu.Unlock()

	select {
	case ok := <-reattached:
		assert.True(t, ok)
	case <-time.After(5 * time.Second):
		t.Fatal("the takeover did not end")
	}
}

// TestTerminalOutputDuringDrainFollowsDrainedOutput checks that output arriving
// while a drain waits for a write to the replaced client is sent after what the
// drain writes, although the drain waits for the write lock without the session's.
func TestTerminalOutputDuringDrainFollowsDrainedOutput(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	conn := m.createConnection("test-cluster", "test-user", path, "", nil, nil)
	conn.isFlushing = true
	conn.Buffer = []BufferedMessage{
		{Type: websocket.BinaryMessage, Data: []byte("first")},
		{Type: websocket.BinaryMessage, Data: []byte("second")},
	}

	client, server := createTestWebSocketConnection()
	defer server.Close()

	// The cluster reader's write to the replaced client holds the write lock.
	conn.writeMu.Lock()

	attached := make(chan bool, 1)

	go func() { attached <- m.drainBufferedMessages(conn, client) }()

	require.Eventually(t, func() bool {
		conn.mu.RLock()
		defer conn.mu.RUnlock()

		return conn.drained != nil
	}, 5*time.Second, time.Millisecond)

	time.Sleep(100 * time.Millisecond)

	// The cluster reader finishes that write and goes on to the next output.
	sent := make(chan struct{})

	go func() {
		conn.writeMu.Unlock()
		m.sendTerminalOutput(conn, websocket.BinaryMessage, []byte("later"))
		close(sent)
	}()

	require.True(t, <-attached)
	<-sent

	require.NoError(t, client.conn.SetReadDeadline(time.Now().Add(5*time.Second)))

	var data []string

	for len(data) < 3 {
		var msg Message
		require.NoError(t, client.ReadJSON(&msg))

		if msg.Type == "DATA" {
			decoded, err := base64.StdEncoding.DecodeString(msg.Data)
			require.NoError(t, err)

			data = append(data, string(decoded))
		}
	}

	assert.Equal(t, []string{"first", "second", "later"}, data)
}

// TestTerminalUpstreamEndDuringDrainFollowsOutput checks that when the cluster
// stream ends normally while a drain waits for a write to the replaced client, the
// client is told the session closed only after the drained output, as it ends the
// session when it is told.
func TestTerminalUpstreamEndDuringDrainFollowsOutput(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	conn := m.createConnection("test-cluster", "test-user", path, "", nil, nil)
	conn.isFlushing = true
	conn.Buffer = []BufferedMessage{
		{Type: websocket.BinaryMessage, Data: []byte("first")},
		{Type: websocket.BinaryMessage, Data: []byte("second")},
	}

	client, server := createTestWebSocketConnection()
	defer server.Close()

	// The cluster reader's write to the replaced client holds the write lock.
	conn.writeMu.Lock()

	attached := make(chan bool, 1)

	go func() { attached <- m.drainBufferedMessages(conn, client) }()

	require.Eventually(t, func() bool {
		conn.mu.RLock()
		defer conn.mu.RUnlock()

		return conn.drained != nil
	}, 5*time.Second, time.Millisecond)

	time.Sleep(100 * time.Millisecond)

	// The cluster reader finishes that write, and the stream ends.
	ended := make(chan struct{})

	go func() {
		conn.writeMu.Unlock()
		close(conn.Done)
		m.handleClusterMessages(conn)
		close(ended)
	}()

	require.True(t, <-attached)
	<-ended

	require.NoError(t, client.conn.SetReadDeadline(time.Now().Add(5*time.Second)))

	var received []string

	for {
		var msg Message
		require.NoError(t, client.ReadJSON(&msg))

		if msg.Type == "DATA" {
			received = append(received, "DATA")
		} else if strings.Contains(msg.Data, `"closed"`) {
			break
		}
	}

	assert.Equal(t, []string{"DATA", "DATA"}, received,
		"the client must get the output before it is told the session closed")
}

// TestTerminalOutputForReplacedClientReachesNewClient checks that output the
// cluster reader picked a client for goes to the client that took the session
// over, if the takeover attached it before the output was written.
func TestTerminalOutputForReplacedClientReachesNewClient(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	conn, oldClient := newTakeoverConnection(t, m)
	conn.isFlushing = false

	// The cluster reader picks the attached client for a frame.
	attachment := conn.attachment.Load()

	newClient, newServer := createTestWebSocketConnection()
	defer newServer.Close()

	require.True(t, m.handleTerminalReconnect(conn, newClient, true))

	m.writeTerminalOutput(conn, oldClient, attachment, websocket.BinaryMessage, []byte("out"))

	require.NoError(t, newClient.conn.SetReadDeadline(time.Now().Add(5*time.Second)))

	for {
		var msg Message
		require.NoError(t, newClient.ReadJSON(&msg))

		if msg.Type == "DATA" {
			data, err := base64.StdEncoding.DecodeString(msg.Data)
			require.NoError(t, err)
			assert.Equal(t, "out", string(data))

			break
		}
	}

	require.NoError(t, oldClient.conn.SetReadDeadline(time.Now().Add(500*time.Millisecond)))

	for {
		var msg Message
		if err := oldClient.ReadJSON(&msg); err != nil {
			break
		}

		assert.NotEqual(t, "DATA", msg.Type, "the replaced client must not get the output")
	}
}

// TestTerminalDrainFailureKeepsUnsentOutput checks that output a drain could not
// write to a client that is gone is kept for the next client to attach, ahead of
// output the cluster reader buffered after its own send to that client failed.
func TestTerminalDrainFailureKeepsUnsentOutput(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	path := "/api/v1/namespaces/default/pods/test-pod/attach"
	frame := func(data string) BufferedMessage {
		return BufferedMessage{Type: websocket.BinaryMessage, Data: []byte(data)}
	}
	buffered := func(conn *Connection) []string {
		conn.mu.RLock()
		defer conn.mu.RUnlock()

		data := make([]string, 0, len(conn.Buffer))
		for _, bm := range conn.Buffer {
			data = append(data, string(bm.Data))
		}

		return data
	}

	client, server := createTestWebSocketConnection()
	server.Close()
	require.NoError(t, client.Close())

	conn := m.createConnection("test-cluster", "test-user", path, "", nil, nil)
	conn.isFlushing = true
	conn.Buffer = []BufferedMessage{frame("first"), frame("second")}

	assert.False(t, m.drainBufferedMessages(conn, client))
	assert.Equal(t, []string{"first", "second"}, buffered(conn))

	conn.mu.RLock()
	assert.Nil(t, conn.Client)
	assert.Nil(t, conn.drained, "the session must be free for the next client")
	assert.NotNil(t, conn.cleanupTimer, "the session must expire if no client attaches")
	conn.mu.RUnlock()

	// The reader's send failed first and detached the client, buffering its frame.
	raced := m.createConnection("test-cluster", "test-user", path, "", nil, nil)
	raced.Buffer = []BufferedMessage{frame("later")}

	m.handleTerminalDrainFailure(raced, []BufferedMessage{frame("first"), frame("second")})
	assert.Equal(t, []string{"first", "second", "later"}, buffered(raced))
}

// TestTerminalCloseRequiresOwner checks that only the owner of a terminal session
// can close it, as only the owner can reattach to it.
func TestTerminalCloseRequiresOwner(t *testing.T) {
	m, url := newTerminalMultiplexer(t)

	owner := newTerminalClientWithToken(t, url, "owner-token")
	owner.send("\x00hi")
	assert.True(t, owner.next().Binary)

	connKey := m.createConnectionKey(owner.msg.ClusterID, owner.msg.Path, owner.msg.UserID, owner.msg.Query)
	cached := func() bool {
		m.mutex.RLock()
		defer m.mutex.RUnlock()

		_, ok := m.connections[connKey]

		return ok
	}

	other := newTerminalClientWithToken(t, url, "other-token")
	assert.Equal(t, "ERROR", other.next().Type, "another user must not attach")

	closeMsg := other.msg
	closeMsg.Type = "CLOSE"
	require.NoError(t, other.conn.WriteJSON(closeMsg))
	assert.Equal(t, "ERROR", other.next().Type)
	assert.True(t, cached(), "another user must not close the session")

	require.NoError(t, owner.conn.WriteJSON(closeMsg))
	assert.Eventually(t, func() bool { return !cached() }, 2*time.Second, 10*time.Millisecond)
}

// TestTerminalReattachAfterTokenRefresh checks that the owner can still reattach
// after their token was refreshed, as the API server identifies the new token as
// the same user, while another user still cannot.
func TestTerminalReattachAfterTokenRefresh(t *testing.T) {
	_, url := newTerminalMultiplexer(t)

	owner := newTerminalClientWithToken(t, url, "alice-1")
	owner.send("\x00hi")
	assert.True(t, owner.next().Binary)
	require.NoError(t, owner.conn.Close())

	other := newTerminalClientWithToken(t, url, "bob")
	assert.Equal(t, "ERROR", other.next().Type, "another user must not attach")

	refreshed := newTerminalClientWithToken(t, url, "alice-2")
	refreshed.send("\x00again")

	output := refreshed.next()
	require.True(t, output.Binary, "the owner must be able to reattach with a refreshed token")

	data, err := base64.StdEncoding.DecodeString(output.Data)
	require.NoError(t, err)
	assert.Equal(t, "\x00again", string(data))
}

// TestClientWritesTimeOut checks that a write to a client that stopped reading,
// e.g. after its network dropped, fails after a while instead of blocking the
// session for as long as TCP takes to give up.
func TestClientWritesTimeOut(t *testing.T) { //nolint:funlen // Timeout and close checks.
	original := clientWriteTimeout
	clientWriteTimeout = 200 * time.Millisecond

	t.Cleanup(func() { clientWriteTimeout = original })

	stop := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = c.Close() }()

		<-stop // Never read.
	}))

	defer server.Close()
	defer close(stop)

	conn, resp, err := newTestDialer().Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	// Close the socket itself, which unblocks a write still waiting, rather than through
	// the lock that write holds.
	defer func() { _ = conn.Close() }()

	client := NewWSConnLock(conn)

	failed := make(chan error, 1)

	go func() {
		chunk := make([]byte, 64*1024)

		for {
			if err := client.WriteMessage(websocket.BinaryMessage, chunk); err != nil {
				failed <- err
				return
			}
		}
	}()

	select {
	case err := <-failed:
		assert.Error(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("a write to a client that stopped reading must not block indefinitely")
	}

	// Writes cannot recover from a timeout, so the connection must be closed. That
	// ends its read loop, so the session is cleaned up and the client reconnects.
	readDone := make(chan error, 1)

	go func() {
		_, _, err := conn.ReadMessage()
		readDone <- err
	}()

	select {
	case err := <-readDone:
		assert.Error(t, err)
	case <-time.After(5 * time.Second):
		t.Fatal("a client whose write timed out must be closed")
	}
}

// TestMultiplexerExecCredentialPluginProcess is the exec credential plugin of
// TestDialWebSocketRetriesAfterExecCredentialRefresh. It prints the token in the
// file the test names.
func TestMultiplexerExecCredentialPluginProcess(_ *testing.T) {
	if os.Getenv("HEADLAMP_MULTIPLEXER_EXEC_CREDENTIAL_HELPER") != "true" {
		return
	}

	//nolint:gosec // The test controls the temporary credential path.
	token, err := os.ReadFile(os.Getenv("HEADLAMP_MULTIPLEXER_EXEC_CREDENTIAL_TOKEN_FILE"))
	if err != nil {
		os.Exit(1)
	}

	_, _ = fmt.Fprintf(os.Stdout,
		`{"apiVersion":"client.authentication.k8s.io/v1","kind":"ExecCredential","status":{"token":%q}}`,
		strings.TrimSpace(string(token)))

	os.Exit(0)
}

// TestDialWebSocketRetriesAfterExecCredentialRefresh checks that a dial that the
// API server rejects with an exec plugin's expired credential is retried with a
// refreshed one, as the cluster proxy does.
func TestDialWebSocketRetriesAfterExecCredentialRefresh(t *testing.T) {
	tokenFile := filepath.Join(t.TempDir(), "token")
	require.NoError(t, os.WriteFile(tokenFile, []byte("token-one"), 0o600))

	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "Bearer token-one" {
			require.NoError(t, os.WriteFile(tokenFile, []byte("token-two"), 0o600))
			w.WriteHeader(http.StatusUnauthorized)

			return
		}

		assert.Equal(t, "Bearer token-two", r.Header.Get("Authorization"))

		upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		_ = c.Close()
	}))
	defer server.Close()

	config := insecureTestConfig(server.URL)
	config.ExecProvider = &api.ExecConfig{
		APIVersion:      "client.authentication.k8s.io/v1",
		Command:         os.Args[0],
		Args:            []string{"-test.run=TestMultiplexerExecCredentialPluginProcess"},
		InteractiveMode: api.NeverExecInteractiveMode,
		Env: []api.ExecEnvVar{
			{Name: "HEADLAMP_MULTIPLEXER_EXEC_CREDENTIAL_HELPER", Value: "true"},
			{Name: "HEADLAMP_MULTIPLEXER_EXEC_CREDENTIAL_TOKEN_FILE", Value: tokenFile},
		},
	}

	conn, err := NewMultiplexer(kubeconfig.NewContextStore(), false).dialWebSocket(
		"wss"+strings.TrimPrefix(server.URL, "https")+"/api/v1/pods?watch=1", config, nil)
	require.NoError(t, err, "the dial must be retried with the refreshed credential")
	require.NoError(t, conn.Close())
}
