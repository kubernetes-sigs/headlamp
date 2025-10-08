package serviceproxy_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/serviceproxy"
)

func TestHTTPGet(t *testing.T) {
	tests := []struct {
		name       string
		url        string
		statusCode int
		body       string
		wantErr    bool
	}{
		{
			name:       "valid URL",
			url:        "http://example.com",
			statusCode: http.StatusOK,
			body:       "Hello, World!",
			wantErr:    false,
		},
		{
			name:       "invalid URL",
			url:        " invalid-url",
			statusCode: 0,
			body:       "",
			wantErr:    true,
		},
		{
			name:       "server returns error response",
			url:        "http://example.com/error",
			statusCode: http.StatusInternalServerError,
			body:       "",
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tt.url == "http://example.com/error" {
					w.WriteHeader(http.StatusInternalServerError)
				} else {
					if _, err := w.Write([]byte(tt.body)); err != nil {
						t.Fatalf("write test: %v", err)
					}
				}
			}))
			defer ts.Close()

			url := ts.URL
			if tt.url == " invalid-url" {
				url = tt.url
			} else if tt.url == "http://example.com/error" {
				url = ts.URL + "/error"
			}

			resp, err := serviceproxy.HTTPGet(context.Background(), url)
			if (err != nil) != tt.wantErr {
				t.Errorf("HTTPGet() error = %v, wantErr %v", err, tt.wantErr)
			}

			if !tt.wantErr && string(resp) != tt.body {
				t.Errorf("HTTPGet() response = %s, want %s", resp, tt.body)
			}
		})
	}
}
