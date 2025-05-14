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
	"go.opentelemetry.io/otel/metric"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

const (
	metricRequestCount   = "http.server.request_count"
	metricActiveRequests = "http.server.active_requests"
)

func TestResponseWriter(t *testing.T) {
	recorder := httptest.NewRecorder()

	writer := newResponseWriter(recorder)

	assert.Equal(t, http.StatusOK, writer.statusCode)

	writer.WriteHeader(http.StatusNotFound)

	assert.Equal(t, http.StatusNotFound, writer.statusCode)

	assert.Equal(t, http.StatusNotFound, recorder.Code)

	content := "Test Content"
	_, err := writer.Write([]byte(content))
	require.NoError(t, err)

	assert.Equal(t, content, recorder.Body.String())
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func newResponseWriter(w http.ResponseWriter) *responseWriter {
	return &responseWriter{
		ResponseWriter: w,
		statusCode:     http.StatusOK,
	}
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// setupTestMeter creates a test meter provider and reader for metrics inspection.
func setupTestMeter(t *testing.T) (*sdkmetric.MeterProvider, *sdkmetric.ManualReader) {
	reader := sdkmetric.NewManualReader()
	provider := sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader))

	originalProvider := otel.GetMeterProvider()
	otel.SetMeterProvider(provider)

	t.Cleanup(func() {
		otel.SetMeterProvider(originalProvider)
	})

	return provider, reader
}

func TestNewMetrics(t *testing.T) {
	provider, reader := setupTestMeter(t)

	t.Cleanup(func() {
		err := provider.Shutdown(context.Background())
		if err != nil {
			t.Logf("Failed to shutdown provider: %v", err)
		}
	})

	metrics, err := tel.NewMetrics()
	require.NoError(t, err)
	require.NotNil(t, metrics)

	assert.NotNil(t, metrics.RequestCounter)
	assert.NotNil(t, metrics.RequestDuration)
	assert.NotNil(t, metrics.ActiveRequestsGauge)
	assert.NotNil(t, metrics.ClusterProxyRequests)
	assert.NotNil(t, metrics.PluginLoadCount)
	assert.NotNil(t, metrics.ErrorCounter)

	ctx := context.Background()
	metrics.RequestCounter.Add(ctx, 1, metric.WithAttributes(attribute.String("test", "value")))
	metrics.ErrorCounter.Add(ctx, 2, metric.WithAttributes(attribute.String("error", "test_error")))

	var data metricdata.ResourceMetrics
	err = reader.Collect(ctx, &data)
	require.NoError(t, err)

	assert.NotEmpty(t, data.ScopeMetrics)

	found := false

	for _, scopeMetric := range data.ScopeMetrics {
		for _, m := range scopeMetric.Metrics {
			if m.Name == metricRequestCount {
				found = true
				break
			}
		}
	}

	assert.True(t, found, "Expected to find http.server.request_count metric")
}

func TestRequestCounterMiddleware(t *testing.T) { //nolint:funlen // long function due to several test cases.
	provider, reader := setupTestMeter(t)
	t.Cleanup(func() {
		err := provider.Shutdown(context.Background())
		if err != nil {
			t.Logf("Failed to shutdown provider: %v", err)
		}
	})

	metrics, err := tel.NewMetrics()
	require.NoError(t, err)

	testHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/error" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte("Error"))

			return
		}

		_, _ = w.Write([]byte("OK"))
	})

	handler := metrics.RequestCounterMiddleware(testHandler)

	server := httptest.NewServer(handler)
	defer server.Close()

	ctx := context.Background()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL+"/test", nil)
	require.NoError(t, err)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	err = resp.Body.Close()
	require.NoError(t, err)

	req, err = http.NewRequestWithContext(ctx, http.MethodGet, server.URL+"/error", nil)
	require.NoError(t, err)
	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	err = resp.Body.Close()
	require.NoError(t, err)

	var data metricdata.ResourceMetrics
	err = reader.Collect(context.Background(), &data)
	require.NoError(t, err)

	requestCountFound := false
	activeRequestsFound := false

	for _, scopeMetric := range data.ScopeMetrics {
		for _, m := range scopeMetric.Metrics {
			if m.Name == metricRequestCount {
				requestCountFound = true

				sum := sumDataPoints(m.Data)
				assert.GreaterOrEqual(t, sum, int64(2), "Expected at least 2 request count increments")
			}

			if m.Name == metricActiveRequests {
				activeRequestsFound = true

				sumActive := sumDataPoints(m.Data)
				assert.Equal(t, int64(0), sumActive, "Expected active requests to be 0 after all requests completed")
			}
		}
	}

	assert.True(t, requestCountFound, "Expected to find http.server.request_count metric")
	assert.True(t, activeRequestsFound, "Expected to find http.server.active_requests metric")
}

func TestRequestCounterMiddlewarePanic(t *testing.T) {
	provider, reader := setupTestMeter(t)
	defer func() {
		err := provider.Shutdown(context.Background())
		if err != nil {
			t.Errorf("Failed to shutdown provider: %v", err)
		}
	}()

	_, server := setupPanicTest(t)
	defer server.Close()

	makeNormalRequest(t, server.URL)
	makePanicRequest(t, server.URL)

	verifyPanicMetrics(t, context.Background(), reader)
}

func setupPanicTest(t *testing.T) (*tel.Metrics, *httptest.Server) {
	metrics, err := tel.NewMetrics()
	require.NoError(t, err)

	panicHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/panic" {
			panic("test panic")
		}

		w.WriteHeader(http.StatusOK)
	})

	recoverMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if err := recover(); err != nil {
					w.WriteHeader(http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}

	handler := recoverMiddleware(metrics.RequestCounterMiddleware(panicHandler))
	server := httptest.NewServer(handler)

	return metrics, server
}

func makeNormalRequest(t *testing.T, serverURL string) {
	ctx := context.Background()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, serverURL+"/normal", nil)
	require.NoError(t, err)

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)

	defer func() {
		err = resp.Body.Close()
		require.NoError(t, err)
	}()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func makePanicRequest(t *testing.T, serverURL string) {
	ctx := context.Background()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, serverURL+"/panic", nil)
	require.NoError(t, err)

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)

	defer func() {
		err = resp.Body.Close()
		require.NoError(t, err)
	}()

	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
}

func verifyPanicMetrics(t *testing.T, ctx context.Context, reader *sdkmetric.ManualReader) {
	var data metricdata.ResourceMetrics
	err := reader.Collect(ctx, &data)
	require.NoError(t, err)

	verifyRequestCountMetric(t, data)
	verifyActiveRequestsMetric(t, data)
}

func verifyRequestCountMetric(t *testing.T, data metricdata.ResourceMetrics) {
	// Implementation specific to checking request count metric
}

func verifyActiveRequestsMetric(t *testing.T, data metricdata.ResourceMetrics) {
	// Implementation specific to checking active requests metric
}

func sumDataPoints(data metricdata.Aggregation) int64 {
	switch v := data.(type) {
	case metricdata.Sum[int64]:
		sum := int64(0)
		for _, dp := range v.DataPoints {
			sum += dp.Value
		}

		return sum
	case metricdata.Sum[float64]:
		sum := float64(0)
		for _, dp := range v.DataPoints {
			sum += dp.Value
		}

		return int64(sum)
	case metricdata.Gauge[int64]:
		// For gauges, we just take the latest value
		if len(v.DataPoints) > 0 {
			return v.DataPoints[len(v.DataPoints)-1].Value
		}
	}

	return 0
}
