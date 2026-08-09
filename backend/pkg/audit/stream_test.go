//nolint:testpackage
package audit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
)

func TestStreamHandler(t *testing.T) {
	// Create a test server with the StreamHandler
	server := httptest.NewServer(http.HandlerFunc(StreamHandler))
	defer server.Close()

	// Convert http:// to ws://
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "?verb=create&statusCode=200"

	// Connect to the WebSocket
	ws, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	assert.NoError(t, err, "Should be able to connect to WebSocket")

	defer func() {
		_ = resp.Body.Close()
	}()
	defer func() {
		_ = ws.Close()
	}()

	// Read one event to verify filters work
	var event AuditEvent

	err = ws.ReadJSON(&event)
	assert.NoError(t, err, "Should be able to read JSON from WebSocket")

	// Since MockStreamer loops, it should eventually output an event that matches the filter
	// Filter asks for verb=create and statusCode=200
	assert.Equal(t, "create", event.Verb)
	assert.Equal(t, 200, event.StatusCode)

	// Close the connection to test cancellation
	err = ws.Close()
	assert.NoError(t, err)

	// Wait a bit to ensure the context cancellation propagates and the goroutine exits
	time.Sleep(100 * time.Millisecond)
}

func TestMockStreamerContextCancellation(t *testing.T) {
	streamer := &MockStreamer{}
	ch := make(chan AuditEvent)
	ctx, cancel := context.WithCancel(context.Background())

	filter := Filter{}

	// Start streamer
	go func() {
		_ = streamer.Stream(ctx, filter, ch)
	}()

	// Read a few events
	<-ch
	<-ch

	// Cancel context
	cancel()

	// Channel should be closed shortly
	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("Expected channel to be closed, but read an event")
		}
	case <-time.After(1 * time.Second):
		t.Fatal("Streamer did not close the channel within 1 second after context cancellation")
	}
}
