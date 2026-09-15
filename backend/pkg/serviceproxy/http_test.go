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
func TestHTTPGetStream(t *testing.T) {
	tests := []struct {
		name        string
		url         string
		statusCode  int
		body        string
		contentType string
		wantErr     bool
		wantStatus  int
	}{
		{
			name:        "valid URL",
			url:         "http://example.com",
			statusCode:  http.StatusOK,
			body:        "Hello, World!",
			contentType: "text/plain",
			wantErr:     false,
			wantStatus:  http.StatusOK,
		},
		{
			name:       "invalid URL",
			url:        " invalid-url",
			statusCode: http.StatusInternalServerError,
			body:       "",
			wantErr:    true,
		},
		{
			name:        "server returns error response",
			url:         "http://example.com/error",
			statusCode:  http.StatusInternalServerError,
			body:        "upstream error",
			contentType: "text/plain",
			wantErr:     false,
			wantStatus:  http.StatusInternalServerError,
		},
		{
			name:        "server returns not found response",
			url:         "http://example.com/not-found",
			statusCode:  http.StatusNotFound,
			body:        "upstream not found",
			contentType: "text/plain",
			wantErr:     false,
			wantStatus:  http.StatusNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", tt.contentType)
				w.WriteHeader(tt.statusCode)

				if _, err := w.Write([]byte(tt.body)); err != nil {
					t.Fatalf("write test: %v", err)
				}
			}))
			defer ts.Close()

			url := ts.URL
			switch tt.url {
			case " invalid-url":
				url = tt.url
			case "http://example.com/error":
				url = ts.URL + "/error"
			case "http://example.com/not-found":
				url = ts.URL + "/not-found"
			}

			w := httptest.NewRecorder()

			err := serviceproxy.HTTPGetStream(context.Background(), url, w)
			if (err != nil) != tt.wantErr {
				t.Errorf("HTTPGetStream() error = %v, wantErr %v", err, tt.wantErr)
			}

			if !tt.wantErr && w.Body.String() != tt.body {
				t.Errorf("HTTPGetStream() response = %s, want %s", w.Body.String(), tt.body)
			}

			if !tt.wantErr && w.Code != tt.wantStatus {
				t.Errorf("HTTPGetStream() status = %d, want %d", w.Code, tt.wantStatus)
			}

			if !tt.wantErr && w.Header().Get("Content-Type") != tt.contentType {
				t.Errorf("HTTPGetStream() content type = %s, want %s", w.Header().Get("Content-Type"), tt.contentType)
			}
		})
	}
}

func TestHTTPGetStreamContextCancellation(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer ts.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := serviceproxy.HTTPGetStream(ctx, ts.URL, httptest.NewRecorder())
	if err == nil {
		t.Errorf("HTTPGetStream() error = nil, want error")
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

	err := serviceproxy.HTTPGetStream(ctx, ts.URL, &countingResponseWriter{})
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

	counter := &countingResponseWriter{}

	if err := serviceproxy.HTTPGetStream(context.Background(), ts.URL, counter); err != nil {
		t.Fatalf("HTTPGetStream() error = %v", err)
	}

	if counter.n != size {
		t.Errorf("HTTPGetStream() streamed %d bytes, want %d", counter.n, size)
	}

	if counter.writes <= 1 {
		t.Errorf("HTTPGetStream() performed %d writes, want more than 1 to confirm streaming", counter.writes)
	}

	if counter.maxWrite > 128*1024 {
		t.Errorf("HTTPGetStream() max write size = %d, want <= %d", counter.maxWrite, 128*1024)
	}

	if counter.statusCode != http.StatusOK {
		t.Errorf("HTTPGetStream() status = %d, want %d", counter.statusCode, http.StatusOK)
	}

	if counter.header.Get("Content-Type") != "application/octet-stream" {
		t.Errorf("HTTPGetStream() content type = %s, want application/octet-stream", counter.header.Get("Content-Type"))
	}
}

// countingResponseWriter records streaming statistics without retaining the
// response body. Keeping no copy of the payload lets large-body tests assert
// the stream is forwarded in bounded chunks without themselves buffering the
// whole body.
type countingResponseWriter struct {
	header     http.Header
	statusCode int
	n          int
	writes     int
	maxWrite   int
}

func (c *countingResponseWriter) Header() http.Header {
	if c.header == nil {
		c.header = http.Header{}
	}

	return c.header
}

func (c *countingResponseWriter) WriteHeader(statusCode int) {
	c.statusCode = statusCode
}

func (c *countingResponseWriter) Write(p []byte) (int, error) {
	c.n += len(p)
	c.writes++

	if len(p) > c.maxWrite {
		c.maxWrite = len(p)
	}

	return len(p), nil
}
