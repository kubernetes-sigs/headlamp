package telemetry

import (
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

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

// RecordEvent records a telemetry event with optional attributes.
func (h *RequestHandler) RecordEvent(span trace.Span, msg string, attrs ...attribute.KeyValue) {
	if h.telemetry != nil && span != nil {
		if len(attrs) > 0 {
			span.AddEvent(msg, trace.WithAttributes(attrs...))
		} else {
			span.AddEvent(msg)
		}
	}
}

// RecordError records an error event in telemetry.
func (h *RequestHandler) RecordError(span trace.Span, err error, msg string) {
	if h.metrics != nil && span != nil {
		span.AddEvent(msg)
		span.RecordError(err)
		span.SetStatus(codes.Error, msg)
	}
}
