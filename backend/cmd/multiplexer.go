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
	// HeartbeatInterval is the interval at which the multiplexer pings cluster connections.
	// It is also the first delay before retrying a failed reconnect.
	HeartbeatInterval = 30 * time.Second
	// MaxReconnectBackoff caps the delay between failed reconnect attempts.
	MaxReconnectBackoff = 10 * time.Minute
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

var (
	// errWatchExpired reports that the cluster no longer has the watch's resource version,
	// so the watch cannot resume and the client has to list again.
	errWatchExpired = errors.New("watch resource version expired")
	// errConnectionSuperseded reports that a reconnect took over the connection's stream.
	errConnectionSuperseded = errors.New("connection superseded by a reconnect")
)

// watchExpiredEvent is the watch event the cluster sends when a resource version expires.
// It is sent to the client when the expiry is reported by the reconnect handshake instead.
const watchExpiredEvent = `{"type":"ERROR","object":{"kind":"Status","apiVersion":"v1","metadata":{},` +
	`"status":"Failure","message":"resource version expired","reason":"Expired","code":410}}`

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
	// clusterWriteMu is a mutex to synchronize writes to the cluster WebSocket connection.
	clusterWriteMu sync.Mutex
	// forwardMu serializes forwarding cluster messages to the client with a reconnect taking
	// over the stream, so the resume cursor only covers messages the client received.
	forwardMu sync.Mutex
	// resourceVersion is the last resource version forwarded to the client; a reconnect
	// resumes the watch from it. Guarded by forwardMu.
	resourceVersion string
	// superseded is set once a reconnect takes over the stream; this connection then stops
	// forwarding, so a message it already read cannot reach the client after newer ones.
	// Guarded by forwardMu.
	superseded bool
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
	// inFlight tracks the upstream dials in progress, indexed like connections, so concurrent
	// requests for the same key share one dial. It is guarded by mutex.
	inFlight map[string]*inFlightDial
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

// errDialIncomplete is what waiters get if the dial they wait on never finished, e.g. it panicked.
var errDialIncomplete = errors.New("connection dial did not complete")

// inFlightDial is an upstream dial that concurrent callers for the same key wait on.
type inFlightDial struct {
	// done is closed once conn and err are set.
	done chan struct{}
	conn *Connection
	err  error
	// waiters counts callers blocked on done. It is guarded by Multiplexer.mutex.
	waiters int
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
		inFlight:                     make(map[string]*inFlightDial),
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
		Query:     c.Query,
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

// dialClusterConnection creates and dials a new WebSocket connection to a Kubernetes cluster without registering it.
func (m *Multiplexer) dialClusterConnection(
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

	if isTerminalPath(path) && token != nil {
		connection.startOwnerIdentityLookup(config, *token)
	}

	return connection, nil
}

// establishClusterConnection creates, registers, and monitors a new WebSocket connection to a Kubernetes cluster.
func (m *Multiplexer) establishClusterConnection(
	clusterID,
	userID,
	path,
	query string,
	clientConn *WSConnLock,
	token *string,
) (*Connection, error) {
	connection, err := m.dialClusterConnection(clusterID, userID, path, query, clientConn, token)
	if err != nil {
		return nil, err
	}

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
	if clusterContext.RequiresUserAuthentication() &&
		(requestToken == nil || strings.TrimSpace(*requestToken) == "") {
		return nil, errUserAuthRequired
	}

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

		if resp == nil {
			return nil, fmt.Errorf("dialing WebSocket: %w", err)
		}

		if resp.StatusCode == http.StatusGone {
			return nil, fmt.Errorf("dialing WebSocket: %w: %w", errWatchExpired, err)
		}

		// The terminals show this error, so tell them apart, e.g. a 403 from a 404.
		return nil, fmt.Errorf("dialing WebSocket (HTTP %s): %w", resp.Status, err)
	}

	_ = resp.Body.Close()

	return conn, nil
}

// calculateBackoffInterval returns the delay before the next reconnect attempt: the base
// interval, doubled for each consecutive failure and capped at maxInterval.
func calculateBackoffInterval(consecutiveFailures int, baseInterval, maxInterval time.Duration) time.Duration {
	return min(baseInterval<<min(consecutiveFailures, 20), maxInterval)
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
	ticker := time.NewTicker(m.heartbeatInterval)
	defer ticker.Stop()

	consecutiveFailures := 0

	for {
		select {
		case <-conn.Done:
			conn.updateStatus(StateClosed, nil)

			return
		case <-ticker.C:
			if isTerminalPath(conn.Path) {
				if pingTerminal(conn) {
					return
				}

				continue
			}

			// A reconnected connection runs its own monitor.
			if newConn, stop := m.handleHeartbeatTick(conn, &consecutiveFailures, ticker); stop || newConn != nil {
				return
			}
		}
	}
}

// resumeWatchQuery returns the query a reconnecting watch dials with, so it resumes from the
// last resource version forwarded to the client. Only watches subscribed from a resource
// version resume; others, such as a single object's watch, start again from the current state.
func resumeWatchQuery(query, resourceVersion string) string {
	if resourceVersion == "" {
		return query
	}

	values, err := url.ParseQuery(query)
	if err != nil || values.Get("watch") == "" || values.Get("resourceVersion") == "" {
		return query
	}

	values.Set("resourceVersion", resourceVersion)

	return values.Encode()
}

// pingTerminal pings a terminal's cluster connection and reports whether to stop
// monitoring it.
func pingTerminal(conn *Connection) bool {
	conn.mu.RLock()
	upstreamClosed := conn.upstreamClosed
	conn.mu.RUnlock()

	// An ended terminal stream is only kept for its buffered output until
	// the client reattaches or the grace period expires. Reconnecting it
	// would replace the session and lose that output.
	if upstreamClosed {
		return true
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
		_ = conn.WSConn.Close()

		return true
	}

	return false
}

// handleHeartbeatTick processes a single heartbeat tick and reconnects if disconnected.
// Returns the newly reconnected Connection (if any) and a boolean indicating if the monitorConnection loop should stop.
func (m *Multiplexer) handleHeartbeatTick(
	conn *Connection,
	consecutiveFailures *int,
	ticker *time.Ticker,
) (*Connection, bool) {
	conn.mu.RLock()
	closed := conn.closed || conn.Status.State == StateClosed
	isConnected := !closed && conn.Status.State == StateConnected && conn.WSConn != nil
	conn.mu.RUnlock()

	if closed {
		return nil, true
	}

	if isConnected {
		conn.clusterWriteMu.Lock()
		err := conn.WSConn.WriteMessage(websocket.PingMessage, nil)
		conn.clusterWriteMu.Unlock()

		if err != nil {
			conn.updateStatus(StateError, fmt.Errorf("heartbeat failed: %w", err))
		} else {
			return nil, false
		}
	}

	newConn, err := m.reconnect(conn)
	if errors.Is(err, errWatchExpired) {
		m.endExpiredWatch(conn)

		return nil, true
	}

	if err != nil && conn.IsClosed() {
		// The connection was closed or replaced while reconnecting.
		return nil, true
	}

	if err != nil {
		*consecutiveFailures++
		delay := calculateBackoffInterval(*consecutiveFailures, m.heartbeatInterval, MaxReconnectBackoff)
		ticker.Reset(delay)

		logger.Log(logger.LevelError, map[string]string{
			logFieldClusterID: conn.ClusterID,
			"failures":        fmt.Sprintf("%d", *consecutiveFailures),
			"nextRetryIn":     delay.String(),
		}, err, "reconnecting to cluster")

		return nil, false
	}

	newConn.mu.RLock()
	clientConn := newConn.Client
	newConn.mu.RUnlock()

	if clientConn != nil {
		go m.handleClusterMessages(newConn)
	}

	return newConn, false
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

	client := conn.Client

	token := conn.Token
	if conn.usesServiceAccountToken {
		token = conn.ownerToken
	}

	conn.mu.RUnlock()

	// Take over the stream before reading the cursor: a message the old reader has already
	// read but not forwarded is dropped here and replayed by the new watch.
	conn.forwardMu.Lock()
	conn.superseded = true
	resourceVersion := conn.resourceVersion
	conn.forwardMu.Unlock()

	// The reader may have ended the watch while this waited for forwardMu.
	if conn.IsClosed() {
		return nil, fmt.Errorf("cannot reconnect closed connection")
	}

	newConn, err := m.dialClusterConnection(
		conn.ClusterID,
		conn.UserID,
		conn.Path,
		resumeWatchQuery(conn.Query, resourceVersion),
		client,
		token,
	)
	if err != nil {
		if !m.replaceRegistered(conn, nil) {
			// conn was closed or another subscription owns its key now; stop retrying for it.
			conn.safeClose()

			// %v, not %w: an expired watch on an obsolete conn must not send an expiry event.
			return nil, fmt.Errorf("reconnect aborted: connection was closed or replaced during reconnect: %v", err)
		}

		return nil, err
	}

	// Keep the query the client subscribed with, so its messages still route to it.
	newConn.Query = conn.Query
	newConn.resourceVersion = resourceVersion

	if !m.replaceRegistered(conn, newConn) {
		newConn.safeClose()
		// conn was closed or replaced by another subscription for its key; close it too,
		// so a replaced connection stops reconnecting.
		conn.safeClose()

		return nil, fmt.Errorf("reconnect aborted: connection was closed or replaced during reconnect")
	}

	go m.monitorConnection(newConn)

	return newConn, nil
}

// replaceRegistered reports whether conn is still open and registered for its key, and if so
// registers newConn in its place when newConn is not nil.
func (m *Multiplexer) replaceRegistered(conn, newConn *Connection) bool {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	connKey := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, conn.Query)
	registeredKey := connKey

	if m.connections[registeredKey] != conn {
		legacyKey := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID)

		if m.connections[legacyKey] == conn {
			registeredKey = legacyKey
		}
	}

	if m.connections[registeredKey] != conn || conn.IsClosed() {
		return false
	}

	if newConn != nil {
		if registeredKey != connKey {
			m.connections[registeredKey] = newConn
		} else {
			m.connections[connKey] = newConn
		}
	}

	return true
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
		if !m.closeRequestedConnection(msg, tokenPtr, lockClientConn) {
			m.sendClientError(lockClientConn, msg.ClusterID, msg.Path, msg.Query, msg.UserID,
				errors.New("terminal session belongs to a different authenticated session"))
		}

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

	// A failed write leaves the terminal looking connected while its input is lost, so
	// close its stream: the reader then reports the break, and the client attaches anew.
	if err := m.writeMessageToCluster(conn, data); err != nil && isTerminalPath(conn.Path) {
		_ = conn.WSConn.Close()
	}
}

// isTerminalPath reports whether the given connection path represents an interactive
// terminal session: the exec or attach subresource of a pod,
// .../api/v1/namespaces/{namespace}/pods/{name}/{exec,attach}. The whole shape is
// matched, so a watch of a pod named "attach" or of a custom resource whose plural
// is "exec" stays a watch. Only the end of the path is matched, as a cluster
// server URL can have a path prefix.
func isTerminalPath(path string) bool {
	parts := strings.Split(path, "/")
	n := len(parts)

	return n >= 7 &&
		(parts[n-1] == "exec" || parts[n-1] == "attach") &&
		parts[n-3] == "pods" &&
		parts[n-5] == "namespaces" &&
		parts[n-6] == "v1" &&
		parts[n-7] == "api"
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

// registeredConnection returns the connection registered for msg under connKey, or under
// the key without its query that connections were registered with before.
func (m *Multiplexer) registeredConnection(connKey string, msg Message) (*Connection, bool) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	if conn, exists := m.connections[connKey]; exists {
		return conn, true
	}

	conn, exists := m.connections[m.createConnectionKey(msg.ClusterID, msg.Path, msg.UserID)]

	return conn, exists
}

// handleNewConnection dials the cluster for connKey, or waits for the dial another caller
// already started for it, and starts handling the messages of a connection it dialed.
// created is true only for the caller that dialed.
func (m *Multiplexer) handleNewConnection(
	connKey string,
	msg Message,
	clientConn *WSConnLock,
	token *string,
) (conn *Connection, created bool, err error) {
	conn, created, err = m.establishSharedConnection(connKey, msg, clientConn, token)
	if err != nil {
		logger.Log(
			logger.LevelError,
			map[string]string{logFieldClusterID: msg.ClusterID, "UserID": msg.UserID},
			err,
			"establishing cluster connection",
		)

		return nil, false, err
	}

	if created {
		go m.handleClusterMessages(conn)
	}

	return conn, created, nil
}

// getOrCreateConnection gets an existing connection or creates a new one if it doesn't exist.
// If a connection exists and a new token is provided, it updates the token to ensure it's fresh.
func (m *Multiplexer) getOrCreateConnection(msg Message, clientConn *WSConnLock, token *string) (*Connection, error) {
	if token == nil || strings.TrimSpace(*token) == "" {
		clusterContext, err := m.kubeConfigStore.GetContext(msg.ClusterID)
		if err == nil && clusterContext.RequiresUserAuthentication() {
			return nil, errUserAuthRequired
		}
	}

	connKey := m.createConnectionKey(msg.ClusterID, msg.Path, msg.UserID, msg.Query)

	conn, exists := m.registeredConnection(connKey, msg)

	isInput := msg.Data != ""

	if !exists {
		// Input never opens a terminal session; it comes from a client whose session ended.
		if isInput && isTerminalPath(msg.Path) {
			return nil, errInputFromDetachedClient
		}

		var (
			err     error
			created bool
		)

		conn, created, err = m.handleNewConnection(connKey, msg, clientConn, token)
		if err != nil {
			return nil, err
		}

		if created {
			return conn, nil
		}

		// Another caller dialed it, so attach to it like to an existing connection.
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

// establishSharedConnection dials the cluster for connKey, or waits for the dial another
// caller already started for it. created is true only for the caller that dialed.
// mutex is not held during the dial so other clusters are not blocked.
func (m *Multiplexer) establishSharedConnection(
	connKey string,
	msg Message,
	clientConn *WSConnLock,
	token *string,
) (conn *Connection, created bool, err error) {
	m.mutex.Lock()

	// The dial may have finished since the caller last checked connections.
	if existing, exists := m.connections[connKey]; exists {
		m.mutex.Unlock()

		return existing, false, nil
	}

	if call, exists := m.inFlight[connKey]; exists {
		call.waiters++
		m.mutex.Unlock()
		<-call.done

		return call.conn, false, call.err
	}

	// err stays set unless the dial returns, so waiters never get a nil connection with no error.
	call := &inFlightDial{done: make(chan struct{}), err: errDialIncomplete}
	m.inFlight[connKey] = call
	m.mutex.Unlock()

	defer func() {
		m.mutex.Lock()
		delete(m.inFlight, connKey)
		m.mutex.Unlock()
		close(call.done)
	}()

	call.conn, call.err = m.establishClusterConnection(
		msg.ClusterID, msg.UserID, msg.Path, msg.Query, clientConn, token)

	return call.conn, true, call.err
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
	// Output whose attachment check passed before the takeover is still written to
	// this client, holding the session's write lock. Let it finish first, as the
	// terminal ends its stream on this status and would drop that output.
	conn.writeMu.Lock()
	conn.writeMu.Unlock() //nolint:staticcheck // Only waits for the writes in flight.

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

// closeRequestedConnection closes the connection msg names, and reports false if it is
// a terminal session that a request with token does not own. Whether it is a terminal
// is decided by the connection's own path, as a crafted path such as one that holds
// the query can name a terminal session by its key without being a terminal path.
// The connection is looked up once, so the one that was checked is the one closed: a
// session opened under the same key while the owner was checked, e.g. after the
// checked one ended, belongs to whoever opened it and is left alone. Only client, the
// client attached to the session, or any of the owner's clients while none is, may
// close a terminal session: a client a takeover replaced, which may close its terminal
// before it is told the session moved, would otherwise end the session in the window
// that took it over.
func (m *Multiplexer) closeRequestedConnection(msg Message, token *string, client *WSConnLock) bool {
	m.mutex.RLock()
	conn, exists := m.connections[m.createConnectionKey(msg.ClusterID, msg.Path, msg.UserID, msg.Query)]
	m.mutex.RUnlock()

	if !exists {
		// Nothing is open, so acknowledge the close, as the client waits for it. A
		// connection opened under the key since it was looked up is left alone.
		_ = client.WriteJSON(Message{
			ClusterID: msg.ClusterID,
			Path:      msg.Path,
			Query:     msg.Query,
			UserID:    msg.UserID,
			Data:      `{"state":"closed","error":""}`,
			Type:      "STATUS",
		})

		return true
	}

	if !isTerminalPath(conn.Path) {
		// A message it already read must not reach the client after its closed status.
		conn.forwardMu.Lock()
		conn.superseded = true
		conn.forwardMu.Unlock()

		conn.updateStatus(StateClosed, nil)
		m.removeConnection(conn)

		return true
	}

	if !m.ownsTerminal(conn, token) {
		return false
	}

	// Claim the session, as the grace timer does, so a takeover cannot start while
	// it closes.
	conn.mu.Lock()
	if conn.isFlushing || (conn.Client != nil && conn.Client != client) {
		conn.mu.Unlock()

		return true
	}

	conn.isFlushing = true
	conn.mu.Unlock()

	conn.updateStatus(StateClosed, nil)
	m.removeConnection(conn)

	return true
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

// startOwnerIdentityLookup looks up who the owner of a new terminal session is, in
// the background rather than delaying every terminal. It runs once the dial has
// succeeded, so failed dials, retried while a shell pod starts, don't send reviews.
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
	// a client a reattach replaced may still send input it had queued. The session may
	// have ended since it was looked up, e.g. while another reattach drained it. Its
	// status was already sent, so a client attached to it would never hear back.
	attached := !conn.closed && conn.Client == clientConn && !conn.isFlushing
	if conn.closed || attached || !reattach {
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

		m.removeConnection(conn)
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
	if errors.Is(err, errWatchExpired) {
		// Report it as the watch event the client relists on, as for a reconnect.
		expiredMsg := Message{
			ClusterID: msg.ClusterID,
			Path:      msg.Path,
			Query:     msg.Query,
			UserID:    msg.UserID,
			Data:      watchExpiredEvent,
			Type:      "DATA",
		}
		if writeErr := clientConn.WriteJSON(expiredMsg); writeErr != nil {
			logger.Log(logger.LevelInfo, map[string]string{logFieldClusterID: msg.ClusterID}, writeErr,
				"sending watch expiry to client")
		}

		return
	}

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
	// A terminal is not reconnected, so the end of its stream is handled here. A watch's
	// read errors are left to monitorConnection, which reconnects it.
	if isTerminalPath(conn.Path) {
		defer m.endTerminalStream(conn)
	}

	var lastResourceVersion string

	for {
		select {
		case <-conn.Done:
			return
		default:
			if err := m.processClusterMessage(conn, &lastResourceVersion); err != nil {
				if isTerminalPath(conn.Path) {
					if !websocket.IsCloseError(err, websocket.CloseNormalClosure) {
						conn.mu.Lock()
						conn.upstreamErr = err
						conn.mu.Unlock()
					}

					return
				}

				m.handleWatchReadError(conn, err)

				return
			}
		}
	}
}

// endTerminalStream handles the end of a terminal's cluster stream, whether it ended
// or broke.
func (m *Multiplexer) endTerminalStream(conn *Connection) {
	conn.mu.Lock()
	conn.upstreamClosed = true

	// The session was ended, e.g. by its grace timer, which closed this stream.
	// Keeping it for another grace period would only keep its output alive.
	if conn.closed {
		conn.mu.Unlock()

		return
	}

	// A client still draining is not attached yet, and its drain reports the end.
	if conn.Client == nil || conn.Status.State == StateClosed || conn.isFlushing {
		m.startCleanupTimer(conn)
		conn.mu.Unlock()

		logger.Log(logger.LevelInfo, map[string]string{
			logFieldClusterID: conn.ClusterID,
			"Path":            conn.Path,
		}, nil, "upstream terminal stream ended while client was disconnected; preserving buffered output for grace period")

		return
	}

	client := conn.Client
	upstreamErr := conn.upstreamErr
	drained := conn.drained

	// Claim the session, as the grace timer does, so a takeover cannot start while
	// it ends: its drain would find it closed and could not tell its client.
	if drained == nil {
		conn.isFlushing = true
	}
	conn.mu.Unlock()

	// The end, an error or that the session closed, waits for a drain still
	// writing to the client, so it follows that output, as the client ends the
	// session when it gets it.
	if drained != nil {
		<-drained

		// A takeover that started meanwhile, or a failed drain or send that detached
		// the client and kept the output it did not get, leaves the end to the drain
		// of the client attaching, which sees upstreamClosed.
		conn.mu.Lock()
		if conn.Client != client || conn.isFlushing || conn.drained != nil {
			conn.mu.Unlock()

			return
		}

		conn.isFlushing = true
		conn.mu.Unlock()
	}

	// A terminal stream that broke, rather than ended, is reported as an error,
	// so the client attaches again instead of treating the session as over.
	if upstreamErr != nil {
		conn.writeMu.Lock()
		m.sendClientError(client, conn.ClusterID, conn.Path, conn.Query, conn.UserID, upstreamErr)
		conn.writeMu.Unlock()
	}

	m.removeConnection(conn)
}

// handleWatchReadError handles the error that stopped a watch's reader.
func (m *Multiplexer) handleWatchReadError(conn *Connection, err error) {
	if errors.Is(err, errConnectionSuperseded) || errors.Is(err, errWatchExpired) {
		return
	}

	var writeErr clientWriteError
	if errors.As(err, &writeErr) {
		logger.Log(logger.LevelInfo, map[string]string{
			logFieldClusterID: conn.ClusterID,
			"userID":          conn.UserID,
		}, err, "writing to client connection failed; stopping client pump")
		m.removeConnection(conn)

		return
	}

	// Let monitorConnection handle reconnect/backoff on all read errors, including close frames.
	conn.updateStatus(StateError, err)
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

	conn.forwardMu.Lock()
	defer conn.forwardMu.Unlock()

	if conn.superseded {
		return errConnectionSuperseded
	}

	expired := errors.Is(m.sendIfNewResourceVersion(message, conn, currentClient, lastResourceVersion), errWatchExpired)

	if err := m.sendDataMessage(conn, currentClient, messageType, message); err != nil {
		return err
	}

	if expired {
		// The client received the expiry event and lists again; a watch resumed from here
		// would miss what changed meanwhile, such as deletions. Removing conn before releasing
		// forwardMu keeps a concurrent reconnect from replacing it.
		m.removeConnection(conn)

		return errWatchExpired
	}

	// Advance the resume cursor only once the client has the message.
	if *lastResourceVersion != "" {
		conn.resourceVersion = *lastResourceVersion
	}

	return nil
}

// endExpiredWatch tells the client that conn's watch expired, so it lists again, and closes
// conn instead of resuming it.
func (m *Multiplexer) endExpiredWatch(conn *Connection) {
	conn.mu.RLock()
	client := conn.Client
	conn.mu.RUnlock()

	if client != nil {
		if err := m.sendDataMessage(conn, client, websocket.TextMessage, []byte(watchExpiredEvent)); err != nil {
			logger.Log(logger.LevelInfo, map[string]string{logFieldClusterID: conn.ClusterID}, err,
				"sending watch expiry to client")
		}
	}

	m.removeConnection(conn)
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
	Type     string `json:"type"`
	Metadata struct {
		ResourceVersion string `json:"resourceVersion"`
	} `json:"metadata"`
	Object struct {
		// Code is set on the Status object of a watch ERROR event.
		Code     int `json:"code"`
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
//   - errWatchExpired if the message reports the watch's resource version as expired,
//     otherwise nil.
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

	if ext.Type == "ERROR" && ext.Object.Code == http.StatusGone {
		return errWatchExpired
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
		return clientWriteError{err: err}
	}

	conn.mu.Lock()
	conn.Status.LastMsg = time.Now()
	conn.mu.Unlock()

	return nil
}

// removeConnection closes conn and removes it from the registry. A replacement client may
// have registered the same key since, so the entry is only removed if it still is conn.
func (m *Multiplexer) removeConnection(conn *Connection) {
	m.mutex.Lock()

	connKey := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, conn.Query)
	if m.connections[connKey] == conn {
		delete(m.connections, connKey)
	} else {
		legacyKey := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID)
		if m.connections[legacyKey] == conn {
			delete(m.connections, legacyKey)
		}
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

		m.removeConnection(conn)
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
func (m *Multiplexer) CloseConnection(clusterID, path, userID string, queries ...string) bool {
	connKey := m.createConnectionKey(clusterID, path, userID, queries...)

	m.mutex.Lock()

	conn, exists := m.connections[connKey]
	if !exists {
		m.mutex.Unlock()
		return false
	}

	delete(m.connections, connKey)
	m.mutex.Unlock()

	conn.forwardMu.Lock()
	conn.superseded = true
	conn.forwardMu.Unlock()

	conn.updateStatus(StateClosed, nil)
	conn.safeClose()

	return true
}

// createConnectionKey creates a unique key for a connection based on cluster ID, path, and user ID.
// Uses string concatenation instead of fmt.Sprintf to avoid allocation overhead
// on this hot path (called on every WebSocket message routing).
func (m *Multiplexer) createConnectionKey(clusterID, path, userID string, queries ...string) string {
	query := ""

	if len(queries) > 0 {
		values, err := url.ParseQuery(queries[0])
		if err == nil {
			query = values.Encode()
		} else {
			query = queries[0]
		}
	}

	return clusterID + ":" + path + ":" + userID + ":" + query
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

type clientWriteError struct {
	err error
}

func (e clientWriteError) Error() string {
	return "client write error: " + e.err.Error()
}

func (e clientWriteError) Unwrap() error {
	return e.err
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

		// Reslicing keeps the dropped frames in the backing array, so clear them.
		clear(c.Buffer[:droppedCount])
		c.Buffer = c.Buffer[droppedCount:]
	}

	const maxBytes = 5 * 1024 * 1024

	startIndex := 0
	for startIndex < len(c.Buffer) && c.BufferBytes > maxBytes {
		c.BufferBytes -= len(c.Buffer[startIndex].Data)
		startIndex++
	}

	if startIndex > 0 {
		clear(c.Buffer[:startIndex])
		c.Buffer = c.Buffer[startIndex:]
	}
}
