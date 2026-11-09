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
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	authenticationv1 "k8s.io/api/authentication/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	utilnet "k8s.io/apimachinery/pkg/util/net"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/transport"
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
	// TerminalGracePeriod is how long a detached terminal session is kept for its client to reattach.
	TerminalGracePeriod = 30 * time.Second
	// HandshakeTimeout is the timeout for the handshake with the client.
	HandshakeTimeout = 45 * time.Second
	// CleanupRoutineInterval is the interval at which the multiplexer cleans up unused connections.
	CleanupRoutineInterval = 5 * time.Minute
	// SecureWebSocketScheme is the secure WebSocket scheme.
	SecureWebSocketScheme = "wss"
	// MultiplexerProtocol is the public subprotocol selected for client connections.
	MultiplexerProtocol = "headlamp.multiplexer.k8s.io"
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

// BufferedMessage represents a message buffered during client disconnection.
type BufferedMessage struct {
	Type int
	Data []byte
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
	// clusterWriteMu serializes data writes to WSConn, which allows one writer at a time.
	clusterWriteMu sync.Mutex
	// closed is a flag to indicate if the connection is closed.
	closed bool
	// usesServiceAccountToken is true when Token was loaded from the
	// in-cluster service account token file.
	usesServiceAccountToken bool
	// Authentication token.
	Token *string
	// ownerToken is the requester's token that opened a terminal session; only a
	// request presenting the same token may reattach to the session after a disconnect.
	ownerToken *string
	// closeOnce is used to ensure the connection is closed only once.
	closeOnce sync.Once
	// Buffer for messages when client is disconnected.
	Buffer []BufferedMessage
	// BufferBytes is the total size in bytes of the messages in Buffer.
	BufferBytes int
	// isFlushing is true when the connection is flushing its buffer during reconnect.
	isFlushing bool
	// drained is set while a client that took the session over is sent what was
	// buffered during the takeover, and closed when that ends. The session stays
	// reserved for the client until then, and output for it waits, to follow that.
	drained chan struct{}
	// attachment changes when a client starts taking the session over, so a write
	// to the client the cluster reader picked before can tell that it may be stale.
	attachment atomic.Uint64
	// cleanupTimer is a timer that cleans up the connection if the client does not reconnect.
	cleanupTimer *time.Timer
	// upstreamClosed is true when the backend cluster connection has closed.
	upstreamClosed bool
	// upstreamErr is why the cluster connection closed, unless it ended normally.
	upstreamErr error
	// ownerIdentity is the user the API server identified ownerToken as, or empty
	// if it could not tell. It lets the owner reattach after their token changed.
	ownerIdentity string
	// ownerIdentityReady is closed once ownerIdentity is looked up, or nil if it is not.
	ownerIdentityReady chan struct{}
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
	// proxyAuthTokenHeader is the request header an authenticating proxy passes the
	// user's token in, or empty if proxy auth is not configured to pass one.
	proxyAuthTokenHeader string
	// unsafeUseServiceAccountToken forces in-cluster contexts to use their token file.
	unsafeUseServiceAccountToken bool
	// saTokenCache caches service account tokens keyed by file path; refreshed when mtime changes.
	saTokenCache map[string]saTokenCacheEntry
	// saTokenMu guards saTokenCache.
	saTokenMu sync.RWMutex
	// heartbeatInterval is how often cluster connections are pinged.
	heartbeatInterval time.Duration
	// terminalGracePeriod is how long a detached terminal session is kept.
	terminalGracePeriod time.Duration
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

// clientWriteTimeout bounds each write to a client. A client whose network dropped
// stops reading without the backend knowing, and a write to it would otherwise block
// the session until TCP gives up.
var clientWriteTimeout = 10 * time.Second

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

	_ = conn.conn.SetWriteDeadline(time.Now().Add(clientWriteTimeout))

	return conn.closeOnError(conn.conn.WriteJSON(v))
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

	_ = conn.conn.SetWriteDeadline(time.Now().Add(clientWriteTimeout))

	return conn.closeOnError(conn.conn.WriteMessage(messageType, data))
}

// closeOnError closes the connection after a failed write and returns err. Once a
// write fails, e.g. because it timed out, none can succeed, so closing ends the read
// loop: the client's sessions are cleaned up and the client sees the connection close
// and reconnects. The caller holds writeMu.
func (conn *WSConnLock) closeOnError(err error) error {
	if err != nil {
		_ = conn.conn.Close()
	}

	return err
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
		heartbeatInterval:            HeartbeatInterval,
		terminalGracePeriod:          TerminalGracePeriod,
		upgrader: websocket.Upgrader{
			Subprotocols: []string{MultiplexerProtocol},
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

// readServiceAccountToken reads the service account token from path, caching the value
// per path and refreshing it when the file's mtime changes (e.g. kubelet token rotation).
func (m *Multiplexer) readServiceAccountToken(path string) (string, error) {
	stat, err := os.Stat(path) //nolint:gosec // Service account token file path from cluster config
	if err != nil {
		return "", fmt.Errorf("stat service account token file: %w", err)
	}

	m.saTokenMu.RLock()
	entry, ok := m.saTokenCache[path]
	m.saTokenMu.RUnlock()

	if ok && entry.modTime.Equal(stat.ModTime()) {
		return entry.token, nil
	}

	tokenBytes, err := os.ReadFile(path) //nolint:gosec // Service account token file path from cluster config
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
				map[string]string{logFieldClusterID: c.ClusterID},
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

	statusMsg, err := c.statusMessageLocked()
	if err != nil {
		return err
	}

	return c.Client.WriteJSON(statusMsg)
}

// statusMessageLocked returns the message that reports the connection's status.
// The caller must hold c.mu.
func (c *Connection) statusMessageLocked() (Message, error) {
	statusData := struct {
		State string `json:"state"`
		Error string `json:"error"`
	}{
		State: string(c.Status.State),
		Error: c.Status.Error,
	}

	jsonData, jsonErr := json.Marshal(statusData)
	if jsonErr != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldClusterID: c.ClusterID}, jsonErr, "marshaling status message")

		return Message{}, jsonErr
	}

	return Message{
		ClusterID: c.ClusterID,
		Path:      c.Path,
		Data:      string(jsonData),
		Type:      "STATUS",
	}, nil
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
		logger.Log(logger.LevelError, map[string]string{logFieldClusterID: clusterID}, err, "getting cluster config")
		return nil, err
	}

	config, err := clusterContext.RESTConfig()
	if err != nil {
		return nil, fmt.Errorf("getting REST config: %w", err)
	}

	authToken, err := m.clusterConnectionToken(clusterContext, token)
	if err != nil {
		return nil, err
	}

	connection := m.createConnection(clusterID, userID, path, query, clientConn, authToken)
	connection.ownerToken = token

	if isTerminalPath(path) && token != nil {
		connection.startOwnerIdentityLookup(config, *token)
	}

	if m.unsafeUseServiceAccountToken && clusterContext.UsesInClusterServiceAccountToken() {
		connection.usesServiceAccountToken = true
	}

	wsURL := createWebSocketURL(config.Host, path, query)

	conn, err := m.dialWebSocket(wsURL, config, authToken)
	if err != nil {
		connection.updateStatus(StateError, err)

		return nil, err
	}

	connection.WSConn = conn
	connection.updateStatus(StateConnected, nil)

	m.mutex.Lock()
	connKey := m.createConnectionKey(clusterID, path, userID, query)
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
		return nil, fmt.Errorf("getting REST config: %w", err)
	}

	return config, nil
}

func (m *Multiplexer) getClusterContextWithFallback(clusterID, userID string) (*kubeconfig.Context, error) {
	// A cluster the user uploaded is stored under its stateless context key, and is
	// used over a shared cluster of the same name, as the cluster proxy does, which
	// the frontend sends the user's other requests for the cluster to.
	clusterContext, err := m.getClusterContext(statelessContextKey(clusterID, userID))
	if userID != "" && errors.Is(err, cache.ErrNotFound) {
		clusterContext, err = m.getClusterContext(clusterID)
	}

	if err != nil {
		return nil, fmt.Errorf("getting cluster config: %w", err)
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

// dialWebSocket opens a WebSocket to the cluster at wsURL. It goes through the same
// client-go transport wrappers as the cluster proxy, so the connection carries the
// context's credentials (tokens, exec plugins, auth providers, basic auth,
// impersonation) and proxy settings. A token from the request takes precedence over
// the context's own, as it does for the proxy.
func (m *Multiplexer) dialWebSocket(wsURL string, config *rest.Config, token *string) (*websocket.Conn, error) {
	transportConfig, err := kubeconfig.TransportConfigFor(config)
	if err != nil {
		return nil, fmt.Errorf("getting transport config: %w", err)
	}

	tlsConfig, err := transport.TLSConfigFor(transportConfig)
	if err != nil {
		return nil, fmt.Errorf("getting TLS config: %w", err)
	}

	proxy := config.Proxy
	if proxy == nil {
		proxy = utilnet.NewProxierWithNoProxyCIDR(http.ProxyFromEnvironment)
	}

	dialer := &websocketDialer{dialer: websocket.Dialer{
		TLSClientConfig:  tlsConfig,
		HandshakeTimeout: HandshakeTimeout,
		Proxy:            proxy,
	}}

	if u, err := url.Parse(wsURL); err == nil && isTerminalPath(u.Path) {
		dialer.dialer.Subprotocols = terminalSubprotocols
	}

	roundTripper, err := transport.HTTPWrappersForConfig(transportConfig, dialer)
	if err != nil {
		return nil, fmt.Errorf("setting up cluster credentials: %w", err)
	}

	conn, resp, err := dialer.dial(roundTripper, wsURL, config.Host, token)

	// An exec plugin's credential can expire before the plugin says so. The 401 made
	// client-go refresh it, so try once more, as the cluster proxy does.
	if conn == nil && token == nil && config.ExecProvider != nil &&
		resp != nil && resp.StatusCode == http.StatusUnauthorized {
		_ = resp.Body.Close()
		conn, resp, err = dialer.dial(roundTripper, wsURL, config.Host, token)
	}

	if conn == nil {
		logDialFailure(err, resp)

		return nil, fmt.Errorf("dialing WebSocket: %w", err)
	}

	_ = resp.Body.Close()

	return conn, nil
}

// logDialFailure logs a failed cluster WebSocket dial, with the server's response if
// there was one, and closes its body.
func logDialFailure(err error, resp *http.Response) {
	logger.Log(logger.LevelError, nil, err, "dialing WebSocket")

	if resp == nil {
		return
	}

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

	_ = resp.Body.Close()
}

// websocketDialer is the innermost round tripper of a cluster WebSocket dial: the
// client-go wrappers around it add the credentials, and it performs the handshake.
type websocketDialer struct {
	dialer websocket.Dialer
	conn   *websocket.Conn
	err    error
}

// dial performs one handshake through roundTripper. It returns the connection, or nil
// with the server's response, if there was one, and why the handshake failed.
func (d *websocketDialer) dial(
	roundTripper http.RoundTripper,
	wsURL, host string,
	token *string,
) (*websocket.Conn, *http.Response, error) {
	d.conn, d.err = nil, nil

	//nolint:gosec // wsURL is built from the configured cluster's server address.
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, wsURL, nil)
	if err != nil {
		return nil, nil, err
	}

	req.Header.Set("Origin", host)

	if token != nil {
		req.Header.Set("Authorization", "Bearer "+*token)
	}

	resp, err := roundTripper.RoundTrip(req)
	if err != nil {
		return nil, resp, err
	}

	return d.conn, resp, d.err
}

// RoundTrip performs the handshake. When the server answers without upgrading, it
// returns that response without an error, so client-go's wrappers see it, e.g. the
// exec plugin authenticator refreshing its credential after a 401.
func (d *websocketDialer) RoundTrip(req *http.Request) (*http.Response, error) {
	conn, resp, err := d.dialer.DialContext(req.Context(), req.URL.String(), req.Header)
	if err != nil {
		if resp != nil {
			d.err = err

			return resp, nil
		}

		return nil, err
	}

	d.conn = conn

	return resp, nil
}

// monitorConnection monitors the health of a connection and attempts to reconnect if necessary.
func (m *Multiplexer) monitorConnection(conn *Connection) {
	heartbeat := time.NewTicker(m.heartbeatInterval)
	defer heartbeat.Stop()

	for {
		select {
		case <-conn.Done:
			conn.updateStatus(StateClosed, nil)

			return
		case <-heartbeat.C:
			conn.mu.RLock()
			upstreamClosed := conn.upstreamClosed
			conn.mu.RUnlock()

			// An ended terminal stream is only kept for its buffered output until
			// the client reattaches or the grace period expires. Reconnecting it
			// would replace the session and lose that output.
			if upstreamClosed {
				return
			}

			// WriteControl may run concurrently with the data writes of writeMessageToCluster.
			if err := conn.WSConn.WriteControl(
				websocket.PingMessage, nil, time.Now().Add(HeartbeatInterval),
			); err != nil {
				// Reconnecting a terminal would start a new exec without a reader in
				// place of the session. Close it instead, so its reader reports the
				// break after any output a drain is still writing: to the client, or
				// on reattach after the client returns. Its status is not written
				// here, as that would wait for such a drain holding the session's lock.
				if isTerminalPath(conn.Path) {
					_ = conn.WSConn.Close()

					return
				}

				conn.updateStatus(StateError, fmt.Errorf("heartbeat failed: %w", err))

				if newConn, err := m.reconnect(conn); err != nil {
					logger.Log(logger.LevelError, map[string]string{logFieldClusterID: conn.ClusterID}, err, "reconnecting to cluster")
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

	// A service account connection re-reads its token file, so pass the requester's
	// token to keep it as the owner of the new connection.
	conn.mu.RLock()

	token := conn.Token
	if conn.usesServiceAccountToken {
		token = conn.ownerToken
	}

	conn.mu.RUnlock()

	newConn, err := m.establishClusterConnection(
		conn.ClusterID,
		conn.UserID,
		conn.Path,
		conn.Query,
		conn.Client,
		token,
	)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldClusterID: conn.ClusterID}, err, "reconnecting to cluster")

		return nil, err
	}

	m.mutex.Lock()
	m.connections[m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, conn.Query)] = newConn
	m.mutex.Unlock()

	return newConn, nil
}

// HandleClientWebSocket handles incoming WebSocket connections from clients.
func (m *Multiplexer) HandleClientWebSocket(w http.ResponseWriter, r *http.Request) {
	// Under a cluster's path, only that cluster's streams are served, as the path
	// alone tells apart the auth cookies of clusters whose cookie names are the same.
	pathCluster := mux.Vars(r)["clusterName"]

	// The OIDC refresh middleware may have renewed the token of the cluster in the
	// path, setting its cookies on w. The upgrade response has only the headers
	// passed to Upgrade, so they are passed, as the browser must get the renewed
	// token: the refresh token it replaced may be used only once. r still has the
	// old cookies, so the renewed ones are applied to it.
	var responseHeader http.Header
	if setCookies := w.Header().Values("Set-Cookie"); len(setCookies) > 0 {
		responseHeader = http.Header{"Set-Cookie": setCookies}
		r = withSetCookies(r, setCookies)
	}

	clientConn, err := m.upgrader.Upgrade(w, r, responseHeader)
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

		if pathCluster != "" && msg.ClusterID != pathCluster {
			m.sendClientError(lockClientConn, msg.ClusterID, msg.Path, msg.Query, msg.UserID,
				fmt.Errorf("cluster %q is not served at this path", msg.ClusterID))

			continue
		}

		m.processClientMessage(r, lockClientConn, msg)
	}
}

// withSetCookies returns a copy of r with the cookies that setCookies set, and
// without those it deletes.
func withSetCookies(r *http.Request, setCookies []string) *http.Request {
	set := (&http.Response{Header: http.Header{"Set-Cookie": setCookies}}).Cookies()
	updated := r.Clone(r.Context())
	updated.Header.Del("Cookie")

	for _, cookie := range r.Cookies() {
		if !slices.ContainsFunc(set, func(c *http.Cookie) bool { return c.Name == cookie.Name }) {
			updated.AddCookie(cookie)
		}
	}

	for _, cookie := range set {
		if cookie.MaxAge >= 0 {
			//nolint:gosec // A request cookie has no attributes.
			updated.AddCookie(&http.Cookie{Name: cookie.Name, Value: cookie.Value})
		}
	}

	return updated
}

// requestToken returns the requester's token for cluster, as the cluster proxy
// takes it: from the header an authenticating proxy passes it in, if configured,
// or else from the cluster's auth cookie.
func (m *Multiplexer) requestToken(r *http.Request, cluster string) (string, error) {
	if m.proxyAuthTokenHeader != "" {
		if token := strings.TrimSpace(r.Header.Get(m.proxyAuthTokenHeader)); token != "" {
			return token, nil
		}
	}

	return auth.GetTokenFromCookie(r, cluster)
}

// processClientMessage processes a single client message that has been verified to be routable.
func (m *Multiplexer) processClientMessage(
	r *http.Request,
	lockClientConn *WSConnLock,
	msg Message,
) {
	if msg.Type != "REQUEST" && msg.Type != "CLOSE" {
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

	token, err := m.requestToken(r, msg.ClusterID)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldClusterID: msg.ClusterID}, err, "getting token from cookie")
		m.sendClientError(lockClientConn, msg.ClusterID, msg.Path, msg.Query, msg.UserID, err)

		return
	}

	var tokenPtr *string
	if token != "" {
		tokenPtr = &token
	}

	if msg.Type == "CLOSE" {
		// Only the owner may end a terminal session, as only the owner may reattach to it.
		if !m.isConnectionOwner(msg, tokenPtr) {
			m.sendClientError(lockClientConn, msg.ClusterID, msg.Path, msg.Query, msg.UserID,
				errors.New("terminal session belongs to a different authenticated session"))

			return
		}

		m.CloseConnection(msg.ClusterID, msg.Path, msg.UserID, msg.Query)

		return
	}

	conn, err := m.getOrCreateConnection(msg, lockClientConn, tokenPtr)
	if errors.Is(err, errInputFromDetachedClient) {
		// Dropped quietly: a replaced client was told its session moved, and an error
		// would make it retry, taking the session back.
		return
	}

	if err != nil {
		m.handleConnectionError(lockClientConn, msg, err)

		return
	}

	// A REQUEST without data only opens or reattaches the connection.
	if conn.Status.State == StateConnected && msg.Data != "" {
		m.writeClientInput(lockClientConn, conn, msg)
	}
}

// writeClientInput writes the data of a client message to the cluster connection.
func (m *Multiplexer) writeClientInput(lockClientConn *WSConnLock, conn *Connection, msg Message) {
	data := []byte(msg.Data)

	// Terminal input is binary, as its first byte selects the channel.
	if msg.Binary {
		var err error

		data, err = base64.StdEncoding.DecodeString(msg.Data)
		if err != nil {
			m.sendClientError(lockClientConn, msg.ClusterID, msg.Path, msg.Query, msg.UserID, err)

			return
		}
	}

	_ = m.writeMessageToCluster(conn, data)
}

// isTerminalPath reports whether the given connection path represents an interactive
// terminal session (exec or attach). The check uses path suffix matching to avoid
// false-positives for resource names that happen to contain "exec" or "attach"
// (e.g. /api/v1/namespaces/default/pods/exec-runner/log).
func isTerminalPath(path string) bool {
	return strings.HasSuffix(path, "/exec") || strings.HasSuffix(path, "/attach")
}

// terminalSubprotocols are the Kubernetes channel protocols requested for exec and
// attach streams, newest first, matching the frontend's direct terminal streams.
var terminalSubprotocols = []string{"v4.channel.k8s.io", "v3.channel.k8s.io", "v2.channel.k8s.io", "channel.k8s.io"}

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

			isTerm := isTerminalPath(conn.Path)
			if !isTerm {
				delete(m.connections, key)
			}
		}
	}
	m.mutex.Unlock()

	for _, conn := range connsToClose {
		disconnectedAt := time.Now()

		isTerm := isTerminalPath(conn.Path)

		conn.mu.Lock()

		detached := conn.Client == clientConn
		if detached {
			conn.Client = nil
			conn.Status.State = StateClosed
			conn.Status.LastMsg = disconnectedAt

			conn.Status.Error = ""
			if isTerm {
				m.startCleanupTimer(conn)
			}
		}
		conn.mu.Unlock()

		if !isTerm && detached {
			conn.safeClose()
		}
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

// handleNewConnection establishes a new cluster connection and starts handling its messages.
func (m *Multiplexer) handleNewConnection(msg Message, clientConn *WSConnLock, token *string) (*Connection, error) {
	conn, err := m.establishClusterConnection(msg.ClusterID, msg.UserID, msg.Path, msg.Query, clientConn, token)
	if err != nil {
		logger.Log(
			logger.LevelError,
			map[string]string{logFieldClusterID: msg.ClusterID, "UserID": msg.UserID},
			err,
			"establishing cluster connection",
		)

		return nil, err
	}

	go m.handleClusterMessages(conn)

	return conn, nil
}

// getOrCreateConnection gets an existing connection or creates a new one if it doesn't exist.
// If a connection exists and a new token is provided, it updates the token to ensure it's fresh.
func (m *Multiplexer) getOrCreateConnection(msg Message, clientConn *WSConnLock, token *string) (*Connection, error) {
	connKey := m.createConnectionKey(msg.ClusterID, msg.Path, msg.UserID, msg.Query)

	m.mutex.RLock()
	conn, exists := m.connections[connKey]
	m.mutex.RUnlock()

	isInput := msg.Data != ""

	if !exists {
		// Input never opens a terminal session; it comes from a client whose session ended.
		if isInput && isTerminalPath(msg.Path) {
			return nil, errInputFromDetachedClient
		}

		return m.handleNewConnection(msg, clientConn, token)
	}

	if isTerminalPath(conn.Path) {
		if !m.ownsTerminal(conn, token) {
			return nil, errors.New("terminal session belongs to a different authenticated session")
		}

		if !m.handleTerminalReconnect(conn, clientConn, !isInput) {
			if isInput {
				return nil, errInputFromDetachedClient
			}

			return nil, fmt.Errorf("terminal session could not be reattached (busy or flush failed)")
		}
	}

	if err := m.refreshConnectionToken(conn, token); err != nil {
		return nil, err
	}

	return conn, nil
}

// errInputFromDetachedClient is returned for terminal input from a client that is not
// attached to the session, e.g. one a reattach replaced, which is told so separately.
var errInputFromDetachedClient = errors.New("terminal input from a client that is not attached")

// sessionMovedMessage is shown in a terminal whose session was taken over by a reattach.
const sessionMovedMessage = "The terminal session was opened in another window."

// notifySessionMoved tells a client that a reattach replaced that its session moved,
// with a closed status the terminal shows, so it ends without retrying. It writes
// through the client's own connection lock only, so a dead client cannot hold up the
// session's other writes.
func (m *Multiplexer) notifySessionMoved(conn *Connection, client *WSConnLock) {
	data, err := json.Marshal(struct {
		State string `json:"state"`
		Error string `json:"error"`
	}{State: string(StateClosed), Error: sessionMovedMessage})
	if err != nil {
		return
	}

	_ = client.WriteJSON(Message{
		ClusterID: conn.ClusterID,
		Path:      conn.Path,
		Query:     conn.Query,
		UserID:    conn.UserID,
		Type:      "STATUS",
		Data:      string(data),
	})
}

// isConnectionOwner reports whether a request with token may act on the connection msg
// names. Only terminal sessions have an owner; other connections, and connections that
// don't exist, are not restricted.
func (m *Multiplexer) isConnectionOwner(msg Message, token *string) bool {
	m.mutex.RLock()
	conn, exists := m.connections[m.createConnectionKey(msg.ClusterID, msg.Path, msg.UserID, msg.Query)]
	m.mutex.RUnlock()

	return !exists || !isTerminalPath(conn.Path) || m.ownsTerminal(conn, token)
}

// ownsTerminal reports whether a request with token may act on the terminal session
// conn. It may when token opened the session, or when the API server identifies token
// as the same user, e.g. after an OIDC token refresh; the session then belongs to the
// new token.
func (m *Multiplexer) ownsTerminal(conn *Connection, token *string) bool {
	if conn.isOwnedBy(token) {
		return true
	}

	if conn.ownerIdentityReady != nil {
		<-conn.ownerIdentityReady
	}

	conn.mu.RLock()
	identity := conn.ownerIdentity
	conn.mu.RUnlock()

	if identity == "" || token == nil {
		return false
	}

	clusterContext, err := m.getClusterContextWithFallback(conn.ClusterID, conn.UserID)
	if err != nil {
		return false
	}

	config, err := clusterContext.RESTConfig()
	if err != nil || tokenIdentity(config, *token) != identity {
		return false
	}

	conn.mu.Lock()
	conn.ownerToken = token
	conn.mu.Unlock()

	return true
}

// startOwnerIdentityLookup looks up who the owner of a new terminal session is,
// alongside the dial rather than delaying every terminal.
func (c *Connection) startOwnerIdentityLookup(config *rest.Config, token string) {
	ready := make(chan struct{})
	c.ownerIdentityReady = ready

	go func() {
		defer close(ready)

		identity := tokenIdentity(config, token)

		c.mu.Lock()
		c.ownerIdentity = identity
		c.mu.Unlock()
	}()
}

// tokenIdentity returns the user the API server identifies token as, or "" when it
// cannot tell, e.g. before Kubernetes 1.28 or when self subject reviews are denied.
// The token is the only credential sent, so a client certificate or impersonation in
// the kubeconfig cannot make different tokens look like the same user.
func tokenIdentity(config *rest.Config, token string) string {
	reviewConfig := rest.AnonymousClientConfig(config)
	reviewConfig.BearerToken = token
	reviewConfig.Timeout = 10 * time.Second

	clientset, err := kubernetes.NewForConfig(reviewConfig)
	if err != nil {
		return ""
	}

	review, err := clientset.AuthenticationV1().SelfSubjectReviews().Create(
		context.Background(), &authenticationv1.SelfSubjectReview{}, metav1.CreateOptions{},
	)
	if err != nil {
		logger.Log(logger.LevelInfo, nil, err, "reviewing terminal owner token")

		return ""
	}

	userInfo := review.Status.UserInfo
	// Every token that fails to authenticate is anonymous, so that is no identity.
	if userInfo.Username == "" || userInfo.Username == "system:anonymous" {
		return ""
	}

	return userInfo.Username + "\x00" + userInfo.UID
}

// isOwnedBy reports whether requestToken matches the token that opened the terminal session.
// Without a token on either side there is no principal to tell requesters apart, so any
// requester can already open a new session with the same credentials.
func (c *Connection) isOwnedBy(requestToken *string) bool {
	c.mu.RLock()
	ownerToken := c.ownerToken
	c.mu.RUnlock()

	if ownerToken == nil || requestToken == nil {
		return ownerToken == nil && requestToken == nil
	}

	return subtle.ConstantTimeCompare([]byte(*ownerToken), []byte(*requestToken)) == 1
}

// handleTerminalReconnect handles client reconnection to an existing terminal session,
// flushing any buffered terminal frames and starting a new cleanup timer if the client drops.
// reattach is whether the request opens or reattaches the session, rather than carrying input.
// It returns true if the client is attached, or reattached successfully, and false if the
// session was busy, the flush failed, or the request carries input from another client.
func (m *Multiplexer) handleTerminalReconnect(conn *Connection, clientConn *WSConnLock, reattach bool) bool {
	conn.mu.Lock()
	// Fast path: if the same client is already attached, don't enter flush mode on every
	// REQUEST. Input only goes to the session from that client, and never takes it over:
	// a client a reattach replaced may still send input it had queued.
	attached := conn.Client == clientConn && !conn.isFlushing
	if attached || !reattach {
		conn.mu.Unlock()
		return attached
	}

	var bufferToFlush []BufferedMessage

	// A takeover reserves the session until its drain ends, even for the client it
	// replaces. An attached client is replaced, as the owner check passed and after
	// a network drop the old connection may be dead without the backend knowing yet.
	alreadyConnected := conn.isFlushing || conn.drained != nil

	var replacedClient *WSConnLock

	if !alreadyConnected {
		if conn.Client != clientConn {
			replacedClient = conn.Client
		}

		conn.isFlushing = true
		conn.attachment.Add(1)

		if conn.cleanupTimer != nil {
			conn.cleanupTimer.Stop()
			conn.cleanupTimer = nil
		}

		bufferToFlush = conn.Buffer
		conn.Buffer = nil
		conn.BufferBytes = 0
	}
	conn.mu.Unlock()

	if alreadyConnected {
		return false
	}

	// Tell the replaced client the session moved, so it ends without retrying. It may
	// be dead, so the reattach does not wait for that write.
	if replacedClient != nil {
		go m.notifySessionMoved(conn, replacedClient)
	}

	flushFailed := false
	// Flush buffered messages to the newly connected client outside the lock
	for i, bm := range bufferToFlush {
		if err := m.sendDataMessage(conn, clientConn, bm.Type, bm.Data); err != nil {
			// Client dropped again during flush: re-buffer remaining messages and allow a future reconnect to retry.
			flushFailed = true

			remaining := append([]BufferedMessage(nil), bufferToFlush[i:]...)
			m.handleTerminalFlushFailure(conn, remaining, time.Now())

			break
		}
	}

	if !flushFailed {
		return m.drainBufferedMessages(conn, clientConn)
	}

	return false
}

func (m *Multiplexer) handleTerminalFlushFailure(
	conn *Connection,
	remaining []BufferedMessage,
	disconnectedAt time.Time,
) {
	conn.mu.Lock()
	conn.Client = nil
	conn.isFlushing = false
	conn.Status.State = StateClosed
	conn.Status.LastMsg = disconnectedAt
	conn.Status.Error = ""

	conn.enforceBufferCaps(remaining, true)

	m.startCleanupTimer(conn)
	conn.mu.Unlock()
}

// drainBufferedMessages sends the messages buffered while the earlier buffer was
// flushed, and attaches the client. The client is attached before they are sent, so
// no more are buffered: output arriving faster than it is sent would otherwise keep
// the drain, which runs in the client's read loop, and the client's requests waiting.
// Until these messages and the status are written, the cluster reader's sends to the
// client wait for drained, and the session stays reserved, so another client cannot
// take it over.
// It returns true if the drain was successful and the client attached, or false if it failed.
func (m *Multiplexer) drainBufferedMessages(conn *Connection, clientConn *WSConnLock) bool {
	conn.mu.Lock()
	tail := conn.Buffer
	conn.Buffer = nil
	conn.BufferBytes = 0
	conn.Client = clientConn
	conn.isFlushing = false
	drained := make(chan struct{})
	conn.drained = drained
	conn.Status.State = StateConnected
	conn.Status.LastMsg = time.Now()
	statusMsg, statusErr := conn.statusMessageLocked()
	sendStatus := statusErr == nil && !conn.closed
	isUpstreamClosed := conn.upstreamClosed
	upstreamErr := conn.upstreamErr
	conn.mu.Unlock()

	// The write lock is taken without the session's lock, as a write to the replaced
	// client may hold it until the write times out, and other clients disconnecting
	// need the session's lock meanwhile. Output arriving in the meantime waits for
	// drained instead of the write lock, so it cannot get ahead of the tail.
	conn.writeMu.Lock()

	for i, bm := range tail {
		if err := clientConn.WriteJSON(m.createWrapperMessage(conn, bm.Type, bm.Data)); err != nil {
			conn.writeMu.Unlock()
			m.handleTerminalDrainFailure(conn, tail[i:])

			return false
		}
	}

	// Tell the client it is attached, as a new connection is told.
	if sendStatus {
		_ = clientConn.WriteJSON(statusMsg)
	}
	conn.writeMu.Unlock()

	conn.mu.Lock()
	conn.endDrainLocked()
	conn.mu.Unlock()

	if isUpstreamClosed {
		// After a break the client attaches anew; after a normal end it is done.
		if upstreamErr != nil {
			m.sendClientError(clientConn, conn.ClusterID, conn.Path, conn.Query, conn.UserID, upstreamErr)
		} else {
			_ = m.sendCompleteMessage(conn, clientConn)
		}

		m.cleanupConnection(conn)
	}

	return true
}

// endDrainLocked releases the session a drain reserved, and the output waiting for
// it. The caller holds conn.mu.
func (c *Connection) endDrainLocked() {
	if c.drained != nil {
		close(c.drained)
		c.drained = nil
	}
}

// handleTerminalDrainFailure detaches a client a drain could not write to, keeping
// the messages it did not get ahead of any the cluster reader buffered after them,
// e.g. after its own send to the client failed and detached it.
func (m *Multiplexer) handleTerminalDrainFailure(conn *Connection, unsent []BufferedMessage) {
	conn.mu.Lock()
	defer conn.mu.Unlock()

	conn.endDrainLocked()
	conn.Client = nil
	conn.Status.State = StateClosed
	conn.Status.LastMsg = time.Now()
	conn.Status.Error = ""
	conn.enforceBufferCaps(unsent, true)

	m.startCleanupTimer(conn)
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
		logger.Log(logger.LevelError, map[string]string{logFieldClusterID: clusterID}, jsonErr, "marshaling error message")
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
			map[string]string{logFieldClusterID: clusterID},
			err,
			"writing error message to client",
		)
	}
}

// handleConnectionError handles errors that occur when establishing a connection.
func (m *Multiplexer) handleConnectionError(clientConn *WSConnLock, msg Message, err error) {
	m.sendClientError(clientConn, msg.ClusterID, msg.Path, msg.Query, msg.UserID, err)
	logger.Log(logger.LevelError,
		map[string]string{logFieldClusterID: msg.ClusterID}, err,
		"establishing cluster connection")
}

// writeMessageToCluster writes a message to the cluster WebSocket connection.
func (m *Multiplexer) writeMessageToCluster(conn *Connection, data []byte) error {
	conn.clusterWriteMu.Lock()
	err := conn.WSConn.WriteMessage(websocket.BinaryMessage, data)
	conn.clusterWriteMu.Unlock()

	if err != nil {
		conn.updateStatus(StateError, err)
		logger.Log(
			logger.LevelError,
			map[string]string{logFieldClusterID: conn.ClusterID},
			err,
			"writing message to cluster",
		)

		return err
	}

	return nil
}

// handleClusterMessages handles messages from a cluster connection.
func (m *Multiplexer) handleClusterMessages(conn *Connection) {
	defer func() {
		isTerm := isTerminalPath(conn.Path)

		conn.mu.Lock()
		conn.upstreamClosed = true
		client := conn.Client
		upstreamErr := conn.upstreamErr
		drained := conn.drained
		// A client still draining is not attached yet, and its drain reports the end.
		clientDisconnected := conn.Client == nil || conn.Status.State == StateClosed || conn.isFlushing
		conn.mu.Unlock()

		if isTerm && clientDisconnected {
			conn.mu.Lock()
			m.startCleanupTimer(conn)
			conn.mu.Unlock()

			logger.Log(logger.LevelInfo, map[string]string{
				logFieldClusterID: conn.ClusterID,
				"Path":            conn.Path,
			}, nil, "upstream terminal stream ended while client was disconnected; preserving buffered output for grace period")

			return
		}

		// The end, an error or that the session closed, waits for a drain still
		// writing to the client, so it follows that output, as the client ends the
		// session when it gets it.
		if drained != nil {
			<-drained
		}

		// A terminal stream that broke, rather than ended, is reported as an error,
		// so the client attaches again instead of treating the session as over.
		if isTerm && upstreamErr != nil {
			conn.writeMu.Lock()
			m.sendClientError(client, conn.ClusterID, conn.Path, conn.Query, conn.UserID, upstreamErr)
			conn.writeMu.Unlock()
		}

		m.cleanupConnection(conn)
	}()

	var lastResourceVersion string

	for {
		select {
		case <-conn.Done:
			return
		default:
			if err := m.processClusterMessage(conn, &lastResourceVersion); err != nil {
				if !websocket.IsCloseError(err, websocket.CloseNormalClosure) {
					conn.mu.Lock()
					conn.upstreamErr = err
					conn.mu.Unlock()
				}

				return
			}
		}
	}
}

func (m *Multiplexer) handleTerminalSendError(conn *Connection,
	failedClient *WSConnLock, sendErr error, messageType int, message []byte,
) {
	disconnectedAt := time.Now()

	conn.mu.Lock()

	if conn.Client != failedClient {
		// The client was already detached, or another client took the session over:
		// keep the frame for the next client, or deliver it to the new one.
		conn.mu.Unlock()
		m.sendTerminalOutput(conn, messageType, message)

		return
	}

	conn.Client = nil
	conn.Status.State = StateClosed

	conn.Status.LastMsg = disconnectedAt

	conn.Status.Error = ""

	conn.enforceBufferCaps([]BufferedMessage{{Type: messageType, Data: message}}, false)

	logger.Log(logger.LevelInfo, map[string]string{
		logFieldClusterID: conn.ClusterID,
		"Path":            conn.Path,
	}, sendErr, "client connection lost; buffering terminal output")

	m.startCleanupTimer(conn)
	conn.mu.Unlock()
}

// processClusterMessage processes a single message from the cluster.
func (m *Multiplexer) processClusterMessage(
	conn *Connection,
	lastResourceVersion *string,
) error {
	messageType, message, err := conn.WSConn.ReadMessage()
	if err != nil {
		if websocket.IsUnexpectedCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
			logger.Log(logger.LevelError,
				map[string]string{
					logFieldClusterID: conn.ClusterID,
					"userID":          conn.UserID,
				},
				err,
				"reading cluster message",
			)
		}

		return err
	}

	if isTerminalPath(conn.Path) {
		m.sendTerminalOutput(conn, messageType, message)

		return nil
	}

	conn.mu.RLock()
	currentClient := conn.Client
	conn.mu.RUnlock()

	if currentClient == nil {
		return nil
	}

	if err := m.sendIfNewResourceVersion(message, conn, currentClient, lastResourceVersion); err != nil {
		return err
	}

	return m.sendDataMessage(conn, currentClient, messageType, message)
}

// sendTerminalOutput sends a frame of terminal output to the attached client, or
// buffers it while no client is attached or one is taking the session over.
func (m *Multiplexer) sendTerminalOutput(conn *Connection, messageType int, message []byte) {
	// Decide and enqueue under one lock so a reconnect cannot attach and finish
	// draining between the check and the append, which would strand this frame.
	conn.mu.Lock()
	if conn.Client == nil || conn.isFlushing {
		conn.enforceBufferCaps([]BufferedMessage{{Type: messageType, Data: message}}, false)
		conn.mu.Unlock()

		return
	}

	if drained := conn.drained; drained != nil {
		conn.mu.Unlock()

		// Follow the output the drain is writing to the client.
		<-drained
		m.sendTerminalOutput(conn, messageType, message)

		return
	}

	client := conn.Client
	attachment := conn.attachment.Load()
	conn.mu.Unlock()

	m.writeTerminalOutput(conn, client, attachment, messageType, message)
}

// writeTerminalOutput writes a frame to the client sendTerminalOutput picked for it
// when the session's attachment was attachment. If a takeover started since, the
// client may be the one it replaced, which can still accept the write, losing the
// frame, so the frame is sent again to the client attached or attaching now. The
// cluster reader reads one frame at a time, so this frame is still the newest. A
// takeover starting after the check waits for the write lock to write to its client,
// so the frame reaches the old client first, like output sent before the takeover.
func (m *Multiplexer) writeTerminalOutput(
	conn *Connection,
	client *WSConnLock,
	attachment uint64,
	messageType int,
	message []byte,
) {
	dataMsg := m.createWrapperMessage(conn, messageType, message)

	conn.writeMu.Lock()
	if conn.attachment.Load() != attachment {
		conn.writeMu.Unlock()
		m.sendTerminalOutput(conn, messageType, message)

		return
	}

	err := client.WriteJSON(dataMsg)
	conn.writeMu.Unlock()

	if err != nil {
		m.handleTerminalSendError(conn, client, err, messageType, message)

		return
	}

	conn.mu.Lock()
	conn.Status.LastMsg = time.Now()
	conn.mu.Unlock()
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
// resourceVersionExtractor is a minimal struct used to extract resourceVersion from
// Kubernetes messages (either metadata.resourceVersion or object.metadata.resourceVersion).
// Using a typed struct instead of map[string]interface{} avoids reflect-heavy
// decoding and reduces allocations by skipping per-field map/interface values.
type resourceVersionExtractor struct {
	Metadata struct {
		ResourceVersion string `json:"resourceVersion"`
	} `json:"metadata"`
	Object struct {
		Metadata struct {
			ResourceVersion string `json:"resourceVersion"`
		} `json:"metadata"`
	} `json:"object"`
}

// sendIfNewResourceVersion checks if a message contains a new resource version
// and sends a COMPLETE message to the client if it does.
//
// This function is called on every incoming WebSocket message from Kubernetes
// cluster watches — it is the hottest path in the multiplexer. It uses a minimal
// typed struct for JSON unmarshalling to avoid the allocation overhead of
// map[string]interface{}.
//
// Parameters:
//   - message: The raw WebSocket message bytes.
//   - conn: The connection associated with this message.
//   - clientConn: The client WebSocket connection to notify.
//   - lastResourceVersion: Pointer to the last known resource version for comparison.
//
// Returns:
//   - An error if any issues occur while writing to the client, or nil if successful/ignored.
func (m *Multiplexer) sendIfNewResourceVersion(
	message []byte,
	conn *Connection,
	clientConn *WSConnLock,
	lastResourceVersion *string,
) error {
	var ext resourceVersionExtractor
	if err := json.Unmarshal(message, &ext); err != nil {
		// If we can't unmarshal as JSON, it might be binary data (e.g. from a terminal)
		// We just return nil here to indicate no new resource version was found,
		// but we don't want to stop processing messages.
		return nil
	}

	// Try to find resourceVersion directly in metadata, then fall back to object.metadata
	rv := ext.Metadata.ResourceVersion
	if rv == "" {
		rv = ext.Object.Metadata.ResourceVersion
	}

	if rv == "" {
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
	m.mutex.Lock()

	connKey := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, conn.Query)
	if existing, ok := m.connections[connKey]; ok && existing == conn {
		delete(m.connections, connKey)
	}
	m.mutex.Unlock()

	conn.mu.Lock()
	if conn.cleanupTimer != nil {
		conn.cleanupTimer.Stop()
		conn.cleanupTimer = nil
	}
	conn.mu.Unlock()

	conn.safeClose()
}

// startCleanupTimer starts the grace period cleanup timer for a disconnected terminal connection.
// The caller must hold conn.mu.Lock().
func (m *Multiplexer) startCleanupTimer(conn *Connection) {
	if conn.cleanupTimer != nil {
		conn.cleanupTimer.Stop()
		conn.cleanupTimer = nil
	}

	var timer *time.Timer

	timer = time.AfterFunc(m.terminalGracePeriod, func() {
		conn.mu.Lock()
		if conn.cleanupTimer != timer {
			conn.mu.Unlock()
			return
		}

		// The state can be an error, e.g. from a failed write to the cluster, so only
		// whether a client is attached or attaching decides.
		stillDisconnected := conn.Client == nil && !conn.isFlushing && conn.drained == nil
		if !stillDisconnected {
			conn.mu.Unlock()
			return
		}

		// Claim the timer slot before cleaning up to reduce races with reconnect.
		// Prevent a concurrent reconnect from attaching after we've decided to clean up.
		conn.isFlushing = true
		conn.cleanupTimer = nil
		conn.mu.Unlock()

		m.cleanupConnection(conn)
	})
	conn.cleanupTimer = timer
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
		return nil, fmt.Errorf("getting context: %w", err)
	}

	return ctxtProxy, nil
}

// CloseConnection closes a specific connection based on its identifier.
func (m *Multiplexer) CloseConnection(clusterID, path, userID string, query ...string) {
	connKey := m.createConnectionKey(clusterID, path, userID, query...)

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

func (m *Multiplexer) createConnectionKey(clusterID, path, userID string, query ...string) string {
	q := ""
	if len(query) > 0 {
		q = query[0]
	}

	if isTerminalPath(path) && q != "" {
		return clusterID + ":" + path + "?" + q + ":" + userID
	}

	return clusterID + ":" + path + ":" + userID
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

// enforceBufferCaps enforces the maximum frame count limit (1000) and byte size limit (5MB) on the buffer.
// It drops the oldest messages if limits are exceeded.
func (c *Connection) enforceBufferCaps(newMessages []BufferedMessage, prepend bool) {
	for _, bm := range newMessages {
		c.BufferBytes += len(bm.Data)
	}

	if prepend {
		c.Buffer = append(newMessages, c.Buffer...)
	} else {
		c.Buffer = append(c.Buffer, newMessages...)
	}

	if len(c.Buffer) > 1000 {
		droppedCount := len(c.Buffer) - 1000
		for i := 0; i < droppedCount; i++ {
			c.BufferBytes -= len(c.Buffer[i].Data)
		}

		c.Buffer = c.Buffer[droppedCount:]
	}

	const maxBytes = 5 * 1024 * 1024

	startIndex := 0
	for startIndex < len(c.Buffer) && c.BufferBytes > maxBytes {
		c.BufferBytes -= len(c.Buffer[startIndex].Data)
		startIndex++
	}

	if startIndex > 0 {
		c.Buffer = c.Buffer[startIndex:]
	}
}
