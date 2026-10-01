package telemetry

import (
	"context"
	"net/http"
	"time"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
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
	if h == nil {
		return
	}

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
	if h == nil {
		return
	}

	if h.metrics != nil && span != nil {
		span.AddEvent(msg)
		span.RecordError(err)
		span.SetStatus(codes.Error, msg)
	}
}

// RecordDuration records request duration metrics.
func (h *RequestHandler) RecordDuration(ctx context.Context, start time.Time, attrs ...attribute.KeyValue) {
	if h == nil {
		return
	}

	if h.metrics != nil {
		duration := float64(time.Since(start).Milliseconds())
		h.metrics.RequestDuration.Record(ctx, duration, metric.WithAttributes(attrs...))
	}
}

// RecordErrorCount increments error counter metrics.
func (h *RequestHandler) RecordErrorCount(ctx context.Context, attrs ...attribute.KeyValue) {
	if h == nil {
		return
	}

	if h.metrics != nil {
		h.metrics.ErrorCounter.Add(ctx, 1, metric.WithAttributes(attrs...))
	}
}

// RecordClusterProxyRequestsCount increments cluster-proxy request counter metrics.
func (h *RequestHandler) RecordClusterProxyRequestsCount(ctx context.Context, attrs ...attribute.KeyValue) {
	if h == nil {
		return
	}

	if h.metrics != nil {
		h.metrics.ClusterProxyRequests.Add(ctx, 1, metric.WithAttributes(attrs...))
	}
}

// RecordRequestCount increments request counter metrics with HTTP request details.
// It automatically adds method and path attributes from the request along with any additional attributes provided.
func (h *RequestHandler) RecordRequestCount(ctx context.Context, r *http.Request, attrs ...attribute.KeyValue) {
	if h == nil {
		return
	}

	if h.metrics != nil && h.telemetry != nil {
		h.metrics.RequestCounter.Add(ctx, 1, metric.WithAttributes(append(attrs,
			attribute.String("http.method", r.Method),
			attribute.String("http.path", r.URL.Path),
		)...))
	}
}

// RecordCacheHit increments the cache hit counter.
func (h *RequestHandler) RecordCacheHit(ctx context.Context) {
	if h == nil || h.metrics == nil {
		return
	}

	h.metrics.CacheHitCount.Add(ctx, 1)
}

// RecordCacheMiss increments the cache miss counter.
func (h *RequestHandler) RecordCacheMiss(ctx context.Context) {
	if h == nil || h.metrics == nil {
		return
	}

	h.metrics.CacheMissCount.Add(ctx, 1)
}

// RecordCacheStore increments the cache store counter.
func (h *RequestHandler) RecordCacheStore(ctx context.Context) {
	if h == nil || h.metrics == nil {
		return
	}

	h.metrics.CacheStoreCount.Add(ctx, 1)
}

// RecordCacheEviction increments the cache eviction counter.
func (h *RequestHandler) RecordCacheEviction(ctx context.Context) {
	if h == nil || h.metrics == nil {
		return
	}

	h.metrics.CacheEvictionCount.Add(ctx, 1)
}

// RecordCacheInvalidation increments the cache invalidation counter.
func (h *RequestHandler) RecordCacheInvalidation(ctx context.Context) {
	if h == nil || h.metrics == nil {
		return
	}

	h.metrics.CacheInvalidationCount.Add(ctx, 1)
}
