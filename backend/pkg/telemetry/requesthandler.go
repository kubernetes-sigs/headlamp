package telemetry

// RequestHandler encapsulates telemetry functionality for HTTP requests.
type RequestHandler struct {
	telemetry *Telemetry
	metrics   *Metrics
}

// NewRequestHandler creates a new RequestHandler instance.
func NewRequestHandler(t *Telemetry, m *Metrics) *RequestHandler {
	return &RequestHandler{
		telemetry: t,
		metrics:   m,
	}
}
