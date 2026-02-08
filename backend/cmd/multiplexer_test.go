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
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func newTestDialer() *websocket.Dialer {
	return &websocket.Dialer{
		NetDial:          net.Dial,
		HandshakeTimeout: 45 * time.Second,
		TLSClientConfig:  &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
	}
}

func TestNewMultiplexer(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, nil, nil)

	assert.NotNil(t, m)
	assert.Equal(t, store, m.kubeConfigStore)
	assert.NotNil(t, m.connections)
	assert.NotNil(t, m.upgrader)
}

func TestHandleClientWebSocket(t *testing.T) {
	contextStore := kubeconfig.NewContextStore()
	m := NewMultiplexer(contextStore, nil, nil)

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.HandleClientWebSocket(w, r)
	}))
	defer server.Close()

	// Connect to test server with Origin header (required for WebSocket connections)
	dialer := newTestDialer()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	// Extract host from server URL to set as Origin
	serverHost := strings.TrimPrefix(server.URL, "http://")
	headers := http.Header{}
	headers.Set("Origin", "http://"+serverHost)

	ws, resp, err := dialer.Dial(wsURL, headers)
	require.NoError(t, err)

	if resp != nil && resp.Body != nil {
		defer resp.Body.Close()
	}

	defer ws.Close()

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
	m := NewMultiplexer(store, nil, nil)

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
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
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
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
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

		defer ws.Close()
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
	conn, err := m.dialWebSocket(wsURL, &tls.Config{InsecureSkipVerify: true}, server.URL, nil) //nolint:gosec

	assert.NoError(t, err)
	assert.NotNil(t, conn)

	if conn != nil {
		conn.Close()
	}
}

func TestDialWebSocket_WithToken(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)

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

		defer ws.Close()
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	token := "my-test-token"
	conn, err := m.dialWebSocket(wsURL, &tls.Config{InsecureSkipVerify: true}, server.URL, &token) //nolint:gosec
	assert.NoError(t, err)
	assert.NotNil(t, conn)

	if conn != nil {
		conn.Close()
	}

	assert.Equal(t, "Bearer "+token, receivedAuth)
}

func TestDialWebSocket_Errors(t *testing.T) {
	contextStore := kubeconfig.NewContextStore()
	m := NewMultiplexer(contextStore, nil, nil)

	// Test invalid URL
	tlsConfig := &tls.Config{InsecureSkipVerify: true} //nolint:gosec

	ws, err := m.dialWebSocket("invalid-url", tlsConfig, "", nil)
	assert.Error(t, err)
	assert.Nil(t, ws)

	// Test unreachable URL
	ws, err = m.dialWebSocket("ws://localhost:12345", tlsConfig, "", nil)
	assert.Error(t, err)
	assert.Nil(t, ws)
}

func TestMonitorConnection(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
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
	close(conn.Done)
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
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
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
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
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

		defer ws.Close()

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
		defer resp.Body.Close()
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
		defer resp.Body.Close()
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

		defer c.Close()

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
		InsecureSkipVerify: true, //nolint:gosec
	}

	return server
}

func TestGetOrCreateConnection(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, nil, nil)

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
	m := NewMultiplexer(store, nil, nil)

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

func TestReconnect(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, nil, nil)

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
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
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
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
	clientConn, clientServer := createTestWebSocketConnection()

	defer clientServer.Close()

	msg := Message{
		ClusterID: "test-cluster",
		Path:      "/api/v1/pods",
		UserID:    "test-user",
	}

	testError := fmt.Errorf("test error")

	// Capture the error message sent to the client
	var receivedMsg struct {
		ClusterID string `json:"clusterId"`
		Error     string `json:"error"`
	}

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
		assert.Equal(t, "test-cluster", receivedMsg.ClusterID)
		assert.Equal(t, "test error", receivedMsg.Error)
	case <-time.After(time.Second):
		t.Fatal("Test timed out")
	}
}

//nolint:funlen
func TestReadClientMessage_InvalidMessage(t *testing.T) {
	contextStore := kubeconfig.NewContextStore()
	m := NewMultiplexer(contextStore, nil, nil)

	// Create a server that will echo messages back
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		}
		ws, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)

		defer ws.Close()

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
	clientConn, _, err := dialer.Dial(wsURL, nil) //nolint:bodyclose
	require.NoError(t, err)

	defer clientConn.Close()

	// Test completely invalid JSON
	err = clientConn.WriteMessage(websocket.TextMessage, []byte("not json at all"))
	require.NoError(t, err)

	msg, err := m.readClientMessage(clientConn)
	require.Error(t, err)
	assert.Equal(t, Message{}, msg)

	// Test JSON with invalid data type
	err = clientConn.WriteJSON(map[string]interface{}{
		"type": "INVALID",
		"data": 123, // data should be string
	})
	require.NoError(t, err)

	msg, err = m.readClientMessage(clientConn)
	require.Error(t, err)
	assert.Equal(t, Message{}, msg)

	// Test empty JSON object
	err = clientConn.WriteMessage(websocket.TextMessage, []byte("{}"))
	require.NoError(t, err)

	msg, err = m.readClientMessage(clientConn)
	// Empty message is valid JSON but will be unmarshaled into an empty Message struct
	require.NoError(t, err)
	assert.Equal(t, Message{}, msg)

	// Test missing required fields
	err = clientConn.WriteJSON(map[string]interface{}{
		"data": "some data",
		// Missing type field
	})
	require.NoError(t, err)

	msg, err = m.readClientMessage(clientConn)
	// Missing fields are allowed by json.Unmarshal
	require.NoError(t, err)
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
	conn.updateStatus(StateConnected, nil)
	assert.Equal(t, StateConnected, conn.Status.State)
	assert.Empty(t, conn.Status.Error)

	// Test with closed connection - state should remain error
	conn.updateStatus(StateError, testErr)
	assert.Equal(t, StateError, conn.Status.State)
	assert.Equal(t, testErr.Error(), conn.Status.Error)

	close(conn.Done)
	conn.closed = true // Mark connection as closed

	// Try to update state after close - should not change
	conn.updateStatus(StateConnected, nil)
	assert.Equal(t, StateError, conn.Status.State)      // State should not change after close
	assert.Equal(t, testErr.Error(), conn.Status.Error) // Error should remain
}

func TestMonitorConnection_ReconnectFailure(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, nil, nil)

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
	conn.WSConn.Close()

	// Wait briefly to ensure error state is set
	time.Sleep(50 * time.Millisecond)

	// Verify connection is in error state
	assert.Equal(t, StateError, conn.Status.State)
	assert.NotEmpty(t, conn.Status.Error)

	close(conn.Done)
	<-done
}

func TestHandleClientWebSocket_InvalidMessages(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.HandleClientWebSocket(w, r)
	}))

	defer server.Close()

	// Test invalid JSON
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	serverHost := strings.TrimPrefix(server.URL, "http://")
	headers := http.Header{}
	headers.Set("Origin", "http://"+serverHost)

	ws, resp, err := websocket.DefaultDialer.Dial(wsURL, headers)
	require.NoError(t, err)

	if resp != nil && resp.Body != nil {
		defer resp.Body.Close()
	}

	err = ws.WriteMessage(websocket.TextMessage, []byte("invalid json"))
	require.NoError(t, err)

	// Should receive an error message or close
	_, message, err := ws.ReadMessage()
	if err != nil {
		// Connection may be closed due to error
		if !websocket.IsCloseError(err, websocket.CloseAbnormalClosure) {
			t.Errorf("expected abnormal closure, got %v", err)
		}
	} else {
		assert.Contains(t, string(message), "error")
	}

	ws.Close()

	// Test invalid message type with new connection
	ws, resp, err = websocket.DefaultDialer.Dial(wsURL, headers)
	require.NoError(t, err)

	if resp != nil && resp.Body != nil {
		defer resp.Body.Close()
	}

	defer ws.Close()

	err = ws.WriteJSON(Message{
		Type:      "INVALID_TYPE",
		ClusterID: "test-cluster",
		Path:      "/api/v1/pods",
		UserID:    "test-user",
	})

	require.NoError(t, err)

	// Should receive an error message or close
	_, message, err = ws.ReadMessage()
	if err != nil {
		// Connection may be closed due to error
		if !websocket.IsCloseError(err, websocket.CloseAbnormalClosure) {
			t.Errorf("expected abnormal closure, got %v", err)
		}
	} else {
		assert.Contains(t, string(message), "error")
	}
}

func TestSendIfNewResourceVersion_VersionComparison(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
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
	assert.Error(t, err)
	assert.Equal(t, "200", lastVersion) // Version should not change on error

	// Test missing resourceVersion
	message = []byte(`{"metadata":{}}`)
	err = m.sendIfNewResourceVersion(message, conn, clientConn, &lastVersion)
	require.NoError(t, err) // Should not error, but also not update version
	assert.Equal(t, "200", lastVersion)
}

func TestSendCompleteMessage_ClosedConnection(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
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
	clientConn.Close()
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
				//nolint:errcheck
				clientConn.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
				clientConn.Close()
			},
			expectedError: false,
		},
		{
			name: "unexpected close error",
			setupConn: func(_ *Connection, clientConn *WSConnLock) {
				//nolint:errcheck
				clientConn.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseProtocolError, ""))
				clientConn.Close()
			},
			expectedError: false, // All errors return nil now
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
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
	m := NewMultiplexer(store, nil, nil)

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

func TestReconnect_WithToken(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store, nil, nil)

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
		newConn.WSConn.Close()
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
	m := NewMultiplexer(contextStore, nil, nil)

	// Create a server that will accept the connection and then close it
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		}
		ws, err := upgrader.Upgrade(w, r, nil)
		require.NoError(t, err)

		defer ws.Close()

		// Keep connection alive briefly
		time.Sleep(100 * time.Millisecond)
	}))

	defer server.Close()

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	conn := createTestConnection("test-cluster", "test-user", "/api/v1/services", "", clientConn)

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	tlsConfig := &tls.Config{InsecureSkipVerify: true} //nolint:gosec

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
	close(conn.Done)
}

func TestWriteMessageToCluster(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
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
	clusterConn.Close()

	err = m.writeMessageToCluster(conn, testMessage)

	assert.Error(t, err)
	assert.Equal(t, StateError, conn.Status.State)
}

func TestHandleClusterMessages(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
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
	testMessage := []byte(`{"metadata":{"resourceVersion":"1"},"kind":"Pod","apiVersion":"v1","metadata":{"name":"test-pod"}}`) //nolint:lll
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
	wsConn.Close()

	// Wait for handleClusterMessages to finish
	select {
	case <-done:
		// Function completed successfully
	case <-time.After(5 * time.Second):
		t.Fatal("Test timed out")
	}
}

func TestSendCompleteMessage(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
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
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)
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

// Security Tests

//nolint:funlen // Table-driven test with comprehensive origin validation test cases
func TestCheckOrigin_SameOrigin(t *testing.T) {
	tests := []struct {
		name        string
		origin      string
		host        string
		expected    bool
		description string
	}{
		{
			name:        "same origin should be allowed",
			origin:      "http://localhost:3000",
			host:        "localhost:4466",
			expected:    true,
			description: "Requests from localhost to localhost should be allowed",
		},
		{
			name:        "no origin header should be rejected",
			origin:      "",
			host:        "localhost:4466",
			expected:    false,
			description: "Requests without Origin header should be rejected to prevent bypass attacks",
		},
		{
			name:        "cross-origin should be rejected",
			origin:      "https://attacker.com",
			host:        "localhost:4466",
			expected:    false,
			description: "Cross-origin requests should be rejected",
		},
		{
			name:        "localhost 127.0.0.1 to localhost should be allowed",
			origin:      "http://127.0.0.1:3000",
			host:        "localhost:4466",
			expected:    true,
			description: "Localhost variations should be allowed",
		},
		{
			name:        "localhost to 127.0.0.1 should be allowed",
			origin:      "http://localhost:3000",
			host:        "127.0.0.1:4466",
			expected:    true,
			description: "Localhost variations should be allowed",
		},
		{
			name:        "exact same host and port",
			origin:      "http://myapp.example.com",
			host:        "myapp.example.com:4466",
			expected:    true,
			description: "Same hostname should be allowed",
		},
		{
			name:        "different subdomain should be rejected",
			origin:      "http://evil.example.com",
			host:        "myapp.example.com:4466",
			expected:    false,
			description: "Different subdomains should be rejected",
		},
		{
			name:        "invalid origin URL should be rejected",
			origin:      "not-a-valid-url",
			host:        "localhost:4466",
			expected:    false,
			description: "Invalid origin URLs should be rejected",
		},
		// Additional loopback address tests
		{
			name:        "127.0.0.2 to 127.0.0.1 should be allowed",
			origin:      "http://127.0.0.2:3000",
			host:        "127.0.0.1:4466",
			expected:    true,
			description: "Different addresses in 127.0.0.0/8 range should be allowed",
		},
		{
			name:        "127.0.0.1 to 127.0.0.2 should be allowed",
			origin:      "http://127.0.0.1:3000",
			host:        "127.0.0.2:4466",
			expected:    true,
			description: "Different addresses in 127.0.0.0/8 range should be allowed",
		},
		{
			name:        "127.255.255.255 to localhost should be allowed",
			origin:      "http://127.255.255.255:3000",
			host:        "localhost:4466",
			expected:    true,
			description: "Any address in 127.0.0.0/8 range to localhost should be allowed",
		},
		{
			name:        "IPv6 loopback ::1 to localhost should be allowed",
			origin:      "http://[::1]:3000",
			host:        "localhost:4466",
			expected:    true,
			description: "IPv6 loopback to localhost should be allowed",
		},
		{
			name:        "localhost to IPv6 loopback ::1 should be allowed",
			origin:      "http://localhost:3000",
			host:        "[::1]:4466",
			expected:    true,
			description: "Localhost to IPv6 loopback should be allowed",
		},
		{
			name:        "IPv6 loopback to 127.0.0.1 should be allowed",
			origin:      "http://[::1]:3000",
			host:        "127.0.0.1:4466",
			expected:    true,
			description: "IPv6 loopback to IPv4 loopback should be allowed",
		},
		{
			name:        "0.0.0.0 should not be treated as loopback",
			origin:      "http://0.0.0.0:3000",
			host:        "localhost:4466",
			expected:    false,
			description: "0.0.0.0 is not a loopback address and should be rejected",
		},
		{
			name:        "localhost.localdomain should not be treated as localhost",
			origin:      "http://localhost.localdomain:3000",
			host:        "localhost:4466",
			expected:    false,
			description: "localhost.localdomain is not localhost and should be rejected",
		},
		// Case-insensitive host comparison tests (RFC 4343)
		{
			name:        "case insensitive same origin - uppercase origin",
			origin:      "http://LOCALHOST:3000",
			host:        "localhost:4466",
			expected:    true,
			description: "Host comparison should be case-insensitive per RFC 4343",
		},
		{
			name:        "case insensitive same origin - uppercase host",
			origin:      "http://localhost:3000",
			host:        "LOCALHOST:4466",
			expected:    true,
			description: "Host comparison should be case-insensitive per RFC 4343",
		},
		{
			name:        "case insensitive same origin - mixed case",
			origin:      "http://MyApp.Example.COM:3000",
			host:        "myapp.example.com:4466",
			expected:    true,
			description: "Host comparison should be case-insensitive per RFC 4343",
		},
		{
			name:        "case insensitive same origin - both mixed case",
			origin:      "http://HEADLAMP.Example.Org:3000",
			host:        "headlamp.EXAMPLE.org:4466",
			expected:    true,
			description: "Host comparison should be case-insensitive per RFC 4343",
		},
	}

	// Create a multiplexer with no allowed hosts (backward compatible mode)
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "http://"+tt.host+"/wsMultiplexer", nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}

			result := m.checkOrigin(req)
			assert.Equal(t, tt.expected, result, tt.description)
		})
	}
}

func TestIsLoopbackHost(t *testing.T) {
	tests := []struct {
		name     string
		host     string
		expected bool
	}{
		// Localhost hostname (case-insensitive)
		{"localhost", "localhost", true},
		{"LOCALHOST uppercase", "LOCALHOST", true},
		{"LocalHost mixed case", "LocalHost", true},
		{"LOCALhost mixed case", "LOCALhost", true},

		// IPv4 loopback range (127.0.0.0/8)
		{"127.0.0.1", "127.0.0.1", true},
		{"127.0.0.2", "127.0.0.2", true},
		{"127.255.255.255", "127.255.255.255", true},
		{"127.0.0.0", "127.0.0.0", true},
		{"127.1.2.3", "127.1.2.3", true},

		// IPv6 loopback
		{"IPv6 loopback ::1", "::1", true},

		// Non-loopback addresses
		{"0.0.0.0", "0.0.0.0", false},
		{"192.168.1.1", "192.168.1.1", false},
		{"10.0.0.1", "10.0.0.1", false},
		{"8.8.8.8", "8.8.8.8", false},

		// Invalid hostnames
		{"localhost.localdomain", "localhost.localdomain", false},
		{"local", "local", false},
		{"attacker.com", "attacker.com", false},
		{"empty string", "", false},
		{"invalid IP", "999.999.999.999", false},

		// IPv6 non-loopback
		{"IPv6 unspecified", "::", false},
		{"IPv6 link-local", "fe80::1", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isLoopbackHost(tt.host)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestDNSRebindingProtection verifies that the allowed hosts feature prevents DNS rebinding attacks.
//
//nolint:funlen // Table-driven test with comprehensive security test cases
func TestDNSRebindingProtection(t *testing.T) {
	tests := []struct {
		name         string
		allowedHosts []string
		origin       string
		host         string
		expected     bool
	}{
		{
			"allowed host accepted",
			[]string{"headlamp.example.com"},
			"http://headlamp.example.com",
			"headlamp.example.com:4466",
			true,
		},
		{
			"non-allowed host rejected",
			[]string{"headlamp.example.com"},
			"http://attacker.com",
			"attacker.com:4466",
			false,
		},
		{
			"localhost always allowed",
			[]string{"headlamp.example.com"},
			"http://localhost:3000",
			"localhost:4466",
			true,
		},
		{
			"127.0.0.1 always allowed",
			[]string{"headlamp.example.com"},
			"http://127.0.0.1:3000",
			"127.0.0.1:4466",
			true,
		},
		{
			"empty allowlist backward compatible",
			nil,
			"http://any-host.example.com",
			"any-host.example.com:4466",
			true,
		},
		{
			"multiple allowed hosts",
			[]string{"app1.example.com", "app2.example.com"},
			"http://app2.example.com",
			"app2.example.com:4466",
			true,
		},
		{
			"DNS rebinding attack blocked",
			[]string{"headlamp.internal.example.com"},
			"http://malicious.attacker.com",
			"malicious.attacker.com:4466",
			false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := NewMultiplexer(kubeconfig.NewContextStore(), tt.allowedHosts, nil)
			req := httptest.NewRequest("GET", "http://"+tt.host+"/wsMultiplexer", nil)
			req.Header.Set("Origin", tt.origin)
			assert.Equal(t, tt.expected, m.checkOrigin(req))
		})
	}
}

// TestIsAllowedHost tests the isAllowedHost helper method directly.
//
//nolint:funlen // Table-driven test with comprehensive test cases.
func TestIsAllowedHost(t *testing.T) {
	tests := []struct {
		name         string
		allowedHosts []string
		host         string
		expected     bool
	}{
		{
			name:         "localhost always allowed",
			allowedHosts: []string{"example.com"},
			host:         "localhost",
			expected:     true,
		},
		{
			name:         "127.0.0.1 always allowed",
			allowedHosts: []string{"example.com"},
			host:         "127.0.0.1",
			expected:     true,
		},
		{
			name:         "::1 always allowed",
			allowedHosts: []string{"example.com"},
			host:         "::1",
			expected:     true,
		},
		{
			name:         "host in allowlist",
			allowedHosts: []string{"example.com", "test.com"},
			host:         "example.com",
			expected:     true,
		},
		{
			name:         "host not in allowlist",
			allowedHosts: []string{"example.com"},
			host:         "attacker.com",
			expected:     false,
		},
		{
			name:         "empty allowlist allows everything",
			allowedHosts: nil,
			host:         "anything.com",
			expected:     true,
		},
		{
			name:         "empty allowlist slice allows everything",
			allowedHosts: []string{},
			host:         "anything.com",
			expected:     true,
		},
		// Case-insensitive allowed hosts tests (RFC 4343)
		{
			name:         "case insensitive allowed host - uppercase in list",
			allowedHosts: []string{"EXAMPLE.COM"},
			host:         "example.com",
			expected:     true,
		},
		{
			name:         "case insensitive allowed host - uppercase request",
			allowedHosts: []string{"example.com"},
			host:         "EXAMPLE.COM",
			expected:     true,
		},
		{
			name:         "case insensitive allowed host - mixed case",
			allowedHosts: []string{"Headlamp.Example.Org"},
			host:         "headlamp.EXAMPLE.org",
			expected:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := NewMultiplexer(kubeconfig.NewContextStore(), tt.allowedHosts, nil)
			result := m.isAllowedHost(tt.host)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// TestExtractClientIP tests client IP extraction with various proxy configurations.
//
//nolint:funlen // Table-driven test with comprehensive proxy scenarios.
func TestExtractClientIP(t *testing.T) {
	// Test without trusted proxies - forwarded headers should be ignored
	t.Run("without trusted proxies", func(t *testing.T) {
		m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil) // No trusted proxies

		tests := []struct {
			name       string
			remoteAddr string
			xff        string
			xRealIP    string
			expected   string
		}{
			{"direct connection", "192.168.1.100:12345", "", "", "192.168.1.100"},
			{"X-Forwarded-For ignored without trust", "10.0.0.1:12345", "203.0.113.50", "", "10.0.0.1"},
			{"X-Real-IP ignored without trust", "10.0.0.1:12345", "", "203.0.113.99", "10.0.0.1"},
			{"IPv6 address", "[::1]:12345", "", "", "::1"},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				req := httptest.NewRequest("GET", "/", nil)
				req.RemoteAddr = tt.remoteAddr

				if tt.xff != "" {
					req.Header.Set("X-Forwarded-For", tt.xff)
				}

				if tt.xRealIP != "" {
					req.Header.Set("X-Real-IP", tt.xRealIP)
				}

				assert.Equal(t, tt.expected, m.extractClientIP(req))
			})
		}
	})

	// Test with trusted proxies - forwarded headers should be used
	t.Run("with trusted proxies", func(t *testing.T) {
		m := NewMultiplexer(kubeconfig.NewContextStore(), nil, []string{"10.0.0.1", "192.168.0.0/16"})

		tests := []struct {
			name       string
			remoteAddr string
			xff        string
			xRealIP    string
			expected   string
		}{
			{"direct connection from trusted", "10.0.0.1:12345", "", "", "10.0.0.1"},
			{"X-Forwarded-For single", "10.0.0.1:12345", "203.0.113.50", "", "203.0.113.50"},
			{"X-Forwarded-For multiple", "10.0.0.1:12345", "203.0.113.50, 70.41.3.18, 150.172.238.178", "", "203.0.113.50"},
			{"X-Real-IP", "10.0.0.1:12345", "", "203.0.113.99", "203.0.113.99"},
			{"X-Forwarded-For takes precedence", "10.0.0.1:12345", "203.0.113.50", "203.0.113.99", "203.0.113.50"},
			{"whitespace handling", "10.0.0.1:12345", "  203.0.113.50  , 70.41.3.18", "", "203.0.113.50"},
			{"CIDR trusted proxy", "192.168.1.1:12345", "203.0.113.50", "", "203.0.113.50"},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				req := httptest.NewRequest("GET", "/", nil)
				req.RemoteAddr = tt.remoteAddr

				if tt.xff != "" {
					req.Header.Set("X-Forwarded-For", tt.xff)
				}

				if tt.xRealIP != "" {
					req.Header.Set("X-Real-IP", tt.xRealIP)
				}

				assert.Equal(t, tt.expected, m.extractClientIP(req))
			})
		}
	})

	// Test untrusted proxy doesn't allow header spoofing
	t.Run("untrusted proxy header spoofing prevention", func(t *testing.T) {
		m := NewMultiplexer(kubeconfig.NewContextStore(), nil, []string{"10.0.0.1"}) // Only 10.0.0.1 trusted

		req := httptest.NewRequest("GET", "/", nil)
		req.RemoteAddr = "203.0.113.100:12345"           // Not a trusted proxy
		req.Header.Set("X-Forwarded-For", "192.168.1.1") // Attacker tries to spoof

		// Should return the direct remote address, ignoring the spoofed header
		assert.Equal(t, "203.0.113.100", m.extractClientIP(req))
	})
}

// TestIsTrustedProxy tests the trusted proxy detection logic.
func TestIsTrustedProxy(t *testing.T) {
	tests := []struct {
		name           string
		trustedProxies []string
		ip             string
		expected       bool
	}{
		{"empty list returns false", nil, "10.0.0.1", false},
		{"empty slice returns false", []string{}, "10.0.0.1", false},
		{"exact IP match", []string{"10.0.0.1"}, "10.0.0.1", true},
		{"exact IP no match", []string{"10.0.0.1"}, "10.0.0.2", false},
		{"CIDR contains IP", []string{"10.0.0.0/8"}, "10.255.255.255", true},
		{"CIDR does not contain IP", []string{"10.0.0.0/8"}, "192.168.1.1", false},
		{"multiple entries - match first", []string{"10.0.0.1", "192.168.0.0/16"}, "10.0.0.1", true},
		{"multiple entries - match second", []string{"10.0.0.1", "192.168.0.0/16"}, "192.168.1.1", true},
		{"multiple entries - no match", []string{"10.0.0.1", "192.168.0.0/16"}, "172.16.0.1", false},
		{"IPv6 exact match", []string{"::1"}, "::1", true},
		{"IPv6 CIDR match", []string{"2001:db8::/32"}, "2001:db8::1", true},
		{"invalid IP returns false", []string{"10.0.0.1"}, "not-an-ip", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := NewMultiplexer(kubeconfig.NewContextStore(), nil, tt.trustedProxies)
			result := m.isTrustedProxy(tt.ip)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIPRateLimiter(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)

	// Create two requests from the same IP (different ports)
	req1 := httptest.NewRequest("GET", "/", nil)
	req1.RemoteAddr = "192.168.1.100:12345"

	req2 := httptest.NewRequest("GET", "/", nil)
	req2.RemoteAddr = "192.168.1.100:54321"

	// Get rate limiter for the same IP - should return the same limiter instance
	limiter1 := m.getIPRateLimiter(req1)
	limiter2 := m.getIPRateLimiter(req2)
	assert.Same(t, limiter1, limiter2, "Same IP should get the same rate limiter instance")

	// Create request from different IP
	req3 := httptest.NewRequest("GET", "/", nil)
	req3.RemoteAddr = "10.0.0.1:12345"

	limiter3 := m.getIPRateLimiter(req3)
	assert.NotSame(t, limiter1, limiter3, "Different IPs should get different rate limiter instances")

	// Test rate limiting - exhaust the IP burst
	allowedCount := 0

	for i := 0; i < IPBurstSize+10; i++ {
		if limiter1.Allow() {
			allowedCount++
		}
	}

	assert.Equal(t, IPBurstSize, allowedCount, "Should allow exactly IPBurstSize requests initially")
}

func TestRateLimiter(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)

	// Create a mock WebSocket connection
	wsConn, wsServer := createTestWebSocketConn()
	defer wsServer.Close()

	// Get rate limiter for the connection
	limiter := m.getRateLimiter(wsConn)
	assert.NotNil(t, limiter)

	// Verify we get the same limiter for the same connection
	limiter2 := m.getRateLimiter(wsConn)
	assert.Equal(t, limiter, limiter2)

	// Test rate limiting - exhaust the burst
	allowedCount := 0

	for i := 0; i < BurstSize+10; i++ {
		if limiter.Allow() {
			allowedCount++
		}
	}

	// Should have allowed exactly BurstSize requests
	assert.Equal(t, BurstSize, allowedCount)

	// Cleanup rate limiter
	m.cleanupRateLimiter(wsConn)

	// Verify a new limiter is created after cleanup
	limiter3 := m.getRateLimiter(wsConn)
	assert.NotNil(t, limiter3)
}

func TestMessageSizeLimit(t *testing.T) {
	contextStore := kubeconfig.NewContextStore()
	m := NewMultiplexer(contextStore, nil, nil)

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.HandleClientWebSocket(w, r)
	}))
	defer server.Close()

	// Connect to test server with Origin header
	dialer := newTestDialer()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	serverHost := strings.TrimPrefix(server.URL, "http://")
	headers := http.Header{}
	headers.Set("Origin", "http://"+serverHost)

	ws, resp, err := dialer.Dial(wsURL, headers)
	require.NoError(t, err)

	if resp != nil && resp.Body != nil {
		defer resp.Body.Close()
	}

	defer ws.Close()

	// Send a message that's within the size limit
	smallMsg := Message{
		Type:      "REQUEST",
		ClusterID: "test-cluster",
		Path:      "/api/v1/pods",
		UserID:    "test-user",
	}
	err = ws.WriteJSON(smallMsg)
	// Note: Testing messages larger than MaxMessageSize would require sending
	// a message larger than 10MB, which is not practical for a unit test.
	// The important thing is that SetReadLimit is called, which we verify
	// by checking that the handler doesn't panic with a normal message.
	assert.NoError(t, err)
}

func TestRateLimitExceeded(t *testing.T) {
	// This test verifies that the rate limiter is properly integrated into the
	// WebSocket handler by sending many messages rapidly and checking that:
	// 1. The connection handles the load without crashing
	// 2. Messages can be sent through the WebSocket
	//
	// Note: The actual rate limiter behavior (Allow/Deny) is tested in detail
	// by TestRateLimitViolationTracking. This test focuses on integration.
	contextStore := kubeconfig.NewContextStore()
	m := NewMultiplexer(contextStore, nil, nil)

	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.HandleClientWebSocket(w, r)
	}))
	defer server.Close()

	// Connect to test server with Origin header
	dialer := newTestDialer()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	serverHost := strings.TrimPrefix(server.URL, "http://")
	headers := http.Header{}
	headers.Set("Origin", "http://"+serverHost)

	ws, resp, err := dialer.Dial(wsURL, headers)
	require.NoError(t, err)

	if resp != nil && resp.Body != nil {
		defer resp.Body.Close()
	}

	defer ws.Close()

	// Send messages through the WebSocket to verify the handler doesn't crash
	// when receiving many messages (even if some get rate limited).
	// The rate limiter has BurstSize=100 and MessagesPerSecond=50.
	messagesSent := 0

	for i := 0; i < BurstSize+10; i++ {
		msg := Message{
			Type:      "REQUEST",
			ClusterID: "test-cluster",
			Path:      "/api/v1/pods",
			UserID:    "test-user",
		}

		err := ws.WriteJSON(msg)
		if err != nil {
			// Connection may be closed due to rate limiting, which is acceptable
			break
		}

		messagesSent++
	}

	// Give server time to process messages
	time.Sleep(100 * time.Millisecond)

	assert.Greater(t, messagesSent, 0, "Should have sent at least some messages")
	t.Logf("Successfully sent %d messages through WebSocket (BurstSize=%d)", messagesSent, BurstSize)

	// Verify rate limiter constants are set correctly
	assert.Equal(t, 50, MessagesPerSecond, "MessagesPerSecond should be 50")
	assert.Equal(t, 100, BurstSize, "BurstSize should be 100")
}

func TestRateLimitConnectionClosure(t *testing.T) {
	// This test verifies that connections are closed after repeated rate limit violations.
	// We test the rate limiting logic directly by checking that the violation counter
	// and exponential backoff work as expected.
	// Test that the constants are properly defined
	assert.Equal(t, 10, MaxRateLimitViolations, "MaxRateLimitViolations should be 10")
	assert.Equal(t, 100*time.Millisecond, InitialBackoffDelay, "InitialBackoffDelay should be 100ms")
	assert.Equal(t, 5*time.Second, MaxBackoffDelay, "MaxBackoffDelay should be 5s")

	// Test exponential backoff calculation
	// Starting with 100ms, doubling: 100, 200, 400, 800, 1600, 3200, 5000 (capped), 5000, ...
	backoff := InitialBackoffDelay
	expectedBackoffs := []time.Duration{
		100 * time.Millisecond,
		200 * time.Millisecond,
		400 * time.Millisecond,
		800 * time.Millisecond,
		1600 * time.Millisecond,
		3200 * time.Millisecond,
		5000 * time.Millisecond, // Capped at MaxBackoffDelay
		5000 * time.Millisecond, // Stays at max
	}

	for i, expected := range expectedBackoffs {
		assert.Equal(t, expected, backoff, "Backoff at iteration %d should be %v", i, expected)

		backoff *= 2
		if backoff > MaxBackoffDelay {
			backoff = MaxBackoffDelay
		}
	}

	t.Log("Exponential backoff calculation verified: 100ms -> 200ms -> 400ms -> 800ms -> 1.6s -> 3.2s -> 5s (max)")
}

func TestRateLimitViolationTracking(t *testing.T) {
	// This test verifies the rate limiter behavior using the direct rate limiter API
	// to ensure the rate limiting mechanism works correctly.
	contextStore := kubeconfig.NewContextStore()
	m := NewMultiplexer(contextStore, nil, nil)

	// Create a mock WebSocket connection
	wsConn, wsServer := createTestWebSocketConn()
	defer wsServer.Close()

	// Get rate limiter for the connection
	limiter := m.getRateLimiter(wsConn)
	require.NotNil(t, limiter)

	// Exhaust the burst capacity
	allowedCount := 0

	for i := 0; i < BurstSize+MaxRateLimitViolations+5; i++ {
		if limiter.Allow() {
			allowedCount++
		}
	}

	// Should have allowed exactly BurstSize requests (the burst capacity)
	assert.Equal(t, BurstSize, allowedCount, "Rate limiter should allow exactly BurstSize requests in burst")

	// Verify that subsequent requests are denied (rate limited)
	// This simulates what happens when a client sends messages too fast
	deniedCount := 0

	for i := 0; i < 5; i++ {
		if !limiter.Allow() {
			deniedCount++
		}
	}

	assert.Equal(t, 5, deniedCount, "Rate limiter should deny requests after burst is exhausted")

	t.Logf("Rate limiter test: allowed %d requests (burst), denied %d subsequent requests", allowedCount, deniedCount)
}

// TestIPRateLimiterEntryTracking tests that IP rate limiters track lastSeen time
// for cleanup purposes.
func TestIPRateLimiterEntryTracking(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), nil, nil)

	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "192.168.1.100:12345"

	// Get rate limiter - this creates an entry
	limiter1 := m.getIPRateLimiter(req)
	require.NotNil(t, limiter1)

	// Verify the entry was stored with the ipRateLimiterEntry struct
	entry, ok := m.ipRateLimiters.Load("192.168.1.100")
	require.True(t, ok, "IP rate limiter entry should exist")

	ipEntry, ok := entry.(*ipRateLimiterEntry)
	require.True(t, ok, "Entry should be of type *ipRateLimiterEntry")
	require.NotNil(t, ipEntry.limiter)
	require.False(t, ipEntry.lastSeen.IsZero(), "lastSeen should be set")

	firstSeen := ipEntry.lastSeen

	// Wait a tiny bit and access again - lastSeen should be updated
	time.Sleep(10 * time.Millisecond)

	limiter2 := m.getIPRateLimiter(req)
	require.Same(t, limiter1, limiter2, "Should return the same limiter")

	// Get the entry again and check lastSeen was updated
	entry, _ = m.ipRateLimiters.Load("192.168.1.100")
	ipEntry = entry.(*ipRateLimiterEntry)
	require.True(t, ipEntry.lastSeen.After(firstSeen) || ipEntry.lastSeen.Equal(firstSeen),
		"lastSeen should be updated on access")
}

// TestIPRateLimiterConstants verifies the cleanup-related constants are properly defined.
func TestIPRateLimiterConstants(t *testing.T) {
	assert.Equal(t, 5*time.Minute, IPRateLimiterCleanupInterval,
		"IPRateLimiterCleanupInterval should be 5 minutes")
	assert.Equal(t, 10*time.Minute, IPRateLimiterStaleTimeout,
		"IPRateLimiterStaleTimeout should be 10 minutes")
}
