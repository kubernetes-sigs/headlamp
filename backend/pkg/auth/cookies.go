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

package auth

import (
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

const (
	// chunkSize is the size of each token chunk, less than 4KB because of the size limit.
	chunkSize = 3800
	// maxCookieChunks is the maximum number of token chunk cookies to clear.
	maxCookieChunks = 10
)

// GetCookiePath returns the full cookie path including baseURL.
func GetCookiePath(baseURL, cluster string) string {
	if baseURL != "" {
		baseURL = "/" + strings.Trim(baseURL, "/")
		return baseURL + "/clusters/" + cluster
	}

	return "/clusters/" + cluster
}

// fnvHash computes a 32-bit FNV-1a hash formatted as an 8-character hex string.
func fnvHash(s string) string {
	var h uint32 = 2166136261
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}

	return fmt.Sprintf("%08x", h)
}

// SanitizeClusterName ensures cluster names are safe for use in cookie names.
func SanitizeClusterName(cluster string) string {
	// Only allow alphanumeric characters, hyphens, and underscores
	reg := regexp.MustCompile(`[^a-zA-Z0-9\-_]`)
	sanitized := reg.ReplaceAllString(cluster, "")

	// Limit length to prevent issues and use a deterministic hash suffix if truncated
	// to avoid cookie name collisions for clusters sharing a long prefix.
	if len(sanitized) > 50 {
		hashSuffix := fnvHash(cluster)
		sanitized = sanitized[:41] + "-" + hashSuffix
	}

	return sanitized
}

// IsSecureContext determines if we should use secure cookies.
func IsSecureContext(r *http.Request) bool {
	// Check if request came over HTTPS
	if r.TLS != nil {
		return true
	}

	// Check X-Forwarded-Proto header (for reverse proxies)
	if proto := r.Header.Get("X-Forwarded-Proto"); proto == "https" {
		return true
	}

	// Check if we're in localhost/development (allow insecure for dev)
	host := r.Host
	if strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.0.0.1") {
		return false
	}

	return false
}

// SetTokenCookie sets an authentication cookie for a specific cluster.
func SetTokenCookie(w http.ResponseWriter, r *http.Request, cluster, token, baseURL string, sessionTTL int) {
	// Validate inputs
	if cluster == "" || token == "" {
		return
	}

	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return
	}

	secure := IsSecureContext(r)

	// if token is larger than maxCookieSize, split it into multiple cookies
	chunks := splitToken(token, chunkSize)

	for i, chunk := range chunks {
		// G124: Secure is set from IsSecureContext so localhost development still works;
		// HttpOnly and SameSite are set unconditionally.
		cookie := &http.Cookie{ //nolint:gosec
			Name:     fmt.Sprintf("headlamp-auth-%s.%d", sanitizedCluster, i),
			Value:    chunk,
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteStrictMode,
			Path:     GetCookiePath(baseURL, cluster),
			MaxAge:   sessionTTL,
		}

		http.SetCookie(w, cookie)
	}

	// Clear any leftover higher-index cookies from previous longer tokens
	ClearTokenCookieFrom(w, r, cluster, baseURL, len(chunks))
}

// GetTokenFromCookie retrieves an authentication cookie for a specific cluster.
func GetTokenFromCookie(r *http.Request, cluster string) (string, error) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return "", errors.New("invalid cluster name")
	}

	// check for chunked cookies first
	var token strings.Builder

	for i := 0; ; i++ {
		cookie, err := r.Cookie(fmt.Sprintf("headlamp-auth-%s.%d", sanitizedCluster, i))
		if err != nil {
			break
		}

		token.WriteString(cookie.Value)
	}

	if token.Len() > 0 {
		return token.String(), nil
	}

	return "", nil
}

// ClearTokenCookie clears an authentication cookie for a specific cluster.
func ClearTokenCookie(w http.ResponseWriter, r *http.Request, cluster, baseURL string) {
	ClearTokenCookieFrom(w, r, cluster, baseURL, 0)
}

// ClearTokenCookieFrom clears authentication cookies starting from startChunk up to maxCookieChunks.
func ClearTokenCookieFrom(w http.ResponseWriter, r *http.Request, cluster, baseURL string, startChunk int) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return
	}

	secure := IsSecureContext(r)

	// Clear chunked cookies starting from startChunk up to maxCookieChunks to ensure potential
	// stale chunks are invalidated even when request URL path does not match cookie path.
	for i := startChunk; i < maxCookieChunks; i++ {
		cookieName := fmt.Sprintf("headlamp-auth-%s.%d", sanitizedCluster, i)

		// G124: Secure is set from IsSecureContext so localhost development still works;
		// HttpOnly and SameSite are set unconditionally.
		cookie := &http.Cookie{ //nolint:gosec
			Name:     cookieName,
			Value:    "",
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteStrictMode,
			Path:     GetCookiePath(baseURL, cluster),
			MaxAge:   -1,
		}

		http.SetCookie(w, cookie)
	}
}

// splitToken splits a token into chunks of a given size.
func splitToken(token string, size int) []string {
	var chunks []string

	for i := 0; i < len(token); i += size {
		end := i + size
		if end > len(token) {
			end = len(token)
		}

		chunks = append(chunks, token[i:end])
	}

	return chunks
}
