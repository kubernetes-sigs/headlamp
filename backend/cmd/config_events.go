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
	"net/http"
	"net/url"
	"reflect"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	configEventFrame    = `{"type":"config"}`
	configEventProtocol = "headlamp.config-events.v1"
	configHeartbeat     = 20 * time.Second
	configChangeWindow  = 100 * time.Millisecond
	configWriteTimeout  = 5 * time.Second
)

// configEvents broadcasts invalidations without storing a queue for each client.
type configEvents struct {
	mu      sync.Mutex
	changed chan struct{}
	dirty   chan struct{}
}

func newConfigEvents(ctx context.Context, snapshot func() ([]Cluster, error)) *configEvents {
	events := &configEvents{changed: make(chan struct{}), dirty: make(chan struct{}, 1)}
	previous, _ := snapshot()

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-events.dirty:
			}

			timer := time.NewTimer(configChangeWindow)
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}

			// Marks up to this point are covered by the next snapshot. A mark
			// during the read remains queued for the following window.
			select {
			case <-events.dirty:
			default:
			}

			current, err := snapshot()
			if err != nil {
				events.notify()
				continue
			}

			if reflect.DeepEqual(previous, current) {
				continue
			}

			previous = current

			events.mu.Lock()
			close(events.changed)
			events.changed = make(chan struct{})
			events.mu.Unlock()
		}
	}()

	return events
}

func (e *configEvents) nextChange() <-chan struct{} {
	e.mu.Lock()
	defer e.mu.Unlock()

	return e.changed
}

func (e *configEvents) notify() {
	select {
	case e.dirty <- struct{}{}:
	default:
	}
}

func configEventUpgrader(devMode, desktopLoopback bool) websocket.Upgrader {
	return websocket.Upgrader{Subprotocols: []string{configEventProtocol}, CheckOrigin: func(r *http.Request) bool {
		origins := r.Header.Values("Origin")
		if len(origins) == 0 {
			return true
		}

		if len(origins) != 1 {
			return false
		}

		if origins[0] == "null" {
			// The authenticated desktop renderer is loaded from a file URL.
			return desktopLoopback
		}

		origin, err := url.Parse(origins[0])
		if err != nil || (origin.Scheme != "http" && origin.Scheme != "https") {
			return false
		}

		if strings.EqualFold(origin.Host, r.Host) {
			return true
		}

		return devMode && origin.Scheme == "http" && (origin.Host == "localhost:3000" || origin.Host == "127.0.0.1:3000")
	}}
}

func sendConfigEvent(conn *websocket.Conn) bool {
	if err := conn.SetWriteDeadline(time.Now().Add(configWriteTimeout)); err != nil {
		return false
	}

	return conn.WriteMessage(websocket.TextMessage, []byte(configEventFrame)) == nil
}

func (e *configEvents) serve(ctx context.Context, upgrader websocket.Upgrader, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer func() { _ = conn.Close() }()

	conn.SetReadLimit(1024)

	extendReadDeadline := func() error { return conn.SetReadDeadline(time.Now().Add(2 * configHeartbeat)) }
	if err := extendReadDeadline(); err != nil {
		return
	}

	conn.SetPongHandler(func(string) error { return extendReadDeadline() })

	disconnected := make(chan struct{})
	go func() {
		defer close(disconnected)

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	changed := e.nextChange()

	if !sendConfigEvent(conn) {
		return
	}

	heartbeat := time.NewTicker(configHeartbeat)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-r.Context().Done():
			return
		case <-disconnected:
			return
		case <-changed:
			changed = e.nextChange()

			if !sendConfigEvent(conn) {
				return
			}
		case <-heartbeat.C:
			if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(configWriteTimeout)); err != nil {
				return
			}
		}
	}
}
