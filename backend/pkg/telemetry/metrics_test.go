package telemetry

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStartMetricsServer(t *testing.T) {
	port := 9090

	server, err := StartMetricsServer(port)
	require.NoError(t, err)
	require.NotNil(t, server)

	time.Sleep(100 * time.Millisecond)

	resp, err := http.Get(fmt.Sprintf("http://localhost:%d/metrics", port))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	assert.Contains(t, string(body), "# HELP")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	assert.NoError(t, server.Shutdown(ctx))
}

// TestResponseWriter tests the custom response writer implementation
func TestResponseWriter(t *testing.T) {
	recorder := httptest.NewRecorder()

	writer := newResponseWriter(recorder)

	assert.Equal(t, http.StatusOK, writer.statusCode)

	// Write a header with a different status
	writer.WriteHeader(http.StatusNotFound)

	// Status should be updated
	assert.Equal(t, http.StatusNotFound, writer.statusCode)

	// The underlying ResponseWriter should also receive the status
	assert.Equal(t, http.StatusNotFound, recorder.Code)

	// Write some content
	content := "Test Content"
	_, err := writer.Write([]byte(content))
	require.NoError(t, err)

	// Content should be written to the underlying ResponseWriter
	assert.Equal(t, content, recorder.Body.String())
}
