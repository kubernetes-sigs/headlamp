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
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/stretchr/testify/require"
)

func TestConfigEventsRefreshNewAndConnectedClients(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())

	var revision atomic.Int32

	events := newConfigEvents(ctx, func() ([]Cluster, error) {
		return []Cluster{{Name: "workload", Metadata: map[string]interface{}{"revision": revision.Load()}}}, nil
	})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		events.serve(ctx, configEventUpgrader(false, false), w, r)
	}))
	t.Cleanup(server.Close)
	t.Cleanup(cancel)

	connect := func() *websocket.Conn {
		t.Helper()

		conn, response, err := websocket.DefaultDialer.DialContext(ctx, "ws"+strings.TrimPrefix(server.URL, "http"), nil)
		if response != nil {
			_ = response.Body.Close()
		}

		require.NoError(t, err)
		t.Cleanup(func() { _ = conn.Close() })
		require.NoError(t, conn.SetReadDeadline(time.Now().Add(5*time.Second)))

		return conn
	}

	readRefresh := func(conn *websocket.Conn) {
		t.Helper()

		messageType, message, err := conn.ReadMessage()
		require.NoError(t, err)
		require.Equal(t, websocket.TextMessage, messageType)
		require.JSONEq(t, configEventFrame, string(message))
	}

	first := connect()
	readRefresh(first)

	second := connect()
	readRefresh(second)

	revision.Add(1)
	events.notify()
	readRefresh(first)
	readRefresh(second)

	reconnected := connect()
	readRefresh(reconnected)

	cancel()

	_, _, err := reconnected.ReadMessage()
	require.Error(t, err)
}

func TestConfigEventsCoalescesPublishedChanges(t *testing.T) {
	var revision atomic.Int32

	events := newConfigEvents(t.Context(), func() ([]Cluster, error) {
		return []Cluster{{Name: "workload", Metadata: map[string]interface{}{"revision": revision.Load()}}}, nil
	})
	first := events.nextChange()

	events.notify()

	select {
	case <-first:
		t.Fatal("an unchanged snapshot notified clients")
	case <-time.After(3 * configChangeWindow):
	}

	for range 10 {
		revision.Add(1)
		events.notify()
	}

	select {
	case <-first:
	case <-time.After(3 * configChangeWindow):
		t.Fatal("a published change did not notify clients")
	}

	select {
	case <-events.nextChange():
		t.Fatal("the same snapshot notified clients twice")
	case <-time.After(3 * configChangeWindow):
	}
}

func TestConfigEventsRetriesAFailedSnapshot(t *testing.T) {
	var reads atomic.Int32

	events := newConfigEvents(t.Context(), func() ([]Cluster, error) {
		switch reads.Add(1) {
		case 1:
			return nil, nil
		case 2:
			return nil, errors.New("temporary store read failure")
		default:
			return []Cluster{{Name: "workload"}}, nil
		}
	})
	changed := events.nextChange()

	events.notify()

	select {
	case <-changed:
		require.EqualValues(t, 3, reads.Load())
	case <-time.After(10 * configChangeWindow):
		t.Fatal("change was lost after the snapshot failed")
	}
}

func TestConfigEventsRequiresDesktopAuthenticationAndChecksOrigin(t *testing.T) {
	const token = "test-desktop-token"
	t.Setenv("HEADLAMP_BACKEND_TOKEN", token)

	config := HeadlampConfig{HeadlampConfig: &headlampconfig.HeadlampConfig{
		HeadlampCFG: &headlampconfig.HeadlampCFG{},
	}}
	events := newConfigEvents(t.Context(), func() ([]Cluster, error) { return nil, nil })
	router := mux.NewRouter()
	serve := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		events.serve(t.Context(), configEventUpgrader(false, true), w, r)
	})
	router.Handle("/config/events", config.authenticatedHandler(serve))
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/config/events"

	dial := func(origin string, withToken bool) (*websocket.Conn, *http.Response, error) {
		t.Helper()

		dialer := *websocket.DefaultDialer
		dialer.Subprotocols = []string{configEventProtocol}

		if withToken {
			dialer.Subprotocols = append(dialer.Subprotocols, "base64url.headlamp.backend.authorization.k8s.io."+
				base64.RawURLEncoding.EncodeToString([]byte(token)))
		}

		return dialer.DialContext(t.Context(), wsURL, http.Header{"Origin": []string{origin}})
	}

	for _, tc := range []struct {
		origin    string
		withToken bool
	}{{"null", false}, {"https://untrusted.example.org", true}} {
		_, response, err := dial(tc.origin, tc.withToken)
		require.Error(t, err)
		require.NotNil(t, response)
		require.Equal(t, http.StatusForbidden, response.StatusCode)
		_ = response.Body.Close()
	}

	conn, response, err := dial("null", true)
	if response != nil {
		_ = response.Body.Close()
	}

	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	require.Equal(t, configEventProtocol, conn.Subprotocol())
	require.NoError(t, conn.SetReadDeadline(time.Now().Add(5*time.Second)))
	_, message, err := conn.ReadMessage()
	require.NoError(t, err)
	require.JSONEq(t, configEventFrame, string(message))
}
