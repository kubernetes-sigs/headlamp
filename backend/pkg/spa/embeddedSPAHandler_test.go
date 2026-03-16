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

// getTestHTML returns the test HTML content used across tests.
func getTestHTML() string {
	return `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Headlamp</title>
    <script>
        // handles both webpack and rspack build systems
        __baseUrl__ = './<%= BASE_URL %>'.replace('%BASE_' + 'URL%', '').replace('<' + '%= BASE_URL %>', '');
        // the syntax of the following line is special - it will be matched and replaced by the server
        // if a base URL is set by the server
        headlampBaseUrl = __baseUrl__;
    </script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`
}

func TestEmbeddedSpaHandler(t *testing.T) {
	testHTML := getTestHTML()

	t.Run("check_headlampBaseUrl_is_set_to_baseURL", func(t *testing.T) {
		testHeadlampBaseURLWithBaseURL(t, testHTML)
	})

	t.Run("check_empty_path_returns_index.html", func(t *testing.T) {
		testEmptyPathReturnsIndex(t, testHTML)
	})

	t.Run("file_not_found", func(t *testing.T) {
		testFileNotFound(t, testHTML)
	})
}

func testHeadlampBaseURLWithBaseURL(t *testing.T, testHTML string) {
	handler := spa.NewEmbeddedHandler(createTestFS(map[string]*fstest.MapFile{
		"static/index.html": {Data: []byte(testHTML)},
	}), "index.html", "/headlamp")

	req, err := http.NewRequestWithContext(context.Background(), "GET", "/headlamp/index.html", nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	// Check that the __baseUrl__ assignment was replaced
	assert.Contains(t, rr.Body.String(), "__baseUrl__ = '/headlamp';")
	assert.Contains(t, rr.Body.String(), "headlampBaseUrl = __baseUrl__;")
}

func testEmptyPathReturnsIndex(t *testing.T, testHTML string) {
	handler := spa.NewEmbeddedHandler(createTestFS(map[string]*fstest.MapFile{
		"static/index.html": {Data: []byte(testHTML)},
	}), "index.html", "/")

	req, err := http.NewRequestWithContext(context.Background(), "GET", "/headlamp/", nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	// When baseURL is "/", the replacement should happen and __baseUrl__ should be set to "/"
	assert.Contains(t, rr.Body.String(), "__baseUrl__ = '/';")
	assert.Contains(t, rr.Body.String(), "headlampBaseUrl = __baseUrl__;")
}

func testFileNotFound(t *testing.T, testHTML string) {
	handler := spa.NewEmbeddedHandler(createTestFS(map[string]*fstest.MapFile{
		"static/index.html": {Data: []byte(testHTML)},
	}), "index.html", "/headlamp")

	req, err := http.NewRequestWithContext(context.Background(), "GET", "/headlamp/not-found.html", nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	// Check that the __baseUrl__ assignment was replaced in fallback case
	assert.Contains(t, rr.Body.String(), "__baseUrl__ = '/headlamp';")
	assert.Contains(t, rr.Body.String(), "headlampBaseUrl = __baseUrl__;")
}
