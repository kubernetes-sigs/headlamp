package serviceproxy_test

import (
	"bytes"
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

			var buf bytes.Buffer

			err := serviceproxy.HTTPGetStream(ctx, url, &buf)
			if (err != nil) != tt.wantErr {
				t.Errorf("HTTPGetStream() error = %v, wantErr %v", err, tt.wantErr)
			}

			if !tt.wantErr && buf.String() != tt.body {
				t.Errorf("HTTPGetStream() response = %s, want %s", buf.String(), tt.body)
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

	err := serviceproxy.HTTPGetStream(ctx, ts.URL, &countingWriter{})
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

	counter := &countingWriter{}

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
}

// countingWriter records streaming statistics without retaining the response
// body. Keeping no copy of the payload lets large-body tests assert the stream
// is forwarded in bounded chunks without themselves buffering the whole body.
type countingWriter struct {
	n        int
	writes   int
	maxWrite int
}

func (c *countingWriter) Write(p []byte) (int, error) {
	c.n += len(p)
	c.writes++

	if len(p) > c.maxWrite {
		c.maxWrite = len(p)
	}

	return len(p), nil
}
