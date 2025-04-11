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
	"github.com/headlamp-k8s/headlamp/backend/pkg/kubeconfig"
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
	m := NewMultiplexer(store)

	assert.NotNil(t, m)
	assert.Equal(t, store, m.kubeConfigStore)
	assert.NotNil(t, m.connections)
	assert.NotNil(t, m.upgrader)
}

func TestHandleClientWebSocket(t *testing.T) {
	contextStore := kubeconfig.NewContextStore()
	m := NewMultiplexer(contextStore)

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
	m := NewMultiplexer(store)

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
	m := NewMultiplexer(kubeconfig.NewContextStore())
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
	m := NewMultiplexer(kubeconfig.NewContextStore())
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

func TestDialWebSocket_Errors(t *testing.T) {
	contextStore := kubeconfig.NewContextStore()
	m := NewMultiplexer(contextStore)

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
	m := NewMultiplexer(kubeconfig.NewContextStore())
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
	m := NewMultiplexer(kubeconfig.NewContextStore())
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
	m := NewMultiplexer(kubeconfig.NewContextStore())
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
	m := NewMultiplexer(store)

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

	conn, err := m.getOrCreateConnection(msg, clientConn)
	assert.NoError(t, err)
	assert.NotNil(t, conn)
	assert.Equal(t, "test-cluster", conn.ClusterID)
	assert.Equal(t, "test-user", conn.UserID)
	assert.Equal(t, "/api/v1/pods", conn.Path)
	assert.Equal(t, "watch=true", conn.Query)

	// Test getting an existing connection
	conn2, err := m.getOrCreateConnection(msg, clientConn)
	assert.NoError(t, err)
	assert.Equal(t, conn, conn2, "Should return the same connection instance")

	// Test with invalid cluster
	msg.ClusterID = "non-existent-cluster"
	conn3, err := m.getOrCreateConnection(msg, clientConn)
	assert.Error(t, err)
	assert.Nil(t, conn3)
}

func TestEstablishClusterConnection(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store)

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
	m := NewMultiplexer(store)

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
	m := NewMultiplexer(kubeconfig.NewContextStore())
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
	m := NewMultiplexer(kubeconfig.NewContextStore())
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
	m := NewMultiplexer(contextStore)

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
	m := NewMultiplexer(store)

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
	m := NewMultiplexer(kubeconfig.NewContextStore())

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.HandleClientWebSocket(w, r)
	}))

	defer server.Close()

	// Test invalid JSON
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	ws, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
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
	ws, resp, err = websocket.DefaultDialer.Dial(wsURL, nil)
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
	m := NewMultiplexer(kubeconfig.NewContextStore())
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
	m := NewMultiplexer(kubeconfig.NewContextStore())
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
			m := NewMultiplexer(kubeconfig.NewContextStore())
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
	m := NewMultiplexer(store)

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
		Token:     &originalToken,
	}

	conn, err := m.getOrCreateConnection(msg, clientConn)
	assert.NoError(t, err)
	assert.NotNil(t, conn)
	assert.Equal(t, &originalToken, conn.Token)

	// Now send a new message with a new token
	newToken := "new-refreshed-token"
	msg.Token = &newToken

	// Get the same connection, but with a new token
	conn2, err := m.getOrCreateConnection(msg, clientConn)
	assert.NoError(t, err)
	assert.Equal(t, conn, conn2, "Should return the same connection instance")

	// Verify the token was updated
	assert.Equal(t, &newToken, conn2.Token, "Token should be updated to the new value")
}

func TestReconnect_WithToken(t *testing.T) {
	store := kubeconfig.NewContextStore()
	m := NewMultiplexer(store)

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
	m := NewMultiplexer(contextStore)

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
	m := NewMultiplexer(kubeconfig.NewContextStore())
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
	m := NewMultiplexer(kubeconfig.NewContextStore())
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
	m := NewMultiplexer(kubeconfig.NewContextStore())
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
	m := NewMultiplexer(kubeconfig.NewContextStore())
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
