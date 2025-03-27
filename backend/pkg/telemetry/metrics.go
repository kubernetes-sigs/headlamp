package telemetry

import (
	"fmt"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
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
	// ErrorCounter counts application errors by category
	ErrorCounter metric.Int64Counter
}
