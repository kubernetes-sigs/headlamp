package main

import (
	"encoding/base64"
	"errors"
	"fmt"
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

func sendMultiplexerTick(t *testing.T, ticks chan<- time.Time) {
	t.Helper()

	select {
	case ticks <- time.Now():
	case <-time.After(3 * time.Second):
		t.Fatal("monitor stopped instead of accepting its next heartbeat")
	}
}

func sendMultiplexerTickOrDone(t *testing.T, ticks chan<- time.Time, done <-chan struct{}) {
	t.Helper()

	// A prior send synchronizes receipt, not tick processing: it may already
	// install the replacement after the test releases the reader or failed dial.
	select {
	case ticks <- time.Now():
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("monitor neither accepted another heartbeat nor completed its replacement")
	}
}

func newLifecycleMultiplexer(t *testing.T, handler http.HandlerFunc) (*Multiplexer, *httptest.Server) {
	t.Helper()

	upstream := httptest.NewTLSServer(handler)
	t.Cleanup(upstream.Close)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "shared", Cluster: &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: true},
	}))
	m := NewMultiplexer(store, false)
	server := httptest.NewServer(http.HandlerFunc(m.HandleClientWebSocket))
	t.Cleanup(server.Close)
	t.Cleanup(m.cleanupConnections)

	return m, server
}

//nolint:funlen // Keeps the close-handler/read-classification ordering and resumed cursor assertions together.
func TestMonitorConnectionCloseReplyWaitsForWatchReader(t *testing.T) {
	for _, code := range []int{websocket.CloseNormalClosure, websocket.CloseGoingAway} {
		t.Run(fmt.Sprint(code), func(t *testing.T) {
			queries := make(chan string, 1)
			m, _ := newLifecycleMultiplexer(t, func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer owner" {
					http.Error(w, "wrong credential", http.StatusUnauthorized)
					return
				}

				queries <- r.URL.RawQuery

				upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

				ws, err := upgrader.Upgrade(w, r, nil)
				if err != nil {
					return
				}

				defer func() { _ = ws.Close() }()

				_ = ws.WriteMessage(websocket.TextMessage,
					[]byte(`{"type":"ADDED","object":{"metadata":{"resourceVersion":"101"}}}`))
				_, _, _ = ws.ReadMessage()
			})
			client, clientServer := createTestWebSocketConnection()
			t.Cleanup(clientServer.Close)
			t.Cleanup(func() { _ = client.Close() })
			messages := pumpMultiplexerFrames(t, client.conn)
			retiring, retiringServer := createTestWebSocketConnection()
			t.Cleanup(retiringServer.Close)
			t.Cleanup(func() { _ = retiring.Close() })

			token := "owner"
			conn := m.createConnection("shared", "original-user", "/watch",
				"watch=1&resourceVersion=10", client, &token)
			conn.WSConn, conn.Status.State, conn.resourceVersion = retiring.conn, StateConnected, "100"
			key := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, client, conn.Query)
			m.connections[key] = conn
			require.NoError(t, retiring.conn.WriteControl(websocket.CloseMessage,
				websocket.FormatCloseMessage(code, ""), time.Now().Add(time.Second)))
			require.ErrorIs(t, retiring.conn.WriteControl(websocket.PingMessage, nil,
				time.Now().Add(time.Second)), websocket.ErrCloseSent)

			ticks := make(chan time.Time)
			monitorDone := make(chan struct{})

			go func() { m.monitorConnectionWithHeartbeat(conn, ticks); close(monitorDone) }()

			sendMultiplexerTick(t, ticks)
			sendMultiplexerTick(t, ticks)
			require.False(t, conn.IsClosed(), "ErrCloseSent must await the reader, not stop the subscription")

			readerDone := make(chan struct{})

			go func() { m.handleClusterMessages(conn, client); close(readerDone) }()

			awaitMultiplexerSignal(t, readerDone, "reader did not classify the close frame")
			conn.mu.RLock()
			state := conn.Status.State
			conn.mu.RUnlock()
			require.Contains(t, []ConnectionState{StateError, StateClosed}, state,
				"the reader must leave the watch retryable or already handed off to its replacement")
			sendMultiplexerTickOrDone(t, ticks, monitorDone)
			awaitMultiplexerSignal(t, monitorDone, "old monitor did not hand off to its replacement")
			frame := awaitMultiplexerFrame(t, messages, func(frame Message) bool { return frame.Type == "DATA" })
			require.Equal(t, conn.Query, frame.Query)
			require.Equal(t, conn.UserID, frame.UserID)
			require.Equal(t, "resourceVersion=100&watch=1", <-queries)
			m.mutex.RLock()
			current := m.connections[key]
			m.mutex.RUnlock()
			require.NotSame(t, conn, current)
			require.NotNil(t, current)
			require.False(t, current.IsClosed())
		})
	}
}

func TestMonitorConnectionFailedPingDoesNotReplayFiniteStreams(t *testing.T) {
	for _, route := range []string{"exec", "log"} {
		t.Run(route, func(t *testing.T) {
			var dials atomic.Int32

			echo := createMockKubeAPIServer()
			t.Cleanup(echo.Close)
			m, _ := newLifecycleMultiplexer(t, func(w http.ResponseWriter, r *http.Request) {
				dials.Add(1)
				echo.Config.Handler.ServeHTTP(w, r)
			})
			client, clientServer := createTestWebSocketConnection()
			t.Cleanup(clientServer.Close)
			t.Cleanup(func() { _ = client.Close() })

			retiring, retiringServer := createTestWebSocketConnection()
			t.Cleanup(retiringServer.Close)
			require.NoError(t, retiring.Close())

			token := "owner"
			conn := m.createConnection("shared", "user", "/pods/p/"+route, "command=probe", client, &token)
			conn.WSConn, conn.Status.State = retiring.conn, StateConnected
			key := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, client, conn.Query)
			m.connections[key] = conn

			ticks := make(chan time.Time, 1)
			ticks <- time.Now()

			m.monitorConnectionWithHeartbeat(conn, ticks)
			require.True(t, conn.IsClosed())
			require.Zero(t, dials.Load(), "failed ping must not execute a second upstream operation")
			readMultiplexerTestMessage(t, client.conn, "STATUS")
			msg := Message{ClusterID: conn.ClusterID, Path: conn.Path, UserID: conn.UserID, Query: conn.Query}
			changed := "different"
			_, err := m.getOrCreateConnection(msg, client, &changed)
			require.ErrorContains(t, err, "credentials changed")
			reopened, err := m.getOrCreateConnection(msg, client, &token)
			require.NoError(t, err)
			require.Equal(t, int32(1), dials.Load())
			readMultiplexerTestMessage(t, client.conn, "STATUS")
			require.NoError(t, m.writeMessageToCluster(reopened, []byte("explicit-request")))
			require.Equal(t, "explicit-request", readMultiplexerTestMessage(t, client.conn, "DATA").Data)
		})
	}
}

//nolint:funlen // Keeps explicit reservation, failed replacement and sole-monitor retry in one deterministic trace.
func TestMonitorConnectionSurvivesFailedExplicitWatchReopen(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	unblock := sync.OnceFunc(func() { close(release) })

	var dials atomic.Int32

	echo := createMockKubeAPIServer()
	t.Cleanup(echo.Close)
	m, _ := newLifecycleMultiplexer(t, func(w http.ResponseWriter, r *http.Request) {
		if dials.Add(1) == 1 {
			close(started)
			<-release
			http.Error(w, "temporary unavailable", http.StatusServiceUnavailable)

			return
		}

		echo.Config.Handler.ServeHTTP(w, r)
	})
	t.Cleanup(unblock)

	client, clientServer := createTestWebSocketConnection()
	t.Cleanup(clientServer.Close)
	t.Cleanup(func() { _ = client.Close() })
	messages := pumpMultiplexerFrames(t, client.conn)
	retiring, retiringServer := createTestWebSocketConnection()
	t.Cleanup(retiringServer.Close)
	t.Cleanup(func() { _ = retiring.Close() })

	conn := m.createConnection("shared", "user", "/watch", "watch=1&resourceVersion=10", client, nil)
	conn.WSConn, conn.Status.State = retiring.conn, StateConnected
	key := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, client, conn.Query)
	m.connections[key] = conn
	conn.resourceVersion = "11"
	result := make(chan error, 1)

	go func() { _, err := m.reconnect(conn, conn.Query, nil); result <- err }()

	awaitMultiplexerSignal(t, started, "explicit reopen did not reserve the subscription")

	ticks := make(chan time.Time)
	done := make(chan struct{})

	go func() { m.monitorConnectionWithHeartbeat(conn, ticks); close(done) }()

	sendMultiplexerTick(t, ticks)
	sendMultiplexerTick(t, ticks)
	unblock()

	select {
	case err := <-result:
		require.Error(t, err)
	case <-time.After(3 * time.Second):
		t.Fatal("failed explicit reopen did not return")
	}

	failed := awaitMultiplexerFrame(t, messages, func(frame Message) bool {
		return frame.Type == "STATUS" && strings.Contains(frame.Data, "error")
	})
	require.Equal(t, conn.Query, failed.Query, "failed resume status must use the opening query")

	sendMultiplexerTickOrDone(t, ticks, done)
	awaitMultiplexerSignal(t, done, "sole monitor did not retry after the failed explicit reopen")
	m.mutex.RLock()
	current := m.connections[key]
	m.mutex.RUnlock()
	require.NotSame(t, conn, current)
	require.NoError(t, m.writeMessageToCluster(current, []byte("after-failed-explicit")))
	frame := awaitMultiplexerFrame(t, messages, func(frame Message) bool { return frame.Type == "DATA" })
	require.Equal(t, "after-failed-explicit", frame.Data)
	require.Equal(t, int32(2), dials.Load())
}

func TestMultiplexerCloseBurstDoesNotDisconnectOtherWatches(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	unblock := sync.OnceFunc(func() { close(release) })
	echo := createMockKubeAPIServer()
	t.Cleanup(echo.Close)
	m, server := newLifecycleMultiplexer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/occupied" {
			close(started)
			<-release
		}

		echo.Config.Handler.ServeHTTP(w, r)
	})
	t.Cleanup(unblock)
	client := dialAuthenticatedMultiplexerClient(t, server.URL)
	pong := make(chan struct{}, 2)

	client.SetPongHandler(func(string) error { pong <- struct{}{}; return nil })
	messages := pumpMultiplexerFrames(t, client)

	msg := Message{Type: "REQUEST", ClusterID: "shared", UserID: "user", Query: "watch=1"}
	for index := 0; index < clientRequestQueueSize+9; index++ {
		msg.Path, msg.RequestID = fmt.Sprintf("/watch/%d", index), fmt.Sprint(index)
		require.NoError(t, client.WriteJSON(msg))
		awaitMultiplexerFrame(t, messages, func(frame Message) bool {
			return frame.Type == "ACK" && frame.RequestID == msg.RequestID
		})
	}

	msg.Path, msg.RequestID = "/occupied", "occupied"
	require.NoError(t, client.WriteJSON(msg))
	awaitMultiplexerSignal(t, started, "worker did not enter the gated dial")

	msg.Type = "CLOSE"
	for index := 0; index < clientRequestQueueSize+8; index++ {
		msg.Path = fmt.Sprintf("/watch/%d", index)
		require.NoError(t, client.WriteJSON(msg))
	}

	require.NoError(t, client.WriteControl(websocket.PingMessage, nil, time.Now().Add(time.Second)))
	awaitMultiplexerSignal(t, pong, "CLOSE notifications disconnected or blocked the real client")
	m.mutex.RLock()
	remaining := len(m.connections)
	m.mutex.RUnlock()
	require.Equal(t, 2, remaining, "only the survivor and occupied dial may remain")

	msg.Type, msg.Path, msg.RequestID, msg.Data = "REQUEST", fmt.Sprintf("/watch/%d", clientRequestQueueSize+8),
		"survivor", "still-connected"
	require.NoError(t, client.WriteJSON(msg))
	require.NoError(t, client.WriteControl(websocket.PingMessage, nil, time.Now().Add(time.Second)))
	awaitMultiplexerSignal(t, pong, "queued CLOSE statuses must not exhaust REQUEST capacity")
	unblock()
	awaitMultiplexerFrame(t, messages, func(frame Message) bool {
		return frame.Type == "ACK" && frame.RequestID == "occupied"
	})

	frame := awaitMultiplexerFrame(t, messages, func(frame Message) bool {
		return frame.Type == "DATA" && frame.Path == msg.Path && frame.Data == msg.Data
	})
	require.Equal(t, msg.Query, frame.Query)
}

func TestMultiplexerInvalidRequestReleasesAcknowledgementCredit(t *testing.T) {
	for _, field := range []string{"clusterId", "path", "userId"} {
		t.Run(field, func(t *testing.T) {
			var dials atomic.Int32

			echo := createMockKubeAPIServer()
			t.Cleanup(echo.Close)
			_, server := newLifecycleMultiplexer(t, func(w http.ResponseWriter, r *http.Request) {
				dials.Add(1)
				echo.Config.Handler.ServeHTTP(w, r)
			})
			client := dialAuthenticatedMultiplexerClient(t, server.URL)
			msg := Message{
				Type: "REQUEST", ClusterID: "shared", Path: "/watch", UserID: "user",
				Query: "watch=1", RequestID: "invalid", Data: "must-not-execute",
			}

			switch field {
			case "clusterId":
				msg.ClusterID = ""
			case "path":
				msg.Path = ""
			case "userId":
				msg.UserID = ""
			}

			require.NoError(t, client.WriteJSON(msg))
			require.NoError(t, client.SetReadDeadline(time.Now().Add(3*time.Second)))

			var frame Message
			require.NoError(t, client.ReadJSON(&frame))
			require.Equal(t, "ERROR", frame.Type)
			require.Contains(t, frame.Data, "missing required routing fields")
			require.NoError(t, client.ReadJSON(&frame))
			require.Equal(t, "ACK", frame.Type)
			require.Equal(t, msg.RequestID, frame.RequestID)
			require.Equal(t, msg.ClusterID, frame.ClusterID)
			require.Equal(t, msg.Path, frame.Path)
			require.Equal(t, msg.UserID, frame.UserID)
			require.Equal(t, msg.Query, frame.Query)
			require.Zero(t, dials.Load())

			msg.ClusterID, msg.Path, msg.UserID, msg.RequestID = "shared", "/next", "user", "next"
			require.NoError(t, client.WriteJSON(msg))
			require.Equal(t, "next", readClientMessageOfType(t, NewWSConnLock(client), "ACK").RequestID)
			require.Equal(t, int32(1), dials.Load())
		})
	}
}

func TestReconnectExplicitWatchReopenKeepsResumeCursor(t *testing.T) {
	queries := make(chan string, 2)
	echo := createMockKubeAPIServer()
	t.Cleanup(echo.Close)
	m, _ := newLifecycleMultiplexer(t, func(w http.ResponseWriter, r *http.Request) {
		queries <- r.URL.RawQuery

		echo.Config.Handler.ServeHTTP(w, r)
	})
	client, clientServer := createTestWebSocketConnection()
	t.Cleanup(clientServer.Close)
	t.Cleanup(func() { _ = client.Close() })
	messages := pumpMultiplexerFrames(t, client.conn)
	retiring, retiringServer := createTestWebSocketConnection()
	t.Cleanup(retiringServer.Close)
	t.Cleanup(func() { _ = retiring.Close() })

	query := "watch=1&resourceVersion=10&labelSelector=team%3Da"
	token := "owner"
	conn := m.createConnection("shared", "original-user", "/watch", query, client, &token)
	conn.WSConn, conn.Status.State, conn.resourceVersion = retiring.conn, StateConnected, "100"
	key := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, client, query)
	m.connections[key] = conn
	msg := Message{
		ClusterID: conn.ClusterID, Path: conn.Path, UserID: conn.UserID, Query: query, Reopen: true,
	}
	reopened, err := m.getOrCreateConnection(msg, client, &token)
	require.NoError(t, err)
	require.Equal(t, "labelSelector=team%3Da&resourceVersion=100&watch=1", <-queries)
	require.Equal(t, query, reopened.Query, "resume queries must not change subscription routing")
	reopened.forwardMu.Lock()
	cursor := reopened.resourceVersion
	reopened.forwardMu.Unlock()
	require.Equal(t, "100", cursor, "a replacement must keep its cursor before receiving a new event")

	resumed, err := m.reconnect(reopened, query, errors.New("failed before another watch event"))
	require.NoError(t, err)
	require.Equal(t, "labelSelector=team%3Da&resourceVersion=100&watch=1", <-queries)
	require.NoError(t, m.writeMessageToCluster(resumed, []byte("resumed")))
	frame := awaitMultiplexerFrame(t, messages, func(frame Message) bool { return frame.Type == "DATA" })
	require.Equal(t, query, frame.Query)
	require.Equal(t, conn.UserID, frame.UserID)
}

func TestMultiplexerCompletedRetentionDoesNotBlockOnActiveSubscriptions(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	client, clientServer := createTestWebSocketConnection()
	t.Cleanup(clientServer.Close)
	t.Cleanup(func() { _ = client.Close() })
	t.Cleanup(m.cleanupConnections)
	active := m.createConnection("shared", "user", "/active", "watch=1", client, nil)
	completed := m.createConnection("shared", "user", "/completed", "", client, nil)

	for _, conn := range []*Connection{active, completed} {
		m.connections[m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, client, conn.Query)] = conn
	}

	active.mu.Lock()
	done := make(chan struct{})

	go func() { m.finishClusterReader(completed); close(done) }()

	var finished bool

	select {
	case <-done:
		finished = true
	case <-time.After(3 * time.Second):
	}

	active.mu.Unlock()
	awaitMultiplexerSignal(t, done, "completed reader did not finish")
	require.True(t, finished, "retaining a completed entry must not inspect active subscriptions")
	require.False(t, active.IsClosed())
}

func TestMultiplexerStateErrorWatchReturnsCodedRetryWithoutReservation(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	client, clientServer := createTestWebSocketConnection()
	t.Cleanup(clientServer.Close)
	t.Cleanup(func() { _ = client.Close() })

	upstream, upstreamServer := createTestWebSocketConnection()
	t.Cleanup(upstreamServer.Close)
	t.Cleanup(func() { _ = upstream.Close() })

	conn := m.createConnection("shared", "original-user", "/watch",
		"watch=1&resourceVersion=42", client, nil)
	conn.WSConn, conn.Status.State = upstream.conn, StateError
	key := m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, client, conn.Query)
	m.connections[key] = conn
	t.Cleanup(m.cleanupConnections)

	msg := Message{
		Type: "REQUEST", ClusterID: conn.ClusterID, Path: conn.Path,
		UserID: conn.UserID, Query: conn.Query, Data: "must-not-use-error-transport",
	}
	m.processClientMessage(httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil), client, msg)
	retry := readMultiplexerTestMessage(t, client.conn, "ERROR")
	require.Contains(t, retry.Data, `"code":"subscription_reconnecting"`)
	require.NotContains(t, retry.Data, `"retryReady":true`)
	require.Equal(t, conn.Query, retry.Query)
	require.Equal(t, conn.UserID, retry.UserID)
	require.NoError(t, upstream.WriteMessage(websocket.TextMessage, []byte("marker")))
	require.NoError(t, upstream.conn.SetReadDeadline(time.Now().Add(3*time.Second)))
	_, data, err := upstream.conn.ReadMessage()
	require.NoError(t, err)
	require.Equal(t, "marker", string(data))
}

//nolint:funlen // Keeps watch query routing, credential pinning and independent CLOSE in one real-client trace.
func TestMultiplexerWatchQueriesStayIndependent(t *testing.T) {
	var dials atomic.Int32

	echo := createMockKubeAPIServer()
	t.Cleanup(echo.Close)
	m, server := newLifecycleMultiplexer(t, func(w http.ResponseWriter, r *http.Request) {
		requireToken := r.Header.Get("Authorization") == "Bearer owner"
		if !requireToken {
			http.Error(w, "wrong credential", http.StatusUnauthorized)
			return
		}

		dials.Add(1)
		echo.Config.Handler.ServeHTTP(w, r)
	})
	context, err := m.kubeConfigStore.GetContext("shared")
	require.NoError(t, err)
	require.NoError(t, m.kubeConfigStore.RemoveContext("shared"))
	require.NoError(t, m.kubeConfigStore.AddContextWithKeyAndTTL(
		context, statelessContextKey("shared", "original-user"), time.Hour))
	client := dialAuthenticatedMultiplexerClient(t, server.URL)
	messages := pumpMultiplexerFrames(t, client)
	msg := Message{
		Type: "REQUEST", ClusterID: "shared", Path: "/api/v1/pods", UserID: "original-user",
		Query: "watch=1&labelSelector=team%3Da", RequestID: "a", Data: "a",
	}
	require.NoError(t, client.WriteJSON(msg))

	acked, delivered := false, false

	awaitMultiplexerFrame(t, messages, func(frame Message) bool {
		if frame.Type == "STATUS" {
			require.Equal(t, msg.Query, frame.Query)
			require.Equal(t, msg.UserID, frame.UserID)
		}

		acked = acked || frame.Type == "ACK" && frame.RequestID == msg.RequestID
		delivered = delivered || frame.Type == "DATA" && frame.Query == msg.Query && frame.Data == msg.Data

		return acked && delivered
	})

	queryA := msg.Query
	msg.Query, msg.RequestID, msg.Data = "watch=1&labelSelector=team%3Db", "b", "b"
	require.NoError(t, client.WriteJSON(msg))

	acked, delivered = false, false

	awaitMultiplexerFrame(t, messages, func(frame Message) bool {
		acked = acked || frame.Type == "ACK" && frame.RequestID == msg.RequestID
		delivered = delivered || frame.Type == "DATA" && frame.Query == msg.Query && frame.Data == msg.Data

		return acked && delivered
	})
	m.mutex.RLock()

	var owner *WSConnLock
	for key := range m.connections {
		owner = key.client
	}

	m.mutex.RUnlock()
	keyA := m.createConnectionKey(msg.ClusterID, msg.Path, msg.UserID, owner, queryA)
	keyB := m.createConnectionKey(msg.ClusterID, msg.Path, msg.UserID, owner, msg.Query)
	m.mutex.RLock()
	connA, connB := m.connections[keyA], m.connections[keyB]
	m.mutex.RUnlock()
	require.NotNil(t, connA)
	require.NotNil(t, connB)
	require.NotSame(t, connA, connB)

	changed := "changed"
	_, err = m.getOrCreateConnection(msg, owner, &changed)
	require.ErrorContains(t, err, "credentials changed")
	_, err = m.reconnect(connA, connB.Query, nil)
	require.ErrorContains(t, err, "preserve its subscription query")

	msg.Reopen, msg.RequestID = true, "b-reopen"
	require.NoError(t, client.WriteJSON(msg))
	awaitMultiplexerFrame(t, messages, func(frame Message) bool {
		return frame.Type == "ACK" && frame.RequestID == "b-reopen"
	})
	m.mutex.RLock()
	preservedA, replacedB := m.connections[keyA], m.connections[keyB]
	m.mutex.RUnlock()
	require.Same(t, connA, preservedA)
	require.NotSame(t, connB, replacedB)
	replacedB.mu.Lock()
	replacedB.Status.State = StateError
	replacedB.mu.Unlock()

	msg.Reopen, msg.RequestID, msg.Data = false, "b-error", "must-not-use-b"
	require.NoError(t, client.WriteJSON(msg))
	retry := awaitMultiplexerFrame(t, messages, func(frame Message) bool {
		return frame.Type == "ERROR" && frame.Query == msg.Query
	})
	require.Contains(t, retry.Data, `"code":"subscription_reconnecting"`)
	require.NotContains(t, retry.Data, `"retryReady":true`, "another query's connected state must not release this retry")
	replacedB.updateStatus(StateConnected, nil)

	msg.Type, msg.Query = "CLOSE", queryA
	require.NoError(t, client.WriteJSON(msg))
	awaitMultiplexerFrame(t, messages, func(frame Message) bool {
		return frame.Type == "STATUS" && frame.Query == queryA && strings.Contains(frame.Data, `"state":"closed"`)
	})

	msg.Type, msg.Query, msg.RequestID, msg.Data, msg.Reopen = "REQUEST", connB.Query, "b-survives", "b-survives", false
	require.NoError(t, client.WriteJSON(msg))
	frame := awaitMultiplexerFrame(t, messages, func(frame Message) bool {
		return frame.Type == "DATA" && frame.Data == "b-survives"
	})
	require.Equal(t, msg.Query, frame.Query)
	require.Equal(t, msg.UserID, frame.UserID)
	m.mutex.RLock()
	remaining := len(m.connections)
	m.mutex.RUnlock()
	require.Equal(t, 1, remaining)
	require.Equal(t, int32(3), dials.Load())
}

func TestMultiplexerLegacyRequestIDAcknowledgesNextWatch(t *testing.T) {
	for _, offered := range [][]string{{MultiplexerProtocol}, nil} {
		t.Run(strings.Join(offered, ","), func(t *testing.T) {
			echo := createMockKubeAPIServer()
			t.Cleanup(echo.Close)
			m, server := newLifecycleMultiplexer(t, echo.Config.Handler.ServeHTTP)
			dialer := newTestDialer()
			dialer.Subprotocols = offered

			client, response, err := dialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
			if response != nil {
				_ = response.Body.Close()
			}

			require.NoError(t, err)
			t.Cleanup(func() { _ = client.Close() })

			expected := ""
			if len(offered) > 0 {
				expected = MultiplexerProtocol
			}

			require.Equal(t, expected, client.Subprotocol())
			messages := pumpMultiplexerFrames(t, client)

			for index := 0; index < 2; index++ {
				msg := Message{
					Type: "REQUEST", ClusterID: "shared", UserID: "original-user",
					Path: fmt.Sprintf("/legacy-watch/%d", index), Query: "watch=1",
					RequestID: fmt.Sprint(index), Data: fmt.Sprintf("watch-%d", index),
				}
				require.NoError(t, client.WriteJSON(msg))

				acked, delivered := false, false

				awaitMultiplexerFrame(t, messages, func(frame Message) bool {
					if frame.Type == "ACK" && frame.RequestID == msg.RequestID {
						require.Equal(t, msg.Path, frame.Path)
						require.Equal(t, msg.Query, frame.Query)
						require.Equal(t, msg.UserID, frame.UserID)

						acked = true
					}

					delivered = delivered || frame.Type == "DATA" && frame.Path == msg.Path && frame.Data == msg.Data

					return acked && delivered
				})
			}

			m.mutex.RLock()
			remaining := len(m.connections)
			m.mutex.RUnlock()
			require.Equal(t, 2, remaining)
		})
	}
}

func TestMultiplexerNegotiatesWatchProtocolWithoutDroppingLegacy(t *testing.T) {
	for _, offered := range [][]string{
		{MultiplexerProtocol, MultiplexerWatchProtocol}, {MultiplexerProtocol}, nil,
	} {
		t.Run(strings.Join(offered, ","), func(t *testing.T) {
			m := NewMultiplexer(kubeconfig.NewContextStore(), false)
			server := httptest.NewServer(http.HandlerFunc(m.HandleClientWebSocket))
			t.Cleanup(server.Close)

			dialer := newTestDialer()
			dialer.Subprotocols = offered

			client, response, err := dialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
			if response != nil {
				_ = response.Body.Close()
			}

			require.NoError(t, err)
			t.Cleanup(func() { _ = client.Close() })

			expected := ""
			if len(offered) > 0 {
				expected = offered[len(offered)-1]
			}

			require.Equal(t, expected, client.Subprotocol())

			msg := Message{
				Type: "REQUEST", ClusterID: "missing", Path: "/watch",
				Query: "watch=1", UserID: "original-user", RequestID: "negotiation",
			}
			require.NoError(t, client.WriteJSON(msg))
			require.NoError(t, client.WriteJSON(msg))

			acks := 0

			for completed := 0; completed < 2; {
				require.NoError(t, client.SetReadDeadline(time.Now().Add(3*time.Second)))

				var frame Message
				require.NoError(t, client.ReadJSON(&frame))

				if frame.Type == "ACK" {
					acks++
				}

				if frame.Type == "ERROR" {
					completed++
				}
			}

			var ack Message
			require.NoError(t, client.ReadJSON(&ack))
			require.Equal(t, "ACK", ack.Type)
			require.Equal(t, msg.RequestID, ack.RequestID)
			require.Equal(t, 1, acks)
		})
	}
}

func TestMultiplexerWatchProtocolPreservesBackendTokenBoundary(t *testing.T) {
	const desktopToken = "test-desktop-token"
	t.Setenv("HEADLAMP_BACKEND_TOKEN", desktopToken)

	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	server := httptest.NewServer(auth.NewBackendTokenMiddleware(false)(http.HandlerFunc(m.HandleClientWebSocket)))
	t.Cleanup(server.Close)

	for _, token := range []string{"", "wrong", desktopToken} {
		t.Run(token, func(t *testing.T) {
			dialer := newTestDialer()

			dialer.Subprotocols = []string{MultiplexerProtocol, MultiplexerWatchProtocol}
			if token != "" {
				dialer.Subprotocols = append(dialer.Subprotocols,
					"base64url.headlamp.backend.authorization.k8s.io."+base64.RawURLEncoding.EncodeToString([]byte(token)))
			}

			client, response, err := dialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
			if response != nil {
				_ = response.Body.Close()
			}

			if token != desktopToken {
				require.Error(t, err)
				require.Nil(t, client)
				require.NotNil(t, response)
				require.Equal(t, http.StatusForbidden, response.StatusCode)

				return
			}

			require.NoError(t, err)
			t.Cleanup(func() { _ = client.Close() })
			require.Equal(t, MultiplexerWatchProtocol, client.Subprotocol())
			require.NotContains(t, response.Header.Get("Sec-WebSocket-Protocol"), desktopToken)
		})
	}
}
