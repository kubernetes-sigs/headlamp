package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

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
			key := m.createConnectionKey(previous.ClusterID, previous.Path, previous.UserID, client)
			m.connections[key] = previous

			type reconnectResult struct {
				conn *Connection
				err  error
			}

			result := make(chan reconnectResult, 1)

			go func() {
				conn, err := m.reconnect(previous)
				result <- reconnectResult{conn, err}
			}()

			select {
			case <-dialStarted:
			case <-time.After(3 * time.Second):
				t.Fatal("reconnect did not reach gated dial")
			}

			previous.safeClose()

			if cancel == "none" {
				request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/wsMultiplexer", nil)
				m.processClientMessage(request, client, Message{
					Type: "REQUEST", ClusterID: previous.ClusterID, Path: previous.Path,
					UserID: previous.UserID, Data: "during-reconnect",
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
					require.Empty(t, m.connections)
					m.mutex.RUnlock()

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
			key := m.createConnectionKey(previous.ClusterID, previous.Path, previous.UserID, client)
			m.connections[key] = previous
			previous.safeClose()

			switch cancel {
			case "close":
				m.closeConnection(key)
			case "disconnect":
				m.closeClientConnections(client)
			}

			replacement, err := m.reconnect(previous)
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
	key := m.createConnectionKey(previous.ClusterID, previous.Path, previous.UserID, client)
	m.connections[key] = previous
	previous.safeClose()

	m.monitorConnection(previous)
	readMultiplexerTestMessage(t, client.conn, "STATUS")
	m.mutex.RLock()
	replacement := m.connections[key]
	m.mutex.RUnlock()
	require.Same(t, previous, replacement, "reader completion must not repeat a completed operation")
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
	m.connections[m.createConnectionKey(conn.ClusterID, conn.Path, conn.UserID, client)] = conn
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
