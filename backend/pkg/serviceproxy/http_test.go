package serviceproxy_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/serviceproxy"
)

//nolint:funlen
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
		{
			name:       "context cancellation",
			url:        "http://example.com/cancel",
			statusCode: http.StatusOK,
			body:       "Hello, World!",
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch {
				case tt.url == "http://example.com/error":
					w.WriteHeader(http.StatusInternalServerError)
				case tt.name == "context cancellation":
					<-r.Context().Done()
					w.WriteHeader(http.StatusOK)

					if _, err := w.Write([]byte(tt.body)); err != nil {
						t.Fatal(err)
					}
				default:
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

			if ctx := context.Background(); tt.name == "context cancellation" {
				var cancel context.CancelFunc
				_, cancel = context.WithCancel(ctx)
				cancel()
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

func TestHTTPGetTimeout(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(15 * time.Second)

		if _, err := w.Write([]byte("Hello, World!")); err != nil {
			t.Fatalf("write test: %v", err)
		}
	}))
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	_, err := serviceproxy.HTTPGet(ctx, ts.URL)
	if err == nil {
		t.Errorf("HTTPGet() error = nil, want error")
	}
}
