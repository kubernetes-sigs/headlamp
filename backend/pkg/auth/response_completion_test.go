/*
Copyright 2026 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package auth //nolint:testpackage // Exercise the internal writer lifecycle without exporting a transport-only helper.

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTokenResponseCompletionOnWrites(t *testing.T) {
	for _, mode := range []string{"write", "flush", "copy", "empty", "flush-error"} {
		t.Run(mode, func(t *testing.T) {
			completed := 0
			recorder := httptest.NewRecorder()

			var writer http.ResponseWriter = recorder
			if mode == "flush-error" {
				writer = &failedFlushWriter{recorder}
			}

			request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
			serveTokenRefreshResponse(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				switch mode {
				case "write", "flush-error":
					_, _ = w.Write([]byte("event"))
				case "flush":
					w.(http.Flusher).Flush()
				case "copy":
					_, _ = io.Copy(w, strings.NewReader("event"))
				case "empty":
					return
				}

				assert.Equal(t, 1, completed, "completion must occur before returning from the handler")
			}), writer, request, func() { completed++ })
			assert.Equal(t, 1, completed, "completion must run exactly once")
		})
	}
}

type failedFlushWriter struct{ *httptest.ResponseRecorder }

func (*failedFlushWriter) FlushError() error { return errors.New("connection closed") }

func TestTokenResponseCompletesBeforeStreamEnds(t *testing.T) {
	completed, release := make(chan struct{}), make(chan struct{})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Set-Cookie", "renewed=token; Secure; HttpOnly; SameSite=Strict")
		serveTokenRefreshResponse(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusForbidden)
			<-release
		}), w, r, func() { close(completed) })
	}))
	defer server.Close()
	defer close(release)

	client := server.Client()
	client.Timeout = time.Second * 3
	request, err := http.NewRequestWithContext(t.Context(), http.MethodGet, server.URL, nil)
	require.NoError(t, err)
	response, err := client.Do(request)
	require.NoError(t, err)

	defer func() { _ = response.Body.Close() }()

	assert.Equal(t, http.StatusForbidden, response.StatusCode)
	assert.Len(t, response.Cookies(), 1)

	select {
	case <-completed:
	case <-time.After(time.Second):
		t.Fatal("refresh retained until the streaming handler returns")
	}
}

func TestTokenResponseCompletionOnAbort(t *testing.T) {
	completed := 0
	writer := httptest.NewRecorder()
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	assert.Panics(t, func() {
		serveTokenRefreshResponse(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			panic(http.ErrAbortHandler)
		}), writer, request, func() { completed++ })
	})
	assert.Equal(t, 1, completed)
	assert.False(t, writer.Flushed, "an aborted response must not be converted into success")
}
