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
	"sync"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
)

// drainConn reads and discards everything the echo server sends back, so the
// server never blocks on a full buffer. The returned function closes the
// connection and waits for the reader to exit.
func drainConn(wsConn *WSConnLock) func() {
	readDone := make(chan struct{})

	go func() {
		defer close(readDone)

		for {
			if _, _, err := wsConn.conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	return func() {
		_ = wsConn.conn.Close()

		<-readDone
	}
}

// pingUntilStopped sends heartbeat pings until stop is closed. The returned
// channel is closed once the goroutine has exited.
func pingUntilStopped(m *Multiplexer, conn *Connection, stop <-chan struct{}) <-chan struct{} {
	done := make(chan struct{})

	go func() {
		defer close(done)

		for {
			select {
			case <-stop:
				return
			default:
				_ = m.sendPing(conn)

				time.Sleep(time.Millisecond)
			}
		}
	}()

	return done
}

// TestPingAndDataWritesDoNotRace checks that heartbeat pings and concurrent
// client data writes can run on the same cluster connection without racing
// (gorilla/websocket panics on concurrent writes). Two data writers run at the
// same time so that wsWriteMu is exercised as well as the WriteControl ping.
func TestPingAndDataWritesDoNotRace(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)

	clientConn, clientServer := createTestWebSocketConnection()
	defer clientServer.Close()

	conn := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "", clientConn)

	wsConn, wsServer := createTestWebSocketConnection()
	defer wsServer.Close()

	conn.WSConn = wsConn.conn

	closeAndWait := drainConn(wsConn)
	defer closeAndWait()

	stop := make(chan struct{})
	pingDone := pingUntilStopped(m, conn, stop)

	var writers sync.WaitGroup

	deadline := time.Now().Add(500 * time.Millisecond)

	for i := 0; i < 2; i++ {
		writers.Add(1)

		go func() {
			defer writers.Done()

			for time.Now().Before(deadline) {
				if err := m.writeMessageToCluster(conn, []byte("x")); err != nil {
					t.Errorf("writeMessageToCluster failed: %v", err)

					return
				}
			}
		}()
	}

	writers.Wait()
	close(stop)
	<-pingDone
}
