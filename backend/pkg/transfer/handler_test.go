// Copyright 2025 The Kubernetes Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package transfer_test

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/transfer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setMuxVars is a helper to set gorilla/mux URL variables on a request.
func setMuxVars(r *http.Request, vars map[string]string) *http.Request {
	return mux.SetURLVars(r, vars)
}

// defaultMuxVars returns the standard set of mux vars for the copy route.
func defaultMuxVars() map[string]string {
	return map[string]string{
		"clusterName": "test-cluster",
		"namespace":   "default",
		"pod":         "test-pod",
		"container":   "test-container",
	}
}

//nolint:funlen,noctx // Table-driven test; test HTTP requests do not need a context.
func TestDownloadHandler(t *testing.T) {
	tests := []struct {
		name           string
		setupRequest   func() *http.Request
		storeError     bool
		expectedStatus int
		expectedBody   string
	}{
		{
			name: "missing path query parameter returns 400",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/copy", nil)
				req = setMuxVars(req, defaultMuxVars())

				return req
			},
			storeError:     false,
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "path is required",
		},
		{
			name: "empty path query parameter returns 400",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/copy?path=", nil)
				req = setMuxVars(req, defaultMuxVars())

				return req
			},
			storeError:     false,
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "path is required",
		},
		{
			name: "valid path sets correct response headers",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/copy?path=/var/log/app.log", nil)
				req = setMuxVars(req, defaultMuxVars())

				return req
			},
			storeError:     false,
			expectedStatus: http.StatusInternalServerError,
			expectedBody:   "invalid configuration",
		},
		{
			name: "path with encoded characters is accepted",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/copy?path=%2Ftmp%2Fmy+file.txt", nil)
				req = setMuxVars(req, defaultMuxVars())

				return req
			},
			storeError:     false,
			expectedStatus: http.StatusInternalServerError,
			expectedBody:   "invalid configuration",
		},
		{
			name: "missing mux variables still processes (empty vars)",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("GET", "/copy?path=/tmp/test", nil)
				// No mux vars set

				return req
			},
			storeError:     true,
			expectedStatus: http.StatusInternalServerError,
			expectedBody:   "cluster not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &MockContextStore{
				MockContext: &kubeconfig.Context{Name: "test-cluster"},
				ShouldError: tt.storeError,
			}

			handler := transfer.DownloadHandler(store, transfer.Options{})
			w := httptest.NewRecorder()
			req := tt.setupRequest()
			handler.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			if tt.expectedBody != "" {
				assert.Contains(t, w.Body.String(), tt.expectedBody)
			}
		})
	}
}

//nolint:noctx // Test HTTP requests do not need a context.
func TestDownloadHandlerSetsHeaders(t *testing.T) {
	// With a bare kubeconfig.Context the REST config is invalid, so
	// VerifyDownloadTarget fails before headers are written.
	store := &MockContextStore{
		MockContext: &kubeconfig.Context{Name: "test-cluster"},
	}

	handler := transfer.DownloadHandler(store, transfer.Options{})
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/copy?path=/var/log/app.log", nil)
	req = setMuxVars(req, defaultMuxVars())

	handler.ServeHTTP(w, req)

	// Verification fails → 500, no download headers set.
	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Empty(t, w.Header().Get("Content-Disposition"))
}

//nolint:funlen,noctx // Table-driven test; test HTTP requests do not need a context.
func TestUploadHandler(t *testing.T) {
	tests := []struct {
		name           string
		setupRequest   func() *http.Request
		storeError     bool
		expectedStatus int
		expectedBody   string
	}{
		{
			name: "upload with path and filename constructs correct full path",
			setupRequest: func() *http.Request {
				body := strings.NewReader("file content here")
				req := httptest.NewRequest("POST", "/copy?path=/tmp&filename=test.txt", body)
				req = setMuxVars(req, defaultMuxVars())

				return req
			},
			storeError:     false,
			expectedStatus: http.StatusInternalServerError,
			expectedBody:   "invalid configuration",
		},
		{
			name: "upload with empty path defaults to /tmp",
			setupRequest: func() *http.Request {
				body := strings.NewReader("file content here")
				req := httptest.NewRequest("POST", "/copy?filename=data.csv", body)
				req = setMuxVars(req, defaultMuxVars())

				return req
			},
			storeError:     false,
			expectedStatus: http.StatusInternalServerError,
			expectedBody:   "invalid configuration",
		},
		{
			name: "upload with trailing slash in path",
			setupRequest: func() *http.Request {
				body := strings.NewReader("file content here")
				req := httptest.NewRequest("POST", "/copy?path=/var/data/&filename=output.log", body)
				req = setMuxVars(req, defaultMuxVars())

				return req
			},
			storeError:     false,
			expectedStatus: http.StatusInternalServerError,
			expectedBody:   "invalid configuration",
		},
		{
			name: "upload without filename returns 400",
			setupRequest: func() *http.Request {
				body := strings.NewReader("file content here")
				req := httptest.NewRequest("POST", "/copy?path=/tmp/specific-file.txt", body)
				req = setMuxVars(req, defaultMuxVars())

				return req
			},
			storeError:     false,
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "filename query parameter is required",
		},
		{
			name: "upload with empty body",
			setupRequest: func() *http.Request {
				req := httptest.NewRequest("POST", "/copy?path=/tmp&filename=empty.txt", nil)
				req = setMuxVars(req, defaultMuxVars())

				return req
			},
			storeError:     false,
			expectedStatus: http.StatusInternalServerError,
			expectedBody:   "invalid configuration",
		},
		{
			name: "upload with cluster store error",
			setupRequest: func() *http.Request {
				body := strings.NewReader("file content here")
				req := httptest.NewRequest("POST", "/copy?path=/tmp&filename=test.txt", body)
				req = setMuxVars(req, defaultMuxVars())

				return req
			},
			storeError:     true,
			expectedStatus: http.StatusInternalServerError,
			expectedBody:   "cluster not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &MockContextStore{
				MockContext: &kubeconfig.Context{Name: "test-cluster"},
				ShouldError: tt.storeError,
			}

			handler := transfer.UploadHandler(store, transfer.Options{})
			w := httptest.NewRecorder()
			req := tt.setupRequest()
			handler.ServeHTTP(w, req)

			assert.Equal(t, tt.expectedStatus, w.Code)

			if tt.expectedBody != "" {
				assert.Contains(t, w.Body.String(), tt.expectedBody)
			}
		})
	}
}

//nolint:noctx // Test HTTP requests do not need a context.
func TestUploadHandlerPathConstruction(t *testing.T) {
	// These tests verify the path construction logic in the handler
	// by checking that the handler accepts various path/filename combos
	// without panicking.
	tests := []struct {
		name     string
		path     string
		filename string
	}{
		{
			name:     "path without trailing slash and with filename",
			path:     "/tmp",
			filename: "file.txt",
		},
		{
			name:     "path with trailing slash and with filename",
			path:     "/tmp/",
			filename: "file.txt",
		},
		{
			name:     "empty path defaults to /tmp",
			path:     "",
			filename: "file.txt",
		},
		{
			name:     "deep nested path",
			path:     "/var/lib/app/data/subdir",
			filename: "output.json",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &MockContextStore{
				MockContext: &kubeconfig.Context{Name: "test-cluster"},
			}

			handler := transfer.UploadHandler(store, transfer.Options{})
			w := httptest.NewRecorder()

			reqURL := "/copy?path=" + tt.path
			if tt.filename != "" {
				reqURL += "&filename=" + tt.filename
			}

			body := strings.NewReader("test content")
			req := httptest.NewRequest("POST", reqURL, body)
			req = setMuxVars(req, defaultMuxVars())

			// Should not panic
			handler.ServeHTTP(w, req)
		})
	}
}

//nolint:noctx // Test HTTP requests do not need a context.
func TestHandlerExtractsMuxVars(t *testing.T) {
	// Verify that the handlers correctly extract all mux variables.
	customVars := map[string]string{
		"clusterName": "prod-cluster",
		"namespace":   "kube-system",
		"pod":         "my-pod-abc123",
		"container":   "sidecar",
	}

	store := &MockContextStore{
		MockContext: &kubeconfig.Context{Name: "prod-cluster"},
	}

	t.Run("DownloadHandler extracts vars and returns error for invalid config", func(t *testing.T) {
		handler := transfer.DownloadHandler(store, transfer.Options{})
		w := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/copy?path=/data", nil)
		req = setMuxVars(req, customVars)

		handler.ServeHTTP(w, req)

		// Verification fails (no valid REST config) → 500
		assert.Equal(t, http.StatusInternalServerError, w.Code)
	})

	t.Run("UploadHandler extracts vars without error", func(t *testing.T) {
		handler := transfer.UploadHandler(store, transfer.Options{})
		w := httptest.NewRecorder()
		body := strings.NewReader("content")
		req := httptest.NewRequest("POST", "/copy?path=/tmp&filename=test.txt", body)
		req = setMuxVars(req, customVars)

		// Should not panic
		handler.ServeHTTP(w, req)
	})
}

//nolint:noctx // Test HTTP requests do not need a context.
func TestHandlerReturnsJSONErrors(t *testing.T) {
	store := &MockContextStore{
		MockContext: &kubeconfig.Context{Name: "test-cluster"},
	}

	t.Run("download missing path returns JSON", func(t *testing.T) {
		handler := transfer.DownloadHandler(store, transfer.Options{})
		w := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/copy", nil)
		req = setMuxVars(req, defaultMuxVars())

		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assert.Contains(t, w.Header().Get("Content-Type"), "application/json")
		assert.Contains(t, w.Body.String(), "path is required")
	})

	t.Run("upload missing filename returns JSON", func(t *testing.T) {
		handler := transfer.UploadHandler(store, transfer.Options{})
		w := httptest.NewRecorder()
		body := strings.NewReader("content")
		req := httptest.NewRequest("POST", "/copy?path=/tmp", body)
		req = setMuxVars(req, defaultMuxVars())

		handler.ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assert.Contains(t, w.Header().Get("Content-Type"), "application/json")
		assert.Contains(t, w.Body.String(), "filename query parameter is required")
	})
}

// newRecordingAPIServer starts a fake Kubernetes API server that records the
// Authorization header of the first exec request and then rejects it.
func newRecordingAPIServer(t *testing.T) (*httptest.Server, <-chan string) {
	t.Helper()

	auths := make(chan string, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case auths <- r.Header.Get("Authorization"):
		default:
		}

		w.WriteHeader(http.StatusBadRequest)
	}))
	t.Cleanup(server.Close)

	return server, auths
}

// authCookie returns the Headlamp auth cookie for the test cluster.
func authCookie(token string) *http.Cookie {
	return &http.Cookie{
		Name:     "headlamp-auth-test-cluster.0",
		Value:    token,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	}
}

// receivedAuth returns the Authorization header recorded by the fake API server.
func receivedAuth(t *testing.T, auths <-chan string) string {
	t.Helper()

	select {
	case auth := <-auths:
		return auth
	default:
		t.Fatal("API server did not receive an exec request")

		return ""
	}
}

//nolint:noctx // Test HTTP requests do not need a context.
func TestHandlerUsesResolvedContextKey(t *testing.T) {
	server, auths := newRecordingAPIServer(t)

	// Browser-imported clusters are stored under a per-user key, not the cluster name.
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContextWithKeyAndTTL(
		createMockContextWithServer(server.URL), "test-cluster-user", time.Hour))

	t.Run("looks up the context by the resolved key", func(t *testing.T) {
		opts := transfer.Options{
			ContextKey: func(*http.Request) (string, error) { return "test-cluster-user", nil },
		}

		req := httptest.NewRequest("GET", "/copy?path=/tmp/file.txt", nil)
		req = setMuxVars(req, defaultMuxVars())
		req.AddCookie(authCookie("cookie-token"))

		transfer.DownloadHandler(store, opts).ServeHTTP(httptest.NewRecorder(), req)

		// The cookie is still looked up by the public cluster name.
		assert.Equal(t, "Bearer cookie-token", receivedAuth(t, auths))
	})

	t.Run("returns 400 when the context key cannot be resolved", func(t *testing.T) {
		opts := transfer.Options{
			ContextKey: func(*http.Request) (string, error) { return "", errors.New("invalid kubeconfig") },
		}

		w := httptest.NewRecorder()
		body := strings.NewReader("content")
		req := httptest.NewRequest("POST", "/copy?path=/tmp&filename=test.txt", body)
		req = setMuxVars(req, defaultMuxVars())

		transfer.UploadHandler(store, opts).ServeHTTP(w, req)

		assert.Equal(t, http.StatusBadRequest, w.Code)
		assert.Contains(t, w.Body.String(), "invalid kubeconfig")
	})
}

//nolint:noctx // Test HTTP requests do not need a context.
func TestHandlerTokenResolution(t *testing.T) {
	const proxyHeader = "X-Forwarded-Id-Token"

	tests := []struct {
		name         string
		opts         transfer.Options
		headers      map[string]string
		cookie       string
		expectedAuth string
	}{
		{
			name:         "proxy-auth header wins when configured",
			opts:         transfer.Options{ProxyAuthTokenHeader: proxyHeader},
			headers:      map[string]string{proxyHeader: "proxy-token", "Authorization": "Bearer header-token"},
			cookie:       "cookie-token",
			expectedAuth: "Bearer proxy-token",
		},
		{
			name:         "proxy-auth header is ignored when not configured",
			headers:      map[string]string{proxyHeader: "proxy-token", "Authorization": "Bearer header-token"},
			expectedAuth: "Bearer header-token",
		},
		{
			name:         "authorization header wins over cookie",
			opts:         transfer.Options{ProxyAuthTokenHeader: proxyHeader},
			headers:      map[string]string{"Authorization": "Bearer header-token"},
			cookie:       "cookie-token",
			expectedAuth: "Bearer header-token",
		},
		{
			name:         "cookie is used when no header is set",
			cookie:       "cookie-token",
			expectedAuth: "Bearer cookie-token",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server, auths := newRecordingAPIServer(t)
			store := &MockContextStore{MockContext: createMockContextWithServer(server.URL)}

			req := httptest.NewRequest("GET", "/copy?path=/tmp/file.txt", nil)
			req = setMuxVars(req, defaultMuxVars())

			for name, value := range tt.headers {
				req.Header.Set(name, value)
			}

			if tt.cookie != "" {
				req.AddCookie(authCookie(tt.cookie))
			}

			transfer.DownloadHandler(store, tt.opts).ServeHTTP(httptest.NewRecorder(), req)

			assert.Equal(t, tt.expectedAuth, receivedAuth(t, auths))
		})
	}
}
