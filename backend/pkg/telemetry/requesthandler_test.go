package telemetry_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	tel "github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
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

func TestRecordError(t *testing.T) {
	t.Run("handles nil span", func(t *testing.T) {
		metrics := &tel.Metrics{}
		handler := tel.NewRequestHandler(nil, metrics)
		handler.RecordError(nil, errors.New("test error"), "test error message")
	})

	t.Run("handles nil error", func(t *testing.T) {
		handler, sr := setupTest(t)
		_, span := testSpan()
		handler.RecordError(span, nil, "test error message")
		span.End()

		spans := sr.Ended()
		require.Len(t, spans, 1)
		assert.Equal(t, codes.Error, spans[0].Status().Code)
		assert.Equal(t, "test error message", spans[0].Status().Description)
	})

	t.Run("records error with message", func(t *testing.T) {
		handler, sr := setupTest(t)
		_, span := testSpan()
		handler.RecordError(span, errors.New("test error"), "error occurred")
		span.End()

		spans := sr.Ended()
		require.Len(t, spans, 1)
		require.GreaterOrEqual(t, len(spans[0].Events()), 2)
		assert.Equal(t, codes.Error, spans[0].Status().Code)
		assert.Equal(t, "error occurred", spans[0].Status().Description)

		var errorEvent *sdktrace.Event

		for _, event := range spans[0].Events() {
			if event.Name == "exception" {
				errorEvent = &event
				break
			}
		}

		require.NotNil(t, errorEvent, "Error event should be recorded")

		hasErrorType := false
		hasErrorMessage := false

		for _, attr := range errorEvent.Attributes {
			switch string(attr.Key) {
			case "exception.type":
				assert.Equal(t, "*errors.errorString", attr.Value.AsString())

				hasErrorType = true
			case "exception.message":
				assert.Equal(t, "test error", attr.Value.AsString())

				hasErrorMessage = true
			}
		}

		assert.True(t, hasErrorType, "Error type attribute should be present")
		assert.True(t, hasErrorMessage, "Error message attribute should be present")
	})
}

func TestRecordDuration(t *testing.T) {
	t.Run("records duration without attributes", func(t *testing.T) {
		metrics := setupMetrics(t)
		handler := tel.NewRequestHandler(nil, metrics)
		ctx := context.Background()
		start := time.Now()

		time.Sleep(10 * time.Millisecond)

		assert.NotPanics(t, func() {
			handler.RecordDuration(ctx, start)
		})
	})

	t.Run("records duration with attributes", func(t *testing.T) {
		metrics := setupMetrics(t)
		handler := tel.NewRequestHandler(nil, metrics)
		ctx := context.Background()
		start := time.Now()

		time.Sleep(10 * time.Millisecond)
		handler.RecordDuration(ctx, start, attribute.String("operation", "test"),
			attribute.Int("status", 200))
	})

	t.Run("handles nil metrics", func(t *testing.T) {
		handler := tel.NewRequestHandler(nil, nil)
		ctx := context.Background()
		start := time.Now()

		assert.NotPanics(t, func() {
			handler.RecordDuration(ctx, start)
		})
	})

	t.Run("handles zero duration", func(t *testing.T) {
		metrics := setupMetrics(t)
		handler := tel.NewRequestHandler(nil, metrics)
		ctx := context.Background()
		start := time.Now()

		assert.NotPanics(t, func() {
			handler.RecordDuration(ctx, start)
		})
	})
}

func TestRecordErrorCount(t *testing.T) {
	t.Run("increments error counter without attributes", func(t *testing.T) {
		metrics := setupMetrics(t)
		handler := tel.NewRequestHandler(nil, metrics)
		ctx := context.Background()

		assert.NotPanics(t, func() {
			handler.RecordErrorCount(ctx)
		})
	})

	t.Run("increments error counter with attributes", func(t *testing.T) {
		metrics := setupMetrics(t)
		handler := tel.NewRequestHandler(nil, metrics)
		ctx := context.Background()

		attrs := []attribute.KeyValue{
			attribute.String("error_type", "validation"),
			attribute.Int("status_code", 400),
		}

		assert.NotPanics(t, func() {
			handler.RecordErrorCount(ctx, attrs...)
		})
	})

	t.Run("handles nil metrics", func(t *testing.T) {
		handler := tel.NewRequestHandler(nil, nil)
		ctx := context.Background()

		assert.NotPanics(t, func() {
			handler.RecordErrorCount(ctx)
		})
	})

	t.Run("handles multiple increments", func(t *testing.T) {
		metrics := setupMetrics(t)
		handler := tel.NewRequestHandler(nil, metrics)
		ctx := context.Background()

		assert.NotPanics(t, func() {
			for i := 0; i < 3; i++ {
				handler.RecordErrorCount(ctx)
			}
		})
	})
}

func setupMetrics(t *testing.T) *tel.Metrics {
	metrics, err := tel.NewMetrics()
	require.NoError(t, err)

	return metrics
}

func TestRecordRequestCount(t *testing.T) {
	t.Run("records request count with default attributes", func(t *testing.T) {
		metrics := setupMetrics(t)
		handler := tel.NewRequestHandler(nil, metrics)
		req := httptest.NewRequest(http.MethodGet, "/test/path", nil)
		ctx := req.Context()

		assert.NotPanics(t, func() {
			handler.RecordRequestCount(ctx, req)
		})
	})

	t.Run("records request count with additional attributes", func(t *testing.T) {
		metrics := setupMetrics(t)
		handler := tel.NewRequestHandler(nil, metrics)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/resource", nil)
		ctx := req.Context()

		attrs := []attribute.KeyValue{
			attribute.String("user_id", "test-user"),
			attribute.String("resource_type", "test-resource"),
		}

		assert.NotPanics(t, func() {
			handler.RecordRequestCount(ctx, req, attrs...)
		})
	})

	t.Run("handles nil metrics", func(t *testing.T) {
		handler := tel.NewRequestHandler(nil, nil)
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		ctx := req.Context()

		assert.NotPanics(t, func() {
			handler.RecordRequestCount(ctx, req)
		})
	})

	t.Run("handles nil request", func(t *testing.T) {
		metrics := setupMetrics(t)
		handler := tel.NewRequestHandler(nil, metrics)
		ctx := context.Background()

		assert.NotPanics(t, func() {
			handler.RecordRequestCount(ctx, nil)
		})
	})

	t.Run("handles multiple requests", func(t *testing.T) {
		metrics := setupMetrics(t)
		handler := tel.NewRequestHandler(nil, metrics)
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		ctx := req.Context()

		assert.NotPanics(t, func() {
			for i := 0; i < 3; i++ {
				handler.RecordRequestCount(ctx, req)
			}
		})
	})
}
