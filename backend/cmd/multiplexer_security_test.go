package main

import (
	"errors"
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
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

type gatedClientWrite struct {
	enabled atomic.Bool
	entered chan struct{}
	release chan struct{}
	unblock func()
	once    sync.Once
}

type gatedClientConn struct {
	net.Conn
	gate   *gatedClientWrite
	closed chan struct{}
	once   sync.Once
}

func (conn *gatedClientConn) Write(data []byte) (int, error) {
	if conn.gate.enabled.Load() {
		conn.gate.once.Do(func() { close(conn.gate.entered) })

		select {
		case <-conn.gate.release:
		case <-conn.closed:
			return 0, net.ErrClosed
		}
	}

	return conn.Conn.Write(data)
}

func (conn *gatedClientConn) Close() error {
	conn.once.Do(func() { close(conn.closed) })

	return conn.Conn.Close()
}

type gatedClientListener struct {
	net.Listener
	gate *gatedClientWrite
}

func (listener *gatedClientListener) Accept() (net.Conn, error) {
	conn, err := listener.Listener.Accept()
	if err != nil {
		return nil, err
	}

	return &gatedClientConn{Conn: conn, gate: listener.gate, closed: make(chan struct{})}, nil
}

func newGatedStatusClient(t *testing.T) (*WSConnLock, *gatedClientWrite) {
	t.Helper()

	gate := &gatedClientWrite{entered: make(chan struct{}), release: make(chan struct{})}
	gate.unblock = sync.OnceFunc(func() { close(gate.release) })
	accepted := make(chan *websocket.Conn, 1)
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err == nil {
			accepted <- conn
		}
	}))
	server.Listener = &gatedClientListener{Listener: server.Listener, gate: gate}
	server.Start()
	t.Cleanup(server.Close)
	dialMultiplexerTestClient(t, server.URL)

	client := NewWSConnLock(<-accepted)

	t.Cleanup(func() { _ = client.Close() })
	t.Cleanup(gate.unblock)

	return client, gate
}

func awaitMultiplexerSignal(t *testing.T, signal <-chan struct{}, description string) {
	t.Helper()

	select {
	case <-signal:
	case <-time.After(3 * time.Second):
		t.Fatal(description)
	}
}

//nolint:funlen // Keeps the blocked network writer and independent lifecycle operations in one regression.
func TestReconnectBlockedStatusDoesNotHoldLifecycleLocks(t *testing.T) {
	dialStarted := make(chan struct{})
	releaseDial := make(chan struct{})
	unblock := sync.OnceFunc(func() { close(releaseDial) })
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(dialStarted)
		<-releaseDial
		http.Error(w, "test handshake rejected", http.StatusServiceUnavailable)
	}))
	t.Cleanup(upstream.Close)
	t.Cleanup(unblock)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "shared", Cluster: &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	client, gate := newGatedStatusClient(t)
	previous := m.createConnection("shared", "user", "/stream", "", client, nil)
	m.connections[m.createConnectionKey("shared", "/stream", "user", client, previous.Query)] = previous
	otherClient, server := createTestWebSocketConnection()
	t.Cleanup(server.Close)
	t.Cleanup(func() { _ = otherClient.Close() })

	other := m.createConnection("missing", "user", "/other", "", otherClient, nil)
	other.Status.State = StateConnected
	otherKey := m.createConnectionKey(other.ClusterID, other.Path, other.UserID, otherClient, other.Query)
	m.connections[otherKey] = other

	t.Cleanup(func() {
		unblock()
		gate.unblock()

		_ = client.Close()

		m.cleanupConnections()
	})

	gate.enabled.Store(true)

	readerDone := make(chan struct{})

	go func() {
		previous.safeClose()
		close(readerDone)
	}()

	awaitMultiplexerSignal(t, gate.entered, "reader status did not block in the network writer")

	reconnectDone := make(chan struct{})

	go func() {
		_, _ = m.reconnect(previous, "", nil)

		close(reconnectDone)
	}()

	awaitMultiplexerSignal(t, dialStarted, "replacement claim was blocked by status I/O")

	operationsDone := make(chan struct{})

	var (
		found    *Connection
		claimErr error
	)

	go func() {
		found, _ = m.getOrCreateConnection(Message{ClusterID: other.ClusterID, Path: other.Path, UserID: other.UserID},
			otherClient, nil)
		_, claimErr = m.reconnect(other, "", errors.New("test heartbeat failure"))
		m.closeConnection(otherKey)
		m.closeClientConnections(otherClient)
		close(operationsDone)
	}()

	awaitMultiplexerSignal(t, operationsDone, "unrelated lookup, claim, close or disconnect was globally stalled")
	require.Same(t, other, found)
	require.ErrorContains(t, claimErr, "getting context: key not found")
	require.NoError(t, client.Close(), "concurrent Close must unblock a stalled WebSocket writer")
	awaitMultiplexerSignal(t, readerDone, "reader cleanup did not finish after client close")
	m.closeClientConnections(client)
	unblock()
	awaitMultiplexerSignal(t, reconnectDone, "canceled replacement did not finish")
}

func TestMultiplexerRequestRejectsClaimBeforeStatusPublication(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	client, server := createTestWebSocketConnection()
	t.Cleanup(server.Close)
	t.Cleanup(func() { _ = client.Close() })

	upstream, upstreamServer := createTestWebSocketConnection()
	t.Cleanup(upstreamServer.Close)
	t.Cleanup(func() { _ = upstream.Close() })

	conn := m.createConnection("shared", "user", "/stream", "", client, nil)
	conn.WSConn, conn.Status.State = upstream.conn, StateConnected
	key := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, client, conn.Query)
	m.connections[key] = conn
	t.Cleanup(m.cleanupConnections)

	// Stop after the real claim, before reconnect publishes StateError.
	_, _, err := m.reserveReconnect(t.Context(), conn, errors.New("test heartbeat failure"))
	require.NoError(t, err)

	defer conn.releaseReconnect()

	conn.mu.RLock()
	state := conn.Status.State
	conn.mu.RUnlock()
	require.Equal(t, StateConnected, state)
	m.processClientMessage(httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil), client,
		Message{Type: "REQUEST", ClusterID: conn.ClusterID, Path: conn.Path, UserID: conn.UserID, Data: "retiring"})
	require.Contains(t, readMultiplexerTestMessage(t, client.conn, "ERROR").Data, "retry")

	// The next received upstream message must be this marker, not the rejected request.
	require.NoError(t, upstream.WriteMessage(websocket.BinaryMessage, []byte("marker")))
	require.NoError(t, upstream.conn.SetReadDeadline(time.Now().Add(3*time.Second)))
	_, payload, err := upstream.conn.ReadMessage()
	require.NoError(t, err)
	require.Equal(t, "marker", string(payload))
}

func dialAuthenticatedMultiplexerClient(t *testing.T, serverURL string) *websocket.Conn {
	t.Helper()

	cookies := httptest.NewRecorder()
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	require.NoError(t, auth.SetTokenCookie(cookies, request, "shared", "owner", "", 3600))

	for _, cookie := range cookies.Result().Cookies() {
		if cookie.MaxAge > 0 {
			request.AddCookie(cookie)
		}
	}

	dialer := newTestDialer()
	dialer.Subprotocols = []string{MultiplexerWatchProtocol, MultiplexerProtocol}

	client, response, err := dialer.Dial("ws"+strings.TrimPrefix(serverURL, "http"), request.Header)
	if response != nil {
		_ = response.Body.Close()
	}

	require.NoError(t, err)
	t.Cleanup(func() { _ = client.Close() })

	return client
}

type multiplexerDialGate struct {
	started, canceled, finished chan struct{}
	release                     chan struct{}
	unblock                     func()
	payloads                    chan string
	upstream                    *httptest.Server
}

func newMultiplexerDialGate(t *testing.T, initial bool) *multiplexerDialGate {
	t.Helper()

	gate := &multiplexerDialGate{
		started: make(chan struct{}), canceled: make(chan struct{}), finished: make(chan struct{}),
		release: make(chan struct{}), payloads: make(chan string, 4),
	}
	gate.unblock = sync.OnceFunc(func() { close(gate.release) })

	var handshakes atomic.Int32

	gate.upstream = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer owner" {
			http.Error(w, "wrong handshake credential", http.StatusUnauthorized)

			return
		}

		if initial || handshakes.Add(1) == 2 {
			defer close(gate.finished)

			close(gate.started)

			select {
			case <-r.Context().Done():
				close(gate.canceled)
				<-gate.release
			case <-gate.release:
			}
		}

		upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = ws.Close() }()

		_, data, err := ws.ReadMessage()
		if err == nil {
			gate.payloads <- string(data)

			_ = ws.WriteMessage(websocket.TextMessage, []byte(r.URL.RawQuery+":"+string(data)))
			_ = ws.WriteControl(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
		}
	}))
	t.Cleanup(gate.upstream.Close)
	t.Cleanup(gate.unblock)

	return gate
}

func TestCleanupConnectionsClosesTransportsBeforeBlockedStatus(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	client, gate := newGatedStatusClient(t)
	connections := make([]*Connection, 0, 2)

	for _, path := range []string{"/first", "/second"} {
		conn := m.createConnection("shared", "user", path, "", client, nil)
		m.connections[m.createConnectionKey("shared", path, "user", client)] = conn
		connections = append(connections, conn)
	}

	gate.enabled.Store(true)

	cleanupDone := make(chan struct{})

	t.Cleanup(func() {
		gate.unblock()
		<-cleanupDone
	})

	go func() {
		m.cleanupConnections()
		close(cleanupDone)
	}()

	awaitMultiplexerSignal(t, gate.entered, "cleanup status did not reach the blocked writer")

	for _, conn := range connections {
		awaitMultiplexerSignal(t, conn.Done, "cleanup left an upstream open while delivering another status")
	}

	gate.unblock()
	awaitMultiplexerSignal(t, cleanupDone, "cleanup did not finish after releasing the writer")
}

//nolint:funlen // Verifies request ordering and non-replay through real client and upstream sockets.
func TestMultiplexerGatedReopenDoesNotReplayQueuedRequest(t *testing.T) {
	gate := newMultiplexerDialGate(t, false)
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "shared", Cluster: &api.Cluster{Server: gate.upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	server := httptest.NewServer(http.HandlerFunc(m.HandleClientWebSocket))
	t.Cleanup(server.Close)
	client := dialAuthenticatedMultiplexerClient(t, server.URL)
	msg := Message{
		Type: "REQUEST", ClusterID: "shared", Path: "/stream", UserID: "user",
		Query: "command=first", Data: "first",
	}
	require.NoError(t, client.WriteJSON(msg))
	readMultiplexerTestMessage(t, client, "STATUS")
	readMultiplexerTestMessage(t, client, "DATA")
	readMultiplexerTestMessage(t, client, "STATUS")
	require.Equal(t, "first", <-gate.payloads)

	msg.Query, msg.Data = "command=second", "second"
	require.NoError(t, client.WriteJSON(msg))
	awaitMultiplexerSignal(t, gate.started, "reopen did not reach the gated handshake")

	msg.Data = "must-not-replay"
	require.NoError(t, client.WriteJSON(msg))

	pong := make(chan struct{})

	client.SetPongHandler(func(string) error { close(pong); return nil })

	messages := make(chan Message, 8)

	readDone := make(chan struct{})
	go func() {
		defer close(readDone)

		for {
			var message Message
			if err := client.ReadJSON(&message); err != nil {
				return
			}

			messages <- message
		}
	}()

	t.Cleanup(func() {
		_ = client.Close()

		<-readDone
	})
	require.NoError(t, client.WriteControl(websocket.PingMessage, nil, time.Now().Add(time.Second)))
	awaitMultiplexerSignal(t, pong, "real read loop did not enqueue the competing request during the dial")
	gate.unblock()

	for sawData, sawError := false, false; !sawData || !sawError; {
		select {
		case message := <-messages:
			switch message.Type {
			case "DATA":
				require.Equal(t, "command=second:second", message.Data)

				sawData = true
			case "ERROR":
				require.Contains(t, message.Data, "retry")

				sawError = true
			}
		case <-time.After(3 * time.Second):
			t.Fatal("reopen payload and explicit retry error were not both delivered")
		}
	}

	awaitMultiplexerSignal(t, gate.finished, "replacement upstream did not finish")
	require.Equal(t, "second", <-gate.payloads)

	select {
	case payload := <-gate.payloads:
		t.Fatalf("a request received during the replacement was replayed: %q", payload)
	default:
	}
}

func multiplexerPingBarrier(t *testing.T, client *websocket.Conn) {
	t.Helper()

	pong := make(chan struct{})

	client.SetPongHandler(func(string) error { close(pong); return nil })
	require.NoError(t, client.WriteControl(websocket.PingMessage, nil, time.Now().Add(time.Second)))

	readDone := make(chan struct{})
	messages := make(chan Message, 8)

	go func() {
		defer close(readDone)

		for {
			var message Message
			if err := client.ReadJSON(&message); err != nil {
				return
			}

			messages <- message
		}
	}()

	t.Cleanup(func() {
		_ = client.Close()

		<-readDone
	})
	awaitMultiplexerSignal(t, pong, "client read loop did not process preceding frames before the ping")

	for {
		select {
		case message := <-messages:
			require.NotEqual(t, "ERROR", message.Type, "explicit cancellation must not report a dial error")
			require.Equal(t, "STATUS", message.Type)
			require.JSONEq(t, `{"state":"closed","error":""}`, message.Data)
		default:
			return
		}
	}
}

func TestMultiplexerClientCancelsGatedDial(t *testing.T) {
	for _, initial := range []bool{false, true} {
		for _, disconnect := range []bool{false, true} {
			t.Run(fmt.Sprintf("initial=%t/disconnect=%t", initial, disconnect), func(t *testing.T) {
				testMultiplexerClientCancelsGatedDial(t, initial, disconnect)
			})
		}
	}
}

func TestMultiplexerGatedDialBoundsPendingRequests(t *testing.T) {
	gate := newMultiplexerDialGate(t, true)
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "shared", Cluster: &api.Cluster{Server: gate.upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	handlerDone := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.HandleClientWebSocket(w, r)
		close(handlerDone)
	}))
	t.Cleanup(server.Close)
	client := dialAuthenticatedMultiplexerClient(t, server.URL)
	msg := Message{Type: "REQUEST", ClusterID: "shared", Path: "/stream", UserID: "user", Data: "never-execute"}
	require.NoError(t, client.WriteJSON(msg))
	awaitMultiplexerSignal(t, gate.started, "initial handshake did not reach the gate")

	for i := 0; i <= clientRequestQueueSize; i++ {
		require.NoError(t, client.WriteJSON(msg))
	}

	require.NoError(t, client.SetReadDeadline(time.Now().Add(3*time.Second)))
	_, _, err := client.ReadMessage()
	require.True(t, websocket.IsCloseError(err, websocket.CloseTryAgainLater), "overload must report retry-later: %v", err)
	awaitMultiplexerSignal(t, gate.canceled, "queue exhaustion did not cancel the dial")
	gate.unblock()
	awaitMultiplexerSignal(t, gate.finished, "canceled upstream did not finish")
	awaitMultiplexerSignal(t, handlerDone, "overloaded handler leaked its worker")

	select {
	case payload := <-gate.payloads:
		t.Fatalf("an overloaded client's request executed upstream: %q", payload)
	default:
	}
}

//nolint:funlen // Keeps real read-loop cancellation, upstream non-execution and cleanup assertions together.
func testMultiplexerClientCancelsGatedDial(t *testing.T, initial, disconnect bool) {
	t.Helper()
	gate := newMultiplexerDialGate(t, initial)
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "shared", Cluster: &api.Cluster{Server: gate.upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	handlerDone := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.HandleClientWebSocket(w, r)
		close(handlerDone)
	}))
	t.Cleanup(server.Close)
	client := dialAuthenticatedMultiplexerClient(t, server.URL)

	msg := Message{
		Type: "REQUEST", ClusterID: "shared", Path: "/stream", UserID: "user",
		Query: "command=first", Data: "first",
	}
	if !initial {
		require.NoError(t, client.WriteJSON(msg))
		readMultiplexerTestMessage(t, client, "STATUS")
		require.Equal(t, "command=first:first", readMultiplexerTestMessage(t, client, "DATA").Data)
		readMultiplexerTestMessage(t, client, "STATUS")
		require.Equal(t, "first", <-gate.payloads)
	}

	msg.Query, msg.Data = "command=must-not-execute", "must-not-execute"
	require.NoError(t, client.WriteJSON(msg))
	awaitMultiplexerSignal(t, gate.started, "request did not reach the gated handshake")

	if disconnect {
		require.NoError(t, client.Close())
	} else {
		msg.Type = "CLOSE"
		require.NoError(t, client.WriteJSON(msg))
	}

	awaitMultiplexerSignal(t, gate.canceled, "client CLOSE/disconnect did not cancel the in-flight handshake")
	gate.unblock()
	awaitMultiplexerSignal(t, gate.finished, "canceled upstream handler did not finish")

	if !disconnect {
		multiplexerPingBarrier(t, client)
	} else {
		awaitMultiplexerSignal(t, handlerDone, "disconnect cleanup did not finish")
	}

	m.mutex.RLock()
	remaining := len(m.connections)
	m.mutex.RUnlock()
	require.Zero(t, remaining, "a canceled handshake must not install a replacement")

	select {
	case payload := <-gate.payloads:
		t.Fatalf("canceled request executed upstream: %q", payload)
	default:
	}

	if !disconnect {
		require.NoError(t, client.Close())
	}

	awaitMultiplexerSignal(t, handlerDone, "real handler did not finish")
}

//nolint:funlen // Exercises authenticated clients across the complete WebSocket protocol.
func TestMultiplexerAuthenticatedClientIsolation(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("Authorization")
		if token != "Bearer owner" && token != "Bearer other-user" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = ws.Close() }()

		for {
			_, data, err := ws.ReadMessage()
			if err != nil {
				return
			}

			if err := ws.WriteMessage(websocket.TextMessage, []byte(token+":"+string(data))); err != nil {
				return
			}
		}
	}))
	t.Cleanup(upstream.Close)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:    "shared",
		Cluster: &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	server := httptest.NewServer(http.HandlerFunc(m.HandleClientWebSocket))
	t.Cleanup(server.Close)

	dial := func(token string) *websocket.Conn {
		t.Helper()

		cookies := httptest.NewRecorder()
		require.NoError(t, auth.SetTokenCookie(cookies, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil),
			"shared", token, "", 3600))
		request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)

		for _, cookie := range cookies.Result().Cookies() {
			if cookie.MaxAge > 0 {
				request.AddCookie(cookie)
			}
		}

		ws, response, err := newTestDialer().Dial("ws"+strings.TrimPrefix(server.URL, "http"), request.Header)
		if response != nil {
			_ = response.Body.Close()
		}

		require.NoError(t, err)
		t.Cleanup(func() { _ = ws.Close() })

		return ws
	}

	owner := dial("owner")
	request := Message{Type: "REQUEST", ClusterID: "shared", Path: "/writable", UserID: "known-victim-id"}
	request.Data = "owner-probe"
	require.NoError(t, owner.WriteJSON(request))
	readMultiplexerTestMessage(t, owner, "STATUS")
	require.Equal(t, "Bearer owner:owner-probe", readMultiplexerTestMessage(t, owner, "DATA").Data)

	for _, token := range []string{"forged", "expired"} {
		attacker := dial(token)
		request.Data = "must-not-use-owner-socket"
		require.NoError(t, attacker.WriteJSON(request))
		readMultiplexerTestMessage(t, attacker, "STATUS")
		readMultiplexerTestMessage(t, attacker, "ERROR")
		require.NoError(t, attacker.Close())
	}

	other := dial("other-user")
	request.Data = "other-probe"
	require.NoError(t, other.WriteJSON(request))
	readMultiplexerTestMessage(t, other, "STATUS")
	require.Equal(t, "Bearer other-user:other-probe", readMultiplexerTestMessage(t, other, "DATA").Data)

	request.Type = "CLOSE"
	require.NoError(t, other.WriteJSON(request))
	readMultiplexerTestMessage(t, other, "STATUS")
	require.NoError(t, other.Close())

	request.Type = "REQUEST"
	request.Data = "owner-still-connected"
	require.NoError(t, owner.WriteJSON(request))
	require.Equal(t, "Bearer owner:owner-still-connected", readMultiplexerTestMessage(t, owner, "DATA").Data)
}

//nolint:funlen // Keeps the gated-dial lifecycle and cancellation assertions together.
func TestReconnectReaderCleanupDuringDial(t *testing.T) {
	for _, cancel := range []string{"none", "close", "disconnect"} {
		t.Run(cancel, func(t *testing.T) {
			dialStarted := make(chan struct{})
			finishDial := make(chan struct{})
			unblockDial := sync.OnceFunc(func() { close(finishDial) })
			echo := createMockKubeAPIServer()
			t.Cleanup(echo.Close)

			upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				close(dialStarted)
				<-finishDial
				echo.Config.Handler.ServeHTTP(w, r)
			}))
			t.Cleanup(upstream.Close)
			t.Cleanup(unblockDial)

			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(&kubeconfig.Context{
				Name:    "shared",
				Cluster: &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: true},
			}))
			m := NewMultiplexer(store, false)
			t.Cleanup(m.cleanupConnections)

			client, clientServer := createTestWebSocketConnection()
			t.Cleanup(clientServer.Close)
			t.Cleanup(func() { _ = client.Close() })

			previous := m.createConnection("shared", "user", "/api/v1/pods", "watch=true", client, nil)
			key := m.createConnectionKey(previous.ClusterID, previous.Path, previous.UserID, client, previous.Query)
			m.connections[key] = previous

			type reconnectResult struct {
				conn *Connection
				err  error
			}

			result := make(chan reconnectResult, 1)

			go func() {
				conn, err := m.reconnect(previous, previous.Query, errors.New("ping write failed"))
				result <- reconnectResult{conn, err}
			}()

			select {
			case <-dialStarted:
			case <-time.After(3 * time.Second):
				t.Fatal("reconnect did not reach gated dial")
			}

			readMultiplexerTestMessage(t, client.conn, "STATUS") // Heartbeat failed.

			previous.safeClose()

			if cancel == "none" {
				request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/wsMultiplexer", nil)
				m.processClientMessage(request, client, Message{
					Type: "REQUEST", ClusterID: previous.ClusterID, Path: previous.Path,
					UserID: previous.UserID, Query: previous.Query, Data: "during-reconnect",
				})
				readMultiplexerTestMessage(t, client.conn, "STATUS")
				retry := readMultiplexerTestMessage(t, client.conn, "ERROR")
				require.Contains(t, retry.Data, "retry")
			}

			switch cancel {
			case "close":
				m.closeConnection(key)
			case "disconnect":
				m.closeClientConnections(client)
			}

			unblockDial()

			select {
			case got := <-result:
				if cancel != "none" {
					require.ErrorContains(t, got.err, "subscription changed")
					require.Nil(t, got.conn)
					m.mutex.RLock()
					remaining := len(m.connections)
					m.mutex.RUnlock()
					require.Zero(t, remaining)

					return
				}

				require.NoError(t, got.err)
				readMultiplexerTestMessage(t, client.conn, "STATUS")
				require.NoError(t, m.writeMessageToCluster(got.conn, []byte("after-reader-cleanup")))
				require.Equal(t, "after-reader-cleanup", readMultiplexerTestMessage(t, client.conn, "DATA").Data)
			case <-time.After(3 * time.Second):
				t.Fatal("reconnect did not complete")
			}
		})
	}
}

func TestReconnectReaderCleanupBeforeClaim(t *testing.T) {
	for _, cancel := range []string{"none", "close", "disconnect"} {
		t.Run(cancel, func(t *testing.T) {
			upstream := createMockKubeAPIServer()
			t.Cleanup(upstream.Close)

			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(&kubeconfig.Context{
				Name:    "shared",
				Cluster: &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: true},
			}))
			m := NewMultiplexer(store, false)
			t.Cleanup(m.cleanupConnections)

			client, clientServer := createTestWebSocketConnection()
			t.Cleanup(clientServer.Close)
			t.Cleanup(func() { _ = client.Close() })

			previous := m.createConnection("shared", "user", "/api/v1/pods", "watch=true", client, nil)
			key := m.createConnectionKey(previous.ClusterID, previous.Path, previous.UserID, client, previous.Query)
			m.connections[key] = previous
			previous.safeClose()

			switch cancel {
			case "close":
				m.closeConnection(key)
			case "disconnect":
				m.closeClientConnections(client)
			}

			replacement, err := m.reconnect(previous, previous.Query, nil)
			if cancel != "none" {
				require.Error(t, err)
				require.Nil(t, replacement)

				return
			}

			require.NoError(t, err)
			readMultiplexerTestMessage(t, client.conn, "STATUS")
			readMultiplexerTestMessage(t, client.conn, "STATUS")
			require.NoError(t, m.writeMessageToCluster(replacement, []byte("after-claim")))
			require.Equal(t, "after-claim", readMultiplexerTestMessage(t, client.conn, "DATA").Data)
		})
	}
}

func pumpMultiplexerFrames(t *testing.T, client *websocket.Conn) <-chan Message {
	t.Helper()

	messages := make(chan Message, 512)

	done := make(chan struct{})
	go func() {
		defer close(done)

		for {
			var message Message
			if err := client.ReadJSON(&message); err != nil {
				return
			}

			messages <- message
		}
	}()

	t.Cleanup(func() {
		_ = client.Close()

		<-done
	})

	return messages
}

func awaitMultiplexerFrame(t *testing.T, messages <-chan Message, accept func(Message) bool) Message {
	t.Helper()

	timeout := time.After(3 * time.Second)

	for {
		select {
		case message := <-messages:
			if accept(message) {
				return message
			}
		case <-timeout:
			t.Fatal("expected multiplexer frame was not delivered")
			return Message{}
		}
	}
}

//nolint:funlen // Exercises acknowledged cancellation and a large real-client subscription burst.
func TestMultiplexerAcknowledgedBurstKeepsDistinctWatches(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	unblock := sync.OnceFunc(func() { close(release) })
	echo := createMockKubeAPIServer()
	t.Cleanup(echo.Close)

	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer owner" {
			http.Error(w, "wrong credential", http.StatusUnauthorized)
			return
		}

		if r.URL.Path == "/canceled" {
			close(started)
			<-release
		}

		echo.Config.Handler.ServeHTTP(w, r)
	}))
	t.Cleanup(upstream.Close)
	t.Cleanup(unblock)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "shared", Cluster: &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	server := httptest.NewServer(http.HandlerFunc(m.HandleClientWebSocket))
	t.Cleanup(server.Close)
	client := dialAuthenticatedMultiplexerClient(t, server.URL)
	messages := pumpMultiplexerFrames(t, client)
	msg := Message{
		Type: "REQUEST", ClusterID: "shared", UserID: "user",
		Path: "/canceled", Query: "watch=1", RequestID: "canceled",
	}
	require.NoError(t, client.WriteJSON(msg))
	awaitMultiplexerSignal(t, started, "cancelable request did not reach the gated handshake")

	msg.Type = "CLOSE"
	require.NoError(t, client.WriteJSON(msg))
	awaitMultiplexerFrame(t, messages, func(frame Message) bool {
		return frame.Type == "ACK" && frame.RequestID == msg.RequestID
	})

	delivered := make(map[string]bool)

	for index := 0; index < 96; index++ {
		msg.Type = "REQUEST"
		msg.Path, msg.RequestID = fmt.Sprintf("/namespaces/ns-%d/pods", index), fmt.Sprint(index)
		msg.Data = msg.RequestID
		require.NoError(t, client.WriteJSON(msg))
		awaitMultiplexerFrame(t, messages, func(frame Message) bool {
			if frame.Type == "DATA" {
				delivered[frame.Path] = true
			}

			return frame.Type == "ACK" && frame.RequestID == msg.RequestID
		})
	}

	if len(delivered) < 96 {
		awaitMultiplexerFrame(t, messages, func(frame Message) bool {
			if frame.Type == "DATA" {
				delivered[frame.Path] = true
			}

			return len(delivered) == 96
		})
	}

	m.mutex.RLock()

	connections := make([]*Connection, 0, len(m.connections))
	for _, conn := range m.connections {
		connections = append(connections, conn)
	}

	m.mutex.RUnlock()
	require.Len(t, connections, 96)
	require.Len(t, delivered, 96)

	for _, conn := range connections {
		require.False(t, conn.IsClosed())
		require.Equal(t, "owner", *conn.Token)
	}
}

//nolint:funlen // Keeps the heartbeat claim, occupied worker and queued-request non-replay assertions together.
func TestMultiplexerQueuedRequestDuringHeartbeatReturnsRetry(t *testing.T) {
	heartbeatStarted, occupiedStarted := make(chan struct{}), make(chan struct{})
	heartbeatRelease, occupiedRelease := make(chan struct{}), make(chan struct{})
	releaseHeartbeat := sync.OnceFunc(func() { close(heartbeatRelease) })
	releaseOccupied := sync.OnceFunc(func() { close(occupiedRelease) })

	var watchDials atomic.Int32

	echo := createMockKubeAPIServer()
	t.Cleanup(echo.Close)

	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/watch" && watchDials.Add(1) == 2:
			close(heartbeatStarted)
			<-heartbeatRelease
		case r.URL.Path == "/occupied":
			close(occupiedStarted)
			<-occupiedRelease
		}

		echo.Config.Handler.ServeHTTP(w, r)
	}))
	t.Cleanup(upstream.Close)
	t.Cleanup(releaseOccupied)
	t.Cleanup(releaseHeartbeat)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "shared", Cluster: &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	server := httptest.NewServer(http.HandlerFunc(m.HandleClientWebSocket))
	t.Cleanup(server.Close)
	client := dialAuthenticatedMultiplexerClient(t, server.URL)
	pong := make(chan struct{})

	client.SetPongHandler(func(string) error { close(pong); return nil })
	messages := pumpMultiplexerFrames(t, client)
	msg := Message{
		Type: "REQUEST", ClusterID: "shared", Path: "/watch", Query: "watch=1",
		UserID: "user", RequestID: "initial", Data: "initial",
	}
	require.NoError(t, client.WriteJSON(msg))

	acked, delivered := false, false

	awaitMultiplexerFrame(t, messages, func(frame Message) bool {
		acked = acked || frame.Type == "ACK" && frame.RequestID == "initial"
		delivered = delivered || frame.Type == "DATA" && frame.Data == "initial"

		return acked && delivered
	})
	m.mutex.RLock()

	var previous *Connection
	for _, conn := range m.connections {
		previous = conn
	}

	m.mutex.RUnlock()

	type reconnectResult struct {
		conn *Connection
		err  error
	}

	result := make(chan reconnectResult, 1)

	go func() {
		conn, err := m.reconnect(previous, previous.Query, errors.New("test heartbeat failed"))
		result <- reconnectResult{conn, err}
	}()

	awaitMultiplexerSignal(t, heartbeatStarted, "heartbeat did not claim its gated replacement")

	msg.Path, msg.RequestID, msg.Data = "/occupied", "occupied", "occupy-worker"
	require.NoError(t, client.WriteJSON(msg))
	awaitMultiplexerSignal(t, occupiedStarted, "client worker did not become occupied")

	msg.Path, msg.Query, msg.RequestID, msg.Data = "/watch", "watch=1", "during", "must-not-replay"
	require.NoError(t, client.WriteJSON(msg))
	require.NoError(t, client.WriteControl(websocket.PingMessage, nil, time.Now().Add(time.Second)))
	awaitMultiplexerSignal(t, pong, "queued watch REQUEST was not read before replacement completion")
	releaseHeartbeat()

	var replacement *Connection

	select {
	case got := <-result:
		require.NoError(t, got.err)
		replacement = got.conn
	case <-time.After(3 * time.Second):
		t.Fatal("heartbeat replacement did not finish")
	}

	releaseOccupied()

	rejected, settled := false, false

	awaitMultiplexerFrame(t, messages, func(frame Message) bool {
		if frame.Type == "ERROR" && frame.Query == msg.Query {
			require.Contains(t, frame.Data, `"code":"subscription_reconnecting"`)

			rejected = true
		}

		settled = settled || frame.Type == "ACK" && frame.RequestID == "during"

		return rejected && settled
	})
	require.NoError(t, m.writeMessageToCluster(replacement, []byte("marker")))
	frame := awaitMultiplexerFrame(t, messages, func(frame Message) bool {
		return frame.Type == "DATA" && frame.Path == "/watch"
	})
	require.Equal(t, "marker", frame.Data)
}

//nolint:funlen // Exercises superseded reader exit, a failed dial and the old monitor's later successful retry.
func TestMonitorConnectionSupersededWatchRetriesAfterFailure(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	unblock := sync.OnceFunc(func() { close(release) })

	var attempts atomic.Int32

	queries := make(chan string, 1)
	event := `{"type":"MODIFIED","object":{"metadata":{"name":"resumed","resourceVersion":"101"}}}`
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer owner" {
			http.Error(w, "wrong credential", http.StatusUnauthorized)
			return
		}

		if attempts.Add(1) == 1 {
			close(started)
			<-release
			http.Error(w, "temporary outage", http.StatusServiceUnavailable)

			return
		}

		queries <- r.URL.RawQuery

		upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = ws.Close() }()

		_ = ws.WriteMessage(websocket.TextMessage, []byte(event))
		_, _, _ = ws.ReadMessage()
	}))
	t.Cleanup(upstream.Close)
	t.Cleanup(unblock)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "shared", Cluster: &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	client, clientServer := createTestWebSocketConnection()
	t.Cleanup(clientServer.Close)
	t.Cleanup(func() { _ = client.Close() })
	messages := pumpMultiplexerFrames(t, client.conn)
	oldSocket, oldServer := createTestWebSocketConnection()
	t.Cleanup(oldServer.Close)

	token := "owner"
	previous := m.createConnection("shared", "user", "/watch", "resourceVersion=100&watch=1", client, &token)
	previous.WSConn, previous.Status.State, previous.resourceVersion = oldSocket.conn, StateError, "100"
	key := m.createConnectionKey(previous.ClusterID, previous.Path, previous.UserID, client, previous.Query)
	m.connections[key] = previous
	t.Cleanup(m.cleanupConnections)

	readerDone, monitorDone := make(chan struct{}), make(chan struct{})
	ticks := make(chan time.Time)

	go func() { m.handleClusterMessages(previous, client); close(readerDone) }()
	go func() { m.monitorConnectionWithHeartbeat(previous, ticks); close(monitorDone) }()

	select {
	case ticks <- time.Now():
	case <-time.After(3 * time.Second):
		t.Fatal("monitor did not read its first tick")
	}

	awaitMultiplexerSignal(t, started, "replacement did not reach the failing handshake")
	require.NoError(t, oldSocket.WriteMessage(websocket.TextMessage,
		[]byte(`{"type":"MODIFIED","object":{"metadata":{"name":"retiring","resourceVersion":"101"}}}`)))
	awaitMultiplexerSignal(t, readerDone, "superseded reader did not exit")
	require.False(t, previous.IsClosed(), "retiring the watch transport must not close the subscription")
	unblock()

	select {
	case ticks <- time.Now():
	case <-time.After(3 * time.Second):
		t.Fatal("old monitor stopped instead of retrying after the failed replacement")
	}

	awaitMultiplexerSignal(t, monitorDone, "old monitor did not finish after its successful retry")
	frame := awaitMultiplexerFrame(t, messages, func(frame Message) bool { return frame.Type == "DATA" })
	require.JSONEq(t, event, frame.Data)
	require.Equal(t, "resourceVersion=100&watch=1", <-queries)
	m.mutex.RLock()
	current := m.connections[key]
	m.mutex.RUnlock()
	require.NotSame(t, previous, current)
	require.False(t, current.IsClosed())
	require.True(t, previous.IsClosed())
	require.Equal(t, int32(2), attempts.Load())
}

//nolint:funlen // Exercises queued retry and explicit watch reopening through the real authenticated client handler.
func TestMultiplexerWatchRetryPreservesSubscriptionQuery(t *testing.T) {
	started, releaseDial, holdSecond := make(chan struct{}), make(chan struct{}), make(chan struct{})
	unblockDial := sync.OnceFunc(func() { close(releaseDial) })
	unblockSecond := sync.OnceFunc(func() { close(holdSecond) })

	var dials atomic.Int32

	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer owner" {
			http.Error(w, "wrong handshake credential", http.StatusUnauthorized)
			return
		}

		index := dials.Add(1)
		if index == 2 {
			close(started)
			<-releaseDial
		}

		upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = ws.Close() }()

		_, payload, err := ws.ReadMessage()
		if err != nil {
			return
		}

		_ = ws.WriteMessage(websocket.TextMessage, []byte(r.URL.RawQuery+":"+string(payload)))

		if index == 2 {
			<-holdSecond
		}

		_ = ws.WriteControl(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
	}))
	t.Cleanup(upstream.Close)
	t.Cleanup(unblockSecond)
	t.Cleanup(unblockDial)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "shared", Cluster: &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	server := httptest.NewServer(http.HandlerFunc(m.HandleClientWebSocket))
	t.Cleanup(server.Close)
	client := dialAuthenticatedMultiplexerClient(t, server.URL)
	msg := Message{
		Type: "REQUEST", ClusterID: "shared", Path: "/stream", UserID: "user",
		Query: "watch=true&resourceVersion=10", Data: "initial",
	}
	require.NoError(t, client.WriteJSON(msg))
	readMultiplexerTestMessage(t, client, "STATUS")
	readMultiplexerTestMessage(t, client, "DATA")
	readMultiplexerTestMessage(t, client, "STATUS")

	msg.Data = "replacement"
	msg.Reopen = true
	require.NoError(t, client.WriteJSON(msg))
	awaitMultiplexerSignal(t, started, "replacement did not reach the paused handshake")

	msg.Data = "latest"
	require.NoError(t, client.WriteJSON(msg))

	pong := make(chan struct{})

	client.SetPongHandler(func(string) error { close(pong); return nil })
	require.NoError(t, client.WriteControl(websocket.PingMessage, nil, time.Now().Add(time.Second)))
	require.NoError(t, client.SetReadDeadline(time.Now().Add(3*time.Second)))

	messages := make(chan Message, 16)

	readerDone := make(chan struct{})
	go func() {
		defer close(readerDone)

		for {
			var message Message
			if err := client.ReadJSON(&message); err != nil {
				return
			}

			messages <- message
		}
	}()

	t.Cleanup(func() {
		_ = client.Close()

		<-readerDone
	})

	next := func() Message {
		t.Helper()

		select {
		case message := <-messages:
			return message
		case <-time.After(3 * time.Second):
			t.Fatal("client did not receive the watch retry protocol response")
			return Message{}
		}
	}

	awaitMultiplexerSignal(t, pong, "new-query REQUEST was not processed before the replacement handshake finished")
	unblockDial()

	var retry Message
	for {
		retry = next()

		if retry.Type == "ERROR" {
			break
		}
	}

	require.Equal(t, msg.Query, retry.Query)
	require.Contains(t, retry.Data, `"code":"subscription_reconnecting"`)
	require.Contains(t, retry.Data, `"retryReady":true`)
	m.mutex.RLock()

	var previous *Connection
	for _, conn := range m.connections {
		previous = conn
	}

	m.mutex.RUnlock()
	require.NotNil(t, previous)
	require.False(t, previous.IsClosed(), "the retry must replace a still-open transport, not rely on completion")

	msg.Reopen = true
	require.NoError(t, client.WriteJSON(msg))

	var update Message
	for {
		update = next()

		if update.Type == "DATA" && update.Query == msg.Query && update.Data == msg.Query+":latest" {
			break
		}
	}

	require.Equal(t, msg.Query+":latest", update.Data)
	require.Equal(t, int32(3), dials.Load())
}

func TestMultiplexerReopenRejectsNonWatch(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	client, server := createTestWebSocketConnection()
	t.Cleanup(server.Close)
	t.Cleanup(func() { _ = client.Close() })

	msg := Message{
		Type: "REQUEST", ClusterID: "shared", Path: "/pods/p/exec", UserID: "user",
		Query: "command=probe", Reopen: true,
	}
	m.processClientMessage(httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil), client, msg)
	require.Contains(t, readMultiplexerTestMessage(t, client.conn, "ERROR").Data, "only supported for watches")
	require.Empty(t, m.connections)
}

func TestMonitorConnectionFailedPingInstallsAndForwardsReplacement(t *testing.T) {
	gate := newMultiplexerDialGate(t, false)
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "shared", Cluster: &api.Cluster{Server: gate.upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	client, clientServer := createTestWebSocketConnection()
	t.Cleanup(clientServer.Close)
	t.Cleanup(func() { _ = client.Close() })

	failedSocket, failedServer := createTestWebSocketConnection()
	t.Cleanup(failedServer.Close)
	require.NoError(t, failedSocket.Close())

	token := "owner"
	previous := m.createConnection("shared", "user", "/stream", "watch=true", client, &token)
	previous.WSConn, previous.Status.State = failedSocket.conn, StateConnected
	key := m.createConnectionKey(previous.ClusterID, previous.Path, previous.UserID, client, previous.Query)
	m.connections[key] = previous
	t.Cleanup(m.cleanupConnections)

	ticks := make(chan time.Time, 1)
	monitorDone := make(chan struct{})

	go func() {
		m.monitorConnectionWithHeartbeat(previous, ticks)
		close(monitorDone)
	}()

	ticks <- time.Now()

	awaitMultiplexerSignal(t, monitorDone, "failed-ping monitor did not exit after replacement installation")
	m.mutex.RLock()
	replacement := m.connections[key]
	m.mutex.RUnlock()
	require.NotSame(t, previous, replacement)
	require.NotNil(t, replacement)
	require.False(t, replacement.IsClosed())
	require.True(t, previous.IsClosed())
	require.Equal(t, token, *replacement.Token)
	readMultiplexerTestMessage(t, client.conn, "STATUS")
	readMultiplexerTestMessage(t, client.conn, "STATUS")
	require.NoError(t, m.writeMessageToCluster(replacement, []byte("monitor-replacement")))
	require.Equal(t, "watch=true:monitor-replacement", readMultiplexerTestMessage(t, client.conn, "DATA").Data)
}

//nolint:funlen // Exercises retention, reserved replacements, ownership and credential checks together.
func TestMultiplexerBoundsCompletedSubscriptionsPerClient(t *testing.T) {
	upstream := createMockKubeAPIServer()
	t.Cleanup(upstream.Close)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "shared", Cluster: &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	client, clientServer := createTestWebSocketConnection()
	t.Cleanup(clientServer.Close)
	t.Cleanup(func() { _ = client.Close() })

	otherClient, otherServer := createTestWebSocketConnection()
	t.Cleanup(otherServer.Close)
	t.Cleanup(func() { _ = otherClient.Close() })

	closedSocket, closedServer := createTestWebSocketConnection()
	t.Cleanup(closedServer.Close)
	require.NoError(t, closedSocket.Close())

	token := "owner"
	pending := m.createConnection("shared", "user", "/pending", "watch=true", client, &token)
	pendingKey := m.createConnectionKey(pending.ClusterID, pending.Path, pending.UserID, client, pending.Query)
	m.connections[pendingKey] = pending
	_, _, err := m.reserveReconnect(t.Context(), pending, errors.New("test failed ping"))
	require.NoError(t, err)

	release := sync.OnceFunc(func() { m.releaseReconnect(pending) })
	defer release()

	pending.closeTransport()
	pending.mu.Lock()
	pending.Status.LastMsg = time.Unix(1, 0)
	pending.mu.Unlock()

	other := m.createConnection("shared", "user", "/other", "", otherClient, &token)
	other.WSConn = closedSocket.conn
	otherKey := m.createConnectionKey(other.ClusterID, other.Path, other.UserID, otherClient, other.Query)
	m.connections[otherKey] = other
	m.handleClusterMessages(other, otherClient)

	var last *Connection
	for i := 0; i < maxCompletedSubscriptionsPerClient+3; i++ {
		last = m.createConnection("shared", "user", fmt.Sprintf("/finite/%d", i), "command=probe", client, &token)
		last.WSConn, last.Status.State = closedSocket.conn, StateConnected
		m.connections[m.createConnectionKey(last.ClusterID, last.Path, last.UserID, client, last.Query)] = last
		m.handleClusterMessages(last, client)
		readMultiplexerTestMessage(t, client.conn, "STATUS")
	}

	t.Cleanup(m.cleanupConnections)
	lastKey := m.createConnectionKey(last.ClusterID, last.Path, last.UserID, client, last.Query)
	firstKey := m.createConnectionKey("shared", "/finite/0", "user", client)
	m.mutex.RLock()
	total := len(m.connections)
	preservedPending := m.connections[pendingKey]
	preservedOther := m.connections[otherKey]
	preservedLast := m.connections[lastKey]
	_, hasFirst := m.connections[firstKey]
	m.mutex.RUnlock()
	require.Equal(t, maxCompletedSubscriptionsPerClient+2, total)
	require.Same(t, pending, preservedPending)
	require.Same(t, other, preservedOther)
	require.Same(t, last, preservedLast)
	require.False(t, hasFirst)
	release()
	m.mutex.RLock()
	_, hasPending := m.connections[pendingKey]
	m.mutex.RUnlock()
	require.False(t, hasPending, "an unreserved completed entry must count toward the retention bound")

	msg := Message{ClusterID: last.ClusterID, Path: last.Path, UserID: last.UserID, Query: "command=new"}
	changedToken := "changed"
	_, err = m.getOrCreateConnection(msg, client, &changedToken)
	require.ErrorContains(t, err, "credentials changed")
	reopened, err := m.getOrCreateConnection(msg, client, &token)
	require.NoError(t, err)
	require.NotSame(t, last, reopened)
	require.Equal(t, msg.Query, reopened.Query)
	readMultiplexerTestMessage(t, client.conn, "STATUS")
	require.NoError(t, m.writeMessageToCluster(reopened, []byte("explicit-reopen")))
	require.Equal(t, "explicit-reopen", readMultiplexerTestMessage(t, client.conn, "DATA").Data)
}

func TestMonitorConnectionDoesNotReplayCompletedStream(t *testing.T) {
	upstream := createMockKubeAPIServer()
	t.Cleanup(upstream.Close)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:    "shared",
		Cluster: &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	t.Cleanup(m.cleanupConnections)

	client, clientServer := createTestWebSocketConnection()
	t.Cleanup(clientServer.Close)
	t.Cleanup(func() { _ = client.Close() })

	previous := m.createConnection("shared", "user",
		"/api/v1/namespaces/default/pods/p/exec", "command=probe", client, nil)
	ws, wsServer := createTestWebSocketConn()
	t.Cleanup(wsServer.Close)

	previous.WSConn = ws
	key := m.createConnectionKey(previous.ClusterID, previous.Path, previous.UserID, client, previous.Query)
	m.connections[key] = previous
	previous.safeClose()

	heartbeat := make(chan time.Time, 1)
	heartbeat <- time.Now()

	m.monitorConnectionWithHeartbeat(previous, heartbeat)
	readMultiplexerTestMessage(t, client.conn, "STATUS")

	// A ping may also fail just before the reader closes the transport.
	replacement, err := m.reconnect(previous, previous.Query, errors.New("ping write failed"))
	require.ErrorIs(t, err, errSubscriptionInactive)
	require.Nil(t, replacement)

	m.mutex.RLock()
	current := m.connections[key]
	m.mutex.RUnlock()
	require.Same(t, previous, current, "reader completion must not repeat a completed operation")
}

func TestMultiplexerRequestReopensCompletedStream(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}

		defer func() { _ = ws.Close() }()

		_, payload, err := ws.ReadMessage()
		if err != nil {
			return
		}

		if err := ws.WriteMessage(websocket.TextMessage, []byte(r.URL.RawQuery+":"+string(payload))); err != nil {
			return
		}

		_ = ws.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
			time.Now().Add(time.Second))
	}))
	t.Cleanup(upstream.Close)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name:    "shared",
		Cluster: &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	server := httptest.NewServer(http.HandlerFunc(m.HandleClientWebSocket))
	t.Cleanup(server.Close)

	client := dialMultiplexerTestClient(t, server.URL)
	msg := Message{
		Type: "REQUEST", ClusterID: "shared", Path: "/api/v1/pods", UserID: "user",
		Query: "command=first", Data: "first request",
	}
	require.NoError(t, client.WriteJSON(msg))
	readMultiplexerTestMessage(t, client, "STATUS")
	require.Equal(t, "command=first:first request", readMultiplexerTestMessage(t, client, "DATA").Data)
	require.JSONEq(t, `{"state":"closed","error":""}`, readMultiplexerTestMessage(t, client, "STATUS").Data)

	msg.Query = "command=second"
	msg.Data = "new request"
	require.NoError(t, client.WriteJSON(msg))
	readMultiplexerTestMessage(t, client, "STATUS")
	require.Equal(t, "command=second:new request", readMultiplexerTestMessage(t, client, "DATA").Data)
}

func TestMultiplexerRequestWriteFailureReturnsError(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	client, clientServer := createTestWebSocketConnection()
	t.Cleanup(clientServer.Close)
	t.Cleanup(func() { _ = client.Close() })

	upstream, upstreamServer := createTestWebSocketConnection()
	t.Cleanup(upstreamServer.Close)
	require.NoError(t, upstream.Close())

	conn := m.createConnection("shared", "user", "/api/v1/pods", "", client, nil)
	conn.WSConn = upstream.conn
	conn.Status.State = StateConnected
	m.connections[m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, client, conn.Query)] = conn
	t.Cleanup(m.cleanupConnections)

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/wsMultiplexer", nil)
	m.processClientMessage(request, client, Message{
		Type: "REQUEST", ClusterID: conn.ClusterID, Path: conn.Path,
		UserID: conn.UserID, Data: "must-not-silently-fail",
	})
	readMultiplexerTestMessage(t, client.conn, "STATUS")
	writeError := readMultiplexerTestMessage(t, client.conn, "ERROR")
	require.NotEmpty(t, writeError.Data)
}
