package main

import (
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
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
	// Authentication token.
	Token *string
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
	// Authentication token.
	Token *string `json:"token"`
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
func NewMultiplexer(kubeConfigStore kubeconfig.ContextStore) *Multiplexer {
	return &Multiplexer{
		connections:     make(map[string]*Connection),
		kubeConfigStore: kubeConfigStore,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

// updateStatus updates the status of a connection and notifies the client.
func (c *Connection) updateStatus(state ConnectionState, err error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return
	}

	c.Status.State = state
	c.Status.LastMsg = time.Now()
	c.Status.Error = ""

	if err != nil {
		c.Status.Error = err.Error()
	}

	if c.Client == nil {
		return
	}

	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	// Check if connection is closed before writing
	if c.closed {
		return
	}

	statusData := struct {
		State string `json:"state"`
		Error string `json:"error"`
	}{
		State: string(state),
		Error: c.Status.Error,
	}

	jsonData, jsonErr := json.Marshal(statusData)
	if jsonErr != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterID": c.ClusterID}, jsonErr, "marshaling status message")

		return
	}

	statusMsg := Message{
		ClusterID: c.ClusterID,
		Path:      c.Path,
		Data:      string(jsonData),
		Type:      "STATUS",
	}

	if err := c.Client.WriteJSON(statusMsg); err != nil {
		if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
			logger.Log(logger.LevelError, map[string]string{"clusterID": c.ClusterID}, err, "writing status message to client")
		}

		c.closed = true
	}
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
	config, err := m.getClusterConfigWithFallback(clusterID, userID)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"clusterID": clusterID}, err, "getting cluster config")
		return nil, err
	}

	connection := m.createConnection(clusterID, userID, path, query, clientConn, token)

	wsURL := createWebSocketURL(config.Host, path, query)

	tlsConfig, err := rest.TLSConfigFor(config)
	if err != nil {
		connection.updateStatus(StateError, err)

		return nil, fmt.Errorf("failed to get TLS config: %v", err)
	}

	conn, err := m.dialWebSocket(wsURL, tlsConfig, config.Host, token)
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
	// Try to get config for stateful cluster first.
	config, err := m.getClusterConfig(clusterID)
	if err != nil {
		// If not found, try with the combined key for stateless clusters.
		combinedKey := fmt.Sprintf("%s%s", clusterID, userID)

		config, err = m.getClusterConfig(combinedKey)
		if err != nil {
			return nil, fmt.Errorf("getting cluster config: %v", err)
		}
	}

	return config, nil
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

	if token != nil {
		dialer.Subprotocols = []string{
			"base64.binary.k8s.io",
			"base64url.bearer.authorization.k8s.io." + base64.RawStdEncoding.EncodeToString([]byte(*token)),
		}
	}

	conn, resp, err := dialer.Dial(
		wsURL,
		http.Header{
			"Origin": {host},
		},
	)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "dialing WebSocket")
		logger.Log(logger.LevelError, nil, resp, "WebSocket response")
		// We only attempt to close the response body if there was an error and resp is not nil.
		// In the successful case (when err is nil), the resp will actually be nil for WebSocket connections,
		// so we don't need to close anything.
		if resp != nil {
			defer resp.Body.Close()
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
	if conn.closed {
		return nil, fmt.Errorf("cannot reconnect closed connection")
	}

	if conn.WSConn != nil {
		conn.WSConn.Close()
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

	defer clientConn.Close()

	lockClientConn := NewWSConnLock(clientConn)

	for {
		msg, err := m.readClientMessage(clientConn)
		if err != nil {
			break
		}

		// Check if it's a close message
		if msg.Type == "CLOSE" {
			m.CloseConnection(msg.ClusterID, msg.Path, msg.UserID)

			continue
		}

		conn, err := m.getOrCreateConnection(msg, lockClientConn)
		if err != nil {
			m.handleConnectionError(lockClientConn, msg, err)

			continue
		}

		if msg.Type == "REQUEST" && conn.Status.State == StateConnected {
			err = m.writeMessageToCluster(conn, []byte(msg.Data))
			if err != nil {
				continue
			}
		}
	}

	m.cleanupConnections()
}

// readClientMessage reads a message from the client WebSocket connection.
func (m *Multiplexer) readClientMessage(clientConn *websocket.Conn) (Message, error) {
	var msg Message

	_, rawMessage, err := clientConn.ReadMessage()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading message")

		return Message{}, err
	}

	err = json.Unmarshal(rawMessage, &msg)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "unmarshaling message")

		return Message{}, err
	}

	return msg, nil
}

// getOrCreateConnection gets an existing connection or creates a new one if it doesn't exist.
func (m *Multiplexer) getOrCreateConnection(msg Message, clientConn *WSConnLock) (*Connection, error) {
	connKey := m.createConnectionKey(msg.ClusterID, msg.Path, msg.UserID)

	m.mutex.RLock()
	conn, exists := m.connections[connKey]
	m.mutex.RUnlock()

	if !exists {
		var err error

		conn, err = m.establishClusterConnection(msg.ClusterID, msg.UserID, msg.Path, msg.Query, clientConn, msg.Token)
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
	}

	return conn, nil
}

// handleConnectionError handles errors that occur when establishing a connection.
func (m *Multiplexer) handleConnectionError(clientConn *WSConnLock, msg Message, err error) {
	errorMsg := struct {
		ClusterID string `json:"clusterId"`
		Error     string `json:"error"`
	}{
		ClusterID: msg.ClusterID,
		Error:     err.Error(),
	}

	if err = clientConn.WriteJSON(errorMsg); err != nil {
		logger.Log(
			logger.LevelError,
			map[string]string{"clusterID": msg.ClusterID},
			err,
			"writing error message to client",
		)
	}

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
// Parameters:
//   - message: The JSON-encoded message containing resource information.
//   - conn: The connection object representing the current connection.
//   - clientConn: The WebSocket connection to the client.
//   - lastResourceVersion: A pointer to the last known resource version string.
//
// Returns:
//   - An error if any issues occur while processing the message, or nil if successful.
func (m *Multiplexer) sendIfNewResourceVersion(
	message []byte,
	conn *Connection,
	clientConn *WSConnLock,
	lastResourceVersion *string,
) error {
	var obj map[string]interface{}
	if err := json.Unmarshal(message, &obj); err != nil {
		return fmt.Errorf("error unmarshaling message: %v", err)
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

	conn.mu.RUnlock()

	completeMsg := Message{
		ClusterID: conn.ClusterID,
		Path:      conn.Path,
		Query:     conn.Query,
		UserID:    conn.UserID,
		Type:      "COMPLETE",
	}

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
	defer conn.writeMu.Unlock()

	if err := clientConn.WriteJSON(dataMsg); err != nil {
		return err
	}

	conn.mu.Lock()
	conn.Status.LastMsg = time.Now()
	conn.mu.Unlock()

	return nil
}

// cleanupConnection performs cleanup for a connection.
func (m *Multiplexer) cleanupConnection(conn *Connection) {
	conn.mu.Lock()
	defer conn.mu.Unlock() // Ensure the mutex is unlocked even if an error occurs

	conn.closed = true

	if conn.WSConn != nil {
		conn.WSConn.Close()
	}

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
		close(conn.Done)

		if conn.WSConn != nil {
			conn.WSConn.Close()
		}

		delete(m.connections, key)
	}
}

// getClusterConfig retrieves the REST config for a given cluster.
func (m *Multiplexer) getClusterConfig(clusterID string) (*rest.Config, error) {
	ctxtProxy, err := m.kubeConfigStore.GetContext(clusterID)
	if err != nil {
		return nil, fmt.Errorf("getting context: %v", err)
	}

	clientConfig, err := ctxtProxy.RESTConfig()
	if err != nil {
		return nil, fmt.Errorf("getting REST config: %v", err)
	}

	return clientConfig, nil
}

// CloseConnection closes a specific connection based on its identifier.
func (m *Multiplexer) CloseConnection(clusterID, path, userID string) {
	connKey := m.createConnectionKey(clusterID, path, userID)

	m.mutex.Lock()

	conn, exists := m.connections[connKey]
	if !exists {
		m.mutex.Unlock()
		// Don't log error for non-existent connections during cleanup
		return
	}

	// Mark as closed before releasing the lock
	conn.mu.Lock()
	if conn.closed {
		conn.mu.Unlock()
		m.mutex.Unlock()
		logger.Log(logger.LevelError, map[string]string{"clusterID": conn.ClusterID}, nil, "closing connection")

		return
	}

	conn.closed = true
	conn.mu.Unlock()

	delete(m.connections, connKey)
	m.mutex.Unlock()

	// Lock the connection mutex before accessing shared resources
	conn.mu.Lock()
	defer conn.mu.Unlock() // Ensure the mutex is unlocked after the operations

	// Close the Done channel and connections after removing from map
	close(conn.Done)

	if conn.WSConn != nil {
		conn.WSConn.Close()
	}
}

// createConnectionKey creates a unique key for a connection based on cluster ID, path, and user ID.
func (m *Multiplexer) createConnectionKey(clusterID, path, userID string) string {
	return fmt.Sprintf("%s:%s:%s", clusterID, path, userID)
}

// createWebSocketURL creates a WebSocket URL from the given parameters.
func createWebSocketURL(host, path, query string) string {
	u, _ := url.Parse(host)
	u.Scheme = "wss"
	u.Path = path
	u.RawQuery = query

	return u.String()
}
