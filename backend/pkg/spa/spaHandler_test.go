package spa_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/spa"
)

const (
	staticTestPath = "headlamp_testdata/static_files/"
)

// Is supposed to return the index.html if there is no static file.
func TestSpaHandlerMissing(t *testing.T) {
	req, err := http.NewRequestWithContext(context.Background(), "GET", "/headlampxxx", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := spa.NewHandler(staticTestPath, "index.html", "/headlamp")
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v",
			status, http.StatusOK)
	}

	indexExpected := "The index."

	if !strings.HasPrefix(rr.Body.String(), indexExpected) {
		t.Errorf("handler returned unexpected body: got :%v: want :%v:",
			rr.Body.String(), indexExpected)
	}
}

// Works with a baseURL to get the index.html.
func TestSpaHandlerBaseURL(t *testing.T) {
	req, err := http.NewRequestWithContext(context.Background(), "GET", "/headlamp/", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := spa.NewHandler(staticTestPath, "index.html", "/headlamp")
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v",
			status, http.StatusOK)
	}

	indexExpected := "The index."
	if !strings.HasPrefix(rr.Body.String(), indexExpected) {
		t.Errorf("handler returned unexpected body: got :%v: want :%v:",
			rr.Body.String(), indexExpected)
	}
}

// Works with a baseURL to get other files.
func TestSpaHandlerOtherFiles(t *testing.T) {
	req, err := http.NewRequestWithContext(context.Background(), "GET", "/headlamp/example.css", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := spa.NewHandler(staticTestPath, "index.html", "/headlamp")
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v",
			status, http.StatusOK)
	}

	expectedCSS := ".somecss"
	if !strings.HasPrefix(rr.Body.String(), expectedCSS) {
		t.Errorf("handler returned unexpected body: got :%v: want :%v:",
			rr.Body.String(), expectedCSS)
	}
}

type spaCacheControlTestCase struct {
	name                string
	method              string
	path                string
	baseURL             string
	indexPath           string
	wantBody            string
	wantCacheControl    string
	acceptEncoding      string
	wantContentEncoding string
}

func spaCacheControlTestCases() []spaCacheControlTestCase {
	return []spaCacheControlTestCase{
		{
			name: "root serves index", path: "/", indexPath: "index.html",
			wantBody: "the-index", wantCacheControl: "no-cache",
		},
		{
			name: "HEAD root serves index headers", method: http.MethodHead, path: "/", indexPath: "index.html",
			wantCacheControl: "no-cache",
		},
		{
			name: "direct index request", path: "/index.html", indexPath: "index.html",
			wantBody: "the-index", wantCacheControl: "no-cache",
		},
		{
			name: "deep link falls back to index", path: "/c/main/pods", indexPath: "index.html",
			wantBody: "the-index", wantCacheControl: "no-cache",
		},
		{
			name: "directory falls back to index", path: "/assets", indexPath: "index.html",
			wantBody: "the-index", wantCacheControl: "no-cache",
		},
		{
			name: "custom base URL and index path", path: "/headlamp/", baseURL: "/headlamp",
			indexPath: "web/app.html", wantBody: "custom-index", wantCacheControl: "no-cache",
		},
		{
			name: "CSS asset keeps default cache behavior", path: "/example.css",
			indexPath: "index.html", wantBody: ".somecss",
		},
		{
			name: "Brotli JavaScript keeps default cache behavior", path: "/app.js",
			indexPath: "index.html", wantBody: "BROTLI-JAVASCRIPT",
			acceptEncoding: "br", wantContentEncoding: "br",
		},
	}
}

func TestSpaHandlerCacheControl(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "index.html", []byte("the-index"))
	writeFile(t, dir, "example.css", []byte(".somecss"))
	writeFile(t, dir, "app.js", []byte("javascript"))
	writeFile(t, dir, "app.js.br", []byte("BROTLI-JAVASCRIPT"))
	writeFile(t, dir, "assets/file.txt", []byte("asset"))
	writeFile(t, dir, "web/app.html", []byte("custom-index"))

	for _, tt := range spaCacheControlTestCases() {
		t.Run(tt.name, func(t *testing.T) {
			method := tt.method

			if method == "" {
				method = http.MethodGet
			}

			req, err := http.NewRequestWithContext(context.Background(), method, tt.path, nil)
			if err != nil {
				t.Fatal(err)
			}

			if tt.acceptEncoding != "" {
				req.Header.Set("Accept-Encoding", tt.acceptEncoding)
			}

			rr := httptest.NewRecorder()
			spa.NewHandler(dir, tt.indexPath, tt.baseURL).ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Fatalf("handler returned status %d, want %d", rr.Code, http.StatusOK)
			}

			if got := rr.Body.String(); got != tt.wantBody {
				t.Errorf("handler returned body %q, want %q", got, tt.wantBody)
			}

			if got := rr.Header().Get("Cache-Control"); got != tt.wantCacheControl {
				t.Errorf("Cache-Control = %q, want %q", got, tt.wantCacheControl)
			}

			if got := rr.Header().Get("Content-Encoding"); got != tt.wantContentEncoding {
				t.Errorf("Content-Encoding = %q, want %q", got, tt.wantContentEncoding)
			}

			if got := rr.Header().Get("Vary"); !strings.Contains(got, "Accept-Encoding") {
				t.Errorf("Vary = %q, want Accept-Encoding", got)
			}
		})
	}
}

func TestSpaHandlerCacheControlOnNotModified(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "index.html", []byte("the-index"))

	indexPath := filepath.Join(dir, "index.html")
	modTime := time.Date(2024, time.January, 2, 3, 4, 5, 0, time.UTC)

	if err := os.Chtimes(indexPath, modTime, modTime); err != nil {
		t.Fatal(err)
	}

	handler := spa.NewHandler(dir, "index.html", "")
	firstResponse := httptest.NewRecorder()
	firstRequest := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
	handler.ServeHTTP(firstResponse, firstRequest)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
	req.Header.Set("If-Modified-Since", firstResponse.Header().Get("Last-Modified"))

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotModified {
		t.Fatalf("handler returned status %d, want %d", rr.Code, http.StatusNotModified)
	}

	if got := rr.Header().Get("Cache-Control"); got != "no-cache" {
		t.Errorf("Cache-Control = %q, want %q", got, "no-cache")
	}

	if got := rr.Header().Get("Vary"); !strings.Contains(got, "Accept-Encoding") {
		t.Errorf("Vary = %q, want Accept-Encoding", got)
	}
}

func TestSpaHandlerTraversal(t *testing.T) {
	tests := []struct {
		name       string
		path       string
		wantStatus int
	}{
		{
			name:       "escape via ..",
			path:       "/headlamp/../outside.txt",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "direct escape",
			path:       "/../outside.txt",
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "encoded escape",
			path:       "/headlamp/%2e%2e/outside.txt",
			wantStatus: http.StatusBadRequest,
		},
		// HasPrefix bypass: a sibling directory whose name starts with the
		// static dir name must be rejected, not matched.
		{
			name:       "sibling dir with shared prefix is rejected",
			path:       "/headlamp/../headlamp_evil/secret.txt",
			wantStatus: http.StatusBadRequest,
		},
		// Backslash in URL path — dangerous on Windows, rejected everywhere.
		{
			name:       "backslash in path is rejected",
			path:       `/headlamp\..\..\etc\passwd`,
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequestWithContext(context.Background(), "GET", tt.path, nil)
			if err != nil {
				t.Fatal(err)
			}

			rr := httptest.NewRecorder()
			handler := spa.NewHandler(staticTestPath, "index.html", "/headlamp")
			handler.ServeHTTP(rr, req)

			if rr.Code != tt.wantStatus {
				t.Errorf("handler returned wrong status code for %s: got %v want %v",
					tt.name, rr.Code, tt.wantStatus)
			}
		})
	}
}

// TestSpaHandlerBareBaseURL verifies that a request for the bare base URL
// (e.g. "/headlamp" with no trailing slash) serves index.html directly
// instead of issuing a 301 redirect to add the trailing slash.
func TestSpaHandlerBareBaseURL(t *testing.T) {
	req, err := http.NewRequestWithContext(context.Background(), "GET", "/headlamp", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := spa.NewHandler(staticTestPath, "index.html", "/headlamp")
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("bare base URL: got status %d, want %d", rr.Code, http.StatusOK)
	}
}

func TestSpaHandlerAbsErrorDoesNotLeakDetails(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("removing current working directory is platform-dependent on windows")
	}

	origWD, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}

	tmp := t.TempDir()
	if err := os.Chdir(tmp); err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() {
		_ = os.Chdir(origWD)
	})

	// Force filepath.Abs to fail by deleting the current working directory.
	if err := os.RemoveAll(tmp); err != nil {
		t.Skipf("could not remove cwd to trigger Abs failure: %v", err)
	}

	req, err := http.NewRequestWithContext(context.Background(), "GET", "/headlamp/", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := spa.NewHandler("relative-static", "index.html", "/headlamp")
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Fatalf("handler returned wrong status code: got %v want %v", rr.Code, http.StatusInternalServerError)
	}

	if got := rr.Body.String(); got != "Internal server error\n" {
		t.Fatalf("unexpected error body: %q", got)
	}
}
