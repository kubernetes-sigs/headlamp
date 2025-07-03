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

// getDomain extracts the appropriate domain for cookie setting
// This is useful for multi-subdomain deployments
func getDomain(r *http.Request) string {
	host := r.Host
	// Remove port if present
	if strings.Contains(host, ":") {
		host = strings.Split(host, ":")[0]
	}

	// For localhost/development, don't set domain
	if strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.0.0.1") {
		return ""
	}

	// For production, you might want to set to parent domain
	// e.g., ".example.com" to work across subdomains
	// This should be configurable based on your deployment
	return ""
}

// SanitizeClusterName ensures cluster names are safe for use in cookie names
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

// IsSecureContext determines if we should use secure cookies
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

// SetTokenCookie sets an authentication cookie for a specific cluster
func SetTokenCookie(w http.ResponseWriter, r *http.Request, cluster, token string) {
	// Validate inputs
	if cluster == "" || token == "" {
		return
	}

	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return
	}

	secure := IsSecureContext(r)

	cookie := &http.Cookie{
		Name:     fmt.Sprintf("headlamp-auth-%s", sanitizedCluster),
		Value:    token,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
		Path:     "/",
		MaxAge:   86400, // 24 hours
	}
	domain := getDomain(r)
	if domain != "" {
		cookie.Domain = domain
	}
	http.SetCookie(w, cookie)
}

// GetTokenFromCookie retrieves an authentication cookie for a specific cluster
func GetTokenFromCookie(r *http.Request, cluster string) (string, error) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return "", errors.New("invalid cluster name")
	}

	cookie, err := r.Cookie(fmt.Sprintf("headlamp-auth-%s", sanitizedCluster))
	if err != nil {
		return "", err
	}
	return cookie.Value, nil
}

// ClearTokenCookie clears an authentication cookie for a specific cluster
func ClearTokenCookie(w http.ResponseWriter, r *http.Request, cluster string) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return
	}

	secure := IsSecureContext(r)

	cookie := &http.Cookie{
		Name:     fmt.Sprintf("headlamp-auth-%s", sanitizedCluster),
		Value:    "",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
		Path:     "/",
		MaxAge:   -1,
	}
	http.SetCookie(w, cookie)
}
