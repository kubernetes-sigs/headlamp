package spa_test

import (
	"context"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/spa"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// writeFile is a small helper to create an arbitrary file under dir.
func writeFile(t *testing.T, dir, name string, content []byte) {
	t.Helper()

	full := filepath.Join(dir, name)
	require.NoError(t, os.MkdirAll(filepath.Dir(full), 0o750))
	require.NoError(t, os.WriteFile(full, content, 0o600))
}

// TestSpaHandlerServesPrecompressedSidecar verifies that the on-disk
// spaHandler picks the brotli sidecar when it exists and the client
// advertises support, and falls back to identity when it doesn't.
func TestSpaHandlerServesPrecompressedSidecar(t *testing.T) {
	dir := t.TempDir()

	originalJS := []byte("// big readable javascript here\n" +
		"function hello() { console.log('hi'); }\n")
	brBytes := []byte("BROTLI-PAYLOAD") // contents are arbitrary; handler must not decode them

	writeFile(t, dir, "index.html", []byte("the-index"))
	writeFile(t, dir, "app.js", originalJS)
	writeFile(t, dir, "app.js.br", brBytes)

	handler := spa.NewHandler(dir, "index.html", "/headlamp")

	tests := []struct {
		name           string
		acceptEncoding string
		wantBody       []byte
		wantEncoding   string
	}{
		{"prefers brotli when offered", "br, gzip", brBytes, "br"},
		{"identity when client only offers gzip", "gzip", originalJS, ""},
		{"explicit brotli only", "br", brBytes, "br"},
		{"identity when no encoding header", "", originalJS, ""},
		{"identity when brotli is disabled", "br;q=0", originalJS, ""},
		{"brotli via wildcard", "*", brBytes, "br"},
		{"q=0 for br with wildcard later still disables br", "br;q=0, *;q=0.5", originalJS, ""},
		{"unsupported encoding falls through to identity", "deflate", originalJS, ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequestWithContext(
				context.Background(), "GET", "/headlamp/app.js", nil)
			require.NoError(t, err)

			if tc.acceptEncoding != "" {
				req.Header.Set("Accept-Encoding", tc.acceptEncoding)
			}

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			assert.Equal(t, http.StatusOK, rr.Code)
			assert.Equal(t, string(tc.wantBody), rr.Body.String())
			assert.Equal(t, tc.wantEncoding, rr.Header().Get("Content-Encoding"))
			// Vary must always be present so caches keep per-encoding entries.
			assert.Contains(t, rr.Header().Get("Vary"), "Accept-Encoding")
			// Content-Type must reflect the original (.js) regardless of encoding.
			assert.Contains(t, rr.Header().Get("Content-Type"), "javascript")
		})
	}
}

// TestSpaHandlerNoSidecarUsesIdentity ensures we don't break files that
// don't have a precompressed sidecar even when the client supports brotli.
func TestSpaHandlerNoSidecarUsesIdentity(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, dir, "index.html", []byte("the-index"))
	writeFile(t, dir, "small.css", []byte(".x{}"))

	handler := spa.NewHandler(dir, "index.html", "/headlamp")

	req, err := http.NewRequestWithContext(
		context.Background(), "GET", "/headlamp/small.css", nil)
	require.NoError(t, err)
	req.Header.Set("Accept-Encoding", "br")

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, ".x{}", rr.Body.String())
	assert.Empty(t, rr.Header().Get("Content-Encoding"))
	assert.Contains(t, rr.Header().Get("Vary"), "Accept-Encoding")
}

// TestEmbeddedSpaHandlerServesPrecompressedSidecar verifies the embed.FS
// handler does the same brotli negotiation for non-index assets.
func TestEmbeddedSpaHandlerServesPrecompressedSidecar(t *testing.T) {
	files := map[string]*fstest.MapFile{
		"static/index.html": {Data: []byte(getTestHTML())},
		"static/app.js":     {Data: []byte("function hi() {}")},
		"static/app.js.br":  {Data: []byte("BROTLI-PAYLOAD")},
	}

	handler := spa.NewEmbeddedHandler(fs.FS(fstest.MapFS(files)), "index.html", "/headlamp")

	tests := []struct {
		name           string
		acceptEncoding string
		wantBody       string
		wantEncoding   string
	}{
		{"brotli", "br, gzip", "BROTLI-PAYLOAD", "br"},
		{"identity when only gzip offered", "gzip", "function hi() {}", ""},
		{"identity", "", "function hi() {}", ""},
		{"identity when brotli disabled", "br;q=0", "function hi() {}", ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequestWithContext(
				context.Background(), "GET", "/headlamp/app.js", nil)
			require.NoError(t, err)

			if tc.acceptEncoding != "" {
				req.Header.Set("Accept-Encoding", tc.acceptEncoding)
			}

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			assert.Equal(t, http.StatusOK, rr.Code)
			assert.Equal(t, tc.wantBody, rr.Body.String())
			assert.Equal(t, tc.wantEncoding, rr.Header().Get("Content-Encoding"))
			assert.Contains(t, rr.Header().Get("Vary"), "Accept-Encoding")
			assert.Contains(t, rr.Header().Get("Content-Type"), "javascript")
		})
	}
}

// TestEmbeddedSpaHandlerNeverServesEncodedIndex makes sure we don't try to
// serve the index.html via a precompressed sidecar, because the handler
// rewrites its body for baseURL substitution.
func TestEmbeddedSpaHandlerNeverServesEncodedIndex(t *testing.T) {
	files := map[string]*fstest.MapFile{
		"static/index.html": {Data: []byte(getTestHTML())},
		// A bogus index.html.br that, if served, would produce wrong bytes.
		"static/index.html.br": {Data: []byte("SHOULD-NEVER-BE-SERVED")},
	}

	handler := spa.NewEmbeddedHandler(fs.FS(fstest.MapFS(files)), "index.html", "/headlamp")

	req, err := http.NewRequestWithContext(
		context.Background(), "GET", "/headlamp/index.html", nil)
	require.NoError(t, err)
	req.Header.Set("Accept-Encoding", "br")

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Empty(t, rr.Header().Get("Content-Encoding"),
		"index.html must be served as identity so baseURL rewriting works")
	assert.Contains(t, rr.Body.String(), "__baseUrl__ = '/headlamp';")
	assert.Contains(t, rr.Header().Get("Vary"), "Accept-Encoding")
}

// TestEmbeddedSpaHandlerMissingSidecarFallsThrough ensures a missing sidecar
// doesn't break the response: we still serve the identity bytes with the
// correct content-type and no Content-Encoding header.
func TestEmbeddedSpaHandlerMissingSidecarFallsThrough(t *testing.T) {
	files := map[string]*fstest.MapFile{
		"static/index.html": {Data: []byte(getTestHTML())},
		"static/app.js":     {Data: []byte("function hi() {}")},
	}

	handler := spa.NewEmbeddedHandler(fs.FS(fstest.MapFS(files)), "index.html", "/headlamp")

	req, err := http.NewRequestWithContext(
		context.Background(), "GET", "/headlamp/app.js", nil)
	require.NoError(t, err)
	req.Header.Set("Accept-Encoding", "br")

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "function hi() {}", rr.Body.String())
	assert.Empty(t, rr.Header().Get("Content-Encoding"))
	assert.Contains(t, rr.Header().Get("Content-Type"), "javascript")
	assert.Contains(t, rr.Header().Get("Vary"), "Accept-Encoding")
}

func TestEmbeddedSpaHandlerPrecompressedHonorsHEAD(t *testing.T) {
	files := map[string]*fstest.MapFile{
		"static/index.html": {Data: []byte(getTestHTML())},
		"static/app.js":     {Data: []byte("function hi() {}")},
		"static/app.js.br":  {Data: []byte("BROTLI-PAYLOAD")},
	}

	handler := spa.NewEmbeddedHandler(fs.FS(fstest.MapFS(files)), "index.html", "/headlamp")

	req, err := http.NewRequestWithContext(
		context.Background(), http.MethodHead, "/headlamp/app.js", nil)
	require.NoError(t, err)
	req.Header.Set("Accept-Encoding", "br")

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "", rr.Body.String())
	assert.Equal(t, "br", rr.Header().Get("Content-Encoding"))
	assert.Contains(t, rr.Header().Get("Vary"), "Accept-Encoding")
}

func TestEmbeddedSpaHandlerPrecompressedSupportsRange(t *testing.T) {
	files := map[string]*fstest.MapFile{
		"static/index.html": {Data: []byte(getTestHTML())},
		"static/app.js":     {Data: []byte("function hi() {}")},
		"static/app.js.br":  {Data: []byte("BROTLI-PAYLOAD")},
	}

	handler := spa.NewEmbeddedHandler(fs.FS(fstest.MapFS(files)), "index.html", "/headlamp")

	req, err := http.NewRequestWithContext(
		context.Background(), http.MethodGet, "/headlamp/app.js", nil)
	require.NoError(t, err)
	req.Header.Set("Accept-Encoding", "br")
	req.Header.Set("Range", "bytes=0-5")

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusPartialContent, rr.Code)
	assert.Equal(t, "BROTLI", rr.Body.String())
	assert.Equal(t, "br", rr.Header().Get("Content-Encoding"))
	assert.Contains(t, rr.Header().Get("Content-Range"), "bytes 0-5/")
}

// TestSetEncodingHeadersNoDuplicateVary ensures that calling setEncodingHeaders
// more than once (as happens when the handler first marks the identity path then
// falls back to serving a sidecar) does not accumulate duplicate
// Vary: Accept-Encoding entries.
func TestSetEncodingHeadersNoDuplicateVary(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "index.html", []byte("<html>"))
	writeFile(t, dir, "app.js", []byte("console.log(1)"))
	writeFile(t, dir, "app.js.br", []byte("BROTLI"))

	handler := spa.NewHandler(dir, "index.html", "/")

	req, err := http.NewRequestWithContext(context.Background(), "GET", "/app.js", nil)
	require.NoError(t, err)
	req.Header.Set("Accept-Encoding", "br")

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	varyValues := rr.Header()["Vary"]
	count := 0

	for _, v := range varyValues {
		if v == "Accept-Encoding" {
			count++
		}
	}

	assert.Equal(t, 1, count, "Vary: Accept-Encoding must appear exactly once, got %v", varyValues)
}

// TestBrotliSidecarsMiddleware verifies that BrotliSidecars correctly wraps
// a file handler to serve .br sidecars for plugin dist folders.
func TestBrotliSidecarsMiddleware(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "myplugin/main.js", []byte("function plugin() {}"))
	writeFile(t, dir, "myplugin/main.js.br", []byte("BROTLI-PLUGIN"))

	// Simulate how headlamp.go wraps http.FileServer for plugins.
	fileServer := http.FileServer(http.Dir(dir))
	handler := http.StripPrefix("/plugins/", spa.BrotliSidecars(dir, fileServer))

	tests := []struct {
		name           string
		acceptEncoding string
		wantBody       string
		wantEncoding   string
	}{
		{"serves sidecar when br offered", "br", "BROTLI-PLUGIN", "br"},
		{"falls back to identity for gzip-only", "gzip", "function plugin() {}", ""},
		{"falls back to identity when no encoding", "", "function plugin() {}", ""},
		{"identity when brotli disabled via q=0", "br;q=0", "function plugin() {}", ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequestWithContext(
				context.Background(), "GET", "/plugins/myplugin/main.js", nil)
			require.NoError(t, err)

			if tc.acceptEncoding != "" {
				req.Header.Set("Accept-Encoding", tc.acceptEncoding)
			}

			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)

			assert.Equal(t, http.StatusOK, rr.Code)
			assert.Equal(t, tc.wantBody, rr.Body.String())
			assert.Equal(t, tc.wantEncoding, rr.Header().Get("Content-Encoding"))
			assert.Contains(t, rr.Header().Get("Vary"), "Accept-Encoding")
			assert.Contains(t, rr.Header().Get("Content-Type"), "javascript")
		})
	}
}

// TestSpaHandlerNeverServesEncodedIndex ensures that the on-disk spaHandler
// never serves a precompressed index.html.br sidecar. headlamp.go rewrites
// index.html at startup for baseURL substitution, so a build-time sidecar
// would contain stale unrewritten bytes.
func TestSpaHandlerNeverServesEncodedIndex(t *testing.T) {
	dir := t.TempDir()

	indexHTML := []byte("<html>index</html>")
	writeFile(t, dir, "index.html", indexHTML)
	writeFile(t, dir, "index.html.br", []byte("STALE-BROTLI-BYTES"))

	handler := spa.NewHandler(dir, "index.html", "/headlamp")

	// Request the root — spaHandler serves index.html as the SPA entry point.
	// http.ServeFile redirects explicit ".../index.html" requests to "./",
	// so we use the trailing-slash form which is the real browser entrypoint.
	req, err := http.NewRequestWithContext(
		context.Background(), "GET", "/headlamp/", nil)
	require.NoError(t, err)
	req.Header.Set("Accept-Encoding", "br")

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Empty(t, rr.Header().Get("Content-Encoding"), "index.html must not be served brotli-encoded")
	assert.Equal(t, string(indexHTML), rr.Body.String())
}

func TestSpaHandlerDirectoryRequestFallsBackToIndex(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "index.html", []byte("the-index"))
	writeFile(t, dir, "assets/file.txt", []byte("x"))

	handler := spa.NewHandler(dir, "index.html", "/headlamp")

	req, err := http.NewRequestWithContext(
		context.Background(), "GET", "/headlamp/assets", nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "the-index", rr.Body.String())
}

func TestSpaHandlerTraversalDoesNotLeakFilesystemError(t *testing.T) {
	handler := spa.NewHandler("headlamp_testdata/static_files/", "index.html", "/headlamp")

	req, err := http.NewRequestWithContext(
		context.Background(), "GET", "/headlamp/../outside.txt", nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.NotContains(t, rr.Body.String(), "escapes from parent")
}
