package telemetry

import (
	"fmt"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// StartMetricsServer initializes and starts an HTTP server that exposes
// application metrics in Prometheus format on the /metrics endpoint.
// The server runs in a separate goroutine and doesn't block the caller.
// It's the caller's responsibility to shut down the server when appropriate.
func StartMetricsServer(port int) (*http.Server, error) {
	if port <= 0 {
		return nil, fmt.Errorf("invalid port for metrics server: %d", port)
	}

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", port),
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
	}

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("Error starting metrics server: %v\n", err)
		}
	}()

	fmt.Printf("Metrics server started on port %d\n", port)

	return server, nil
}

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
}

// NewMetrics creates and registers a set of common application metrics.
// It initializes metrics for HTTP request counting, duration tracking,
// active request monitoring, cluster proxy usage, plugin loading, and error counting.
// The returned metrics instance can be used throughout the application to record metrics data.
func NewMetrics() (*Metrics, error) { //nolint:funlen
	meter := otel.Meter("headlamp")

	requestCounter, err := meter.Int64Counter(
		"http.server.request_count",
		metric.WithDescription("Total number of HTTP requests"),
	)
	if err != nil {
		return nil, err
	}

	requestDuration, err := meter.Float64Histogram(
		"http.server.duration",
		metric.WithDescription("Duration of HTTP requests"),
		metric.WithUnit("ms"),
	)
	if err != nil {
		return nil, err
	}

	activeRequests, err := meter.Int64UpDownCounter(
		"http.server.active_requests",
		metric.WithDescription("Number of active HTTP requests"),
	)
	if err != nil {
		return nil, err
	}

	clusterProxyRequests, err := meter.Int64Counter(
		"headlamp.cluster_proxy.requests",
		metric.WithDescription("Total number of cluster proxy requests"),
	)
	if err != nil {
		return nil, err
	}

	pluginLoadCount, err := meter.Int64Counter(
		"headlamp.plugin.load_count",
		metric.WithDescription("Number of plugin loads"),
	)
	if err != nil {
		return nil, err
	}

	pluginDeleteCount, err := meter.Int64Counter(
		"headlamp.plugin.delete_count",
		metric.WithDescription("Number of plugin deletions"),
	)
	if err != nil {
		return nil, err
	}

	errorCounter, err := meter.Int64Counter(
		"headlamp.errors",
		metric.WithDescription("Count of errors"),
	)
	if err != nil {
		return nil, err
	}

	return &Metrics{
		RequestCounter:       requestCounter,
		RequestDuration:      requestDuration,
		ActiveRequestsGauge:  activeRequests,
		ClusterProxyRequests: clusterProxyRequests,
		PluginLoadCount:      pluginLoadCount,
		PluginDeleteCount:    pluginDeleteCount,
		ErrorCounter:         errorCounter,
	}, nil
}

// RequestCounterMiddleware creates HTTP middleware that tracks request metrics.
// The middleware:
// 1. Increments the active requests gauge when a request starts.
// 2. Records the request count with method and path attributes.
// 3. Captures the response status code.
// 4. Decrements the active requests gauge when the request completes.
func (m *Metrics) RequestCounterMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.ActiveRequestsGauge.Add(r.Context(), 1)

		attrs := []attribute.KeyValue{
			attribute.String("http.method", r.Method),
			attribute.String("http.target", r.URL.Path),
		}

		m.RequestCounter.Add(r.Context(), 1, metric.WithAttributes(attrs...))

		wrapper := newResponseWriter(w)

		next.ServeHTTP(wrapper, r)

		statusAttr := attribute.Int("http.status_code", wrapper.statusCode)
		m.RequestCounter.Add(r.Context(), 1, metric.WithAttributes(append(attrs, statusAttr)...))

		m.ActiveRequestsGauge.Add(r.Context(), -1)
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
