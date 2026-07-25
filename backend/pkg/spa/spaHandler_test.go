package spa_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
