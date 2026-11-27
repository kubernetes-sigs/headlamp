/*
Copyright 2026 The Kubernetes Authors.

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
	"encoding/base64"
	"net"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// blockedWriteConn models cluster backpressure after the HTTP upgrade finishes.
type blockedWriteConn struct {
	net.Conn
	writeStarted chan struct{}
	releaseWrite <-chan struct{}
	writeOnce    sync.Once
}

func (c *blockedWriteConn) Write(p []byte) (int, error) {
	if c.releaseWrite != nil {
		c.writeOnce.Do(func() { close(c.writeStarted) })
		<-c.releaseWrite
	}

	return c.Conn.Write(p)
}

func newBackpressuredCluster(t *testing.T) (*websocket.Conn, <-chan struct{}, func()) {
	t.Helper()

	clusterConn, server := createTestWebSocketConn()
	t.Cleanup(server.Close)
	t.Cleanup(func() { _ = clusterConn.Close() })

	var transport *blockedWriteConn

	dialer := newTestDialer()
	dialer.NetDial = nil
	dialer.NetDialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		raw, err := (&net.Dialer{}).DialContext(ctx, network, addr)
		if err != nil {
			return nil, err
		}

		transport = &blockedWriteConn{Conn: raw, writeStarted: make(chan struct{})}

		return transport, nil
	}
	ws, resp, err := dialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	require.NoError(t, err)

	if resp != nil && resp.Body != nil {
		require.NoError(t, resp.Body.Close())
	}

	t.Cleanup(func() { _ = ws.Close() })

	release := make(chan struct{})
	transport.releaseWrite = release

	var releaseOnce sync.Once

	unblock := func() { releaseOnce.Do(func() { close(release) }) }
	t.Cleanup(unblock)

	return ws, transport.writeStarted, unblock
}

func TestClusterBackpressureDoesNotBlockClientOutput(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)
	clientConn, clientServer := createTestWebSocketConnection()
	t.Cleanup(clientServer.Close)
	t.Cleanup(func() { _ = clientConn.Close() })

	ws, writeStarted, unblock := newBackpressuredCluster(t)
	conn := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn)
	conn.WSConn = ws
	writeDone := make(chan error, 1)

	go func() { writeDone <- m.writeMessageToCluster(conn, []byte("input")) }()

	t.Cleanup(func() {
		unblock()

		select {
		case err := <-writeDone:
			assert.NoError(t, err)
		case <-time.After(time.Second):
			t.Error("cluster writer did not finish after backpressure was released")
		}
	})

	select {
	case <-writeStarted:
	case <-time.After(time.Second):
		t.Fatal("cluster write did not reach backpressure")
	}

	outputDone := make(chan error, 1)

	go func() {
		outputDone <- m.sendDataMessage(conn, clientConn, websocket.BinaryMessage, []byte("output"))
	}()

	select {
	case err := <-outputDone:
		require.NoError(t, err)
	case <-time.After(time.Second):
		t.Fatal("cluster backpressure blocked client output")
	}

	require.NoError(t, clientConn.conn.SetReadDeadline(time.Now().Add(time.Second)))

	var msg Message

	require.NoError(t, clientConn.ReadJSON(&msg))
	assert.Equal(t, base64.StdEncoding.EncodeToString([]byte("output")), msg.Data)

	select {
	case err := <-writeDone:
		t.Fatalf("cluster write finished before backpressure was released: %v", err)
	default:
	}
}
