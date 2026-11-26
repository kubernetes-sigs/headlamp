package spa_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/spa"
	"github.com/stretchr/testify/assert"
)

func TestIndexRequiresCacheRevalidation(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "index.html", []byte("the-index"))
	writeFile(t, dir, "app.js", []byte("the-script"))

	for _, baseURL := range []string{"", "/headlamp"} {
		handlers := map[string]http.Handler{
			"filesystem": spa.NewHandler(dir, "index.html", baseURL),
			"embedded": spa.NewEmbeddedHandler(fstest.MapFS{
				"static/index.html": {Data: []byte("the-index")},
				"static/app.js":     {Data: []byte("the-script")},
			}, "index.html", baseURL),
		}
		for name, handler := range handlers {
			for _, path := range []string{"/", "/index.html", "/c/test/pods", "/app.js"} {
				t.Run(name+baseURL+path, func(t *testing.T) {
					rr := httptest.NewRecorder()
					handler.ServeHTTP(rr, httptest.NewRequestWithContext(t.Context(), http.MethodGet, baseURL+path, nil))
					assert.Equal(t, http.StatusOK, rr.Code)

					if path == "/app.js" {
						assert.Empty(t, rr.Header().Get("Cache-Control"))
						assert.Equal(t, "the-script", rr.Body.String())
					} else {
						assert.Equal(t, "no-cache", rr.Header().Get("Cache-Control"))
						assert.Equal(t, "the-index", rr.Body.String())
					}
				})
			}
		}
	}
}
