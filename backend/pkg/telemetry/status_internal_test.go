package telemetry

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResponseWriterCommittedStatus(t *testing.T) {
	for _, test := range []struct {
		name  string
		write func(http.ResponseWriter)
		want  int
	}{
		{"explicit", func(w http.ResponseWriter) { w.WriteHeader(http.StatusNotFound) }, http.StatusNotFound},
		{"duplicate header", func(w http.ResponseWriter) {
			w.WriteHeader(http.StatusCreated)
			w.WriteHeader(http.StatusInternalServerError)
		}, http.StatusCreated},
		{"implicit header", func(w http.ResponseWriter) {
			_, _ = io.WriteString(w, "body")
			w.WriteHeader(http.StatusInternalServerError)
		}, http.StatusOK},
		{"informational then final", func(w http.ResponseWriter) {
			w.WriteHeader(http.StatusEarlyHints)
			w.WriteHeader(http.StatusNoContent)
		}, http.StatusNoContent},
		{"informational then implicit", func(w http.ResponseWriter) {
			w.WriteHeader(http.StatusEarlyHints)
			_, _ = io.WriteString(w, "body")
		}, http.StatusOK},
		{"flush commits header", func(w http.ResponseWriter) {
			assert.NoError(t, http.NewResponseController(w).Flush())
			w.WriteHeader(http.StatusInternalServerError)
		}, http.StatusOK},
	} {
		t.Run(test.name, func(t *testing.T) {
			recorded := make(chan int, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				writer := newResponseWriter(w)
				test.write(writer)
				recorded <- writer.statusCode
			}))
			defer server.Close()

			request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, server.URL, nil)
			require.NoError(t, err)
			response, err := server.Client().Do(request)
			require.NoError(t, err)
			defer func() { require.NoError(t, response.Body.Close()) }()
			_, err = io.Copy(io.Discard, response.Body)
			require.NoError(t, err)
			assert.Equal(t, test.want, response.StatusCode)
			assert.Equal(t, response.StatusCode, <-recorded, "metric status must match the HTTP response")
		})
	}
}
