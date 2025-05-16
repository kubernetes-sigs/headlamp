package telemetry_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	tel "github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"go.opentelemetry.io/otel/trace"
)

func TestNewRequestHandler(t *testing.T) {
	telemetry := &tel.Telemetry{}
	metrics := &tel.Metrics{}

	handler := tel.NewRequestHandler(telemetry, metrics)

	if handler == nil {
		t.Errorf("Expected non-nil RequestHandler, got nil")
	}
}

func testSpan() (context.Context, trace.Span) {
	req := httptest.NewRequest(http.MethodPost, "http://example.com/test/path", nil)
	ctx := req.Context()

	tracer := otel.GetTracerProvider().Tracer("test-tracer")
	ctx, span := tracer.Start(ctx, "test-span")

	return ctx, span
}

func setupTest(t *testing.T) (*tel.RequestHandler, *tracetest.SpanRecorder) {
	sr, tp := setupTracingProvider(t)
	originalTP := otel.GetTracerProvider()
	otel.SetTracerProvider(tp)
	t.Cleanup(func() {
		otel.SetTracerProvider(originalTP)
	})

	telemetry := &tel.Telemetry{}
	metrics := &tel.Metrics{}
	handler := tel.NewRequestHandler(telemetry, metrics)

	return handler, sr
}

func TestRecordEvent(t *testing.T) {
	t.Run("handles nil span", func(t *testing.T) {
		handler, _ := setupTest(t)
		handler.RecordEvent(nil, "test RecordEvent")
	})

	t.Run("handles nil telemetry", func(t *testing.T) {
		handler := tel.NewRequestHandler(nil, &tel.Metrics{})
		_, span := testSpan()
		handler.RecordEvent(span, "test RecordEvent")
	})

	t.Run("records event without attributes", func(t *testing.T) {
		handler, sr := setupTest(t)
		_, span := testSpan()
		handler.RecordEvent(span, "test RecordEvent")
		span.End()

		spans := sr.Ended()
		require.Len(t, spans, 1, "Expected one span")

		events := spans[0].Events()
		require.Len(t, events, 1, "Expected one event")
		assert.Equal(t, "test RecordEvent", events[0].Name)
	})

	t.Run("records event with attributes", func(t *testing.T) {
		handler, sr := setupTest(t)
		_, span := testSpan()
		handler.RecordEvent(span, "test RecordEvent", attribute.String("key1", "value1"),
			attribute.Int("key2", 42))
		span.End()

		spans := sr.Ended()
		require.Len(t, spans, 1, "Expected one span")

		events := spans[0].Events()
		require.Len(t, events, 1, "Expected one event")
		assert.Equal(t, "test RecordEvent", events[0].Name)

		eventAttrs := events[0].Attributes
		require.Len(t, eventAttrs, 2, "Expected two attributes")

		foundAttrs := make(map[string]bool)

		for _, attr := range eventAttrs {
			switch string(attr.Key) {
			case "key1":
				assert.Equal(t, "value1", attr.Value.AsString())

				foundAttrs["key1"] = true
			case "key2":
				assert.Equal(t, int64(42), attr.Value.AsInt64())

				foundAttrs["key2"] = true
			}
		}

		assert.Len(t, foundAttrs, 2, "Not all expected attributes were found")
	})
}
