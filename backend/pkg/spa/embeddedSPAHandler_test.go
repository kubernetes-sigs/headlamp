package spa_test

import (
	"context"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/spa"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Helper function to create test filesystem.
func createTestFS(files map[string]*fstest.MapFile) fs.FS {
	return fstest.MapFS(files)
}

func TestEmbeddedSpaHandler(t *testing.T) {
	t.Run("check_headlampBaseUrl_is_set_to_baseURL", func(t *testing.T) {
		handler := spa.NewEmbeddedHandler(createTestFS(map[string]*fstest.MapFile{
			"static/index.html": {Data: []byte("headlampBaseUrl = './';")},
		}), "index.html", "/headlamp")

		req, err := http.NewRequestWithContext(context.Background(), "GET", "/headlamp/index.html", nil)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Equal(t, "headlampBaseUrl = '/headlamp';", rr.Body.String())
	})

	t.Run("check_empty_path_returns_index.html", func(t *testing.T) {
		handler := spa.NewEmbeddedHandler(createTestFS(map[string]*fstest.MapFile{
			"static/index.html": {Data: []byte("headlampBaseUrl = './';")},
		}), "index.html", "/")

		req, err := http.NewRequestWithContext(context.Background(), "GET", "/headlamp/", nil)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Equal(t, "headlampBaseUrl = './';", rr.Body.String())
	})

	t.Run("file_not_found", func(t *testing.T) {
		handler := spa.NewEmbeddedHandler(createTestFS(map[string]*fstest.MapFile{
			"static/index.html": {Data: []byte("headlampBaseUrl = './';")},
		}), "index.html", "/headlamp")

		req, err := http.NewRequestWithContext(context.Background(), "GET", "/headlamp/not-found.html", nil)
		require.NoError(t, err)

		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		assert.Equal(t, http.StatusOK, rr.Code)
		assert.Equal(t, "headlampBaseUrl = './';", rr.Body.String())
	})
}
