package serviceproxy_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/serviceproxy"
	"github.com/stretchr/testify/assert"
)

func TestValidateURL(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr bool
		errMsg  string
	}{
		{
			name:    "valid http URL",
			url:     "http://example.com",
			wantErr: false,
		},
		{
			name:    "valid https URL",
			url:     "https://example.com",
			wantErr: false,
		},
		{
			name:    "valid http URL with port",
			url:     "http://example.com:8080",
			wantErr: false,
		},
		{
			name:    "valid https URL with port",
			url:     "https://example.com:8443",
			wantErr: false,
		},
		{
			name:    "valid http URL with path",
			url:     "http://example.com/path/to/resource",
			wantErr: false,
		},
		{
			name:    "invalid file:// scheme",
			url:     "file:///etc/passwd",
			wantErr: true,
			errMsg:  "invalid URL scheme: file",
		},
		{
			name:    "invalid ftp:// scheme",
			url:     "ftp://example.com",
			wantErr: true,
			errMsg:  "invalid URL scheme: ftp",
		},
		{
			name:    "invalid scheme",
			url:     "gopher://example.com",
			wantErr: true,
			errMsg:  "invalid URL scheme: gopher",
		},
		{
			name:    "malformed URL",
			url:     "http://",
			wantErr: true,
			errMsg:  "URL must have a host",
		},
		{
			name:    "empty string",
			url:     "",
			wantErr: true,
			errMsg:  "invalid URL",
		},
		{
			name:    "no scheme",
			url:     "example.com",
			wantErr: true,
			errMsg:  "invalid URL scheme",
		},
		{
			name:    "relative path",
			url:     "/path/to/resource",
			wantErr: true,
			errMsg:  "invalid URL scheme",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := serviceproxy.ValidateURL(tt.url)
			if tt.wantErr {
				assert.Error(t, err)
				if tt.errMsg != "" {
					assert.Contains(t, err.Error(), tt.errMsg)
				}
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

//nolint:funlen
func TestHTTPGetStream(t *testing.T) {
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
			switch tt.url {
			case " invalid-url":
				url = tt.url
			case "http://example.com/error":
				url = ts.URL + "/error"
			}

			ctx := context.Background()

			if tt.name == "context cancellation" {
				var cancel context.CancelFunc

				ctx, cancel = context.WithCancel(ctx)
				cancel()
			}

			w := httptest.NewRecorder()

			err := serviceproxy.HTTPGetStream(ctx, url, w)
			if (err != nil) != tt.wantErr {
				t.Errorf("HTTPGetStream() error = %v, wantErr %v", err, tt.wantErr)
			}

			if !tt.wantErr && w.Body.String() != tt.body {
				t.Errorf("HTTPGetStream() response = %s, want %s", w.Body.String(), tt.body)
			}
		})
	}
}

func TestHTTPGetStreamTimeout(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(15 * time.Second)

		if _, err := w.Write([]byte("Hello, World!")); err != nil {
			t.Fatalf("write test: %v", err)
		}
	}))
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	w := httptest.NewRecorder()
	err := serviceproxy.HTTPGetStream(ctx, ts.URL, w)
	if err == nil {
		t.Errorf("HTTPGetStream() error = nil, want error")
	}
}

func TestHTTPGetStreamDoesNotBuffer(t *testing.T) {
	const (
		size      = 32 * 1024 * 1024
		chunkSize = 8 * 1024
	)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		chunk := make([]byte, chunkSize)
		for i := range chunk {
			chunk[i] = 'a'
		}

		w.Header().Set("Content-Type", "application/octet-stream")
		w.WriteHeader(http.StatusOK)

		written := 0
		for written < size {
			toWrite := chunk
			if remaining := size - written; remaining < len(chunk) {
				toWrite = chunk[:remaining]
			}

			n, err := w.Write(toWrite)
			if err != nil {
				t.Fatalf("write test: %v", err)
			}

			written += n
		}
	}))
	defer ts.Close()

	w := httptest.NewRecorder()

	if err := serviceproxy.HTTPGetStream(context.Background(), ts.URL, w); err != nil {
		t.Fatalf("HTTPGetStream() error = %v", err)
	}

	if w.Body.Len() != size {
		t.Errorf("HTTPGetStream() streamed %d bytes, want %d", w.Body.Len(), size)
	}

	// Verify Content-Type was forwarded
	if w.Header().Get("Content-Type") != "application/octet-stream" {
		t.Errorf("HTTPGetStream() Content-Type = %s, want application/octet-stream", w.Header().Get("Content-Type"))
	}

	// Verify status code was forwarded
	if w.Code != http.StatusOK {
		t.Errorf("HTTPGetStream() status code = %d, want %d", w.Code, http.StatusOK)
	}
}
