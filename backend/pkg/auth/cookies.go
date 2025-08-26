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
)

// SanitizeClusterName ensures cluster names are safe for use in cookie names.
func SanitizeClusterName(cluster string) string {
	// Only allow alphanumeric characters, hyphens, and underscores
	reg := regexp.MustCompile(`[^a-zA-Z0-9\-_]`)
	sanitized := reg.ReplaceAllString(cluster, "")

	// Limit length to prevent issues
	if len(sanitized) > 50 {
		sanitized = sanitized[:50]
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
func SetTokenCookie(w http.ResponseWriter, r *http.Request, cluster, token string) {
	// Validate inputs
	if cluster == "" || token == "" {
		return
	}

	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return
	}

	// Clear any existing cookies
	ClearTokenCookie(w, r, cluster)

	secure := IsSecureContext(r)

	// if token is larger than maxCookieSize, split it into multiple cookies
	chunks := splitToken(token, chunkSize)
	for i, chunk := range chunks {
		cookie := &http.Cookie{
			Name:     fmt.Sprintf("headlamp-auth-%s.%d", sanitizedCluster, i),
			Value:    chunk,
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteStrictMode,
			Path:     "/clusters/" + cluster,
			MaxAge:   86400, // 24 hours
		}

		http.SetCookie(w, cookie)
	}
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
func ClearTokenCookie(w http.ResponseWriter, r *http.Request, cluster string) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return
	}

	secure := IsSecureContext(r)

	// clear chunked cookies
	for i := 0; ; i++ {
		cookieName := fmt.Sprintf("headlamp-auth-%s.%d", sanitizedCluster, i)

		_, err := r.Cookie(cookieName)
		if err != nil {
			// No more cookies for this cluster
			break
		}

		cookie := &http.Cookie{
			Name:     cookieName,
			Value:    "",
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteStrictMode,
			Path:     "/clusters/" + cluster,
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
