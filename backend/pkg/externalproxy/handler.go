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

package externalproxy

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const (
	// DefaultTimeout is the maximum time to wait for a proxy response.
	DefaultTimeout = 30 * time.Second
	// DefaultMaxResponseSize is the maximum size (in bytes) for proxied responses.
	DefaultMaxResponseSize int64 = 100 * 1024 * 1024
)

// Timeout and MaxResponseSize are package defaults that tests may override.
//
//nolint:gochecknoglobals // allow test override
var (
	Timeout         = DefaultTimeout
	MaxResponseSize = DefaultMaxResponseSize
)

// Handler proxies browser requests to allowlisted external URLs.
//
// The target URL is taken from the proxy-to header (or Forward-to for
// compatibility). Sensitive and hop-by-hop headers are stripped before the
// request is forwarded. Redirects are followed only when the new target is
// still on the allowlist; otherwise the proxy returns 502 with a generic body
// that does not disclose upstream URLs.
type Handler struct {
	// GetAllowlist returns the current ProxyURLs allowlist.
	GetAllowlist func() []AllowlistEntry
	// Timeout overrides DefaultTimeout when non-zero.
	Timeout time.Duration
	// MaxResponseSize overrides DefaultMaxResponseSize when non-zero.
	MaxResponseSize int64
	// Client is the HTTP client used for upstream requests.
	Client *http.Client
}

// NewHandler constructs a Handler with a shared redirect-aware HTTP client.
func NewHandler(getAllowlist func() []AllowlistEntry) *Handler {
	return &Handler{
		GetAllowlist: getAllowlist,
		Client:       NewHTTPClient(),
	}
}

func (h *Handler) timeout() time.Duration {
	if h.Timeout > 0 {
		return h.Timeout
	}

	return Timeout
}

func (h *Handler) maxResponseSize() int64 {
	if h.MaxResponseSize > 0 {
		return h.MaxResponseSize
	}

	return MaxResponseSize
}

func (h *Handler) client() *http.Client {
	if h.Client != nil {
		return h.Client
	}

	return NewHTTPClient()
}

// ServeHTTP implements http.Handler for /externalproxy.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	proxyURL := r.Header.Get("proxy-to")
	if proxyURL == "" && r.Header.Get("Forward-to") != "" {
		proxyURL = r.Header.Get("Forward-to")
	}

	if proxyURL == "" {
		logger.Log(logger.LevelError, nil, errors.New("proxy URL is empty"), "proxy URL is empty")
		http.Error(w, "proxy URL is empty", http.StatusBadRequest)

		return
	}

	targetURL, err := url.Parse(proxyURL)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"proxyURL": proxyURL}, err, "The provided proxy URL is invalid")
		http.Error(w, "The provided proxy URL is invalid", http.StatusBadRequest)

		return
	}

	allowlist := []AllowlistEntry{}
	if h.GetAllowlist != nil {
		allowlist = h.GetAllowlist()
	}

	if !MatchesAllowlist(targetURL.String(), allowlist) {
		denyErr := errors.New("no allowed proxy url match, request denied")
		logger.Log(logger.LevelError, map[string]string{"proxyURL": targetURL.Redacted()},
			denyErr, "no allowed proxy url match, request denied")
		http.Error(w, "no allowed proxy url match, request denied", http.StatusBadRequest)

		return
	}

	proxyCtx := context.WithValue(r.Context(), allowlistContextKey{}, allowlist)
	proxyCtx, cancel := context.WithTimeout(proxyCtx, h.timeout())
	defer cancel()

	proxyReq, err := http.NewRequestWithContext(proxyCtx, r.Method, proxyURL, r.Body) //nolint:gosec
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating request")
		http.Error(w, "external proxy request failed", http.StatusInternalServerError)

		return
	}

	proxyReq.Header = make(http.Header)
	CopyFilteredHeaders(proxyReq.Header, r.Header)

	// Disable caching
	w.Header().Set("Cache-Control", "no-cache, private, max-age=0")
	w.Header().Set("Expires", time.Unix(0, 0).Format(http.TimeFormat))
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("X-Accel-Expires", "0")

	resp, err := h.client().Do(proxyReq) //nolint:gosec
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "making request")
		http.Error(w, "external proxy request failed", http.StatusBadGateway)

		return
	}

	defer func() { _ = resp.Body.Close() }()

	var reader io.ReadCloser

	switch resp.Header.Get("Content-Encoding") {
	case "gzip":
		reader, err = gzip.NewReader(resp.Body)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "reading gzip response")
			http.Error(w, "external proxy request failed", http.StatusInternalServerError)

			return
		}

		defer func() { _ = reader.Close() }()
	default:
		reader = resp.Body
	}

	// Read the first chunk before committing the response so early upstream
	// failures can still return a 502 instead of an empty success response.
	firstChunk := make([]byte, 32*1024)

	n, readErr := reader.Read(firstChunk)
	if readErr != nil && !errors.Is(readErr, io.EOF) && n == 0 {
		logger.Log(logger.LevelError, nil, readErr, "reading response")
		http.Error(w, "external proxy request failed", http.StatusBadGateway)

		return
	}

	if contentType := resp.Header.Get("Content-Type"); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}

	maxSize := h.maxResponseSize()

	// Reject early if Content-Length exceeds the maximum allowed size.
	if resp.ContentLength > maxSize {
		logger.Log(logger.LevelError, nil, nil, "proxy response exceeded maximum allowed size (Content-Length)")
		http.Error(w, "response too large", http.StatusBadGateway)

		return
	}

	// Prevent unexpected or unfollowed redirects from being returned.
	if resp.StatusCode >= 300 && resp.StatusCode <= 399 && resp.StatusCode != http.StatusNotModified {
		logger.Log(logger.LevelError, nil, nil, "proxy response returned an unexpected or unfollowed redirect")
		http.Error(w, "external proxy request failed: unexpected redirect", http.StatusBadGateway)

		return
	}

	w.WriteHeader(resp.StatusCode)

	body := io.MultiReader(bytes.NewReader(firstChunk[:n]), reader)
	if _, err := io.Copy(w, io.LimitReader(body, maxSize)); err != nil {
		logger.Log(logger.LevelError, nil, err, "streaming response")

		return
	}
}
