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

var (
	errEmptyProxyURL   = errors.New("proxy URL is empty")
	errInvalidProxyURL = errors.New("invalid proxy URL")
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
	GetAllowlist func() ([]AllowlistEntry, error)
	// Timeout overrides DefaultTimeout when non-zero.
	Timeout time.Duration
	// MaxResponseSize overrides DefaultMaxResponseSize when non-zero.
	MaxResponseSize int64
	// Client is the HTTP client used for upstream requests.
	Client *http.Client
}

// NewHandler constructs a Handler with a shared redirect-aware HTTP client.
func NewHandler(getAllowlist func() ([]AllowlistEntry, error)) *Handler {
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

func targetURLFromRequest(r *http.Request) (*url.URL, error) {
	proxyURL := r.Header.Get("proxy-to")
	if proxyURL == "" && r.Header.Get("Forward-to") != "" {
		proxyURL = r.Header.Get("Forward-to")
	}

	if proxyURL == "" {
		return nil, errEmptyProxyURL
	}

	parsed, err := url.Parse(proxyURL)
	if err != nil {
		// url.Parse errors embed the raw input; return a generic error so
		// logs do not leak potentially sensitive proxy-to values.
		return nil, errInvalidProxyURL
	}

	if err := validateProxyURL(parsed); err != nil {
		return nil, err
	}

	return parsed, nil
}

func validateProxyURL(targetURL *url.URL) error {
	if targetURL.Scheme != "http" && targetURL.Scheme != "https" {
		return errInvalidProxyURL
	}

	if targetURL.Host == "" {
		return errInvalidProxyURL
	}

	if targetURL.User != nil {
		return errInvalidProxyURL
	}

	return nil
}

func proxyURLHeaderForLog(r *http.Request) string {
	proxyURL := r.Header.Get("proxy-to")
	if proxyURL == "" {
		proxyURL = r.Header.Get("Forward-to")
	}

	if proxyURL == "" {
		return ""
	}

	parsed, err := url.Parse(proxyURL)
	if err != nil {
		return "[invalid]"
	}

	return redactURLForLog(parsed)
}

func writeTargetURLError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, errEmptyProxyURL) {
		logger.Log(logger.LevelError, nil, err, "proxy URL is empty")
		http.Error(w, "proxy URL is empty", http.StatusBadRequest)

		return
	}

	logger.Log(logger.LevelError, map[string]string{"proxyURL": proxyURLHeaderForLog(r)},
		err, "The provided proxy URL is invalid")
	http.Error(w, "The provided proxy URL is invalid", http.StatusBadRequest)
}

func (h *Handler) allowlist() ([]AllowlistEntry, error) {
	if h.GetAllowlist == nil {
		return nil, nil
	}

	return h.GetAllowlist()
}

func writeAllowlistDenied(w http.ResponseWriter, targetURL *url.URL) {
	denyErr := errors.New("no allowed proxy URL match, request denied")
	logger.Log(logger.LevelError, map[string]string{"proxyURL": redactURLForLog(targetURL)},
		denyErr, "No allowed proxy URL match, request denied")
	http.Error(w, "No allowed proxy URL match, request denied", http.StatusBadRequest)
}

func redactURLForLog(targetURL *url.URL) string {
	if targetURL == nil {
		return ""
	}

	redacted := *targetURL
	redacted.Path = ""
	redacted.RawPath = ""
	redacted.RawQuery = ""
	redacted.Fragment = ""

	return redacted.Redacted()
}

func setNoCacheHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-cache, private, max-age=0")
	w.Header().Set("Expires", time.Unix(0, 0).Format(http.TimeFormat))
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("X-Accel-Expires", "0")
}

func responseReader(resp *http.Response) (io.ReadCloser, error) {
	switch resp.Header.Get("Content-Encoding") {
	case "gzip":
		return gzip.NewReader(resp.Body)
	default:
		return resp.Body, nil
	}
}

func writeUpstreamResponse(w http.ResponseWriter, resp *http.Response, reader io.Reader, maxSize int64) {
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

	if resp.ContentLength > maxSize {
		logger.Log(logger.LevelError, nil, nil, "proxy response exceeded maximum allowed size (Content-Length)")
		http.Error(w, "response too large", http.StatusBadGateway)

		return
	}

	if resp.StatusCode >= 300 && resp.StatusCode <= 399 && resp.StatusCode != http.StatusNotModified {
		logger.Log(logger.LevelError, nil, nil, "proxy response returned an unexpected or unfollowed redirect")
		http.Error(w, "external proxy request failed: unexpected redirect", http.StatusBadGateway)

		return
	}

	w.WriteHeader(resp.StatusCode)

	body := io.MultiReader(bytes.NewReader(firstChunk[:n]), reader)
	if _, err := io.Copy(w, io.LimitReader(body, maxSize)); err != nil {
		logger.Log(logger.LevelError, nil, err, "streaming response")
	}
}

func (h *Handler) proxyRequest(
	w http.ResponseWriter,
	r *http.Request,
	targetURL *url.URL,
	allowlist []AllowlistEntry,
) {
	proxyCtx := context.WithValue(r.Context(), allowlistContextKey{}, allowlist)

	proxyCtx, cancel := context.WithTimeout(proxyCtx, h.timeout())

	defer cancel()

	proxyReq, err := http.NewRequestWithContext(proxyCtx, r.Method, targetURL.String(), r.Body) //nolint:gosec
	if err != nil {
		// Omit the raw error: it can embed the upstream URL (path/query).
		logger.Log(logger.LevelError, map[string]string{"proxyURL": redactURLForLog(targetURL)},
			nil, "creating request")
		http.Error(w, "external proxy request failed", http.StatusInternalServerError)

		return
	}

	proxyReq.Header = make(http.Header)
	CopyFilteredHeaders(proxyReq.Header, r.Header)
	setNoCacheHeaders(w)

	resp, err := h.client().Do(proxyReq) //nolint:gosec
	if err != nil {
		// CheckRedirect can return both a non-nil response and an error; close the body to avoid leaks.
		if resp != nil {
			_ = resp.Body.Close()
		}

		// Omit the raw error: net/http errors include the full request URL.
		logger.Log(logger.LevelError, map[string]string{"proxyURL": redactURLForLog(targetURL)},
			nil, "making request")
		http.Error(w, "external proxy request failed", http.StatusBadGateway)

		return
	}

	defer func() { _ = resp.Body.Close() }()

	reader, err := responseReader(resp)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading gzip response")
		http.Error(w, "external proxy request failed", http.StatusInternalServerError)

		return
	}

	if reader != resp.Body {
		defer func() { _ = reader.Close() }()
	}

	writeUpstreamResponse(w, resp, reader, h.maxResponseSize())
}

// ServeHTTP implements http.Handler for /externalproxy.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	targetURL, err := targetURLFromRequest(r)
	if err != nil {
		writeTargetURLError(w, r, err)

		return
	}

	allowlist, err := h.allowlist()
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "compiling proxy URL patterns")
		http.Error(w, "failed to compile proxy URL patterns", http.StatusInternalServerError)

		return
	}

	if !MatchesAllowlist(targetURL.String(), allowlist) {
		writeAllowlistDenied(w, targetURL)

		return
	}

	h.proxyRequest(w, r, targetURL, allowlist)
}
