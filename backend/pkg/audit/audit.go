package audit

// AuditEvent represents a single audit log entry.
type AuditEvent struct {
	User       string `json:"user"`
	Verb       string `json:"verb"`
	Resource   string `json:"resource"`
	StatusCode int    `json:"statusCode"`
	Timestamp  string `json:"timestamp"`
	Message    string `json:"message"`
}

// Filter defines criteria for filtering audit events.
type Filter struct {
	User       string
	Verb       string
	Resource   string
	StatusCode int
}

// Match checks if an AuditEvent matches the given filter criteria.
func (f Filter) Match(event AuditEvent) bool {
	if f.User != "" && f.User != event.User {
		return false
	}

	if f.Verb != "" && f.Verb != event.Verb {
		return false
	}

	if f.Resource != "" && f.Resource != event.Resource {
		return false
	}

	if f.StatusCode != 0 && f.StatusCode != event.StatusCode {
		return false
	}

	return true
}

// Streamer is an interface for streaming audit logs from different sources.
type Streamer interface {
	Stream(filter Filter, ch chan<- AuditEvent) error
}
