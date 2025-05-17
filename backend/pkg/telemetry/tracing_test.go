package telemetry_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	tel "github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	semconv "go.opentelemetry.io/otel/semconv/v1.4.0"
)

func setupTracingProvider(t *testing.T) (*tracetest.SpanRecorder, *sdktrace.TracerProvider) {
	sr := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithSpanProcessor(sr),
	)

	t.Cleanup(func() {
		_ = tp.Shutdown(context.Background())
	})

	return sr, tp
}

func TestTracingMiddleware(t *testing.T) {
	sr, tp := setupTracingProvider(t)
	originalTP := otel.GetTracerProvider()
	otel.SetTracerProvider(tp)

	defer otel.SetTracerProvider(originalTP)

	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("test response"))
	})

	middleware := tel.TracingMiddleware("test-service")

	handler := middleware(testHandler)

	req := httptest.NewRequest("GET", "/test-path", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "test response", w.Body.String())

	spans := sr.Ended()
	require.Len(t, spans, 1, "Expected one span to be created")

	span := spans[0]
	assert.Equal(t, "test-service", span.Name())
	assert.NotZero(t, span.StartTime())
	assert.NotZero(t, span.EndTime())

	containsAttribute := func(key string, value interface{}) bool {
		for _, attr := range span.Attributes() {
			if string(attr.Key) == key {
				switch v := value.(type) {
				case string:
					return attr.Value.AsString() == v
				case int:
					return attr.Value.AsInt64() == int64(v)
				}
			}
		}

		return false
	}

	assert.True(t, containsAttribute("http.method", "GET"))
	assert.True(t, containsAttribute("http.target", "/test-path"))
	assert.True(t, containsAttribute("http.status_code", 200))
}

func TestTracingMiddlewareWithPropagation(t *testing.T) {
	sr, tp := setupTracingProvider(t)
	originalTP := otel.GetTracerProvider()
	otel.SetTracerProvider(tp)

	defer otel.SetTracerProvider(originalTP)

	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, span := otel.GetTracerProvider().Tracer("test").Start(r.Context(), "inner-span")
		span.End()

		w.WriteHeader(http.StatusOK)
	})

	middleware := tel.TracingMiddleware("test-service")

	handler := middleware(testHandler)

	req := httptest.NewRequest("GET", "/test-path", nil)

	ctx, parentSpan := otel.Tracer("test").Start(context.Background(), "parent-span")
	defer parentSpan.End()

	otel.GetTextMapPropagator().Inject(ctx, propagation.HeaderCarrier(req.Header))

	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	spans := sr.Ended()
	require.GreaterOrEqual(t, len(spans), 2, "Expected at least two spans to be created")

	var middlewareSpan sdktrace.ReadOnlySpan

	var innerSpan sdktrace.ReadOnlySpan

	for _, s := range spans {
		if s.Name() == "test-service" {
			middlewareSpan = s
		} else if s.Name() == "inner-span" {
			innerSpan = s
		}
	}

	require.NotNil(t, middlewareSpan, "Middleware span not found")
	require.NotNil(t, innerSpan, "Inner span not found")

	assert.Equal(t, middlewareSpan.SpanContext().TraceID(), innerSpan.SpanContext().TraceID(),
		"Inner span should share trace ID with middleware span")
}

func TestStartSpan(t *testing.T) {
	sr, tp := setupTracingProvider(t)

	ctx, span := tel.StartSpan(tp, "test-span")

	tel.AddSpanAttributes(ctx, attribute.String("test.key", "test-value"))

	span.End()

	spans := sr.Ended()
	require.Len(t, spans, 1, "Expected one span to be created")

	roSpan := spans[0]
	assert.Equal(t, "test-span", roSpan.Name())

	found := false

	for _, attr := range roSpan.Attributes() {
		if attr.Key == attribute.Key("test.key") && attr.Value.AsString() == "test-value" {
			found = true
			break
		}
	}

	assert.True(t, found, "Expected to find attribute test.key=test-value")
}

func TestAddSpanAttributes(t *testing.T) {
	sr, tp := setupTracingProvider(t)

	ctx, span := tp.Tracer("test").Start(context.Background(), "test-span")

	tel.AddSpanAttributes(ctx,
		attribute.String("string.attr", "string-value"),
		attribute.Int("int.attr", 42),
		attribute.Bool("bool.attr", true),
	)

	span.End()

	spans := sr.Ended()
	require.Len(t, spans, 1, "Expected one spans to be created")

	roSpan := spans[0]
	attrs := roSpan.Attributes()

	findAttr := func(key string) (attribute.KeyValue, bool) {
		for _, attr := range attrs {
			if string(attr.Key) == key {
				return attr, true
			}
		}

		return attribute.KeyValue{}, false
	}

	stringAttr, found := findAttr("string.attr")
	assert.True(t, found, "Expected to find string.attr")
	assert.Equal(t, "string-value", stringAttr.Value.AsString())

	intAttr, found := findAttr("int.attr")
	assert.True(t, found, "Expected to find int.attr")
	assert.Equal(t, int64(42), intAttr.Value.AsInt64())

	boolAttr, found := findAttr("bool.attr")
	assert.True(t, found, "Expected to find bool.attr")
	assert.Equal(t, true, boolAttr.Value.AsBool())
}

func TestEndSpan(t *testing.T) {
	sr, tp := setupTracingProvider(t)

	ctx, _ := tp.Tracer("test").Start(context.Background(), "test-span")

	tel.EndSpan(ctx, nil)

	spans := sr.Ended()
	require.Len(t, spans, 1, "Expected one span to be created and ended")

	events := spans[0].Events()
	for _, event := range events {
		assert.NotEqual(t, semconv.ExceptionEventName, event.Name, "Should not have exception event when error is nil")
	}

	ctx, _ = tp.Tracer("test").Start(context.Background(), "error-span")
	testErr := errors.New("test error")
	tel.EndSpan(ctx, testErr)

	spans = sr.Ended()
	require.Len(t, spans, 2, "Expected two spans to be created and ended")

	errorSpan := spans[1]

	events = errorSpan.Events()
	errorEventFound := false

	for _, event := range events {
		if event.Name == semconv.ExceptionEventName {
			errorEventFound = true
			errorMsgFound := false
			errorTypeFound := false

			for _, attr := range event.Attributes {
				if attr.Key == semconv.ExceptionMessageKey &&
					strings.Contains(attr.Value.AsString(), "test error") {
					errorMsgFound = true
				}

				if attr.Key == semconv.ExceptionTypeKey {
					errorTypeFound = true
				}
			}

			assert.True(t, errorMsgFound, "Error message should be recorded in event")
			assert.True(t, errorTypeFound, "Error type should be recorded in event")
		}
	}

	assert.True(t, errorEventFound, "Exception event should be recorded when error is provided")
}

func TestCreateSpan(t *testing.T) {
	sr, tp := setupTracingProvider(t)
	originalTP := otel.GetTracerProvider()
	otel.SetTracerProvider(tp)

	req := httptest.NewRequest(http.MethodPost, "/test/path", nil)

	defer otel.SetTracerProvider(originalTP)

	t.Run("creates span with attributes", func(t *testing.T) {
		tracerName := "attribute-tracer"
		operationName := "attribute-operation"

		attrs := []attribute.KeyValue{
			attribute.String("string.key", "string-value"),
			attribute.Int("int.key", 42),
			attribute.Bool("bool.key", true),
		}

		_, span := tel.CreateSpan(context.Background(), req, tracerName, operationName, attrs...)
		require.NotNil(t, span)
		span.End()

		spans := sr.Ended()
		require.GreaterOrEqual(t, len(spans), 1, "Expected at least one span to be created")

		lastSpan := spans[len(spans)-1]
		assert.Equal(t, operationName, lastSpan.Name())

		spanAttrs := lastSpan.Attributes()

		checkAttribute := func(key string, expectedValue interface{}) bool {
			for _, attr := range spanAttrs {
				if string(attr.Key) == key {
					switch expected := expectedValue.(type) {
					case string:
						return attr.Value.AsString() == expected
					case int:
						return attr.Value.AsInt64() == int64(expected)
					case bool:
						return attr.Value.AsBool() == expected
					}
				}
			}

			return false
		}

		assert.True(t, checkAttribute("string.key", "string-value"))
		assert.True(t, checkAttribute("int.key", 42))
		assert.True(t, checkAttribute("bool.key", true))
	})
}
