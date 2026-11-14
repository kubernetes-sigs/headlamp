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
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
	//nolint:gosec // Test server uses self-signed TLS certificates
	conn, err := m.dialWebSocket(wsURL, &tls.Config{InsecureSkipVerify: true}, server.URL, nil)

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
	//nolint:gosec // Test server uses self-signed TLS certificates
	conn, err := m.dialWebSocket(wsURL, &tls.Config{InsecureSkipVerify: true}, server.URL, &token)
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
	tlsConfig := &tls.Config{InsecureSkipVerify: true} //nolint:gosec // Test server uses self-signed TLS certificates

	ws, err := m.dialWebSocket("invalid-url", tlsConfig, "", nil)
	assert.Error(t, err)
	assert.Nil(t, ws)

	// Test unreachable URL
	ws, err = m.dialWebSocket("ws://localhost:12345", tlsConfig, "", nil)
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
	tlsConfig := &tls.Config{InsecureSkipVerify: true} //nolint:gosec // Test server uses self-signed TLS certificates

	// This should fail with a "bad handshake" error and log the response
	ws, err := m.dialWebSocket(wsURL, tlsConfig, "", nil)

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
	tlsConfig := &tls.Config{InsecureSkipVerify: true} //nolint:gosec // Test server uses self-signed TLS certificates

	ws, err := m.dialWebSocket(wsURL, tlsConfig, "", nil)
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
		m.handleClusterMessages(conn, clientConn)
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

func TestCalculateBackoff_Progression(t *testing.T) {
	baseDelay := 1 * time.Second
	maxDelay := 60 * time.Second

	tests := []struct {
		name     string
		attempt  int
		expected time.Duration
	}{
		{name: "negative attempt defaults to base", attempt: -1, expected: 1 * time.Second},
		{name: "attempt 0 equals base delay", attempt: 0, expected: 1 * time.Second},
		{name: "attempt 1 doubles", attempt: 1, expected: 2 * time.Second},
		{name: "attempt 2 quadruples", attempt: 2, expected: 4 * time.Second},
		{name: "attempt 3 octuples", attempt: 3, expected: 8 * time.Second},
		{name: "attempt 4 multiplies by 16", attempt: 4, expected: 16 * time.Second},
		{name: "attempt 5 multiplies by 32", attempt: 5, expected: 32 * time.Second},
		{name: "attempt 6 caps at maxDelay", attempt: 6, expected: 60 * time.Second},
		{name: "attempt 10 caps at maxDelay", attempt: 10, expected: 60 * time.Second},
		{name: "large attempt count (100) caps at maxDelay", attempt: 100, expected: 60 * time.Second},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := calculateBackoff(tt.attempt, baseDelay, maxDelay, 0, nil)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestCalculateBackoff_ProductionSequence(t *testing.T) {
	zeroJitter := float64(0)
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	m.backoffJitterFactor = &zeroJitter

	expectedSequence := []struct {
		attempt  int
		expected time.Duration
	}{
		{attempt: 0, expected: 30 * time.Second},
		{attempt: 1, expected: 60 * time.Second},
		{attempt: 2, expected: 2 * time.Minute},
		{attempt: 3, expected: 2 * time.Minute},
		{attempt: 4, expected: 2 * time.Minute},
		{attempt: 10, expected: 2 * time.Minute},
	}

	for _, tc := range expectedSequence {
		delay := m.nextReconnectDelay(tc.attempt)

		assert.Equal(t, tc.expected, delay, "attempt %d delay mismatch", tc.attempt)
	}
}

func TestCalculateBackoff_JitterBounds(t *testing.T) {
	baseDelay := 10 * time.Second
	maxDelay := 100 * time.Second
	jitterFactor := 0.2

	// Fixed maximum positive jitter (+20%)
	resultMax := calculateBackoff(1, baseDelay, maxDelay, jitterFactor, func() float64 { return 1.0 })
	assert.Equal(t, 24*time.Second, resultMax) // 20s * 1.2 = 24s

	// Fixed maximum negative jitter (-20%)
	resultMin := calculateBackoff(1, baseDelay, maxDelay, jitterFactor, func() float64 { return -1.0 })
	assert.Equal(t, 16*time.Second, resultMin) // 20s * 0.8 = 16s

	// Zero jitter
	resultZero := calculateBackoff(1, baseDelay, maxDelay, jitterFactor, func() float64 { return 0.0 })
	assert.Equal(t, 20*time.Second, resultZero)

	// Random jitter bounds over 50 iterations
	for i := 0; i < 50; i++ {
		res := calculateBackoff(1, baseDelay, maxDelay, jitterFactor, defaultBackoffJitter)
		assert.GreaterOrEqual(t, res, 16*time.Second)
		assert.LessOrEqual(t, res, 24*time.Second)
	}
}

func TestMonitorConnection_CancellationDuringBackoff(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	// Configure an unreachable cluster server to ensure reconnect fails
	err := store.AddContext(&kubeconfig.Context{
		Name: "unreachable-cluster",
		Cluster: &api.Cluster{
			Server: "https://127.0.0.1:1", // closed port
		},
	})
	require.NoError(t, err)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	conn := m.createConnection("unreachable-cluster", "test-user", "/api/v1/pods", "", clientConn, nil)
	conn.Status.State = StateError // In error state so it enters reconnect backoff

	// Configure test timing: short initial tick so reconnect failure occurs quickly,
	// followed by a long backoff (10m).
	m.heartbeatInterval = 10 * time.Millisecond
	m.minReconnectBackoff = 10 * time.Minute
	m.maxReconnectBackoff = 30 * time.Minute

	backoffScheduled := make(chan struct{})

	var signalOnce sync.Once

	m.backoffScheduledFunc = func(attempt int, delay time.Duration) {
		signalOnce.Do(func() {
			close(backoffScheduled)
		})
	}

	done := make(chan struct{})

	go func() {
		m.monitorConnection(conn)
		close(done)
	}()

	// Wait for reconnect failure and backoff timer to be scheduled
	select {
	case <-backoffScheduled:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for reconnect backoff to be scheduled")
	}

	// Close conn.Done to verify cancellation responsiveness during backoff
	close(conn.Done)

	// monitorConnection must exit promptly, NOT waiting for the 10-minute backoff
	select {
	case <-done:
		assert.Equal(t, StateClosed, conn.Status.State)
	case <-time.After(2 * time.Second):
		t.Fatal("monitorConnection did not exit promptly upon conn.Done closure during backoff")
	}
}

func setupLiveTestConnectionWithBackoff(
	t *testing.T,
	clusterURL string,
	clientConn *WSConnLock,
	maxBackoff time.Duration,
) (*Multiplexer, *Connection) {
	t.Helper()

	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "test-cluster",
		Cluster: &api.Cluster{
			Server:                clusterURL,
			InsecureSkipTLSVerify: true,
		},
	}))

	zeroJitter := float64(0)
	m.heartbeatInterval = 10 * time.Millisecond
	m.minReconnectBackoff = 20 * time.Millisecond
	m.maxReconnectBackoff = maxBackoff
	m.backoffJitterFactor = &zeroJitter

	conn, err := m.createClusterConnection(
		"test-cluster",
		"test-user",
		"/api/v1/pods",
		"",
		clientConn,
		nil,
	)
	require.NoError(t, err)
	require.NotNil(t, conn.WSConn)
	require.Equal(t, StateConnected, conn.Status.State)

	m.mutex.Lock()
	connKey := m.createConnectionKey("test-cluster", "/api/v1/pods", "test-user")
	m.connections[connKey] = conn
	m.mutex.Unlock()

	return m, conn
}

func createCapturingUpgradeServer(
	serverFail *atomic.Bool,
	upgrades *atomic.Int32,
) (*httptest.Server, <-chan *websocket.Conn) {
	serverSockets := make(chan *websocket.Conn, 10)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if serverFail.Load() {
			http.Error(w, "server error", http.StatusInternalServerError)

			return
		}

		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		}

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		upgrades.Add(1)

		select {
		case serverSockets <- ws:
		default:
			_ = ws.Close()
		}
	}))

	return server, serverSockets
}

func TestMonitorConnection_ReconnectFailureAppliesBackoff(t *testing.T) {
	var (
		serverFail atomic.Bool
		upgrades   atomic.Int32
	)

	server, _ := createCapturingUpgradeServer(&serverFail, &upgrades)
	defer server.Close()

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	m, conn := setupLiveTestConnectionWithBackoff(t, server.URL, clientConn, 100*time.Millisecond)
	backoffEvents := make(chan backoffEvent, 10)

	m.backoffScheduledFunc = func(attempt int, delay time.Duration) {
		backoffEvents <- backoffEvent{attempt: attempt, delay: delay}
	}

	readerDone := make(chan struct{})

	go func() {
		m.handleClusterMessages(conn, clientConn)
		close(readerDone)
	}()

	done := make(chan struct{})

	go func() {
		m.monitorConnection(conn)
		close(done)
	}()

	// Break connection and make subsequent reconnect attempts fail
	serverFail.Store(true)

	_ = conn.WSConn.Close()

	// Verify the reader exits cleanly upon read failure without aborting the monitor
	select {
	case <-readerDone:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for reader to exit after connection break")
	}

	expectedDelays := []time.Duration{
		20 * time.Millisecond,
		40 * time.Millisecond,
		80 * time.Millisecond,
		100 * time.Millisecond,
		100 * time.Millisecond,
	}

	// Verify reported backoff events match the expected progression
	assertBackoffSequence(t, backoffEvents, expectedDelays...)

	cleanUpTestConnection(t, done, conn)
}

type backoffEvent struct {
	attempt int
	delay   time.Duration
}

func assertBackoffEvent(t *testing.T, ch <-chan backoffEvent, expectedAttempt int, expectedDelay time.Duration) {
	t.Helper()

	select {
	case ev := <-ch:
		assert.Equal(t, expectedAttempt, ev.attempt)
		assert.Equal(t, expectedDelay, ev.delay)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for backoff event")
	}
}

func assertBackoffSequence(t *testing.T, ch <-chan backoffEvent, expectedDelays ...time.Duration) {
	t.Helper()

	for i, expected := range expectedDelays {
		assertBackoffEvent(t, ch, i, expected)
	}
}

func cleanUpTestConnection(t *testing.T, done <-chan struct{}, conns ...*Connection) {
	t.Helper()

	for _, c := range conns {
		if c != nil && c.Done != nil {
			select {
			case <-c.Done:
			default:
				close(c.Done)
			}
		}
	}

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("monitorConnection did not exit promptly after done channel closure")
	}
}

func setupTestMultiplexerWithBackoff(
	t *testing.T,
	clusterURL string,
	clientConn *WSConnLock,
) (*Multiplexer, *Connection) {
	t.Helper()

	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "test-cluster",
		Cluster: &api.Cluster{
			Server:                clusterURL,
			InsecureSkipTLSVerify: true,
		},
	}))

	conn := m.createConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn, nil)
	conn.Status.State = StateError

	zeroJitter := float64(0)
	m.heartbeatInterval = 10 * time.Millisecond
	m.minReconnectBackoff = 20 * time.Millisecond
	m.maxReconnectBackoff = 200 * time.Millisecond
	m.backoffJitterFactor = &zeroJitter

	return m, conn
}

func awaitClusterConnection(
	t *testing.T,
	m *Multiplexer,
	upgrades *atomic.Int32,
	clusterID, path, userID string,
) *Connection {
	t.Helper()

	connKey := m.createConnectionKey(clusterID, path, userID)

	require.Eventually(t, func() bool {
		m.mutex.RLock()
		defer m.mutex.RUnlock()

		return m.connections[connKey] != nil && upgrades.Load() > 0
	}, 2*time.Second, 5*time.Millisecond)

	m.mutex.RLock()
	activeConn := m.connections[connKey]
	m.mutex.RUnlock()

	return activeConn
}

type synchronizedBackoffTracker struct {
	firstBackoff   chan backoffEvent
	secondBackoff  chan backoffEvent
	recoverySignal chan struct{}
}

func setupSynchronizedBackoff(m *Multiplexer) *synchronizedBackoffTracker {
	tracker := &synchronizedBackoffTracker{
		firstBackoff:   make(chan backoffEvent, 1),
		secondBackoff:  make(chan backoffEvent, 1),
		recoverySignal: make(chan struct{}),
	}

	var firstOnce sync.Once

	m.backoffScheduledFunc = func(attempt int, delay time.Duration) {
		var isFirst bool

		firstOnce.Do(func() {
			isFirst = true

			tracker.firstBackoff <- backoffEvent{attempt: attempt, delay: delay}

			<-tracker.recoverySignal
		})

		if !isFirst {
			select {
			case tracker.secondBackoff <- backoffEvent{attempt: attempt, delay: delay}:
			default:
			}
		}
	}

	return tracker
}

func TestMonitorConnection_ResetBackoffOnSuccess(t *testing.T) {
	var (
		serverFail atomic.Bool
		upgrades   atomic.Int32
	)

	server, _ := createCapturingUpgradeServer(&serverFail, &upgrades)
	defer server.Close()

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	m, conn := setupTestMultiplexerWithBackoff(t, server.URL, clientConn)
	tracker := setupSynchronizedBackoff(m)

	defer func() {
		select {
		case <-tracker.recoverySignal:
		default:
			close(tracker.recoverySignal)
		}
	}()

	// 1. Initial reconnect fails -> triggers backoff attempt 0
	serverFail.Store(true)

	done := make(chan struct{})

	go func() {
		m.monitorConnection(conn)
		close(done)
	}()

	// Ensure the first failure event is definitely recorded before recovery
	assertBackoffEvent(t, tracker.firstBackoff, 0, 20*time.Millisecond)

	// Explicitly synchronize recovery flag update with the first backoff callback
	serverFail.Store(false)
	close(tracker.recoverySignal)

	// 2. Await recovery
	activeConn := awaitClusterConnection(t, m, &upgrades, "test-cluster", "/api/v1/pods", "test-user")

	// 3. Drop connection and fail server again to verify backoff was reset to 0
	serverFail.Store(true)

	if activeConn != nil && activeConn.WSConn != nil {
		_ = activeConn.WSConn.Close()
	}

	// Verify using secondBackoff channel to prevent any stale events from being consumed
	assertBackoffEvent(t, tracker.secondBackoff, 0, 20*time.Millisecond)

	cleanUpTestConnection(t, done, conn, activeConn)
}

func TestMonitorConnection_ReconnectRestartsMessageReader(t *testing.T) {
	var (
		serverFail atomic.Bool
		upgrades   atomic.Int32
	)

	server, serverSockets := createCapturingUpgradeServer(&serverFail, &upgrades)
	defer server.Close()

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	m, conn := setupLiveTestConnectionWithBackoff(t, server.URL, clientConn, 200*time.Millisecond)

	srvWs1 := awaitServerSocket(t, serverSockets, "first server socket upgrade")

	go m.handleClusterMessages(conn, clientConn)

	done := make(chan struct{})

	go func() {
		m.monitorConnection(conn)
		close(done)
	}()

	verifyClusterMessageForwarded(t, srvWs1, clientConn, "1")

	_ = srvWs1.Close()

	srvWs2 := awaitServerSocket(t, serverSockets, "second server socket upgrade after reconnect")

	connKey := m.createConnectionKey("test-cluster", "/api/v1/pods", "test-user")

	var activeConn *Connection

	require.Eventually(t, func() bool {
		m.mutex.RLock()
		defer m.mutex.RUnlock()

		c := m.connections[connKey]
		if c != nil && c != conn {
			activeConn = c

			return true
		}

		return false
	}, 2*time.Second, 5*time.Millisecond)

	verifyClusterMessageForwarded(t, srvWs2, clientConn, "2")

	cleanUpTestConnection(t, done, conn, activeConn)

	_ = srvWs2.Close()
}

func awaitServerSocket(t *testing.T, ch <-chan *websocket.Conn, desc string) *websocket.Conn {
	t.Helper()

	select {
	case ws := <-ch:
		return ws
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for %s", desc)

		return nil
	}
}

func verifyClusterMessageForwarded(
	t *testing.T,
	srvWs *websocket.Conn,
	clientConn *WSConnLock,
	resourceVersion string,
) {
	t.Helper()

	testMsg := []byte(fmt.Sprintf(`{"metadata":{"resourceVersion":"%s"},"kind":"Pod","apiVersion":"v1"}`, resourceVersion))
	require.NoError(t, srvWs.WriteMessage(websocket.TextMessage, testMsg))

	require.NoError(t, clientConn.conn.SetReadDeadline(time.Now().Add(2*time.Second)))
	defer func() {
		_ = clientConn.conn.SetReadDeadline(time.Time{})
	}()

	for {
		var clientMsg Message
		require.NoError(t, clientConn.ReadJSON(&clientMsg), "timed out or failed waiting for cluster DATA frame")

		switch clientMsg.Type {
		case "STATUS", "COMPLETE":
			// Discard control frames preceding or interspersed with the cluster data
			continue
		case "DATA":
			require.Equal(t, "DATA", clientMsg.Type)
			require.Equal(t, "/api/v1/pods", clientMsg.Path)
			require.Equal(t, "test-cluster", clientMsg.ClusterID)
			require.Contains(t, clientMsg.Data, fmt.Sprintf(`"resourceVersion":"%s"`, resourceVersion))

			return
		default:
			t.Fatalf("unexpected message type received: %s", clientMsg.Type)
		}
	}
}

func TestHandleClusterMessages_StateClosedNotOverwrittenByStateError(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	wsConn, wsServer := createTestWebSocketConnection()
	defer wsServer.Close()

	conn := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn)
	conn.WSConn = wsConn.conn

	conn.mu.Lock()
	conn.Status.State = StateClosed
	conn.mu.Unlock()

	_ = wsConn.Close()

	m.handleClusterMessages(conn, clientConn)

	conn.mu.RLock()
	finalState := conn.Status.State
	conn.mu.RUnlock()

	assert.Equal(t, StateClosed, finalState,
		"handleClusterMessages defer must not overwrite StateClosed with StateError")
}

func TestHandleClusterMessages_ClosesUpstreamSocketOnReaderExit(t *testing.T) {
	var (
		serverFail atomic.Bool
		upgrades   atomic.Int32
	)

	server, serverSockets := createCapturingUpgradeServer(&serverFail, &upgrades)
	defer server.Close()

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	m, conn := setupLiveTestConnectionWithBackoff(t, server.URL, clientConn, 200*time.Millisecond)
	srvWs := awaitServerSocket(t, serverSockets, "server socket upgrade")

	// Close the server side to simulate upstream peer termination
	_ = srvWs.Close()

	m.handleClusterMessages(conn, clientConn)

	assert.Error(t, conn.WSConn.WriteMessage(websocket.PingMessage, nil),
		"upstream socket must be closed when reader exits")

	conn.mu.RLock()
	state := conn.Status.State
	conn.mu.RUnlock()
	assert.Equal(t, StateError, state, "status must be StateError upon reader exit")

	select {
	case <-conn.Done:
		t.Fatal("conn.Done must remain open so monitorConnection can reconnect")
	default:
	}
}

func TestHandleClusterMessages_OldReaderDoesNotCloseReplacementConnection(t *testing.T) {
	var (
		serverFail atomic.Bool
		upgrades   atomic.Int32
	)

	server, serverSockets := createCapturingUpgradeServer(&serverFail, &upgrades)
	defer server.Close()

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	m, oldConn := setupLiveTestConnectionWithBackoff(t, server.URL, clientConn, 200*time.Millisecond)
	oldSrvWs := awaitServerSocket(t, serverSockets, "old server socket upgrade")

	newConn, err := m.createClusterConnection(
		"test-cluster",
		"test-user",
		"/api/v1/pods",
		"",
		clientConn,
		nil,
	)
	require.NoError(t, err)

	newSrvWs := awaitServerSocket(t, serverSockets, "new server socket upgrade")
	defer func() { _ = newSrvWs.Close() }()

	connKey := m.createConnectionKey("test-cluster", "/api/v1/pods", "test-user")
	m.mutex.Lock()
	m.connections[connKey] = newConn
	m.mutex.Unlock()

	_ = oldSrvWs.Close()

	m.handleClusterMessages(oldConn, clientConn)

	assert.Error(t, oldConn.WSConn.WriteMessage(websocket.PingMessage, nil),
		"old socket must be closed")

	m.mutex.RLock()
	activeConn := m.connections[connKey]
	m.mutex.RUnlock()

	assert.Equal(t, newConn, activeConn, "replacement connection must remain in map")

	assert.NoError(t, newConn.WSConn.WriteMessage(websocket.PingMessage, nil),
		"replacement socket must remain open and unaffected by old reader exit")

	newConn.mu.RLock()
	newState := newConn.Status.State
	newConn.mu.RUnlock()
	assert.Equal(t, StateConnected, newState, "replacement connection state must be unaffected")

	newConn.safeClose()
}

func TestUpdateStatusIfNotClosed_DeterministicOrderings(t *testing.T) {
	clientConn1, clientServer1 := createTestWebSocketConnection()
	defer clientServer1.Close()

	conn1 := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn1)

	// Case 1: Rejects update when closed or state is StateClosed
	conn1.updateStatus(StateClosed, nil)
	conn1.safeClose()

	assert.False(t, conn1.updateStatusIfNotClosed(StateError, fmt.Errorf("test error")))

	conn1.mu.RLock()
	assert.Equal(t, StateClosed, conn1.Status.State)
	conn1.mu.RUnlock()

	conn1.mu.Lock()
	conn1.Status.State = StateConnected
	conn1.closed = true
	conn1.mu.Unlock()

	assert.False(t, conn1.updateStatusIfNotClosed(StateConnecting, nil))

	// Case 2: updateStatusIfNotClosed succeeds on open connection before close
	clientConn2, clientServer2 := createTestWebSocketConnection()
	defer clientServer2.Close()

	conn2 := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn2)

	assert.True(t, conn2.updateStatusIfNotClosed(StateError, nil))

	conn2.mu.RLock()
	assert.Equal(t, StateError, conn2.Status.State)
	conn2.mu.RUnlock()

	conn2.updateStatus(StateClosed, nil)
	conn2.safeClose()

	conn2.mu.RLock()
	assert.Equal(t, StateClosed, conn2.Status.State)
	conn2.mu.RUnlock()
}

func TestUpdateStatusIfNotClosed_ConcurrentWithClose(t *testing.T) {
	for i := 0; i < 50; i++ {
		clientConn, clientServer := createTestWebSocketConnection()

		conn := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn)

		start := make(chan struct{})

		var wg sync.WaitGroup

		wg.Add(2)

		go func() {
			defer wg.Done()

			<-start

			conn.updateStatus(StateClosed, nil)
			conn.safeClose()
		}()

		go func() {
			defer wg.Done()

			<-start

			_ = conn.updateStatusIfNotClosed(StateError, nil)
		}()

		close(start)
		wg.Wait()

		conn.mu.RLock()
		finalState := conn.Status.State
		conn.mu.RUnlock()

		assert.Equal(t, StateClosed, finalState, "StateClosed must never be overwritten by StateError")
		clientServer.Close()
	}
}

func createGatedUpgradeServer(
	upgradeArrived chan<- struct{},
	releaseUpgrade <-chan struct{},
	receivedTokens ...chan<- string,
) (*httptest.Server, <-chan *websocket.Conn) {
	serverSockets := make(chan *websocket.Conn, 1)

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(receivedTokens) > 0 && receivedTokens[0] != nil {
			token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")

			select {
			case receivedTokens[0] <- token:
			default:
			}
		}

		select {
		case upgradeArrived <- struct{}{}:
		default:
		}

		<-releaseUpgrade

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		serverSockets <- ws
	}))

	return server, serverSockets
}

func closeReleaseUpgrade(releaseUpgrade chan struct{}) {
	select {
	case <-releaseUpgrade:
	default:
		close(releaseUpgrade)
	}
}

type reconnectResult struct {
	newConn *Connection
	err     error
}

func startAsyncReconnect(m *Multiplexer, conn *Connection) <-chan reconnectResult {
	resultCh := make(chan reconnectResult, 1)

	go func() {
		newConn, err := m.reconnect(conn)
		resultCh <- reconnectResult{newConn: newConn, err: err}
	}()

	return resultCh
}

func assertReplacementServerSocketClosed(t *testing.T, serverSockets <-chan *websocket.Conn) {
	t.Helper()

	select {
	case srvWs := <-serverSockets:
		defer func() {
			_ = srvWs.Close()
		}()

		_ = srvWs.SetReadDeadline(time.Now().Add(2 * time.Second))
		_, _, readErr := srvWs.ReadMessage()
		assert.Error(t, readErr, "replacement server socket must be closed when newConn is closed")
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for server socket")
	}
}

func assertConnectionClosedState(t *testing.T, conn *Connection) {
	t.Helper()

	conn.mu.RLock()
	defer conn.mu.RUnlock()

	assert.Nil(t, conn.Client)
	assert.Equal(t, StateClosed, conn.Status.State)
}

func assertReconnectClosedResult(t *testing.T, resultCh <-chan reconnectResult) {
	t.Helper()

	var res reconnectResult
	select {
	case res = <-resultCh:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for reconnect to complete")
	}

	require.Error(t, res.err)
	assert.Contains(t, res.err.Error(), "connection was closed during reconnect")
	assert.Nil(t, res.newConn)
}

func TestReconnect_ClosedConnectionDoesNotLeak(t *testing.T) {
	upgradeArrived := make(chan struct{}, 1)
	releaseUpgrade := make(chan struct{})

	defer closeReleaseUpgrade(releaseUpgrade)

	server, serverSockets := createGatedUpgradeServer(upgradeArrived, releaseUpgrade)
	defer server.Close()

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	m, conn := setupTestMultiplexerWithBackoff(t, server.URL, clientConn)
	connKey := m.createConnectionKey("test-cluster", "/api/v1/pods", "test-user")

	m.mutex.Lock()
	m.connections[connKey] = conn
	m.mutex.Unlock()

	resultCh := startAsyncReconnect(m, conn)

	select {
	case <-upgradeArrived:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for reconnect upgrade request to arrive at server")
	}

	// Close original connection through client disconnect while reconnect is in flight
	m.closeClientConnections(clientConn)

	// Release upgrade so createClusterConnection completes
	close(releaseUpgrade)

	assertReconnectClosedResult(t, resultCh)

	assert.True(t, conn.IsClosed(), "original connection must be closed")
	assertConnectionClosedState(t, conn)

	m.mutex.RLock()
	assert.Nil(t, m.connections[connKey], "replacement connection must not be registered in map")
	m.mutex.RUnlock()

	assertReplacementServerSocketClosed(t, serverSockets)
}

func TestReconnect_RejectsNilClientOrClosedConnection(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, false)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	// 1. Connection with conn.closed = true
	conn1 := m.createConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn, nil)

	conn1.mu.Lock()
	conn1.closed = true
	conn1.mu.Unlock()

	newConn1, err1 := m.reconnect(conn1)
	assert.Error(t, err1)
	assert.Nil(t, newConn1)
	assert.Contains(t, err1.Error(), "cannot reconnect closed connection")

	// 2. Connection with conn.Client = nil (disconnected)
	conn2 := m.createConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn, nil)

	conn2.mu.Lock()
	conn2.Client = nil
	conn2.mu.Unlock()

	newConn2, err2 := m.reconnect(conn2)
	assert.Error(t, err2)
	assert.Nil(t, newConn2)
	assert.Contains(t, err2.Error(), "cannot reconnect closed connection")

	// 3. Connection safely closed via safeClose()
	conn3 := m.createConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn, nil)
	conn3.safeClose()

	newConn3, err3 := m.reconnect(conn3)
	assert.Error(t, err3)
	assert.Nil(t, newConn3)
	assert.Contains(t, err3.Error(), "cannot reconnect closed connection")
}

func TestReconnect_RejectsWhenClientModifiedDuringReconnect(t *testing.T) {
	upgradeArrived := make(chan struct{}, 1)
	releaseUpgrade := make(chan struct{})

	defer closeReleaseUpgrade(releaseUpgrade)

	server, serverSockets := createGatedUpgradeServer(upgradeArrived, releaseUpgrade)
	defer server.Close()

	clientConn1, clientServer1 := createTestWebSocketConnection()
	defer clientServer1.Close()

	clientConn2, clientServer2 := createTestWebSocketConnection()
	defer clientServer2.Close()

	m, conn := setupTestMultiplexerWithBackoff(t, server.URL, clientConn1)
	connKey := m.createConnectionKey("test-cluster", "/api/v1/pods", "test-user")

	m.mutex.Lock()
	m.connections[connKey] = conn
	m.mutex.Unlock()

	resultCh := startAsyncReconnect(m, conn)

	select {
	case <-upgradeArrived:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for reconnect upgrade request to arrive at server")
	}

	// Change conn.Client while reconnect is in flight
	conn.mu.Lock()
	conn.Client = clientConn2
	conn.mu.Unlock()

	// Release upgrade so createClusterConnection completes
	close(releaseUpgrade)

	assertReconnectClosedResult(t, resultCh)

	m.mutex.RLock()
	assert.Equal(t, conn, m.connections[connKey], "map must still retain original connection and not register replacement")
	m.mutex.RUnlock()

	assertReplacementServerSocketClosed(t, serverSockets)
	conn.safeClose()
}

func TestConnection_ReconnectSnapshot(t *testing.T) {
	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	token := "test-token"
	conn := &Connection{
		Client: clientConn,
		Token:  &token,
	}

	// 1. Active connection
	c, tok := conn.reconnectSnapshot()
	assert.Equal(t, clientConn, c)
	require.NotNil(t, tok)
	assert.Equal(t, "test-token", *tok)

	// 2. Closed connection
	conn.mu.Lock()
	conn.closed = true
	conn.mu.Unlock()

	c, tok = conn.reconnectSnapshot()
	assert.Nil(t, c)
	assert.Nil(t, tok)

	// 3. Connection with nil client
	conn.mu.Lock()
	conn.closed = false
	conn.Client = nil
	conn.mu.Unlock()

	c, tok = conn.reconnectSnapshot()
	assert.Nil(t, c)
	assert.Nil(t, tok)

	// 4. Nil connection receiver
	var nilConn *Connection

	c, tok = nilConn.reconnectSnapshot()
	assert.Nil(t, c)
	assert.Nil(t, tok)
}

func awaitSuccessfulReconnect(t *testing.T, resultCh <-chan reconnectResult) *Connection {
	t.Helper()

	var res reconnectResult
	select {
	case res = <-resultCh:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for reconnect to complete")
	}

	require.NoError(t, res.err)
	require.NotNil(t, res.newConn)

	return res.newConn
}

func awaitReceivedToken(t *testing.T, receivedTokens <-chan string) string {
	t.Helper()

	select {
	case receivedToken := <-receivedTokens:
		return receivedToken
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for upgrade request token")

		return ""
	}
}

func closeServerSocket(t *testing.T, serverSockets <-chan *websocket.Conn) {
	t.Helper()

	select {
	case srvWs := <-serverSockets:
		_ = srvWs.Close()
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for server socket")
	}
}

func TestReconnect_TokenSnapshotRace(t *testing.T) {
	upgradeArrived := make(chan struct{}, 1)
	releaseUpgrade := make(chan struct{})
	receivedTokens := make(chan string, 1)

	defer closeReleaseUpgrade(releaseUpgrade)

	server, serverSockets := createGatedUpgradeServer(upgradeArrived, releaseUpgrade, receivedTokens)
	defer server.Close()

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	m, conn := setupTestMultiplexerWithBackoff(t, server.URL, clientConn)
	connKey := m.createConnectionKey("test-cluster", "/api/v1/pods", "test-user")

	initialToken := "initial-token-snapshot"
	conn.Token = &initialToken

	m.mutex.Lock()
	m.connections[connKey] = conn
	m.mutex.Unlock()

	resultCh := startAsyncReconnect(m, conn)

	select {
	case <-upgradeArrived:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for reconnect upgrade request to reach server")
	}

	// While reconnect upgrade is blocked at the server, refresh the original connection token
	refreshedToken := "refreshed-token-updated"
	err := m.refreshConnectionToken(conn, &refreshedToken)
	require.NoError(t, err)

	conn.mu.RLock()
	require.NotNil(t, conn.Token)
	assert.Equal(t, refreshedToken, *conn.Token, "original connection token must be refreshed")
	conn.mu.RUnlock()

	// Release upgrade so reconnect completes
	close(releaseUpgrade)

	newConn := awaitSuccessfulReconnect(t, resultCh)
	defer newConn.safeClose()

	// Verify the actual token sent in the upgrade request was the original snapshot
	receivedToken := awaitReceivedToken(t, receivedTokens)
	assert.Equal(t, initialToken, receivedToken,
		"actual token sent in upgrade request must be the original snapshot token")

	require.NotNil(t, newConn.Token)
	assert.Equal(t, initialToken, *newConn.Token,
		"replacement connection must retain snapshotted token")

	conn.safeClose()
	closeServerSocket(t, serverSockets)
}

func setupAtomicRemovalTestScenario(
	t *testing.T,
	serverURL string,
	client1, client2 *WSConnLock,
) (*Multiplexer, *Connection, *Connection, *Connection, string) {
	t.Helper()

	m, conn1 := setupTestMultiplexerWithBackoff(t, serverURL, client1)
	connKey1 := m.createConnectionKey("test-cluster", "/api/v1/pods", "test-user")

	conn2 := &Connection{
		ClusterID: "test-cluster",
		Path:      "/api/v1/services",
		UserID:    "test-user",
		Client:    client1,
		Status:    ConnectionStatus{State: StateConnected},
	}
	connKey2 := m.createConnectionKey("test-cluster", "/api/v1/services", "test-user")

	conn3 := &Connection{
		ClusterID: "test-cluster",
		Path:      "/api/v1/nodes",
		UserID:    "test-user",
		Client:    client2,
		Status:    ConnectionStatus{State: StateConnected},
	}
	connKey3 := m.createConnectionKey("test-cluster", "/api/v1/nodes", "test-user")

	m.mutex.Lock()
	m.connections[connKey1] = conn1
	m.connections[connKey2] = conn2
	m.connections[connKey3] = conn3
	m.mutex.Unlock()

	return m, conn1, conn2, conn3, connKey1
}

func TestCloseClientConnections_AtomicRemovalAndStateTransition(t *testing.T) {
	upgradeArrived := make(chan struct{}, 1)
	releaseUpgrade := make(chan struct{})

	defer closeReleaseUpgrade(releaseUpgrade)

	server, serverSockets := createGatedUpgradeServer(upgradeArrived, releaseUpgrade)
	defer server.Close()

	client1, clientServer1 := createTestWebSocketConnection()
	defer clientServer1.Close()

	client2, clientServer2 := createTestWebSocketConnection()
	defer clientServer2.Close()

	m, conn1, conn2, conn3, connKey1 := setupAtomicRemovalTestScenario(t, server.URL, client1, client2)

	resultCh := startAsyncReconnect(m, conn1)

	select {
	case <-upgradeArrived:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for reconnect upgrade request")
	}

	// Close client1 connections while reconnect is in-flight.
	// Atomic removal and state transition must set conn.Client = nil and StateClosed under m.mutex.
	m.closeClientConnections(client1)

	// Verify client1 connections are atomically removed and closed, while client2 remains untouched
	m.mutex.RLock()
	assert.Nil(t, m.connections[connKey1], "conn1 should be removed from multiplexer")
	assert.Equal(t, conn3, m.connections[m.createConnectionKey("test-cluster", "/api/v1/nodes", "test-user")])
	m.mutex.RUnlock()

	assertConnectionClosedState(t, conn1)
	assertConnectionClosedState(t, conn2)

	conn3.mu.RLock()
	assert.Equal(t, client2, conn3.Client, "conn3.Client must remain intact")
	conn3.mu.RUnlock()

	close(releaseUpgrade)

	assertReconnectClosedResult(t, resultCh)

	m.mutex.RLock()
	assert.Nil(t, m.connections[connKey1], "conn1 replacement must not remain registered")
	m.mutex.RUnlock()

	assertReplacementServerSocketClosed(t, serverSockets)

	conn3.safeClose()
}
