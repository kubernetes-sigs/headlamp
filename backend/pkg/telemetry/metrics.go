package telemetry

import (
	"net/http"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// Metrics represents a collection of standardized application metrics.
// It encapsulates various counters, gauges, and histograms for tracking
// application performance and behavior.
type Metrics struct {
	// RequestCounter tracks the total number of HTTP requests
	RequestCounter metric.Int64Counter
	// RequestDuration measures the distribution of HTTP request durations
	RequestDuration metric.Float64Histogram
	// ActiveRequestsGauge tracks the number of currently active HTTP requests
	ActiveRequestsGauge metric.Int64UpDownCounter
	// ClusterProxyRequests counts requests made through the cluster proxy
	ClusterProxyRequests metric.Int64Counter
	// PluginLoadCount tracks the number of plugin loads
	PluginLoadCount metric.Int64Counter
	// PluginDeleteCount tracks the number of plugin deletions
	PluginDeleteCount metric.Int64Counter
	// ErrorCounter counts application errors by category
	ErrorCounter metric.Int64Counter
	// KubeconfigRefreshCounter tracks the number of kubeconfig refresh operations
	KubeconfigRefreshCounter metric.Int64Counter
}

// NewMetrics creates and registers a set of common application metrics.
// It initializes metrics for HTTP request counting, duration tracking,
// active request monitoring, cluster proxy usage, plugin loading, and error counting.
// The returned metrics instance can be used throughout the application to record metrics data.
func NewMetrics() (*Metrics, error) {
	meter := otel.Meter("headlamp")

	metrics := &Metrics{}

	if err := initRequestMetrics(meter, metrics); err != nil {
		return nil, err
	}

	if err := initApplicationMetrics(meter, metrics); err != nil {
		return nil, err
	}

	return metrics, nil
}

// initRequestMetrics initializes HTTP request-related metrics.
func initRequestMetrics(meter metric.Meter, metrics *Metrics) error {
	var err error

	metrics.RequestCounter, err = meter.Int64Counter(
		"http.server.request_count",
		metric.WithDescription("Total number of HTTP requests"),
	)
	if err != nil {
		return err
	}

	metrics.RequestDuration, err = meter.Float64Histogram(
		"http.server.duration",
		metric.WithDescription("Duration of HTTP requests"),
		metric.WithUnit("ms"),
	)
	if err != nil {
		return err
	}

	metrics.ActiveRequestsGauge, err = meter.Int64UpDownCounter(
		"http.server.active_requests",
		metric.WithDescription("Number of active HTTP requests"),
	)
	if err != nil {
		return err
	}

	metrics.ClusterProxyRequests, err = meter.Int64Counter(
		"headlamp.cluster_proxy.requests",
		metric.WithDescription("Total number of cluster proxy requests"),
	)
	if err != nil {
		return err
	}

	return nil
}

// initApplicationMetrics initializes Headlamp-specific application metrics.
func initApplicationMetrics(meter metric.Meter, metrics *Metrics) error {
	var err error

	metrics.PluginLoadCount, err = meter.Int64Counter(
		"headlamp.plugin.load_count",
		metric.WithDescription("Number of plugin loads"),
	)
	if err != nil {
		return err
	}

	metrics.PluginDeleteCount, err = meter.Int64Counter(
		"headlamp.plugin.delete_count",
		metric.WithDescription("Number of plugin deletions"),
	)
	if err != nil {
		return err
	}

	metrics.ErrorCounter, err = meter.Int64Counter(
		"headlamp.errors",
		metric.WithDescription("Count of errors"),
	)
	if err != nil {
		return err
	}

	return nil
}

// RequestCounterMiddleware creates HTTP middleware that tracks request metrics.
func (m *Metrics) RequestCounterMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.ActiveRequestsGauge.Add(r.Context(), 1)

		wrapper := newResponseWriter(w)

		defer func() {
			attrs := []attribute.KeyValue{
				attribute.String("http.method", r.Method),
				attribute.String("http.target", r.URL.Path),
				attribute.Int("http.status_code", wrapper.statusCode),
			}

			if rec := recover(); rec != nil {
				wrapper.statusCode = http.StatusInternalServerError
				attrs[2] = attribute.Int("http.status_code", http.StatusInternalServerError)

				m.RequestCounter.Add(r.Context(), 1, metric.WithAttributes(attrs...))

				m.ActiveRequestsGauge.Add(r.Context(), -1)

				panic(rec)
			}

			m.RequestCounter.Add(r.Context(), 1, metric.WithAttributes(attrs...))

			m.ActiveRequestsGauge.Add(r.Context(), -1)
		}()

		next.ServeHTTP(wrapper, r)
	})
}

// responseWriter is a custom implementation of http.ResponseWriter that
// captures the status code of the response for metrics collection.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

// newResponseWriter creates a new responseWriter instance that wraps an existing http.ResponseWriter.
// The status code defaults to http.StatusOK (200) and is updated when WriteHeader is called.
func newResponseWriter(w http.ResponseWriter) *responseWriter {
	return &responseWriter{
		ResponseWriter: w,
		statusCode:     http.StatusOK,
	}
}

// WriteHeader overrides the http.ResponseWriter WriteHeader method to
// capture the response status code before delegating to the wrapped ResponseWriter.
// This method updates the internal statusCode field and then calls ethe wrapped ResponseWriter's WriteHeader method.
func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}
