package serviceproxy //nolint

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewConnection(t *testing.T) {
	tests := []struct {
		name string
		ps   *proxyService
		want ServiceConnection
	}{
		{
			name: "valid proxy service",
			ps: &proxyService{
				URIPrefix: "http://example.com",
			},
			want: &Connection{URI: "http://example.com"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conn := NewConnection(tt.ps)
			if conn == nil {
				t.Errorf("NewConnection() returned nil")
			}

			c, ok := conn.(*Connection)
			if !ok {
				t.Errorf("NewConnection() returned unexpected type")
			}

			if c.URI != tt.want.(*Connection).URI {
				t.Errorf("NewConnection() URI = %s, want %s", c.URI, tt.want.(*Connection).URI)
			}
		})
	}
}

func TestGet(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := w.Write([]byte("Hello, World!")); err != nil {
			t.Fatalf("write test: %v", err)
		}
	}))
	defer ts.Close()

	// Create a connection to the test server
	conn := NewConnection(&proxyService{URIPrefix: ts.URL})

	// Test Get()
	resp, err := conn.Get("/test")
	if err != nil {
		t.Errorf("Get() error = %v", err)
	}

	if string(resp) != "Hello, World!" {
		t.Errorf("Get() response = %s, want Hello, World!", resp)
	}
}
