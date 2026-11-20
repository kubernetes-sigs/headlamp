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
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
)

const (
	// chunkSize is the size of each token chunk, less than 4KB because of the size limit.
	chunkSize = 3800
	// maxIDTokenChunks bounds client-controlled chunk-count metadata.
	maxIDTokenChunks   = 16
	maxAuthTokenChunks = 32

	// sharedTokenCookiePrefix names the cookies holding a token shared by every
	// cluster that trusts the same OIDC issuer + client-id (token broadcast).
	// SanitizeClusterName strips "~", so no cluster name can produce this prefix.
	sharedTokenCookiePrefix = "headlamp-auth~shared-" //nolint:gosec // cookie name, not a credential
	// logoutMarkerPrefix names the cookie that keeps a logged-out cluster from
	// reading the shared token. It lives on the shared cookie's path so it is
	// renewed with it (RenewLogoutMarkers).
	logoutMarkerPrefix = "headlamp-auth~out-"
)

// logoutMarkerNameRegex matches the marker cookies MarkLoggedOut sets.
var logoutMarkerNameRegex = regexp.MustCompile(`^headlamp-auth~out-[a-f0-9]{16}$`)

// sharedTokenKeyRegex matches keys produced by SharedTokenKey.
var sharedTokenKeyRegex = regexp.MustCompile(`^[a-f0-9]{16}$`)

// SharedTokenKeyResolver returns the shared token key and logout marker name
// of a cluster, resolved on the server from its kubeconfig, or ok=false.
type SharedTokenKeyResolver func(cluster string) (key, logoutMarker string, ok bool)

// SharedTokenIdentity returns the OIDC issuer + client-id a context may share a
// token under. Only operator-configured contexts qualify: a client-controlled
// kubeconfig must not be able to claim an issuer.
func SharedTokenIdentity(kCtx *kubeconfig.Context) (issuer, clientID string, ok bool) {
	if kCtx == nil || kCtx.Internal || !operatorConfigured(kCtx.Source) || !isOIDCAuthContext(kCtx) {
		return "", "", false
	}

	issuer, clientID = oidcIssuerAndClientID(kCtx)
	if issuer == "" || clientID == "" {
		return "", "", false
	}

	return issuer, clientID, true
}

// operatorConfigured reports whether a context from this source is set up by
// the operator rather than by a client. It is an allow-list: a source that is
// unset, or added later, is not trusted until it is listed here.
func operatorConfigured(source int) bool {
	switch source {
	case kubeconfig.KubeConfig, kubeconfig.InCluster, kubeconfig.ClusterInventory:
		return true
	default:
		return false
	}
}

// GetCookiePath returns the full cookie path including baseURL.
func GetCookiePath(baseURL, cluster string) string {
	if baseURL != "" {
		baseURL = "/" + strings.Trim(baseURL, "/")
		return baseURL + "/clusters/" + cluster
	}

	return "/clusters/" + cluster
}

// EncodeClusterForURL returns a path-safe representation of a cluster name.
func EncodeClusterForURL(cluster string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(cluster))
}

// DecodeClusterFromURL decodes an encoded cluster segment.
func DecodeClusterFromURL(segment string) (string, error) {
	cluster, err := base64.RawURLEncoding.DecodeString(segment)
	if err != nil {
		return "", fmt.Errorf("decode cluster URL segment: %w", err)
	}

	if len(cluster) == 0 {
		return "", errors.New("cluster URL segment is empty")
	}

	if !utf8.Valid(cluster) {
		return "", errors.New("cluster URL segment is not valid UTF-8")
	}

	return string(cluster), nil
}

// GetOIDCLogoutCookiePath returns the path for the restricted ID-token cookies.
func GetOIDCLogoutCookiePath(baseURL, cluster string) string {
	trimmedBaseURL := strings.Trim(baseURL, "/")
	if trimmedBaseURL != "" {
		trimmedBaseURL = "/" + trimmedBaseURL
	}

	return trimmedBaseURL + "/encoded-clusters/" + EncodeClusterForURL(cluster) + "/oidc-logout"
}

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

// GetForwardedProto extracts and normalizes the client protocol from the X-Forwarded-Proto header.
// If multiple comma-separated protocols are present (e.g. from multi-tier reverse proxies),
// the first (client-facing) protocol is returned in lowercase. Only "http" and "https" are recognized.
func GetForwardedProto(r *http.Request) string {
	if r == nil {
		return ""
	}

	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		return ""
	}

	if before, _, found := strings.Cut(proto, ","); found {
		proto = before
	}

	proto = strings.ToLower(strings.TrimSpace(proto))
	if proto == "http" || proto == "https" {
		return proto
	}

	return ""
}

// IsSecureContext determines if we should use secure cookies.
func IsSecureContext(r *http.Request) bool {
	// Check if request came over HTTPS
	if r.TLS != nil {
		return true
	}

	// Check X-Forwarded-Proto header (for reverse proxies)
	if GetForwardedProto(r) == "https" {
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
func SetTokenCookie(
	w http.ResponseWriter,
	r *http.Request,
	cluster, token, baseURL string,
	sessionTTL int,
) error {
	// Validate inputs
	if cluster == "" || token == "" {
		return nil
	}

	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return nil
	}

	return setAuthTokenChunks(w, IsSecureContext(r), GetCookiePath(baseURL, cluster),
		authTokenCookiePrefix(sanitizedCluster), token, sessionTTL)
}

// ClearLogoutMarker lifts the logout marker set by MarkLoggedOut. Called when
// the user picks a new identity for the cluster (login, set-token). markerID
// is the cluster's LogoutMarkerID.
func ClearLogoutMarker(w http.ResponseWriter, r *http.Request, markerID, baseURL string) {
	if markerID == "" {
		return
	}

	clearAuthCookie(w, IsSecureContext(r), GetCookiePath(baseURL, ""), LogoutMarkerName(markerID))
}

// LogoutMarkerID returns what the logout marker of a context is derived from:
// its kubeconfig file and the name it has there, which a rename leaves alone,
// or its own name when it does not come from a file. A NUL joins the file and
// the name, so a context name that has one gets no ID.
func LogoutMarkerID(kCtx *kubeconfig.Context) string {
	if kCtx == nil {
		return ""
	}

	if kCtx.KubeConfigContextName != "" {
		return kCtx.KubeConfigPath + "\x00" + kCtx.KubeConfigContextName
	}

	if strings.Contains(kCtx.Name, "\x00") {
		return ""
	}

	return kCtx.Name
}

// LogoutMarkerName returns the logout marker cookie name for a marker ID, or
// "" without one. It hashes the full ID: the markers share one path, so names
// that sanitize alike (prod.eu, prodeu) must not share a marker.
func LogoutMarkerName(markerID string) string {
	if markerID == "" {
		return ""
	}

	sum := sha256.Sum256([]byte(markerID))

	return logoutMarkerPrefix + hex.EncodeToString(sum[:8])
}

// GetTokenFromCookie retrieves the authentication cookie of a specific cluster.
// Handlers only ever see the cluster's own cookie: the shared token is resolved
// by the OIDC refresh middleware (ReadClusterToken) and handed to them in the
// Authorization header, with the shared cookies stripped from the request.
func GetTokenFromCookie(r *http.Request, cluster string) (string, error) {
	token, _, err := ReadClusterToken(r, cluster, nil)

	return token, err
}

// ReadClusterToken returns the cluster's own cookie token or, unless the
// cluster is logged out, its shared token and key. sharedKey is "" for an own
// token; a nil resolve reads the own cookie only.
func ReadClusterToken(
	r *http.Request, cluster string, resolve SharedTokenKeyResolver,
) (token, sharedKey string, err error) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return "", "", errors.New("invalid cluster name")
	}

	namePrefix := authTokenCookiePrefix(sanitizedCluster)
	cookies := parseRequestCookies(r)

	if token := cookies.chunks(namePrefix); token != "" {
		return token, "", nil
	}

	if resolve == nil || !cookies.hasPrefix(sharedTokenCookiePrefix) {
		return "", "", nil
	}

	// Without the marker name a logout cannot be seen, so nothing is shared.
	key, logoutMarker, ok := resolve(cluster)
	if !ok || logoutMarker == "" || cookies.has(logoutMarker) {
		return "", "", nil
	}

	token = cookies.chunks(sharedTokenCookiePrefix + key)
	if token == "" {
		return "", "", nil
	}

	return token, key, nil
}

// requestCookies is the request's Cookie header parsed once, first value wins
// as with http.Request.Cookie.
type requestCookies map[string]string

func parseRequestCookies(r *http.Request) requestCookies {
	all := r.Cookies()
	cookies := make(requestCookies, len(all))

	for _, cookie := range all {
		if _, dup := cookies[cookie.Name]; !dup {
			cookies[cookie.Name] = cookie.Value
		}
	}

	return cookies
}

func (c requestCookies) has(name string) bool {
	_, ok := c[name]

	return ok
}

func (c requestCookies) hasPrefix(prefix string) bool {
	for name := range c {
		if strings.HasPrefix(name, prefix) {
			return true
		}
	}

	return false
}

// chunks reassembles the <namePrefix>.<i> chunk cookies.
func (c requestCookies) chunks(namePrefix string) string {
	var token strings.Builder

	for i := 0; i < maxAuthTokenChunks; i++ {
		value, ok := c[fmt.Sprintf("%s.%d", namePrefix, i)]
		if !ok || value == "" {
			break
		}

		token.WriteString(value)
	}

	return token.String()
}

// ClearTokenCookieBounded invalidates chunk zero and clears other visible chunks.
// Unsent suffixes expire naturally and cannot be read without chunk zero.
func ClearTokenCookieBounded(w http.ResponseWriter, r *http.Request, cluster, baseURL string) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return
	}

	secure := IsSecureContext(r)
	cookiePath := GetCookiePath(baseURL, cluster)
	namePrefix := authTokenCookiePrefix(sanitizedCluster)

	for i := 0; i < maxAuthTokenChunks; i++ {
		if _, err := r.Cookie(fmt.Sprintf("%s.%d", namePrefix, i)); i > 0 && err != nil {
			continue
		}

		clearAuthTokenChunkCookie(w, secure, cookiePath, namePrefix, i)
	}
}

// MarkLoggedOut keeps a cluster from reading the shared token until its next
// login or set-token. The marker is renewed with the shared cookie
// (RenewLogoutMarkers), so it cannot expire first. markerID is the cluster's
// LogoutMarkerID.
func MarkLoggedOut(w http.ResponseWriter, r *http.Request, markerID, baseURL string, sessionTTL int) {
	if markerID == "" {
		return
	}

	setLogoutMarker(w, IsSecureContext(r), GetCookiePath(baseURL, ""), LogoutMarkerName(markerID), sessionTTL)
}

// RenewLogoutMarkers re-sets every logout marker the request carries with the
// session TTL. Called when the shared cookie is renewed, so the markers slide
// with it. Only well-formed marker names are renewed, and only with the fixed
// value, so nothing from the request is reflected into the response.
func RenewLogoutMarkers(w http.ResponseWriter, r *http.Request, baseURL string, sessionTTL int) {
	secure := IsSecureContext(r)
	cookiePath := GetCookiePath(baseURL, "")

	for name := range parseRequestCookies(r) {
		if logoutMarkerNameRegex.MatchString(name) {
			setLogoutMarker(w, secure, cookiePath, name, sessionTTL)
		}
	}
}

func setLogoutMarker(w http.ResponseWriter, secure bool, cookiePath, name string, sessionTTL int) {
	// G124: Secure is set from IsSecureContext so localhost development still works;
	// HttpOnly and SameSite are set unconditionally.
	http.SetCookie(w, &http.Cookie{ //nolint:gosec // Secure attribute is dynamically set based on request context
		Name:     name,
		Value:    "1",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
		Path:     cookiePath,
		MaxAge:   sessionTTL,
	})
}

// SharedTokenKey derives the shared cookie key for an OIDC issuer + client-id.
func SharedTokenKey(issuer, clientID string) string {
	sum := sha256.Sum256([]byte(issuer + "\x00" + clientID))
	return hex.EncodeToString(sum[:8])
}

// SetSharedTokenCookie stores a token once, under headlamp-auth~shared-<key>,
// for every cluster whose kubeconfig resolves to key. Like SetTokenCookie, an
// empty token stores nothing.
func SetSharedTokenCookie(
	w http.ResponseWriter,
	r *http.Request,
	key, token, baseURL string,
	sessionTTL int,
) error {
	if !sharedTokenKeyRegex.MatchString(key) {
		return errors.New("invalid shared token key")
	}

	if token == "" {
		return nil
	}

	// Scoped to <baseURL>/clusters/: visible to every cluster.
	return setAuthTokenChunks(w, IsSecureContext(r), GetCookiePath(baseURL, ""),
		sharedTokenCookiePrefix+key, token, sessionTTL)
}

// joinSharedToken makes a cluster read the shared token: its own chunk zero is
// cleared so a stale private token cannot shadow it, and its logout marker is
// lifted.
func joinSharedToken(w http.ResponseWriter, r *http.Request, kCtx *kubeconfig.Context, baseURL string) {
	cluster := kCtx.Name

	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return
	}

	secure := IsSecureContext(r)
	namePrefix := authTokenCookiePrefix(sanitizedCluster)

	clearAuthTokenChunkCookie(w, secure, GetCookiePath(baseURL, cluster), namePrefix, 0)
	clearAuthCookie(w, secure, GetCookiePath(baseURL, ""), LogoutMarkerName(LogoutMarkerID(kCtx)))
}

// StripSharedTokenCookies removes the shared token cookies from the Cookie
// header, which the cluster proxy forwards to the API server. It runs even
// with token broadcast off, as browsers keep the cookies until they expire.
func StripSharedTokenCookies(r *http.Request) {
	lines := r.Header.Values("Cookie")
	kept := make([]string, 0, len(lines))
	stripped := false

	for _, line := range lines {
		pairs := make([]string, 0, strings.Count(line, ";")+1)

		for _, pair := range strings.Split(line, ";") {
			pair = strings.TrimSpace(pair)
			if pair == "" {
				continue
			}

			name, _, _ := strings.Cut(pair, "=")
			if strings.HasPrefix(name, sharedTokenCookiePrefix) {
				stripped = true
				continue
			}

			pairs = append(pairs, pair)
		}

		if len(pairs) > 0 {
			kept = append(kept, strings.Join(pairs, "; "))
		}
	}

	if !stripped {
		return
	}

	r.Header.Del("Cookie")

	for _, line := range kept {
		r.Header.Add("Cookie", line)
	}
}

func authTokenCookiePrefix(sanitizedCluster string) string {
	return "headlamp-auth-" + sanitizedCluster
}

// setAuthTokenChunks writes token as <namePrefix>.<i> chunk cookies and clears
// the chunk following the last one.
func setAuthTokenChunks(
	w http.ResponseWriter,
	secure bool,
	cookiePath, namePrefix, token string,
	sessionTTL int,
) error {
	chunks, sizeErr := boundedAuthTokenChunks(token)
	for i, chunk := range chunks {
		// G124: Secure is set from IsSecureContext so localhost development still works;
		// HttpOnly and SameSite are set unconditionally.
		cookie := &http.Cookie{ //nolint:gosec // Secure attribute is dynamically set based on request context
			Name:     fmt.Sprintf("%s.%d", namePrefix, i),
			Value:    chunk,
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteStrictMode,
			Path:     cookiePath,
			MaxAge:   sessionTTL,
		}

		http.SetCookie(w, cookie)
	}

	if len(chunks) < maxAuthTokenChunks {
		clearAuthTokenChunkCookie(w, secure, cookiePath, namePrefix, len(chunks))
	}

	return sizeErr
}

func boundedAuthTokenChunks(token string) ([]string, error) {
	chunks := splitToken(token, chunkSize)
	if len(chunks) > maxAuthTokenChunks {
		return nil, fmt.Errorf("authentication token exceeds the %d-cookie storage limit", maxAuthTokenChunks)
	}

	return chunks, nil
}

func clearAuthTokenChunkCookie(w http.ResponseWriter, secure bool, cookiePath, namePrefix string, index int) {
	clearAuthCookie(w, secure, cookiePath, fmt.Sprintf("%s.%d", namePrefix, index))
}

func clearAuthCookie(w http.ResponseWriter, secure bool, cookiePath, name string) {
	// G124: Secure is set from IsSecureContext so localhost development still works;
	// HttpOnly and SameSite are set unconditionally.
	cookie := &http.Cookie{ //nolint:gosec // Secure attribute is dynamically set based on request context
		Name:     name,
		Value:    "",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
		Path:     cookiePath,
		MaxAge:   -1,
	}
	http.SetCookie(w, cookie)
}

// SetIDTokenCookie sets an ID token cookie for a specific cluster.
// This is used for OIDC RP-initiated logout (id_token_hint parameter).
// The cookie path is restricted to the cluster's oidc-logout endpoint.
// Large ID tokens are split into chunks to avoid exceeding per-cookie size limits (~4KB).
func SetIDTokenCookie(
	w http.ResponseWriter,
	r *http.Request,
	cluster, idToken, baseURL string,
	sessionTTL int,
) error {
	if cluster == "" || idToken == "" {
		return nil
	}

	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return nil
	}

	secure := IsSecureContext(r)

	cookiePath := GetOIDCLogoutCookiePath(baseURL, cluster)

	chunks, sizeErr := boundedIDTokenChunks(idToken)

	for i, chunk := range chunks {
		// G124: Secure is set from IsSecureContext so localhost development still works;
		// HttpOnly and SameSite are set unconditionally.
		cookie := &http.Cookie{ //nolint:gosec // Secure attribute is dynamically set based on request context
			Name:     fmt.Sprintf("headlamp-id-token-%s.%d", sanitizedCluster, i),
			Value:    chunk,
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteStrictMode,
			Path:     cookiePath,
			MaxAge:   sessionTTL,
		}

		http.SetCookie(w, cookie)
	}

	if len(chunks) < maxIDTokenChunks {
		clearIDTokenChunkCookie(w, secure, cookiePath, sanitizedCluster, len(chunks))
	}

	return sizeErr
}

func boundedIDTokenChunks(idToken string) ([]string, error) {
	chunks := splitToken(idToken, chunkSize)
	if len(chunks) > maxIDTokenChunks {
		return nil, fmt.Errorf("ID token exceeds the %d-cookie storage limit", maxIDTokenChunks)
	}

	return chunks, nil
}

// GetIDTokenFromCookie retrieves the ID token cookie for a specific cluster.
// Supports chunked cookies for large ID tokens.
func GetIDTokenFromCookie(r *http.Request, cluster string) (string, error) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return "", errors.New("invalid cluster name")
	}

	// Check for chunked cookies
	var idToken strings.Builder

	for i := 0; i < maxIDTokenChunks; i++ {
		cookie, err := r.Cookie(fmt.Sprintf("headlamp-id-token-%s.%d", sanitizedCluster, i))
		if err != nil {
			break
		}

		if cookie.Value == "" {
			break
		}

		idToken.WriteString(cookie.Value)
	}

	if idToken.Len() > 0 {
		return idToken.String(), nil
	}

	return "", http.ErrNoCookie
}

// ClearIDTokenCookie clears the ID token cookie for a specific cluster.
// Chunk zero is always invalidated, even when the request path hides the cookies.
func ClearIDTokenCookie(w http.ResponseWriter, r *http.Request, cluster, baseURL string) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return
	}

	secure := IsSecureContext(r)

	cookiePath := GetOIDCLogoutCookiePath(baseURL, cluster)

	for index := 0; index < maxIDTokenChunks; index++ {
		if _, err := r.Cookie(fmt.Sprintf("headlamp-id-token-%s.%d", sanitizedCluster, index)); index > 0 && err != nil {
			continue
		}

		clearIDTokenChunkCookie(w, secure, cookiePath, sanitizedCluster, index)
	}
}

func clearIDTokenChunkCookie(
	w http.ResponseWriter,
	secure bool,
	cookiePath, sanitizedCluster string,
	index int,
) {
	// G124: Secure is set from IsSecureContext so localhost development still works;
	// HttpOnly and SameSite are set unconditionally.
	cookie := &http.Cookie{ //nolint:gosec // Secure attribute is dynamically set based on request context
		Name:     fmt.Sprintf("headlamp-id-token-%s.%d", sanitizedCluster, index),
		Value:    "",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
		Path:     cookiePath,
		MaxAge:   -1,
	}
	http.SetCookie(w, cookie)
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
