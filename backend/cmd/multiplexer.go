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
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
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
	// HeartbeatInterval is the interval at which the multiplexer pings cluster connections.
	// It is also the first delay before retrying a failed reconnect.
	HeartbeatInterval = 30 * time.Second
	// MaxReconnectBackoff caps the delay between failed reconnect attempts.
	MaxReconnectBackoff = 10 * time.Minute
	// HandshakeTimeout is the timeout for the handshake with the client.
	HandshakeTimeout = 45 * time.Second
	// CleanupRoutineInterval is the interval at which the multiplexer cleans up unused connections.
	CleanupRoutineInterval = 5 * time.Minute
	// SecureWebSocketScheme is the secure WebSocket scheme.
	SecureWebSocketScheme = "wss"
	// MultiplexerProtocol is the public subprotocol selected for client connections.
	MultiplexerProtocol = "headlamp.multiplexer.k8s.io"
	// MultiplexerWatchProtocol negotiates acknowledged list-watch flow control.
	MultiplexerWatchProtocol = "headlamp.multiplexer.v2.k8s.io"
)

var (
	errSubscriptionInactive = errors.New("subscription is no longer active")
	errReconnectInProgress  = errors.New("subscription is already reconnecting; retry after reconnection")
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
	// upstreamMu serializes payload writes with replacement reservations.
	// Acquire it before lifecycle locks; never hold lifecycle locks during I/O.
	upstreamMu sync.Mutex
	// closed is a flag to indicate if the connection is closed.
	closed bool
	// usesServiceAccountToken is true when Token was loaded from the
	// in-cluster service account token file.
	usesServiceAccountToken bool
	// Authentication token.
	Token *string
	// closeOnce is used to ensure the connection is closed only once.
	closeOnce sync.Once
	// reconnecting and dialCancel are guarded by mu.
	reconnecting bool
	dialCancel   context.CancelFunc
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
	// Reopen explicitly replaces a watch transport with this request's query.
	Reopen bool `json:"reopen,omitempty"`
	// RequestID opts into processing acknowledgements for client backpressure.
	RequestID string `json:"requestId,omitempty"`
}

// connectionKey identifies an upstream connection within one client WebSocket.
type connectionKey struct {
	client    *WSConnLock
	clusterID string
	path      string
	userID    string
	query     string
}

type completedSubscription struct {
	conn     *Connection
	closedAt time.Time
}

// Multiplexer manages multiple WebSocket connections.
type Multiplexer struct {
	// Entries own subscriptions independently of the current transport's lifetime.
	connections map[connectionKey]*Connection
	// completed indexes only unreserved completed subscriptions, bounded per client.
	completed map[*WSConnLock]map[connectionKey]completedSubscription
	// mutex is a mutex to synchronize access to the connections.
	mutex sync.RWMutex
	// inFlight tracks the upstream dials in progress, indexed like connections, so concurrent
	// requests for the same key share one dial. It is guarded by mutex.
	inFlight map[connectionKey]*inFlightDial
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
	// heartbeatInterval is HeartbeatInterval; tests shorten it.
	heartbeatInterval time.Duration
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

func (call *inFlightDial) wait(ctx context.Context) (*Connection, error) {
	select {
	case <-ctx.Done():
		return nil, errSubscriptionInactive
	case <-call.done:
		return call.conn, call.err
	}
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

// Close may run concurrently with writes, as supported by gorilla/websocket.
// In particular, it must unblock a stalled writer rather than wait for it.
func (conn *WSConnLock) Close() error {
	return conn.conn.Close()
}

// NewMultiplexer creates a new Multiplexer instance.
func NewMultiplexer(kubeConfigStore kubeconfig.ContextStore, unsafeUseServiceAccountToken bool) *Multiplexer {
	return &Multiplexer{
		connections:                  make(map[connectionKey]*Connection),
		completed:                    make(map[*WSConnLock]map[connectionKey]completedSubscription),
		inFlight:                     make(map[connectionKey]*inFlightDial),
		kubeConfigStore:              kubeConfigStore,
		unsafeUseServiceAccountToken: unsafeUseServiceAccountToken,
		saTokenCache:                 make(map[string]saTokenCacheEntry),
		heartbeatInterval:            HeartbeatInterval,
		upgrader: websocket.Upgrader{
			Subprotocols: []string{MultiplexerWatchProtocol, MultiplexerProtocol},
			CheckOrigin:  checkWebSocketOrigin,
		},
	}
}

func checkWebSocketOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}

	if auth.IsBackendTokenProtocolAuthenticated(r) {
		// Native clients carry desktop credentials in a private subprotocol.
		// The middleware has verified and removed it before the upgrader runs.
		return true
	}

	originURL, err := url.Parse(origin)
	if err != nil {
		return false
	}

	expectedScheme := "http"
	if r.TLS != nil || auth.GetForwardedProto(r) == "https" {
		expectedScheme = "https"
	}

	return strings.EqualFold(originURL.Scheme, expectedScheme) &&
		strings.EqualFold(originURL.Host, r.Host)
}

// readServiceAccountToken reads the service account token from path, caching the value
// per path and refreshing it when the file's mtime changes (e.g. kubelet token rotation).
func (m *Multiplexer) readServiceAccountToken(path string) (string, error) {
	// #nosec G703 -- path is a configured in-cluster TokenFile, never a client subscription path.
	stat, err := os.Stat(path)
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
	c.updateStatusContext(context.Background(), state, err)
}

func (c *Connection) updateStatusContext(ctx context.Context, state ConnectionState, err error) {
	if state == StateClosed {
		c.safeClose()

		return
	}

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

	c.mu.Unlock()

	writeErr := c.writeStatusContext(ctx)
	if writeErr != nil {
		if !websocket.IsCloseError(writeErr, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
			logger.Log(logger.LevelError,
				map[string]string{logFieldClusterID: c.ClusterID},
				writeErr,
				"writing status message to client")
		}
	}
}

func (c *Connection) writeStatus() error {
	return c.writeStatusContext(context.Background())
}

func (c *Connection) writeStatusContext(ctx context.Context) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	c.mu.RLock()
	client := c.Client
	c.mu.RUnlock()

	if client == nil {
		return nil
	}

	client.writeMu.Lock()
	defer client.writeMu.Unlock()

	// Snapshot after obtaining the writer: installation can detach a retiring
	// transport while its status is waiting, avoiding stale closed notifications.
	c.mu.RLock()

	if c.Client != client || ctx.Err() != nil {
		c.mu.RUnlock()

		return nil
	}

	statusData := struct {
		State string `json:"state"`
		Error string `json:"error"`
	}{
		State: string(c.Status.State),
		Error: c.Status.Error,
	}
	c.mu.RUnlock()

	jsonData, jsonErr := json.Marshal(statusData)
	if jsonErr != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldClusterID: c.ClusterID}, jsonErr, "marshaling status message")

		return jsonErr
	}

	statusMsg := Message{
		ClusterID: c.ClusterID,
		Path:      c.Path,
		Query:     c.Query,
		UserID:    c.UserID,
		Data:      string(jsonData),
		Type:      "STATUS",
	}

	return client.conn.WriteJSON(statusMsg)
}

// safeClose safely closes the connection and its resources.
func (c *Connection) safeClose() {
	if c.closeTransport() {
		_ = c.writeStatus()
	}
}

func (c *Connection) detachAndClose() {
	c.mu.Lock()
	c.Client = nil
	c.mu.Unlock()
	c.safeClose()
}

// closeTransport completes lifecycle cleanup before any client notification.
func (c *Connection) closeTransport() bool {
	var notify bool

	c.closeOnce.Do(func() {
		c.mu.Lock()
		if !c.closed {
			notify = c.Status.State != StateClosed && c.Client != nil
			c.Status.State = StateClosed
			c.Status.LastMsg = time.Now()
			c.Status.Error = ""

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

	return notify
}

// establishClusterConnectionContext creates and dials a connection without registering it.
func (m *Multiplexer) establishClusterConnectionContext(
	ctx context.Context,
	clusterID, userID, path, query, dialQuery string,
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
	if m.unsafeUseServiceAccountToken && clusterContext.UsesInClusterServiceAccountToken() {
		connection.usesServiceAccountToken = true
	}

	wsURL := createWebSocketURL(config.Host, path, dialQuery)

	tlsConfig, err := rest.TLSConfigFor(config)
	if err != nil {
		connection.updateStatusContext(ctx, StateError, err)

		return nil, fmt.Errorf("failed to get TLS config: %w", err)
	}

	conn, err := m.dialWebSocketContext(ctx, wsURL, tlsConfig, config.Host, authToken)
	if err != nil {
		if ctx.Err() == nil {
			connection.updateStatusContext(ctx, StateError, err)
		}

		return nil, err
	}

	connection.WSConn = conn
	connection.Status.State = StateConnected

	return connection, nil
}

// startConnectionContext installs a dialed connection only if its reservation
// remains active and still owns the subscription.
func (m *Multiplexer) startConnectionContext(
	ctx context.Context, key connectionKey, conn, previous *Connection,
) error {
	m.mutex.Lock()
	if ctx.Err() != nil || m.connections[key] != previous {
		m.mutex.Unlock()

		_ = conn.WSConn.Close()

		return fmt.Errorf("subscription changed while connecting: %w", errSubscriptionInactive)
	}

	m.connections[key] = conn
	m.forgetCompletedConnectionLocked(key)
	m.mutex.Unlock()

	if previous != nil {
		previous.mu.Lock()
		previous.Client = nil
		previous.mu.Unlock()
		previous.safeClose()
	}

	conn.updateStatus(StateConnected, nil)
	go m.monitorConnection(conn)
	go m.handleClusterMessages(conn, key.client)

	return nil
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
	if userID != "" {
		clusterContext, err := m.getClusterContext(statelessContextKey(clusterID, userID))
		if err == nil {
			return clusterContext, nil
		}
	}

	clusterContext, err := m.getClusterContext(clusterID)
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

// dialWebSocket establishes a WebSocket connection.
func (m *Multiplexer) dialWebSocket(
	wsURL string,
	tlsConfig *tls.Config,
	host string,
	token *string,
) (*websocket.Conn, error) {
	return m.dialWebSocketContext(context.Background(), wsURL, tlsConfig, host, token)
}

func cancellableWebSocketDialer(ctx context.Context, tlsConfig *tls.Config) (websocket.Dialer, func()) {
	dialer := websocket.Dialer{
		TLSClientConfig:  tlsConfig,
		HandshakeTimeout: HandshakeTimeout,
	}

	var stopCancel func() bool

	dialer.NetDialContext = func(dialCtx context.Context, network, address string) (net.Conn, error) {
		var netDialer net.Dialer

		conn, err := netDialer.DialContext(dialCtx, network, address)
		if err == nil {
			// DialContext alone does not interrupt a pending HTTP upgrade read.
			stopCancel = context.AfterFunc(ctx, func() { _ = conn.Close() })
		}

		return conn, err
	}

	return dialer, func() {
		if stopCancel != nil {
			stopCancel()
		}
	}
}

func (m *Multiplexer) dialWebSocketContext(
	ctx context.Context, wsURL string, tlsConfig *tls.Config, host string, token *string,
) (*websocket.Conn, error) {
	dialer, stopCancel := cancellableWebSocketDialer(ctx, tlsConfig)
	defer stopCancel()

	headers := http.Header{
		"Origin": {host},
	}

	if token != nil {
		headers.Set("Authorization", "Bearer "+*token)
	}

	conn, resp, err := dialer.DialContext(
		ctx,
		wsURL,
		headers,
	)
	if err == nil {
		return conn, nil
	}

	if ctx.Err() != nil {
		if resp != nil {
			_ = resp.Body.Close()
		}

		return nil, fmt.Errorf("subscription changed while connecting: %w", errSubscriptionInactive)
	}

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

		if resp.StatusCode == http.StatusGone {
			return nil, fmt.Errorf("dialing WebSocket: %w: %w", errWatchExpired, err)
		}
	}

	return nil, fmt.Errorf("dialing WebSocket: %w", err)
}

// calculateBackoffInterval returns the delay before the next reconnect attempt: the base
// interval, doubled for each consecutive failure and capped at maxInterval.
func calculateBackoffInterval(consecutiveFailures int, baseInterval, maxInterval time.Duration) time.Duration {
	return min(baseInterval<<min(consecutiveFailures, 20), maxInterval)
}

// monitorConnection monitors the health of a connection and attempts to reconnect if necessary.
func (m *Multiplexer) monitorConnection(conn *Connection) {
	ticker := time.NewTicker(m.heartbeatInterval)
	defer ticker.Stop()

	m.monitorConnectionTicks(conn, ticker.C, ticker)
}

func (m *Multiplexer) monitorConnectionWithHeartbeat(conn *Connection, heartbeat <-chan time.Time) {
	m.monitorConnectionTicks(conn, heartbeat, nil)
}

func (m *Multiplexer) monitorConnectionTicks(conn *Connection, heartbeat <-chan time.Time, ticker *time.Ticker) {
	consecutiveFailures := 0

	for {
		select {
		case <-conn.Done:
			conn.updateStatus(StateClosed, nil)

			return
		case <-heartbeat:
			if conn.IsClosed() {
				return
			}
			// A reconnected connection runs its own monitor.
			if newConn, stop := m.handleHeartbeatTick(conn, &consecutiveFailures, ticker); stop || newConn != nil {
				return
			}
		}
	}
}

// resumeWatchQuery returns the query a reconnecting watch dials with, so it resumes from the
// last resource version forwarded to the client. Explicitly empty cursors advance after
// the first event; watches that omit resourceVersion retain their original semantics.
func resumeWatchQuery(query, resourceVersion string) string {
	if resourceVersion == "" {
		return query
	}

	values, err := url.ParseQuery(query)
	if err != nil || values.Get("watch") == "" || !values.Has("resourceVersion") {
		return query
	}

	values.Set("resourceVersion", resourceVersion)

	return values.Encode()
}

func isWatchQuery(query string) bool {
	values, err := url.ParseQuery(query)
	if err != nil {
		return false
	}

	watch, err := strconv.ParseBool(values.Get("watch"))

	return err == nil && watch
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
	reconnecting := conn.reconnecting
	conn.mu.RUnlock()

	if closed {
		return nil, true
	}

	if reconnecting {
		return nil, false
	}

	if isConnected {
		err := conn.WSConn.WriteControl(websocket.PingMessage, nil, time.Now().Add(m.heartbeatInterval))
		if err == nil {
			return nil, false
		}

		if errors.Is(err, websocket.ErrCloseSent) {
			// The close handler has replied, but the reader still classifies the
			// close. Its result decides watch resumption versus finite completion.
			return nil, false
		}
	}

	if !isWatchQuery(conn.Query) {
		// Redialing an exec/log transport can repeat the operation before any
		// payload is sent. Only an explicit REQUEST may reopen finite streams.
		m.finishClusterReader(conn)
		return nil, true
	}

	newConn, err := m.reconnect(conn, conn.Query, errors.New("upstream heartbeat or watch failed"))
	if errors.Is(err, errWatchExpired) {
		m.endExpiredWatch(conn)

		return nil, true
	}

	if errors.Is(err, errReconnectInProgress) {
		return nil, false
	}

	if errors.Is(err, errSubscriptionInactive) ||
		(err != nil && conn.IsClosed()) {
		// The connection was closed or replaced while reconnecting.
		return nil, true
	}

	if err != nil {
		m.backoffReconnect(conn, consecutiveFailures, ticker, err)

		return nil, false
	}

	return newConn, false
}

func (m *Multiplexer) backoffReconnect(conn *Connection, failures *int, ticker *time.Ticker, err error) {
	*failures++

	delay := calculateBackoffInterval(*failures, m.heartbeatInterval, MaxReconnectBackoff)
	if ticker != nil {
		ticker.Reset(delay)
	}

	logger.Log(logger.LevelError, map[string]string{
		logFieldClusterID: conn.ClusterID,
		"failures":        fmt.Sprintf("%d", *failures),
		"nextRetryIn":     delay.String(),
	}, err, "reconnecting to cluster")
}

// reconnect replaces the upstream transport for a subscription. A heartbeat can
// reserve a replacement only while the reader is still active.
func (m *Multiplexer) reconnect(conn *Connection, query string, heartbeatErr error) (*Connection, error) {
	return m.reconnectContext(context.Background(), conn, query, heartbeatErr)
}

func (m *Multiplexer) reconnectContext(
	ctx context.Context, conn *Connection, query string, heartbeatErr error,
) (*Connection, error) {
	watch := isWatchQuery(conn.Query)
	if heartbeatErr == nil && watch && query != conn.Query {
		return nil, fmt.Errorf("a watch reopen must preserve its subscription query")
	}

	ctx, key, err := m.reserveReconnect(ctx, conn, heartbeatErr)
	if err != nil {
		return nil, err
	}

	defer m.releaseReconnect(conn)

	// Take over the stream before reading the cursor: a message the old reader has already
	// read but not forwarded is dropped here and replayed by the new watch.
	conn.forwardMu.Lock()
	conn.superseded = true
	resourceVersion := conn.resourceVersion
	conn.forwardMu.Unlock()

	if heartbeatErr != nil {
		conn.updateStatus(StateError, fmt.Errorf("heartbeat failed: %w", heartbeatErr))
	}

	dialQuery := query
	if watch {
		dialQuery = resumeWatchQuery(query, resourceVersion)
	}

	conn.mu.RLock()
	token := conn.Token
	conn.mu.RUnlock()

	newConn, err := m.establishClusterConnectionContext(
		ctx, conn.ClusterID, conn.UserID, conn.Path, query, dialQuery, key.client, token,
	)
	if err != nil {
		m.mutex.RLock()
		active := m.connections[key] == conn
		m.mutex.RUnlock()

		if ctx.Err() != nil || !active {
			conn.detachAndClose()

			return nil, fmt.Errorf("subscription changed while connecting: %w", errSubscriptionInactive)
		}

		return nil, err
	}

	if watch {
		newConn.resourceVersion = resourceVersion
	}

	if err := m.startConnectionContext(ctx, key, newConn, conn); err != nil {
		conn.detachAndClose()

		return nil, err
	}

	return newConn, nil
}

// reserveReconnect atomically excludes payload writes and claims an owned
// subscription, without waiting for any client writer under the global lock.
func (m *Multiplexer) reserveReconnect(
	ctx context.Context, conn *Connection, heartbeatErr error,
) (context.Context, connectionKey, error) {
	conn.upstreamMu.Lock()
	m.mutex.Lock()
	conn.mu.Lock()
	clientConn := conn.Client
	key := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, clientConn, conn.Query)

	var claimErr error

	switch {
	case ctx.Err() != nil || clientConn == nil || m.connections[key] != conn || (heartbeatErr != nil && conn.closed):
		claimErr = errSubscriptionInactive
	case conn.reconnecting:
		claimErr = errReconnectInProgress
	default:
		m.forgetCompletedConnectionLocked(key)

		conn.reconnecting = true
		if isWatchQuery(conn.Query) {
			// Once superseded, the existing reader cannot resume even if its socket is alive.
			conn.Status.State = StateError
		}

		ctx, conn.dialCancel = context.WithCancel(ctx)
	}

	conn.mu.Unlock()
	m.mutex.Unlock()
	conn.upstreamMu.Unlock()

	if claimErr != nil {
		return nil, key, claimErr
	}

	return ctx, key, nil
}

func (m *Multiplexer) releaseReconnect(conn *Connection) {
	conn.releaseReconnect()
	m.retainCompletedConnection(conn)
}

func (conn *Connection) releaseReconnect() {
	conn.mu.Lock()
	conn.dialCancel()
	conn.dialCancel = nil
	conn.reconnecting = false
	conn.mu.Unlock()
}

// HandleClientWebSocket handles incoming WebSocket connections from clients.
func (m *Multiplexer) HandleClientWebSocket(w http.ResponseWriter, r *http.Request) {
	clientConn, err := m.upgradeClient(w, r)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "upgrading connection")
		return
	}

	lockClientConn := NewWSConnLock(clientConn)
	work := m.newClientWork(r, lockClientConn)

	defer func() {
		work.cancel()

		_ = lockClientConn.Close()
		m.closeClientConnections(lockClientConn)
		<-work.done
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

		var validationErr error

		if msg.ClusterID == "" || msg.Path == "" || msg.UserID == "" || msg.Type == "" {
			validationErr = fmt.Errorf(
				"missing required routing fields: clusterId='%s', path='%s', userId='%s', type='%s'",
				msg.ClusterID, msg.Path, msg.UserID, msg.Type,
			)
			logger.Log(logger.LevelError, nil, validationErr, "invalid client message")

			if msg.Type != multiplexerRequestType || msg.RequestID == "" {
				continue
			}
		}

		key := m.createConnectionKey(msg.ClusterID, msg.Path, msg.UserID, lockClientConn, msg.Query)
		if msg.Type == "CLOSE" {
			work.closeSubscription(key)

			continue
		}

		if !work.enqueue(&clientRequest{key: key, msg: msg, err: validationErr}) {
			// A bounded queue prevents a slow dial/write from accumulating work.
			closeOverloadedMultiplexerClient(clientConn)

			return
		}
	}
}

func (m *Multiplexer) upgradeClient(w http.ResponseWriter, r *http.Request) (*websocket.Conn, error) {
	upgrader := m.upgrader

	for _, protocol := range websocket.Subprotocols(r) {
		if protocol == MultiplexerWatchProtocol {
			// This websocket version selects in client order, despite its
			// documented server preference. Restrict a per-request copy.
			upgrader.Subprotocols = []string{MultiplexerWatchProtocol}
			break
		}
	}

	return upgrader.Upgrade(w, r, nil)
}

func closeOverloadedMultiplexerClient(client *websocket.Conn) {
	_ = client.WriteControl(websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseTryAgainLater, "multiplexer request queue full"),
		time.Now().Add(time.Second))
}

const (
	clientRequestQueueSize = 32
	multiplexerRequestType = "REQUEST"
)

type clientRequest struct {
	key    connectionKey
	msg    Message
	status *Connection
	ctx    context.Context
	cancel context.CancelFunc
	err    error
}

// One bounded worker per client keeps reads (especially CLOSE/disconnect)
// responsive without automatically replaying requests queued during a dial.
type clientWork struct {
	m             *Multiplexer
	ctx           context.Context
	cancel        context.CancelFunc
	queue         chan *clientRequest
	notifications chan *clientRequest
	done          chan struct{}
	mu            sync.Mutex
	pending       map[*clientRequest]struct{}
}

func (m *Multiplexer) newClientWork(r *http.Request, client *WSConnLock) *clientWork {
	ctx, cancel := context.WithCancel(r.Context())
	work := &clientWork{
		m:   m,
		ctx: ctx, cancel: cancel,
		queue:         make(chan *clientRequest, clientRequestQueueSize),
		notifications: make(chan *clientRequest, clientRequestQueueSize),
		done:          make(chan struct{}),
		pending:       make(map[*clientRequest]struct{}),
	}

	go func() {
		defer close(work.done)

		for {
			select {
			case <-ctx.Done():
				return
			case notification := <-work.notifications:
				m.mutex.RLock()
				reopened := m.connections[notification.key] != nil
				m.mutex.RUnlock()

				if !reopened {
					_ = notification.status.writeStatusContext(ctx)
				}
			case request := <-work.queue:
				if request.ctx.Err() == nil {
					switch {
					case request.err != nil:
						m.handleConnectionErrorContext(request.ctx, client, request.msg, request.err)
					default:
						m.processClientMessage(r.WithContext(request.ctx), client, request.msg)
					}
				}

				if request.msg.Type == multiplexerRequestType && request.msg.RequestID != "" && ctx.Err() == nil {
					_ = client.WriteJSON(Message{
						ClusterID: request.msg.ClusterID, Path: request.msg.Path, Query: request.msg.Query,
						UserID: request.msg.UserID, RequestID: request.msg.RequestID, Type: "ACK",
					})
				}

				work.mu.Lock()
				delete(work.pending, request)
				request.cancel()
				work.mu.Unlock()
			}
		}
	}()

	return work
}

func (work *clientWork) enqueue(request *clientRequest) bool {
	if request.status != nil {
		select {
		case work.notifications <- request:
			return true
		default:
			return false
		}
	}

	work.mu.Lock()
	defer work.mu.Unlock()

	request.ctx, request.cancel = context.WithCancel(work.ctx)
	if request.err == nil && request.msg.Type == multiplexerRequestType {
		needsDial, reconnecting := work.connectionState(request.key)
		if reconnecting {
			request.err = errReconnectInProgress
		} else if needsDial {
			for pending := range work.pending {
				if pending.key == request.key && pending.msg.Type == multiplexerRequestType &&
					pending.err == nil && pending.ctx.Err() == nil {
					request.err = errReconnectInProgress
					break
				}
			}
		}
	}

	select {
	case work.queue <- request:
		work.pending[request] = struct{}{}

		return true
	default:
		request.cancel()

		return false
	}
}

func (work *clientWork) connectionState(key connectionKey) (needsDial, reconnecting bool) {
	work.m.mutex.RLock()
	conn := work.m.connections[key]
	work.m.mutex.RUnlock()

	if conn == nil {
		return true, false
	}

	conn.mu.RLock()
	defer conn.mu.RUnlock()

	return conn.closed || conn.reconnecting || conn.Status.State != StateConnected, conn.reconnecting
}

func (work *clientWork) cancelKey(key connectionKey) {
	work.mu.Lock()
	defer work.mu.Unlock()

	for pending := range work.pending {
		if pending.key == key {
			pending.cancel()
		}
	}
}

func (work *clientWork) closeSubscription(key connectionKey) {
	work.cancelKey(key)
	conn := work.m.removeConnection(key)

	// Invalidate and close immediately; only the notification waits for work.
	if conn != nil && conn.closeTransport() {
		// Notifications are best effort; lifecycle cancellation must never
		// disconnect other subscriptions because the worker queue is full.
		_ = work.enqueue(&clientRequest{key: key, status: conn})
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
		m.closeConnection(m.createConnectionKey(msg.ClusterID, msg.Path, msg.UserID, lockClientConn, msg.Query))

		return
	}

	if msg.Type != multiplexerRequestType {
		m.sendClientErrorContext(
			r.Context(),
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
		logger.Log(logger.LevelError, map[string]string{logFieldClusterID: msg.ClusterID}, err, "getting token from cookie")
		m.sendClientErrorContext(r.Context(), lockClientConn, msg.ClusterID, msg.Path, msg.Query, msg.UserID, err)

		return
	}

	var tokenPtr *string
	if token != "" {
		tokenPtr = &token
	}

	conn, err := m.getOrCreateConnectionContext(r.Context(), msg, lockClientConn, tokenPtr)
	if err != nil {
		if r.Context().Err() == nil && !errors.Is(err, errSubscriptionInactive) {
			m.handleConnectionErrorContext(r.Context(), lockClientConn, msg, err)
		}

		return
	}

	if err := m.writeMessageToClusterContext(r.Context(), conn, []byte(msg.Data)); err != nil {
		if r.Context().Err() == nil {
			m.handleConnectionErrorContext(r.Context(), lockClientConn, msg, err)
		}
	}
}

// closeClientConnections closes all connections associated with a specific client.
func (m *Multiplexer) closeClientConnections(clientConn *WSConnLock) {
	var connsToClose []*Connection

	m.mutex.Lock()
	for key, conn := range m.connections {
		if key.client == clientConn {
			connsToClose = append(connsToClose, conn)

			delete(m.connections, key)
		}
	}

	delete(m.completed, clientConn)
	m.mutex.Unlock()

	for _, conn := range connsToClose {
		conn.mu.Lock()
		if conn.dialCancel != nil {
			conn.dialCancel()
		}

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
// Reusing a socket requires the same credentials as its upstream handshake.
func (m *Multiplexer) getOrCreateConnection(msg Message, clientConn *WSConnLock, token *string) (*Connection, error) {
	return m.getOrCreateConnectionContext(context.Background(), msg, clientConn, token)
}

func (m *Multiplexer) validateConnectionRequest(msg Message, token *string) error {
	if token == nil || strings.TrimSpace(*token) == "" {
		clusterContext, err := m.kubeConfigStore.GetContext(msg.ClusterID)
		if err == nil && clusterContext.RequiresUserAuthentication() {
			return errUserAuthRequired
		}
	}

	if msg.Reopen && !isWatchQuery(msg.Query) {
		return fmt.Errorf("reopen is only supported for watches")
	}

	return nil
}

func (m *Multiplexer) getOrCreateConnectionContext(
	ctx context.Context, msg Message, clientConn *WSConnLock, token *string,
) (*Connection, error) {
	if err := m.validateConnectionRequest(msg, token); err != nil {
		return nil, err
	}

	connKey := m.createConnectionKey(msg.ClusterID, msg.Path, msg.UserID, clientConn, msg.Query)

	m.mutex.Lock()
	if ctx.Err() != nil {
		m.mutex.Unlock()

		return nil, errSubscriptionInactive
	}

	conn := m.connections[connKey]
	if call := m.inFlight[connKey]; call != nil && conn != nil {
		if err := m.refreshConnectionToken(conn, token); err != nil {
			m.mutex.Unlock()

			return nil, err
		}

		call.waiters++
		m.mutex.Unlock()

		return call.wait(ctx)
	}

	if conn != nil {
		m.mutex.Unlock()

		if err := m.refreshConnectionToken(conn, token); err != nil {
			return nil, err
		}

		if msg.Reopen && !isWatchQuery(conn.Query) {
			return nil, fmt.Errorf("reopen cannot replace a non-watch subscription")
		}

		if conn.IsClosed() || msg.Reopen {
			return m.reconnectContext(ctx, conn, msg.Query, nil)
		}

		return conn, nil
	}

	// Reserve initial dials so CLOSE can invalidate a subscription before its handshake finishes.
	previous := m.createConnection(msg.ClusterID, msg.UserID, msg.Path, msg.Query, clientConn, token)
	ctx, previous.dialCancel = context.WithCancel(ctx)
	previous.reconnecting = true
	m.connections[connKey] = previous
	call := &inFlightDial{done: make(chan struct{}), err: errDialIncomplete}
	m.inFlight[connKey] = call
	m.mutex.Unlock()

	return m.dialInitialConnection(ctx, connKey, previous, call)
}

func (m *Multiplexer) dialInitialConnection(
	ctx context.Context, connKey connectionKey, previous *Connection, call *inFlightDial,
) (*Connection, error) {
	defer previous.releaseReconnect()
	defer func() {
		m.mutex.Lock()
		if m.inFlight[connKey] == call {
			delete(m.inFlight, connKey)
		}
		m.mutex.Unlock()
		close(call.done)
	}()

	conn, err := m.establishClusterConnectionContext(
		ctx, previous.ClusterID, previous.UserID, previous.Path,
		previous.Query, previous.Query, connKey.client, previous.Token)
	if err != nil {
		call.err = err

		m.mutex.Lock()
		if m.connections[connKey] == previous {
			delete(m.connections, connKey)
		}
		m.mutex.Unlock()

		return nil, err
	}

	if err := m.startConnectionContext(ctx, connKey, conn, previous); err != nil {
		call.err = err
		return nil, err
	}

	call.conn = conn
	call.err = nil

	return conn, nil
}

func (m *Multiplexer) refreshConnectionToken(conn *Connection, requestToken *string) error {
	conn.mu.RLock()
	defer conn.mu.RUnlock()

	if conn.usesServiceAccountToken {
		return nil
	}

	var current, requested string
	if conn.Token != nil {
		current = *conn.Token
	}

	if requestToken != nil {
		requested = *requestToken
	}

	if current != requested {
		return fmt.Errorf("connection credentials changed; open a new subscription")
	}

	return nil
}

// sendClientError sends an error message to the client WebSocket connection.
func (m *Multiplexer) sendClientErrorContext(
	ctx context.Context, clientConn *WSConnLock, clusterID, path, query, userID string, err error,
) {
	clientConn.writeMu.Lock()
	defer clientConn.writeMu.Unlock()

	if ctx.Err() != nil {
		return
	}

	errorData := struct {
		Error      string `json:"error"`
		Code       string `json:"code,omitempty"`
		RetryReady bool   `json:"retryReady,omitempty"`
	}{
		Error: err.Error(),
	}
	if errors.Is(err, errReconnectInProgress) {
		errorData.Code = "subscription_reconnecting"
		// Snapshot readiness under the client writer so it agrees with STATUS
		// ordering, including requests rejected while a worker was dialing.
		m.mutex.RLock()
		conn := m.connections[m.createConnectionKey(clusterID, path, userID, clientConn, query)]
		m.mutex.RUnlock()

		errorData.RetryReady = conn == nil
		if conn != nil {
			conn.mu.RLock()
			errorData.RetryReady = !conn.reconnecting && (conn.closed || conn.Status.State == StateConnected)
			conn.mu.RUnlock()
		}
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

	if err := clientConn.conn.WriteJSON(errorMsg); err != nil {
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
	m.handleConnectionErrorContext(context.Background(), clientConn, msg, err)
}

func (m *Multiplexer) handleConnectionErrorContext(
	ctx context.Context, clientConn *WSConnLock, msg Message, err error,
) {
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

		clientConn.writeMu.Lock()
		defer clientConn.writeMu.Unlock()

		if ctx.Err() != nil {
			return
		}

		if writeErr := clientConn.conn.WriteJSON(expiredMsg); writeErr != nil {
			logger.Log(logger.LevelInfo, map[string]string{logFieldClusterID: msg.ClusterID}, writeErr,
				"sending watch expiry to client")
		}

		return
	}

	m.sendClientErrorContext(ctx, clientConn, msg.ClusterID, msg.Path, msg.Query, msg.UserID, err)

	if ctx.Err() != nil {
		return
	}

	logger.Log(logger.LevelError,
		map[string]string{logFieldClusterID: msg.ClusterID}, err,
		"establishing cluster connection")
}

// writeMessageToCluster writes a message to the cluster WebSocket connection.
func (m *Multiplexer) writeMessageToCluster(conn *Connection, data []byte) error {
	return m.writeMessageToClusterContext(context.Background(), conn, data)
}

func (m *Multiplexer) writeMessageToClusterContext(ctx context.Context, conn *Connection, data []byte) error {
	conn.upstreamMu.Lock()
	conn.mu.RLock()

	var err error

	switch {
	case ctx.Err() != nil:
		err = errSubscriptionInactive
	case conn.reconnecting:
		err = errReconnectInProgress
	case !conn.closed && isWatchQuery(conn.Query) && conn.Status.State == StateError:
		err = errReconnectInProgress
	case conn.closed || conn.WSConn == nil || conn.Status.State != StateConnected:
		err = fmt.Errorf("subscription is not connected; retry after reconnection or reopen the subscription")
	}

	conn.mu.RUnlock()

	if err != nil {
		conn.upstreamMu.Unlock()

		return err
	}

	err = conn.WSConn.WriteMessage(websocket.BinaryMessage, data)
	conn.upstreamMu.Unlock()

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

const maxCompletedSubscriptionsPerClient = 64

// finishClusterReader bounds retained completed subscriptions before status I/O.
// Reserved replacements remain owned even if their retiring reader exits.
func (m *Multiplexer) finishClusterReader(conn *Connection) {
	notify := conn.closeTransport()
	m.retainCompletedConnection(conn)

	if notify {
		_ = conn.writeStatus()
	}
}

func (m *Multiplexer) retainCompletedConnection(conn *Connection) {
	conn.mu.RLock()
	completed := conn.closed && !conn.reconnecting && conn.Client != nil
	conn.mu.RUnlock()

	if !completed {
		return
	}

	m.mutex.Lock()
	defer m.mutex.Unlock()

	conn.mu.RLock()

	client := conn.Client

	key := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, client, conn.Query)
	if client == nil || !conn.closed || conn.reconnecting || m.connections[key] != conn {
		conn.mu.RUnlock()

		return
	}

	entry := completedSubscription{conn, conn.Status.LastMsg}
	conn.mu.RUnlock()

	entries := m.completed[client]
	if entries == nil {
		entries = make(map[connectionKey]completedSubscription)
		m.completed[client] = entries
	}

	entries[key] = entry
	if len(entries) <= maxCompletedSubscriptionsPerClient {
		return
	}

	oldestKey, oldest := key, entries[key]
	for candidateKey, candidate := range entries {
		if candidate.closedAt.Before(oldest.closedAt) {
			oldestKey, oldest = candidateKey, candidate
		}
	}

	delete(m.connections, oldestKey)
	delete(entries, oldestKey)
	oldest.conn.mu.Lock()
	oldest.conn.Client = nil
	oldest.conn.mu.Unlock()
}

// Caller holds m.mutex.
func (m *Multiplexer) forgetCompletedConnectionLocked(key connectionKey) {
	entries := m.completed[key.client]
	delete(entries, key)

	if len(entries) == 0 {
		delete(m.completed, key.client)
	}
}

// handleClusterMessages handles messages from a cluster connection.
func (m *Multiplexer) handleClusterMessages(conn *Connection, clientConn *WSConnLock) {
	// Keep the subscription available for an in-flight replacement or a new request.
	closeOnExit := true
	defer func() {
		if closeOnExit {
			m.finishClusterReader(conn)
		}
	}()

	var lastResourceVersion string

	for {
		select {
		case <-conn.Done:
			return
		default:
			if err := m.processClusterMessage(conn, clientConn, &lastResourceVersion); err != nil {
				if errors.Is(err, errConnectionSuperseded) && isWatchQuery(conn.Query) {
					// The transport is retired, not the owned subscription: a failed
					// replacement must leave the monitor eligible for its next retry.
					closeOnExit = false
					_ = conn.WSConn.Close()

					return
				}

				if errors.Is(err, errConnectionSuperseded) || errors.Is(err, errWatchExpired) {
					return
				}

				var writeErr clientWriteError
				if errors.As(err, &writeErr) {
					logger.Log(logger.LevelInfo, map[string]string{
						logFieldClusterID: conn.ClusterID,
						"userID":          conn.UserID,
					}, err, "writing to client connection failed; stopping client pump")
					m.removeRegisteredConnection(conn)

					return
				}

				if isWatchQuery(conn.Query) {
					// Watch close frames, including routine timeout code 1000, resume
					// from the last forwarded cursor. Finite streams remain terminal.
					closeOnExit = false

					conn.updateStatus(StateError, err)
				}

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
					logFieldClusterID: conn.ClusterID,
					"userID":          conn.UserID,
				},
				err,
				"reading cluster message",
			)
		}

		return err
	}

	conn.forwardMu.Lock()
	defer conn.forwardMu.Unlock()

	if conn.superseded {
		return errConnectionSuperseded
	}

	expired := errors.Is(m.sendIfNewResourceVersion(message, conn, clientConn, lastResourceVersion), errWatchExpired)

	if err := m.sendDataMessage(conn, clientConn, messageType, message); err != nil {
		return err
	}

	if expired {
		// The client received the expiry event and lists again; a watch resumed from here
		// would miss what changed meanwhile, such as deletions. Removing conn before releasing
		// forwardMu keeps a concurrent reconnect from replacing it.
		m.removeRegisteredConnection(conn)

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

	m.removeRegisteredConnection(conn)
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
func (m *Multiplexer) removeRegisteredConnection(conn *Connection) {
	m.mutex.Lock()
	conn.mu.Lock()

	connKey := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, conn.Client, conn.Query)
	if m.connections[connKey] == conn {
		delete(m.connections, connKey)
		m.forgetCompletedConnectionLocked(connKey)
	}

	if conn.dialCancel != nil {
		conn.dialCancel()
	}
	conn.mu.Unlock()
	m.mutex.Unlock()

	conn.safeClose()
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
	connections := make([]*Connection, 0, len(m.connections))

	for key, conn := range m.connections {
		connections = append(connections, conn)
		delete(m.connections, key)
		conn.mu.Lock()
		if conn.dialCancel != nil {
			conn.dialCancel()
		}
		conn.mu.Unlock()
	}

	clear(m.completed)
	m.mutex.Unlock()

	notifications := make([]*Connection, 0, len(connections))
	for _, conn := range connections {
		if conn.closeTransport() {
			notifications = append(notifications, conn)
		}
	}

	for _, conn := range notifications {
		_ = conn.writeStatus()
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

// closeConnection closes the upstream connection for a single subscription.
func (m *Multiplexer) closeConnection(connKey connectionKey) {
	if conn := m.removeConnection(connKey); conn != nil {
		conn.safeClose()
	}
}

func (m *Multiplexer) removeConnection(connKey connectionKey) *Connection {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	conn, exists := m.connections[connKey]
	if !exists {
		return nil
	}

	delete(m.connections, connKey)
	m.forgetCompletedConnectionLocked(connKey)
	conn.mu.Lock()
	if conn.dialCancel != nil {
		conn.dialCancel()
	}
	conn.mu.Unlock()

	return conn
}

func (m *Multiplexer) createConnectionKey(
	clusterID, path, userID string, client *WSConnLock, query ...string,
) connectionKey {
	key := connectionKey{client: client, clusterID: clusterID, path: path, userID: userID}
	if len(query) != 0 && isWatchQuery(query[0]) {
		key.query = query[0]
	}

	return key
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
