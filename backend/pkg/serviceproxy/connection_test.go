package serviceproxy //nolint

import (
	"bytes"
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
	tests := []struct {
		name       string
		uri        string
		requestURI string
		wantBody   []byte
		wantErr    bool
	}{
		{
			name:       "valid request",
			uri:        "http://example.com",
			requestURI: "/test",
			wantBody:   []byte("Hello, World!"),
			wantErr:    false,
		},
		{
			name:       "invalid URI",
			uri:        " invalid-uri",
			requestURI: "/test",
			wantBody:   nil,
			wantErr:    true,
		},
		{
			name:       "invalid request URI",
			uri:        "http://example.com",
			requestURI: " invalid-request-uri",
			wantBody:   nil,
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conn := &Connection{URI: tt.uri}

			if tt.wantBody != nil {
				ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					_, err := w.Write(tt.wantBody)
					if err != nil {
						t.Fatal(err)
					}
				}))
				defer ts.Close()

				conn.URI = ts.URL
			}

			body, err := conn.Get(tt.requestURI)
			if (err != nil) != tt.wantErr {
				t.Errorf("Get() error = %v, wantErr %v", err, tt.wantErr)
			}

			if !tt.wantErr && !bytes.Equal(body, tt.wantBody) {
				t.Errorf("Get() body = %s, want %s", body, tt.wantBody)
			}
		})
	}
}

func TestGetNonOKStatusCode(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer ts.Close()

	conn := &Connection{URI: ts.URL}

	_, err := conn.Get("/test")
	if err == nil {
		t.Errorf("Get() error = nil, want error")
	}
}
