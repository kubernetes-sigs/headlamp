package spa

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestSetEncodingHeadersDoesNotFalsePositiveOnSimilarVaryToken(t *testing.T) {
	rr := httptest.NewRecorder()
	rr.Header().Add("Vary", "X-Accept-Encoding")

	setEncodingHeaders(rr, "")

	vary := rr.Header().Values("Vary")
	acceptCount := 0
	similarCount := 0

	for _, v := range vary {
		if v == "Accept-Encoding" {
			acceptCount++
		}

		if v == "X-Accept-Encoding" {
			similarCount++
		}
	}

	if similarCount != 1 {
		t.Fatalf("expected X-Accept-Encoding to be preserved once, got %d in %v", similarCount, vary)
	}

	if acceptCount != 1 {
		t.Fatalf("expected Accept-Encoding to be added once, got %d in %v", acceptCount, vary)
	}
}

func TestTryBrotliSidecarRejectsInvalidPaths(t *testing.T) {
	dir := t.TempDir()

	tests := []struct {
		name string
		path string
	}{
		{name: "backslash path", path: `/foo\\bar.js`},
		{name: "parent escape", path: `/../outside.js`},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, tc.path, nil)
			if err != nil {
				t.Fatal(err)
			}

			req.Header.Set("Accept-Encoding", "br")

			rr := httptest.NewRecorder()
			served := tryBrotliSidecar(rr, req, dir)

			if !served {
				t.Fatalf("expected invalid path to be handled by middleware")
			}

			if rr.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 for invalid path, got %d", rr.Code)
			}
		})
	}
}

func TestTryBrotliSidecarRequiresOriginalFile(t *testing.T) {
	dir := t.TempDir()

	write := func(name, body string) {
		p := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(p), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	// Leave only sidecar file; original does not exist.
	write("app.js.br", "STALE")

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "/app.js", nil)
	if err != nil {
		t.Fatal(err)
	}

	req.Header.Set("Accept-Encoding", "br")

	rr := httptest.NewRecorder()
	served := tryBrotliSidecar(rr, req, dir)

	if served {
		t.Fatalf("expected middleware not to serve stale sidecar when original is missing")
	}
}

func TestTryBrotliSidecarDoesNotSetEncodingOnOpenFailure(t *testing.T) {
	dir := t.TempDir()

	write := func(name, body string) {
		p := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(p), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	write("app.js", "console.log(1)")
	write("app.js.br", "BROTLI")

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "/app.js", nil)
	if err != nil {
		t.Fatal(err)
	}

	req.Header.Set("Accept-Encoding", "br")

	// Remove sidecar after it exists to emulate a race where open/stat fails
	// after an earlier existence check.
	if err := os.Remove(filepath.Join(dir, "app.js.br")); err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	served := tryBrotliSidecar(rr, req, dir)

	if served {
		t.Fatalf("expected middleware to fall through when sidecar open fails")
	}

	if got := rr.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("expected no Content-Encoding on fallback, got %q", got)
	}
}
