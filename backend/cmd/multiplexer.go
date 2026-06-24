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
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"k8s.io/client-go/rest"
)

const (
	// StateConnecting is the state when the connection is being established.
	StateConnecting ConnectionState = "connecting"
	// StateConnected is the state when the connection is established.
	StateConnected ConnectionState = "connected"
	// StateError is the state when the connection has an error.
	StateError ConnectionState = "error"
	// StateClosed is the state when the connection is closed.
	StateClosed ConnectionState = "closed"
)

const (
	// HeartbeatInterval is the interval at which the multiplexer sends heartbeat messages to the client.
	HeartbeatInterval = 30 * time.Second
	// HandshakeTimeout is the timeout for the handshake with the client.
	HandshakeTimeout = 45 * time.Second
	// CleanupRoutineInterval is the interval at which the multiplexer cleans up unused connections.
	CleanupRoutineInterval = 5 * time.Minute
	// SecureWebSocketScheme is the secure WebSocket scheme.
	SecureWebSocketScheme = "wss"
)

// ConnectionState represents the current state of a connection.
type ConnectionState string

type ConnectionStatus struct {
	// State is the current state of the connection.
	State ConnectionState `json:"state"`
	// Error is the error message of the connection.
	Error string `json:"error,omitempty"`
	// LastMsg is the last message time of the connection.
	LastMsg time.Time `json:"lastMsg"`
}

// Connection represents a WebSocket connection to a Kubernetes cluster.
type Connection struct {
	// ClusterID is the ID of the cluster.
	ClusterID string
	// UserID is the ID of the user.
	UserID string
	// Path is the path of the connection.
	Path string
	// Query is the query of the connection.
	Query string
	// WSConn is the WebSocket connection to the cluster.
	WSConn *websocket.Conn
	// Status is the status of the connection.
	Status ConnectionStatus
	// Client is the WebSocket connection to the client.
	Client *WSConnLock
	// Done is a channel to signal when the connection is done.
	Done chan struct{}
	// mu is a mutex to synchronize access to the connection.
	mu sync.RWMutex
	// writeMu is a mutex to synchronize access to the write operations.
	writeMu sync.Mutex
	// closed is a flag to indicate if the connection is closed.
	closed bool
	// usesServiceAccountToken is true when Token was loaded from the
	// in-cluster service account token file.
	usesServiceAccountToken bool
	// Authentication token.
	Token *string
	// closeOnce is used to ensure the connection is closed only once.
	closeOnce sync.Once
}

// Message represents a WebSocket message structure.
type Message struct {
	// ClusterID is the ID of the cluster.
	ClusterID string `json:"clusterId"`
	// Path is the path of the connection.
	Path string `json:"path"`
	// Query is the query of the connection.
	Query string `json:"query"`
	// UserID is the ID of the user.
	UserID string `json:"userId"`
	// Data contains the message payload.
	Data string `json:"data,omitempty"`
	// Binary is a flag to indicate if the message is binary.
	Binary bool `json:"binary,omitempty"`
	// Type is the type of the message.
	Type string `json:"type"`
}

// Multiplexer manages multiple WebSocket connections.
type Multiplexer struct {
	// connections is a map of connections indexed by the cluster ID and path.
	connections map[string]*Connection
	// mutex is a mutex to synchronize access to the connections.
	mutex sync.RWMutex
	// upgrader is the WebSocket upgrader.
	upgrader websocket.Upgrader
	// kubeConfigStore is the kubeconfig store.
	kubeConfigStore kubeconfig.ContextStore
	// unsafeUseServiceAccountToken forces in-cluster contexts to use their token file.
	unsafeUseServiceAccountToken bool
	// saTokenCache caches service account tokens keyed by file path; refreshed when mtime changes.
	saTokenCache map[string]saTokenCacheEntry
	// saTokenMu guards saTokenCache.
	saTokenMu sync.RWMutex
}

// saTokenCacheEntry caches a service account token alongside the source file's mtime.
type saTokenCacheEntry struct {
	token   string
	modTime time.Time
}

// WSConnLock provides a thread-safe wrapper around a WebSocket connection.
// It ensures that write operations are synchronized using a mutex to prevent
// concurrent writes which could corrupt the WebSocket stream.
type WSConnLock struct {
	// conn is the underlying WebSocket connection
	conn *websocket.Conn
	// writeMu is a mutex to synchronize access to write operations.
	// This prevents concurrent writes to the WebSocket connection.
	writeMu sync.Mutex
}

// NewWSConnLock creates a new WSConnLock instance that wraps the provided
// WebSocket connection with thread-safe write operations.
func NewWSConnLock(conn *websocket.Conn) *WSConnLock {
	return &WSConnLock{
		conn:    conn,
		writeMu: sync.Mutex{},
	}
}

// WriteJSON writes the JSON encoding of v as a message to the WebSocket connection.
// It ensures thread-safety by using a mutex lock during the write operation.
func (conn *WSConnLock) WriteJSON(v interface{}) error {
	conn.writeMu.Lock()
	defer conn.writeMu.Unlock()

	return conn.conn.WriteJSON(v)
}

// ReadJSON reads the next JSON-encoded message from the WebSocket connection
// and stores it in the value pointed to by v.
// Note: Reading is already thread-safe in gorilla/websocket, so no mutex is needed.
func (conn *WSConnLock) ReadJSON(v interface{}) error {
	return conn.conn.ReadJSON(v)
}

// ReadMessage reads the next message from the WebSocket connection.
// It returns the message type and payload.
// Note: Reading is already thread-safe in gorilla/websocket, so no mutex is needed.
func (conn *WSConnLock) ReadMessage() (messageType int, p []byte, err error) {
	return conn.conn.ReadMessage()
}

// WriteMessage writes a message to the WebSocket connection with the given type and payload.
// It ensures thread-safety by using a mutex lock during the write operation.
func (conn *WSConnLock) WriteMessage(messageType int, data []byte) error {
	conn.writeMu.Lock()
	defer conn.writeMu.Unlock()

	return conn.conn.WriteMessage(messageType, data)
}

// Close safely closes the WebSocket connection.
// It ensures thread-safety by acquiring the write mutex before closing,
// preventing any concurrent writes during the close operation.
func (conn *WSConnLock) Close() error {
	conn.writeMu.Lock()
	defer conn.writeMu.Unlock()

	return conn.conn.Close()
}

// NewMultiplexer creates a new Multiplexer instance.
func NewMultiplexer(kubeConfigStore kubeconfig.ContextStore, unsafeUseServiceAccountToken bool) *Multiplexer {
	return &Multiplexer{
		connections:                  make(map[string]*Connection),
		kubeConfigStore:              kubeConfigStore,
		unsafeUseServiceAccountToken: unsafeUseServiceAccountToken,
		saTokenCache:                 make(map[string]saTokenCacheEntry),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

// readServiceAccountToken reads the service account token from path, caching the value
// per path and refreshing it when the file's mtime changes (e.g. kubelet token rotation).
func (m *Multiplexer) readServiceAccountToken(path string) (string, error) {
	stat, err := os.Stat(path) //nolint:gosec
	if err != nil {
		return "", fmt.Errorf("stat service account token file: %w", err)
	}

	m.saTokenMu.RLock()
	entry, ok := m.saTokenCache[path]
	m.saTokenMu.RUnlock()

	if ok && entry.modTime.Equal(stat.ModTime()) {
		return entry.token, nil
	}

	tokenBytes, err := os.ReadFile(path) //nolint:gosec
	if err != nil {
		return "", fmt.Errorf("reading service account token file: %w", err)
	}

	token := strings.TrimSpace(string(tokenBytes))
	if token == "" {
		return "", fmt.Errorf("service account token file is empty")
	}

	m.saTokenMu.Lock()
	m.saTokenCache[path] = saTokenCacheEntry{token: token, modTime: stat.ModTime()}
	m.saTokenMu.Unlock()

	return token, nil
}

// IsClosed returns whether the connection is closed.
func (c *Connection) IsClosed() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return c.closed
}

// updateStatus updates the status of a connection and notifies the client.
func (c *Connection) updateStatus(state ConnectionState, err error) {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()

		return
	}

	c.Status.State = state
	c.Status.LastMsg = time.Now()
	c.Status.Error = ""

	if err != nil {
		c.Status.Error = err.Error()
	}

	if c.Client == nil {
		c.mu.Unlock()

		if state == StateClosed {
			c.safeClose()
		}

		return
	}

	writeErr := c.writeStatusLocked()
	c.mu.Unlock()

	if writeErr != nil {
		if !websocket.IsCloseError(writeErr, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
			logger.Log(logger.LevelError,
				map[string]string{"clusterID": c.ClusterID},
				writeErr,
				"writing status message to client")
		}
	}

	if state == StateClosed {
		c.safeClose()
	}
}

func (c *Connection) writeStatusLocked() error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	if c.closed {
		return nil
	}

	statusData := struct {
		State string `json:"state"`
		Error string `json:"error"`
	}{
		State: string(c.Status.State),
		Error: c.Status.Error,
	}

	jsonData, jsonErr := json.Marshal(statusData)
	if jsonErr != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterID": c.ClusterID}, jsonErr, "marshaling status message")

		return jsonErr
	}

	statusMsg := Message{
		ClusterID: c.ClusterID,
		Path:      c.Path,
		Data:      string(jsonData),
		Type:      "STATUS",
	}

	return c.Client.WriteJSON(statusMsg)
}

// safeClose safely closes the connection and its resources.
func (c *Connection) safeClose() {
	c.closeOnce.Do(func() {
		c.mu.Lock()
		if !c.closed {
			shouldWriteStatus := c.Status.State != StateClosed
			c.Status.State = StateClosed
			c.Status.LastMsg = time.Now()
			c.Status.Error = ""

			if shouldWriteStatus && c.Client != nil {
				_ = c.writeStatusLocked()
			}

			c.closed = true
		}
		c.mu.Unlock()

		if c.Done != nil {
			select {
			case <-c.Done:
				// Already closed
			default:
				close(c.Done)
			}
		}

		if c.WSConn != nil {
			_ = c.WSConn.Close()
		}
	})
}

// establishClusterConnection creates a new WebSocket connection to a Kubernetes cluster.
func (m *Multiplexer) establishClusterConnection(
	clusterID,
	userID,
	path,
	query string,
	clientConn *WSConnLock,
	token *string,
) (*Connection, error) {
	clusterContext, err := m.getClusterContextWithFallback(clusterID, userID)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterID": clusterID}, err, "getting cluster config")
		return nil, err
	}

	config, err := clusterContext.RESTConfig()
	if err != nil {
		return nil, fmt.Errorf("getting REST config: %v", err)
	}

	authToken, err := m.clusterConnectionToken(clusterContext, token)
	if err != nil {
		return nil, err
	}

	connection := m.createConnection(clusterID, userID, path, query, clientConn, authToken)
	if m.unsafeUseServiceAccountToken && clusterContext.UsesInClusterServiceAccountToken() {
		connection.usesServiceAccountToken = true
	}

	wsURL := createWebSocketURL(config.Host, path, query)

	tlsConfig, err := rest.TLSConfigFor(config)
	if err != nil {
		connection.updateStatus(StateError, err)

		return nil, fmt.Errorf("failed to get TLS config: %v", err)
	}

	conn, err := m.dialWebSocket(wsURL, tlsConfig, config.Host, authToken)
	if err != nil {
		connection.updateStatus(StateError, err)

		return nil, err
	}

	connection.WSConn = conn
	connection.updateStatus(StateConnected, nil)

	m.mutex.Lock()
	connKey := m.createConnectionKey(clusterID, path, userID)
	m.connections[connKey] = connection
	m.mutex.Unlock()

	go m.monitorConnection(connection)

	return connection, nil
}

// getClusterConfigWithFallback attempts to get the cluster config,
// falling back to a combined key for stateless clusters.
func (m *Multiplexer) getClusterConfigWithFallback(clusterID, userID string) (*rest.Config, error) {
	clusterContext, err := m.getClusterContextWithFallback(clusterID, userID)
	if err != nil {
		return nil, err
	}

	config, err := clusterContext.RESTConfig()
	if err != nil {
		return nil, fmt.Errorf("getting REST config: %v", err)
	}

	return config, nil
}

func (m *Multiplexer) getClusterContextWithFallback(clusterID, userID string) (*kubeconfig.Context, error) {
	// Try to get config for stateful cluster first.
	clusterContext, err := m.getClusterContext(clusterID)
	if err != nil {
		// If not found, try with the combined key for stateless clusters.
		combinedKey := fmt.Sprintf("%s%s", clusterID, userID)

		clusterContext, err = m.getClusterContext(combinedKey)
		if err != nil {
			return nil, fmt.Errorf("getting cluster config: %v", err)
		}
	}

	return clusterContext, nil
}

func (m *Multiplexer) clusterConnectionToken(
	clusterContext *kubeconfig.Context,
	requestToken *string,
) (*string, error) {
	if !m.unsafeUseServiceAccountToken || !clusterContext.UsesInClusterServiceAccountToken() {
		return requestToken, nil
	}

	token, err := m.readServiceAccountToken(clusterContext.AuthInfo.TokenFile)
	if err != nil {
		return nil, err
	}

	return &token, nil
}

// createConnection creates a new Connection instance.
func (m *Multiplexer) createConnection(
	clusterID,
	userID,
	path,
	query string,
	clientConn *WSConnLock,
	token *string,
) *Connection {
	return &Connection{
		ClusterID: clusterID,
		UserID:    userID,
		Path:      path,
		Query:     query,
		Client:    clientConn,
		Done:      make(chan struct{}),
		Status: ConnectionStatus{
			State:   StateConnecting,
			LastMsg: time.Now(),
		},
		Token: token,
	}
}

// dialWebSocket establishes a WebSocket connection.
func (m *Multiplexer) dialWebSocket(
	wsURL string,
	tlsConfig *tls.Config,
	host string,
	token *string,
) (*websocket.Conn, error) {
	dialer := websocket.Dialer{
		TLSClientConfig:  tlsConfig,
		HandshakeTimeout: HandshakeTimeout,
	}

	headers := http.Header{
		"Origin": {host},
	}

	if token != nil {
		headers.Set("Authorization", "Bearer "+*token)
	}

	conn, resp, err := dialer.Dial(
		wsURL,
		headers,
	)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "dialing WebSocket")
		// We only attempt to close the response body if there was an error and resp is not nil.
		// In the successful case (when err is nil), the resp will actually be nil for WebSocket connections,
		// so we don't need to close anything.
		if resp != nil {
			// Log only serializable fields from the response to avoid JSON marshaling errors
			logger.Log(
				logger.LevelError,
				map[string]string{
					"status":     resp.Status,
					"statusCode": fmt.Sprintf("%d", resp.StatusCode),
				},
				nil,
				"WebSocket response",
			)

			defer func() { _ = resp.Body.Close() }()
		}

		return nil, fmt.Errorf("dialing WebSocket: %v", err)
	}

	return conn, nil
}

// monitorConnection monitors the health of a connection and attempts to reconnect if necessary.
func (m *Multiplexer) monitorConnection(conn *Connection) {
	heartbeat := time.NewTicker(HeartbeatInterval)
	defer heartbeat.Stop()

	for {
		select {
		case <-conn.Done:
			conn.updateStatus(StateClosed, nil)

			return
		case <-heartbeat.C:
			if err := conn.WSConn.WriteMessage(websocket.PingMessage, nil); err != nil {
				conn.updateStatus(StateError, fmt.Errorf("heartbeat failed: %v", err))

				if newConn, err := m.reconnect(conn); err != nil {
					logger.Log(logger.LevelError, map[string]string{"clusterID": conn.ClusterID}, err, "reconnecting to cluster")
				} else {
					conn = newConn
				}
			}
		}
	}
}

// reconnect attempts to reestablish a connection.
func (m *Multiplexer) reconnect(conn *Connection) (*Connection, error) {
	if conn.IsClosed() {
		return nil, fmt.Errorf("cannot reconnect closed connection")
	}

	if conn.WSConn != nil {
		_ = conn.WSConn.Close()
	}

	newConn, err := m.establishClusterConnection(
		conn.ClusterID,
		conn.UserID,
		conn.Path,
		conn.Query,
		conn.Client,
		conn.Token,
	)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterID": conn.ClusterID}, err, "reconnecting to cluster")

		return nil, err
	}

	m.mutex.Lock()
	m.connections[m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID)] = newConn
	m.mutex.Unlock()

	return newConn, nil
}

// HandleClientWebSocket handles incoming WebSocket connections from clients.
func (m *Multiplexer) HandleClientWebSocket(w http.ResponseWriter, r *http.Request) {
	clientConn, err := m.upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "upgrading connection")
		return
	}

	lockClientConn := NewWSConnLock(clientConn)

	defer func() {
		_ = lockClientConn.Close()
		m.closeClientConnections(lockClientConn)
	}()

	for {
		msg, isFatal, err := m.readClientMessage(clientConn)
		if err != nil {
			if isFatal {
				logUnexpectedClientReadClose(err)

				break
			}
			// For non-fatal errors (like parsing), log and continue because
			// there is no routable client message context available.
			logger.Log(logger.LevelError, nil, err, "failed to read client message")

			continue
		}

		// Validate required routing fields upfront
		if msg.ClusterID == "" || msg.Path == "" || msg.UserID == "" || msg.Type == "" {
			errStr := fmt.Errorf(
				"missing required routing fields: clusterId='%s', path='%s', userId='%s', type='%s'",
				msg.ClusterID, msg.Path, msg.UserID, msg.Type,
			)
			logger.Log(logger.LevelError, nil, errStr, "invalid client message")

			continue
		}

		m.processClientMessage(r, lockClientConn, msg)
	}
}

// processClientMessage processes a single client message that has been verified to be routable.
func (m *Multiplexer) processClientMessage(
	r *http.Request,
	lockClientConn *WSConnLock,
	msg Message,
) {
	// Check if it's a close message
	if msg.Type == "CLOSE" {
		m.CloseConnection(msg.ClusterID, msg.Path, msg.UserID)

		return
	}

	if msg.Type != "REQUEST" {
		m.sendClientError(
			lockClientConn,
			msg.ClusterID,
			msg.Path,
			msg.Query,
			msg.UserID,
			fmt.Errorf("unsupported message type: %s", msg.Type),
		)

		return
	}

	token, err := auth.GetTokenFromCookie(r, msg.ClusterID)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterID": msg.ClusterID}, err, "getting token from cookie")
		m.sendClientError(lockClientConn, msg.ClusterID, msg.Path, msg.Query, msg.UserID, err)

		return
	}

	var tokenPtr *string
	if token != "" {
		tokenPtr = &token
	}

	conn, err := m.getOrCreateConnection(msg, lockClientConn, tokenPtr)
	if err != nil {
		m.handleConnectionError(lockClientConn, msg, err)

		return
	}

	if msg.Type == "REQUEST" && conn.Status.State == StateConnected {
		_ = m.writeMessageToCluster(conn, []byte(msg.Data))
	}
}

// closeClientConnections closes all connections associated with a specific client.
func (m *Multiplexer) closeClientConnections(clientConn *WSConnLock) {
	var connsToClose []*Connection

	m.mutex.Lock()
	for key, conn := range m.connections {
		conn.mu.RLock()
		isClient := conn.Client == clientConn
		conn.mu.RUnlock()

		if isClient {
			connsToClose = append(connsToClose, conn)

			delete(m.connections, key)
		}
	}
	m.mutex.Unlock()

	for _, conn := range connsToClose {
		conn.mu.Lock()
		if conn.Client == clientConn {
			conn.Client = nil
			conn.Status.State = StateClosed
			conn.Status.LastMsg = time.Now()
			conn.Status.Error = ""
		}
		conn.mu.Unlock()

		conn.safeClose()
	}
}

func logUnexpectedClientReadClose(err error) {
	if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
		logger.Log(logger.LevelError, nil, err, "reading client message")
	}
}

// readClientMessage reads a message from the client WebSocket connection.
// It returns the message, a boolean indicating if the error is fatal for the connection, and the error.
func (m *Multiplexer) readClientMessage(clientConn *websocket.Conn) (Message, bool, error) {
	var msg Message

	_, rawMessage, err := clientConn.ReadMessage()
	if err != nil {
		return Message{}, true, err
	}

	err = json.Unmarshal(rawMessage, &msg)
	if err != nil {
		return Message{}, false, err
	}

	return msg, false, nil
}

// getOrCreateConnection gets an existing connection or creates a new one if it doesn't exist.
// If a connection exists and a new token is provided, it updates the token to ensure it's fresh.
func (m *Multiplexer) getOrCreateConnection(msg Message, clientConn *WSConnLock, token *string) (*Connection, error) {
	connKey := m.createConnectionKey(msg.ClusterID, msg.Path, msg.UserID)

	m.mutex.RLock()
	conn, exists := m.connections[connKey]
	m.mutex.RUnlock()

	if !exists {
		var err error

		conn, err = m.establishClusterConnection(msg.ClusterID, msg.UserID, msg.Path, msg.Query, clientConn, token)
		if err != nil {
			logger.Log(
				logger.LevelError,
				map[string]string{"clusterID": msg.ClusterID, "UserID": msg.UserID},
				err,
				"establishing cluster connection",
			)

			return nil, err
		}

		go m.handleClusterMessages(conn, clientConn)
	} else if err := m.refreshConnectionToken(conn, token); err != nil {
		return nil, err
	}

	return conn, nil
}

func (m *Multiplexer) refreshConnectionToken(conn *Connection, requestToken *string) error {
	if requestToken == nil {
		return nil
	}

	if conn.usesServiceAccountToken {
		return nil
	}

	conn.mu.Lock()
	defer conn.mu.Unlock()

	if conn.Token == nil || *conn.Token != *requestToken {
		conn.Token = requestToken
	}

	return nil
}

// sendClientError sends an error message to the client WebSocket connection.
func (m *Multiplexer) sendClientError(clientConn *WSConnLock, clusterID, path, query, userID string, err error) {
	errorData := struct {
		Error string `json:"error"`
	}{
		Error: err.Error(),
	}

	jsonData, jsonErr := json.Marshal(errorData)
	if jsonErr != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterID": clusterID}, jsonErr, "marshaling error message")
		return
	}

	errorMsg := Message{
		ClusterID: clusterID,
		Path:      path,
		Query:     query,
		UserID:    userID,
		Data:      string(jsonData),
		Type:      "ERROR",
	}

	if err := clientConn.WriteJSON(errorMsg); err != nil {
		logger.Log(
			logger.LevelError,
			map[string]string{"clusterID": clusterID},
			err,
			"writing error message to client",
		)
	}
}

// handleConnectionError handles errors that occur when establishing a connection.
func (m *Multiplexer) handleConnectionError(clientConn *WSConnLock, msg Message, err error) {
	m.sendClientError(clientConn, msg.ClusterID, msg.Path, msg.Query, msg.UserID, err)
	logger.Log(logger.LevelError, map[string]string{"clusterID": msg.ClusterID}, err, "establishing cluster connection")
}

// writeMessageToCluster writes a message to the cluster WebSocket connection.
func (m *Multiplexer) writeMessageToCluster(conn *Connection, data []byte) error {
	err := conn.WSConn.WriteMessage(websocket.BinaryMessage, data)
	if err != nil {
		conn.updateStatus(StateError, err)
		logger.Log(
			logger.LevelError,
			map[string]string{"clusterID": conn.ClusterID},
			err,
			"writing message to cluster",
		)

		return err
	}

	return nil
}

// handleClusterMessages handles messages from a cluster connection.
func (m *Multiplexer) handleClusterMessages(conn *Connection, clientConn *WSConnLock) {
	defer m.cleanupConnection(conn)

	var lastResourceVersion string

	for {
		select {
		case <-conn.Done:
			return
		default:
			if err := m.processClusterMessage(conn, clientConn, &lastResourceVersion); err != nil {
				return
			}
		}
	}
}

// processClusterMessage processes a single message from the cluster.
func (m *Multiplexer) processClusterMessage(
	conn *Connection,
	clientConn *WSConnLock,
	lastResourceVersion *string,
) error {
	messageType, message, err := conn.WSConn.ReadMessage()
	if err != nil {
		if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
			logger.Log(logger.LevelError,
				map[string]string{
					"clusterID": conn.ClusterID,
					"userID":    conn.UserID,
				},
				err,
				"reading cluster message",
			)
		}

		return err
	}

	if err := m.sendIfNewResourceVersion(message, conn, clientConn, lastResourceVersion); err != nil {
		return err
	}

	return m.sendDataMessage(conn, clientConn, messageType, message)
}

// sendIfNewResourceVersion checks the version of a resource from an incoming message
// and sends a complete message to the client if the resource version has changed.
//
// This function is used to ensure that the client is always aware of the latest version
// of a resource. When a new message is received, it extracts the resource version from
// the message metadata. If the resource version has changed since the last known version,
// it sends a complete message to the client to update them with the latest resource state.
// Non-JSON payloads (e.g., terminal/exec raw bytes or binary payloads) are gracefully
// ignored and do not trigger an error.
// Parameters:
//   - message: The message containing resource information (or non-JSON frames to be ignored).
//   - conn: The connection object representing the current connection.
//   - clientConn: The WebSocket connection to the client.
//   - lastResourceVersion: A pointer to the last known resource version string.
//
// Returns:
//   - An error if any issues occur while writing to the client, or nil if successful/ignored.
func (m *Multiplexer) sendIfNewResourceVersion(
	message []byte,
	conn *Connection,
	clientConn *WSConnLock,
	lastResourceVersion *string,
) error {
	var obj map[string]interface{}
	if err := json.Unmarshal(message, &obj); err != nil {
		// If we can't unmarshal as JSON, it might be binary data (e.g. from a terminal)
		// We just return nil here to indicate no new resource version was found,
		// but we don't want to stop processing messages.
		return nil
	}

	// Try to find metadata directly
	metadata, ok := obj["metadata"].(map[string]interface{})
	if !ok {
		// Try to find metadata in object field
		if objField, ok := obj["object"].(map[string]interface{}); ok {
			if metadata, ok = objField["metadata"].(map[string]interface{}); !ok {
				// No metadata field found, nothing to do
				return nil
			}
		} else {
			// No metadata field found, nothing to do
			return nil
		}
	}

	rv, ok := metadata["resourceVersion"].(string)
	if !ok {
		// No resourceVersion field, nothing to do
		return nil
	}

	// Update version and send complete message if version is different
	if rv != *lastResourceVersion {
		*lastResourceVersion = rv

		return m.sendCompleteMessage(conn, clientConn)
	}

	return nil
}

// sendCompleteMessage sends a COMPLETE message to the client.
func (m *Multiplexer) sendCompleteMessage(conn *Connection, clientConn *WSConnLock) error {
	conn.mu.RLock()

	if conn.closed {
		conn.mu.RUnlock()
		return nil // Connection is already closed, no need to send message
	}

	completeMsg := Message{
		ClusterID: conn.ClusterID,
		Path:      conn.Path,
		Query:     conn.Query,
		UserID:    conn.UserID,
		Type:      "COMPLETE",
	}
	conn.mu.RUnlock()

	conn.writeMu.Lock()
	defer conn.writeMu.Unlock()

	err := clientConn.WriteJSON(completeMsg)
	if err != nil {
		logger.Log(logger.LevelInfo, nil, err, "connection closed while writing complete message")

		return nil // Just return nil for any error - connection is dead anyway
	}

	return nil
}

// sendDataMessage sends the actual data message to the client.
func (m *Multiplexer) sendDataMessage(
	conn *Connection,
	clientConn *WSConnLock,
	messageType int,
	message []byte,
) error {
	dataMsg := m.createWrapperMessage(conn, messageType, message)

	conn.writeMu.Lock()
	err := clientConn.WriteJSON(dataMsg)
	conn.writeMu.Unlock()

	if err != nil {
		return err
	}

	conn.mu.Lock()
	conn.Status.LastMsg = time.Now()
	conn.mu.Unlock()

	return nil
}

// cleanupConnection performs cleanup for a connection.
func (m *Multiplexer) cleanupConnection(conn *Connection) {
	conn.safeClose()

	m.mutex.Lock()
	connKey := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID)
	delete(m.connections, connKey)
	m.mutex.Unlock()
}

// createWrapperMessage creates a wrapper message for a cluster connection.
func (m *Multiplexer) createWrapperMessage(conn *Connection, messageType int, message []byte) Message {
	var data string
	if messageType == websocket.BinaryMessage {
		data = base64.StdEncoding.EncodeToString(message)
	} else {
		data = string(message)
	}

	return Message{
		ClusterID: conn.ClusterID,
		Path:      conn.Path,
		Query:     conn.Query,
		UserID:    conn.UserID,
		Data:      data,
		Binary:    messageType == websocket.BinaryMessage,
		Type:      "DATA",
	}
}

// cleanupConnections closes and removes all connections.
func (m *Multiplexer) cleanupConnections() {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	for key, conn := range m.connections {
		conn.updateStatus(StateClosed, nil)
		delete(m.connections, key)
	}
}

// getClusterConfig retrieves the REST config for a given cluster.
func (m *Multiplexer) getClusterContext(clusterID string) (*kubeconfig.Context, error) {
	ctxtProxy, err := m.kubeConfigStore.GetContext(clusterID)
	if err != nil {
		return nil, fmt.Errorf("getting context: %v", err)
	}

	return ctxtProxy, nil
}

// CloseConnection closes a specific connection based on its identifier.
func (m *Multiplexer) CloseConnection(clusterID, path, userID string) {
	connKey := m.createConnectionKey(clusterID, path, userID)

	m.mutex.Lock()

	conn, exists := m.connections[connKey]
	if !exists {
		m.mutex.Unlock()
		return
	}

	delete(m.connections, connKey)
	m.mutex.Unlock()

	conn.updateStatus(StateClosed, nil)
	conn.safeClose()
}

// createConnectionKey creates a unique key for a connection based on cluster ID, path, and user ID.
func (m *Multiplexer) createConnectionKey(clusterID, path, userID string) string {
	return fmt.Sprintf("%s:%s:%s", clusterID, path, userID)
}

// createWebSocketURL creates a WebSocket URL from the given parameters.
// It converts HTTP schemes to WebSocket schemes: https:// -> wss://, http:// -> ws://.
// If url.Parse fails, a warning is logged and a fallback invalid WebSocket URL is returned,
// which will cause the connection attempt to fail with a clear error.
func createWebSocketURL(host, path, query string) string {
	// If host doesn't have a scheme, prepend https:// for proper parsing
	if !strings.Contains(host, "://") {
		host = "https://" + host
	}

	u, err := url.Parse(host)
	if err != nil {
		// Log a warning but continue with best effort - the connection will fail anyway
		logger.Log(logger.LevelWarn, nil, err, "parsing cluster host URL")
		// Return a fallback URL that will cause a clear connection error
		return SecureWebSocketScheme + "://invalid-url" + path
	}

	// Convert HTTP/HTTPS scheme to WebSocket scheme and preserve existing ws/wss schemes.
	switch u.Scheme {
	case "https":
		u.Scheme = SecureWebSocketScheme
	case "http":
		u.Scheme = "ws"
	case "ws", SecureWebSocketScheme:
		// Preserve existing WebSocket scheme
	default:
		// For unknown schemes, default to secure WebSocket.
		u.Scheme = SecureWebSocketScheme
	}

	u.Path = singleJoiningSlash(u.Path, path)
	u.RawQuery = query

	return u.String()
}

// singleJoiningSlash joins two URL paths with a single slash, mirroring the
// helper used by net/http/httputil. It preserves the cluster server's path
// prefix (e.g. when the kubeconfig points at a reverse-proxy that routes by
// URL path such as Warpgate).
func singleJoiningSlash(a, b string) string {
	aslash := strings.HasSuffix(a, "/")
	bslash := strings.HasPrefix(b, "/")

	switch {
	case aslash && bslash:
		return a + b[1:]
	case !aslash && !bslash:
		return a + "/" + b
	}

	return a + b
}
