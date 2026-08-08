package audit

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for simplicity in this implementation
	},
}

// MockStreamer implements Streamer by generating mock audit events.
type MockStreamer struct{}

// Stream generates random mock events for testing the UI.
func (m *MockStreamer) Stream(filter Filter, ch chan<- AuditEvent) error {
	verbs := []string{"create", "update", "delete", "get", "list", "patch"}
	resources := []string{"pods", "deployments", "services", "namespaces", "configmaps"}
	users := []string{"admin", "system:serviceaccount:kube-system:default", "developer"}
	statusCodes := []int{200, 201, 403, 404, 500}

	for i := 0; i < 1000; i++ {
		event := AuditEvent{
			User:       users[i%len(users)],
			Verb:       verbs[i%len(verbs)],
			Resource:   resources[i%len(resources)],
			StatusCode: statusCodes[i%len(statusCodes)],
			Timestamp:  time.Now().Format(time.RFC3339Nano),
			Message:    "Mock audit event",
		}
		
		if filter.Match(event) {
			ch <- event
		}
		
		time.Sleep(10 * time.Millisecond) // Simulate stream delay
	}
	close(ch)
	return nil
}

// StreamHandler handles WebSocket connections and streams audit events.
func StreamHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Failed to upgrade connection", http.StatusInternalServerError)
		return
	}
	defer conn.Close()

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
		_ = streamer.Stream(filter, ch)
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
