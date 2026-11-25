/*
Copyright 2025 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package spa

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDetectContentTypeFallbacks(t *testing.T) {
	t.Run("extension match avoids open", func(t *testing.T) {
		ct := detectContentType("app.js", func() (io.ReadCloser, error) {
			return nil, errors.New("should not be called")
		})
		assert.Contains(t, ct, "javascript")
	})

	t.Run("unknown extension sniffs content", func(t *testing.T) {
		ct := detectContentType("README.unknownext", func() (io.ReadCloser, error) {
			return io.NopCloser(strings.NewReader("<html><body>hello</body></html>")), nil
		})
		assert.Contains(t, ct, "text/html")
	})

	t.Run("open error returns empty", func(t *testing.T) {
		ct := detectContentType("README.unknownext", func() (io.ReadCloser, error) {
			return nil, errors.New("open failed")
		})
		assert.Equal(t, "", ct)
	})
}

func TestSpaHandlerPrecompressedAndIndex(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>./base</html>"), 0o600))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "app.js"), []byte("console.log(1)"), 0o600))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "app.js.br"), []byte("br-bytes"), 0o600))

	h := NewHandler(dir, "index.html", "/headlamp")

	t.Run("serves brotli sidecar when accepted", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/headlamp/app.js", nil)
		req.Header.Set("Accept-Encoding", "br")

		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Equal(t, "br", rec.Header().Get("Content-Encoding"))
		assert.Equal(t, "br-bytes", rec.Body.String())
	})

	t.Run("falls back to index.html for SPA routes", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/headlamp/clusters/c1", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), "<html>")
	})

	t.Run("rejects backslash path traversal with 400", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, `/headlamp/a\b`, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("bare baseURL serves index.html and missing static dir returns 500", func(t *testing.T) {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/headlamp", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusOK, rec.Code)

		hMissing := NewHandler(filepath.Join(t.TempDir(), "does-not-exist"), "index.html", "")
		recErr := httptest.NewRecorder()
		hMissing.ServeHTTP(recErr, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
		assert.Equal(t, http.StatusInternalServerError, recErr.Code)
	})
}
