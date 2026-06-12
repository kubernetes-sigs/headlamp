package main

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Minimal fake favicons: the real PNG/ICO magic-byte signature (which the
// handler validates) followed by arbitrary filler. The body content is never
// decoded, so any bytes after the signature work.
var (
	pngBytes = append([]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, []byte("png-body")...)
	icoBytes = append([]byte{0x00, 0x00, 0x01, 0x00}, []byte("ico-body")...)
)

func faviconTestConfig(favicon, faviconBase64 string) *HeadlampConfig {
	return &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				Favicon:       favicon,
				FaviconBase64: faviconBase64,
			},
		},
	}
}

func writeTempFavicon(t *testing.T, name string, data []byte) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), name)
	require.NoError(t, os.WriteFile(path, data, 0o600))

	return path
}

func TestResolveFavicon_PNGFile(t *testing.T) {
	path := writeTempFavicon(t, "favicon.png", pngBytes)

	data, contentType, ok := resolveFavicon(faviconTestConfig(path, ""))
	assert.True(t, ok)
	assert.Equal(t, "image/png", contentType)
	assert.Equal(t, pngBytes, data)
}

func TestResolveFavicon_ICOFile(t *testing.T) {
	path := writeTempFavicon(t, "favicon.ico", icoBytes)

	data, contentType, ok := resolveFavicon(faviconTestConfig(path, ""))
	assert.True(t, ok)
	assert.Equal(t, "image/x-icon", contentType)
	assert.Equal(t, icoBytes, data)
}

func TestResolveFavicon_MagicMismatch(t *testing.T) {
	// A .png file whose bytes are not actually a PNG must be rejected.
	path := writeTempFavicon(t, "fake.png", []byte("<html>not a png</html>"))

	_, _, ok := resolveFavicon(faviconTestConfig(path, ""))
	assert.False(t, ok)
}

func TestResolveFavicon_UnsupportedExtension(t *testing.T) {
	path := writeTempFavicon(t, "icon.svg", []byte("<svg></svg>"))

	_, _, ok := resolveFavicon(faviconTestConfig(path, ""))
	assert.False(t, ok)
}

func TestResolveFavicon_MissingFile(t *testing.T) {
	_, _, ok := resolveFavicon(faviconTestConfig("/no/such/favicon.png", ""))
	assert.False(t, ok)
}

func TestResolveFavicon_Base64PNG(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString(pngBytes)

	data, contentType, ok := resolveFavicon(faviconTestConfig("", encoded))
	assert.True(t, ok)
	assert.Equal(t, "image/png", contentType)
	assert.Equal(t, pngBytes, data)
}

func TestResolveFavicon_Base64NotPNG(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString([]byte("not a png"))

	_, _, ok := resolveFavicon(faviconTestConfig("", encoded))
	assert.False(t, ok)
}

func TestResolveFavicon_Base64Invalid(t *testing.T) {
	_, _, ok := resolveFavicon(faviconTestConfig("", "this is not base64!!!"))
	assert.False(t, ok)
}

func TestResolveFavicon_FileWinsOverBase64(t *testing.T) {
	path := writeTempFavicon(t, "favicon.ico", icoBytes)
	encoded := base64.StdEncoding.EncodeToString(pngBytes)

	data, contentType, ok := resolveFavicon(faviconTestConfig(path, encoded))
	assert.True(t, ok)
	assert.Equal(t, "image/x-icon", contentType)
	assert.Equal(t, icoBytes, data)
}

func TestResolveFavicon_None(t *testing.T) {
	_, _, ok := resolveFavicon(faviconTestConfig("", ""))
	assert.False(t, ok)
}

func TestAddFaviconRoutes_ServesAllTabIcons(t *testing.T) {
	path := writeTempFavicon(t, "favicon.png", pngBytes)

	r := mux.NewRouter()
	addFaviconRoutes(faviconTestConfig(path, ""), r)

	for _, route := range []string{"/favicon.ico", "/favicon-16x16.png", "/favicon-32x32.png"} {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, route, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, route)
		assert.Equal(t, "image/png", w.Header().Get("Content-Type"), route)
		assert.Equal(t, "nosniff", w.Header().Get("X-Content-Type-Options"), route)
		assert.Equal(t, pngBytes, w.Body.Bytes(), route)
	}
}

func TestAddFaviconRoutes_NotConfigured(t *testing.T) {
	r := mux.NewRouter()
	addFaviconRoutes(faviconTestConfig("", ""), r)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/favicon.ico", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// No override registered, so the bare router has no match.
	assert.Equal(t, http.StatusNotFound, w.Code)
}
