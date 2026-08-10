package audit

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all for simplicity
	},
}

// AuditEvent represents a Kubernetes audit event.
type AuditEvent struct {
	Level     string `json:"level,omitempty"`
	Timestamp string `json:"stageTimestamp,omitempty"`
	Verb      string `json:"verb,omitempty"`
	User      struct {
		Username string `json:"username,omitempty"`
	} `json:"user,omitempty"`
	ObjectRef struct {
		Resource  string `json:"resource,omitempty"`
		Namespace string `json:"namespace,omitempty"`
		Name      string `json:"name,omitempty"`
	} `json:"objectRef,omitempty"`
	ResponseStatus struct {
		Code int `json:"code,omitempty"`
	} `json:"responseStatus,omitempty"`
}

// EventList is the payload sent by Kubernetes audit webhook.
type EventList struct {
	Kind       string            `json:"kind"`
	APIVersion string            `json:"apiVersion"`
	Items      []json.RawMessage `json:"items"`
}

// Filter defines criteria to filter audit logs.
type Filter struct {
	User       string
	Verb       string
	Kind       string // corresponds to ObjectRef.Resource
	StatusCode int
}

// MatchFilter checks if an event matches the filter.
func MatchFilter(eventBytes []byte, filter *Filter) bool {
	if filter == nil || (filter.User == "" && filter.Verb == "" && filter.Kind == "" && filter.StatusCode == 0) {
		return true
	}

	var event AuditEvent
	if err := json.Unmarshal(eventBytes, &event); err != nil {
		return true // skip filter if we can't parse
	}

	if filter.User != "" && event.User.Username != filter.User {
		return false
	}

	if filter.Verb != "" && event.Verb != filter.Verb {
		return false
	}

	if filter.Kind != "" && event.ObjectRef.Resource != filter.Kind {
		return false
	}

	if filter.StatusCode != 0 && event.ResponseStatus.Code != filter.StatusCode {
		return false
	}

	return true
}

type clientConn struct {
	conn   *websocket.Conn
	filter *Filter
}

// Streamer manages websocket connections for audit logs.
type Streamer struct {
	clients   map[*clientConn]bool
	clientsMu sync.Mutex
}

// NewStreamer creates a new Audit Log Streamer.
func NewStreamer() *Streamer {
	return &Streamer{
		clients: make(map[*clientConn]bool),
	}
}

// HandleWebhook receives EventList from Kubernetes Audit webhook.
func (s *Streamer) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Error reading body", http.StatusBadRequest)
		return
	}

	defer func() {
		_ = r.Body.Close()
	}()

	var eventList EventList
	if err := json.Unmarshal(body, &eventList); err != nil {
		// It might be a single event
		var singleEvent json.RawMessage
		if err := json.Unmarshal(body, &singleEvent); err == nil {
			eventList.Items = []json.RawMessage{singleEvent}
		} else {
			http.Error(w, "Invalid payload", http.StatusBadRequest)
			return
		}
	}

	s.broadcast(eventList.Items)
	w.WriteHeader(http.StatusOK)
}

func (s *Streamer) broadcast(events []json.RawMessage) {
	s.clientsMu.Lock()
	defer s.clientsMu.Unlock()

	for client := range s.clients {
		for _, event := range events {
			if MatchFilter(event, client.filter) {
				err := client.conn.WriteMessage(websocket.TextMessage, event)
				if err != nil {
					_ = client.conn.Close()
					delete(s.clients, client)

					break // break inner loop, move to next client
				}
			}
		}
	}
}

// HandleWebSocket accepts WS connections for the frontend to receive stream.
func (s *Streamer) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	// Parse filters from query string
	q := r.URL.Query()

	filter := &Filter{
		User: q.Get("user"),
		Verb: q.Get("verb"),
		Kind: q.Get("kind"),
	}
	if codeStr := q.Get("statuscode"); codeStr != "" {
		if code, err := strconv.Atoi(codeStr); err == nil {
			filter.StatusCode = code
		}
	}

	c := &clientConn{conn: conn, filter: filter}

	s.clientsMu.Lock()
	s.clients[c] = true
	s.clientsMu.Unlock()

	// Keep alive loop
	go func() {
		defer func() {
			s.clientsMu.Lock()
			delete(s.clients, c)
			s.clientsMu.Unlock()

			_ = conn.Close()
		}()

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				break
			}
		}
	}()
}
