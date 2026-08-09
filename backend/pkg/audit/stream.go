package audit

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}

		u, err := url.Parse(origin)
		if err != nil {
			return false
		}

		if u.Scheme == "app" || u.Scheme == "file" || u.Scheme == "headlamp" {
			return true
		}

		return strings.EqualFold(u.Host, r.Host)
	},
}

// MockStreamer implements Streamer by generating mock audit events.
type MockStreamer struct{}

// Stream generates random mock events for testing the UI.
func (m *MockStreamer) Stream(ctx context.Context, filter Filter, ch chan<- AuditEvent) error {
	verbs := []string{"create", "update", "delete", "get", "list", "patch"}
	resources := []string{"pods", "deployments", "services", "namespaces", "configmaps"}
	users := []string{"admin", "system:serviceaccount:kube-system:default", "developer"}
	statusCodes := []int{200, 201, 403, 404, 500}

	i := 0

	for {
		select {
		case <-ctx.Done():
			close(ch)
			return nil
		case <-time.After(10 * time.Millisecond): // Simulate stream delay
			event := AuditEvent{
				User:       users[i%len(users)],
				Verb:       verbs[i%len(verbs)],
				Resource:   resources[i%len(resources)],
				StatusCode: statusCodes[i%len(statusCodes)],
				Timestamp:  time.Now().Format(time.RFC3339Nano),
				Message:    "Mock audit event",
			}

			if filter.Match(event) {
				// Non-blocking send or select with ctx.Done() to avoid blocking forever if ch is unread
				select {
				case ch <- event:
				case <-ctx.Done():
					close(ch)
					return nil
				}
			}

			i++
		}
	}
}

// StreamHandler handles WebSocket connections and streams audit events.
func StreamHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Failed to upgrade connection", http.StatusInternalServerError)
		return
	}
	defer func() {
		_ = conn.Close()
	}()

	// Parse query parameters for initial filters
	q := r.URL.Query()
	statusCode, _ := strconv.Atoi(q.Get("statusCode"))
	filter := Filter{
		User:       q.Get("user"),
		Verb:       q.Get("verb"),
		Resource:   q.Get("resource"),
		StatusCode: statusCode,
	}

	ch := make(chan AuditEvent)
	streamer := &MockStreamer{}

	go func() {
		_ = streamer.Stream(r.Context(), filter, ch)
	}()

	for event := range ch {
		data, err := json.Marshal(event)
		if err != nil {
			continue
		}

		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			break // Connection closed or error
		}
	}
}
