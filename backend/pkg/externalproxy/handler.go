/*
Copyright 2025 The Kubernetes Authors.

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

// Package externalproxy handles proxying requests to external URLs.
package externalproxy

import (
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/gobwas/glob"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
)

const (
	// DefaultTimeout is the default timeout for proxy requests.
	DefaultTimeout = 30 * time.Second
)

// Handler handles external proxy requests.
type Handler struct {
	// AllowedURLs is a list of glob patterns for allowed proxy URLs.
	AllowedURLs []string
}

// NewHandler creates a new external proxy handler.
func NewHandler(allowedURLs []string) *Handler {
	return &Handler{
		AllowedURLs: allowedURLs,
	}
}

// ServeHTTP handles HTTP requests for external proxying.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	proxyURL := r.Header.Get("proxy-to")
	if proxyURL == "" && r.Header.Get("Forward-to") != "" {
		proxyURL = r.Header.Get("Forward-to")
	}

	if proxyURL == "" {
		logger.Log(logger.LevelError, map[string]string{"proxyURL": proxyURL},
			nil, "proxy URL is empty")
		http.Error(w, "proxy URL is empty", http.StatusBadRequest)

		return
	}

	parsedURL, err := url.Parse(proxyURL)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{"proxyURL": proxyURL},
			err, "The provided proxy URL is invalid")
		http.Error(w, fmt.Sprintf("The provided proxy URL is invalid: %v", err), http.StatusBadRequest)

		return
	}

	if !h.isURLAllowed(parsedURL) {
		logger.Log(logger.LevelError, map[string]string{"proxyURL": proxyURL},
			errors.New("no allowed proxy url match"), "no allowed proxy url match, request denied")
		http.Error(w, "no allowed proxy url match, request denied", http.StatusBadRequest)

		return
	}

	h.proxyRequest(w, r, proxyURL)
}

// isURLAllowed checks if the given URL matches any of the allowed URL patterns.
func (h *Handler) isURLAllowed(parsedURL *url.URL) bool {
	for _, allowedPattern := range h.AllowedURLs {
		g := glob.MustCompile(allowedPattern)
		if g.Match(parsedURL.String()) {
			return true
		}
	}

	return false
}

// proxyRequest performs the actual proxy request to the target URL.
func (h *Handler) proxyRequest(w http.ResponseWriter, r *http.Request, proxyURL string) {
	// Create context with timeout to prevent hanging requests
	ctx, cancel := context.WithTimeout(context.Background(), DefaultTimeout)
	defer cancel()

	proxyReq, err := http.NewRequestWithContext(ctx, r.Method, proxyURL, r.Body)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "creating request")
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	// Copy headers from original request, filtering as needed
	proxyReq.Header = make(http.Header)
	for h, val := range r.Header {
		proxyReq.Header[h] = val
	}

	// Create HTTP client; timeout is enforced by the request context
	client := http.Client{}

	resp, err := client.Do(proxyReq)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "making request")
		http.Error(w, err.Error(), http.StatusBadGateway)

		return
	}

	defer resp.Body.Close()

	// Copy relevant response headers from upstream (excluding certain headers we override)
	copyResponseHeaders(w, resp)

	// Set cache control headers (override any from upstream)
	setCacheControlHeaders(w)

	// Read and write response body
	if err := writeResponseBody(w, resp); err != nil {
		// Error already logged in writeResponseBody
		return
	}
}

// copyResponseHeaders copies headers from the upstream response to the client response,
// excluding headers that will be overridden.
func copyResponseHeaders(w http.ResponseWriter, resp *http.Response) {
	skipHeaders := map[string]bool{
		"Cache-Control":   true,
		"Expires":         true,
		"Pragma":          true,
		"X-Accel-Expires": true,
	}

	for key, values := range resp.Header {
		if !skipHeaders[key] {
			for _, value := range values {
				w.Header().Add(key, value)
			}
		}
	}
}

// setCacheControlHeaders sets cache control headers to disable caching.
func setCacheControlHeaders(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-cache, private, max-age=0")
	w.Header().Set("Expires", time.Unix(0, 0).Format(http.TimeFormat))
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("X-Accel-Expires", "0")
}

// writeResponseBody reads the response body (handling gzip encoding) and writes it to the client.
func writeResponseBody(w http.ResponseWriter, resp *http.Response) error {
	var reader io.ReadCloser

	var err error

	switch resp.Header.Get("Content-Encoding") {
	case "gzip":
		reader, err = gzip.NewReader(resp.Body)
		if err != nil {
			logger.Log(logger.LevelError, nil, err, "reading gzip response")
			http.Error(w, err.Error(), http.StatusInternalServerError)

			return err
		}

		defer reader.Close()
	default:
		reader = resp.Body
	}

	respBody, err := io.ReadAll(reader)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "reading response")
		http.Error(w, err.Error(), http.StatusBadGateway)

		return err
	}

	// Forward the upstream status code to the client
	w.WriteHeader(resp.StatusCode)

	_, err = w.Write(respBody)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "writing response")
		// Can't call http.Error here since we already wrote the header

		return err
	}

	return nil
}
