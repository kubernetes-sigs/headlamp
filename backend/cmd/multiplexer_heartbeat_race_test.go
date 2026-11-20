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

// pingUntilStopped runs heartbeat ticks until stop is closed. The returned
// channel is closed once the goroutine has exited.
func pingUntilStopped(t *testing.T, m *Multiplexer, conn *Connection, stop <-chan struct{}) <-chan struct{} {
	t.Helper()

	done := make(chan struct{})

	go func() {
		defer close(done)

		// The ticker is only passed through; a successful ping never resets it.
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()

		failures := 0

		for {
			select {
			case <-stop:
				return
			default:
				newConn, stopMonitor := m.handleHeartbeatTick(conn, &failures, ticker)
				if newConn != nil || stopMonitor || failures != 0 {
					t.Errorf("heartbeat tick did not ping cleanly: newConn=%v stop=%v failures=%d",
						newConn != nil, stopMonitor, failures)

					return
				}

				time.Sleep(time.Millisecond)
			}
		}
	}()

	return done
}

// TestPingAndDataWritesDoNotRace checks that heartbeat pings and concurrent
// client data writes can run on the same cluster connection without racing
// (gorilla/websocket panics on concurrent writes). Two data writers run at the
// same time as the heartbeat so that clusterWriteMu is exercised from three
// goroutines.
func TestPingAndDataWritesDoNotRace(t *testing.T) {
	m := NewMultiplexer(kubeconfig.NewContextStore(), false)

	conn := createTestConnection("test-cluster", "test-user", "/api/v1/pods", "", nil)

	wsConn, wsServer := createTestWebSocketConnection()
	defer wsServer.Close()

	conn.WSConn = wsConn.conn
	conn.updateStatus(StateConnected, nil)

	closeAndWait := drainConn(wsConn)
	defer closeAndWait()

	stop := make(chan struct{})
	pingDone := pingUntilStopped(t, m, conn, stop)

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
