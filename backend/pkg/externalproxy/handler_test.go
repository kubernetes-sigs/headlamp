/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package externalproxy_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/externalproxy"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHandlerFiltersSensitiveHeaders(t *testing.T) {
	var received http.Header

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = r.Header.Clone()

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer upstream.Close()

	upstreamURL, err := url.Parse(upstream.URL)
	require.NoError(t, err)

	allowlist, err := externalproxy.CompileAllowlist([]string{upstreamURL.String()})
	require.NoError(t, err)

	handler := externalproxy.NewHandler(func() []externalproxy.AllowlistEntry { return allowlist })

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/externalproxy", nil)
	req.Header.Set("proxy-to", upstream.URL)
	req.Header.Set("Authorization", "Bearer sensitive")
	req.Header.Set("Cookie", "session=1")
	req.Header.Set("X-HEADLAMP_BACKEND-TOKEN", "secret")
	req.Header.Set("X-Custom-Preserve", "keep")

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "keep", received.Get("X-Custom-Preserve"))
	assert.Empty(t, received.Get("Authorization"))
	assert.Empty(t, received.Get("Cookie"))
	assert.Empty(t, received.Get("X-HEADLAMP_BACKEND-TOKEN"))
	assert.Empty(t, received.Get("proxy-to"))
}

func TestHandlerBlocksDisallowedRedirect(t *testing.T) {
	var mu sync.Mutex

	disallowedHit := false

	disallowed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		disallowedHit = true
		mu.Unlock()
	}))
	defer disallowed.Close()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, disallowed.URL, http.StatusFound)
	}))
	defer upstream.Close()

	upstreamURL, err := url.Parse(upstream.URL)
	require.NoError(t, err)

	allowlist, err := externalproxy.CompileAllowlist([]string{upstreamURL.String()})
	require.NoError(t, err)

	handler := externalproxy.NewHandler(func() []externalproxy.AllowlistEntry { return allowlist })

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/externalproxy", nil)
	req.Header.Set("proxy-to", upstream.URL)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadGateway, rr.Code)
	assert.Contains(t, rr.Body.String(), "external proxy request failed")
	assert.NotContains(t, rr.Body.String(), disallowed.URL)

	mu.Lock()
	assert.False(t, disallowedHit)
	mu.Unlock()
}

func TestHandlerFollowsAllowedRedirect(t *testing.T) {
	final := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("final"))
	}))
	defer final.Close()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, final.URL, http.StatusFound)
	}))
	defer upstream.Close()

	allowlist, err := externalproxy.CompileAllowlist([]string{upstream.URL + "*", final.URL + "*"})
	require.NoError(t, err)

	handler := externalproxy.NewHandler(func() []externalproxy.AllowlistEntry { return allowlist })

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/externalproxy", nil)
	req.Header.Set("proxy-to", upstream.URL)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "final", rr.Body.String())
}
