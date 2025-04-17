package telemetry

import (
	"context"
	"net/http"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

// TracingMiddleware creates an HTTP middleware that automatically instruments
// HTTP handlers with OpenTelemetry tracing.
// The middleware creates spans for each HTTP request, propagates trace context
// across service boundaries, and records request and response details as span events.
func TracingMiddleware(serviceName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return otelhttp.NewHandler(next, serviceName,
			otelhttp.WithMessageEvents(otelhttp.ReadEvents, otelhttp.WriteEvents),
			otelhttp.WithPropagators(propagation.NewCompositeTextMapPropagator(
				propagation.TraceContext{},
				propagation.Baggage{},
			)),
		)
	}
}

// StartSpan starts a new span with the given name and returns the context with the span.
// This function creates a span using the specified TracerProvider, which enables proper
// span attribution to the correct service or component. The context returned contains the created span,
// which can be used for further tracing operations.
func StartSpan(tp trace.TracerProvider, name string, opts ...trace.SpanStartOption) (context.Context, trace.Span) {
	tracer := tp.Tracer("headlamp")
	return tracer.Start(context.Background(), name, opts...)
}

// AddSpanAttributes adds attributes to the current span in the context.
//
// Attributes provide additional information about the operation being performed,
// such as request parameters, database query details, or any other relevant metadata.
// This function extracts the span from the context and sets the provided attributes.
func AddSpanAttributes(ctx context.Context, attributes ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	span.SetAttributes(attributes...)
}

// EndSpan ends the current span in the context.
// This function should be called when an operation completes to finalize the span.
// If an error is provided, it will be recorded in the span with appropriate attributes.
// Typically used in a defer statement following StartSpan.
func EndSpan(ctx context.Context, err error) {
	span := trace.SpanFromContext(ctx)
	if err != nil {
		span.RecordError(err)
	}

	span.End()
}

// GetTracer returns a named tracer.
// A tracer is used to create spans for tracing operations. Each tracer can be
// named to indicate which component or module is creating the spans, allowing
// for better organization in tracing backends.
func GetTracer(name string) trace.Tracer {
	return otel.Tracer(name)
}
