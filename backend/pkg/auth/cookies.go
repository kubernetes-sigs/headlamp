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
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

const (
	// chunkSize is the size of each token chunk, less than 4KB because of the size limit.
	chunkSize = 3800
	// maxSanitizedClusterNamePrefixLen bounds the human-readable prefix SanitizeClusterName
	// keeps from the cluster name, before it appends the hash suffix that makes the result
	// unique. It does not bound the hash suffix itself.
	maxSanitizedClusterNamePrefixLen = 50
	// clusterNameHashBytes is the length of the hash suffix SanitizeClusterName appends, taken
	// from the front of a SHA-256 digest. At 128 bits, an accidental collision between two
	// different cluster names is not a practical concern (unlike a 32- or 64-bit checksum,
	// where the input space of arbitrary cluster names makes one essentially guaranteed over
	// enough distinct clusters); this is a cookie name, not a cryptographic commitment, so the
	// full 256 bits of SHA-256 would be unnecessary length for no further resistance that matters
	// here.
	clusterNameHashBytes = 16
	// authCookieNamePrefix is the prefix every cookie this package sets begins with. Anything
	// forwarding a caller's own Cookie header to a destination outside Headlamp's own cluster
	// proxying (see FilterAuthCookies) uses this to find Headlamp's own session cookies without
	// also stripping cookies the caller attached for its own purposes.
	authCookieNamePrefix = "headlamp-auth-"
	// minClearedCookieChunks is the minimum number of chunk indices ClearTokenCookie always
	// clears, regardless of whether the current request's path can see that many chunks already
	// set. See ClearTokenCookie's doc comment for why visibility cannot be relied on here.
	//
	// It is set equal to maxTokenChunks -- not just a generous-looking guess -- because the two
	// must agree for ClearTokenCookie's floor to actually guarantee full cleanup when a token
	// needed more than one scope's worth of chunks: if a token had ever been allowed more chunks
	// than this floor covers, a stale chunk beyond the floor could survive a clear it could not
	// see, and a later, shorter token would then have readChunkedCookie silently append that
	// stale tail onto itself. See SetTokenCookie for why this only has to be enforced when
	// useDeploymentScope applies.
	minClearedCookieChunks = maxTokenChunks
	// maxTokenChunks bounds how many chunks SetTokenCookie will ever split a token into when
	// useDeploymentScope applies -- about 19KB at chunkSize bytes each. A deployment that never
	// uses --oidc-use-impersonation, or a cluster it does not apply to, never has this enforced
	// at all (see SetTokenCookie): docs/installation/in-cluster/oidc.md documents support for
	// JWTs well beyond this, via ingress buffer tuning, and that must keep working unchanged
	// when the flag is off, exactly as every other part of this feature does.
	maxTokenChunks = 5
)

// GetCookiePath returns the cookie path for an auth cookie. When useDeploymentScope is true, the
// cookie is scoped to the whole deployment rather than to this one cluster; otherwise it is
// scoped to this cluster alone, as every cookie was before --oidc-use-impersonation existed.
//
// The broader scope exists because some routes that must authenticate the OIDC identity for
// impersonation -- the WebSocket multiplexer and node drain -- are not themselves cluster-scoped
// paths, so a browser would never attach a per-cluster cookie to them. Callers pass true only
// when impersonation applies to this specific cluster, not unconditionally: with it, every
// request carries every cluster's token chunks, so applying it to every OIDC deployment
// (impersonation or not) would grow the Cookie header with each additional cluster a user logs
// into, risking "431 Request Header Fields Too Large" from an ingress or load balancer in front
// of Headlamp, in deployments that never asked for impersonation at all.
func GetCookiePath(baseURL, cluster string, useDeploymentScope bool) string {
	prefix := ""
	if baseURL != "" {
		prefix = "/" + strings.Trim(baseURL, "/")
	}

	if useDeploymentScope {
		return prefix + "/"
	}

	return prefix + "/clusters/" + cluster
}

// SanitizeClusterName returns a cookie-name-safe identifier for cluster. The human-readable
// part alone is not unique: punctuation is stripped and the result is truncated, so two
// differently named clusters (for example "prod.a" and "prod!a") can produce the same prefix.
// A hash of the full, original name is appended so two different clusters cannot collide on the
// same cookie name -- which matters because cookies now share one path (see GetCookiePath)
// instead of one per cluster, so a name collision would let one cluster's request read another
// cluster's token. An input that sanitizes to nothing (including the empty string) still
// returns "", preserving callers' existing "invalid cluster name" check.
func SanitizeClusterName(cluster string) string {
	// Only allow alphanumeric characters, hyphens, and underscores.
	reg := regexp.MustCompile(`[^a-zA-Z0-9\-_]`)
	sanitized := reg.ReplaceAllString(cluster, "")

	if sanitized == "" {
		return ""
	}

	if len(sanitized) > maxSanitizedClusterNamePrefixLen {
		sanitized = sanitized[:maxSanitizedClusterNamePrefixLen]
	}

	sum := sha256.Sum256([]byte(cluster))

	return fmt.Sprintf("%s-%x", sanitized, sum[:clusterNameHashBytes])
}

// legacySanitizedClusterName returns the cookie-name identifier this package used before
// SanitizeClusterName appended a hash suffix. It exists only so ClearTokenCookie can also clear
// a cookie a client's browser may still be holding under that earlier format.
func legacySanitizedClusterName(cluster string) string {
	reg := regexp.MustCompile(`[^a-zA-Z0-9\-_]`)
	sanitized := reg.ReplaceAllString(cluster, "")

	if len(sanitized) > maxSanitizedClusterNamePrefixLen {
		sanitized = sanitized[:maxSanitizedClusterNamePrefixLen]
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

// SetTokenCookie sets an authentication cookie for a specific cluster. useDeploymentScope widens
// the cookie's path to the whole deployment instead of just this cluster; pass true only when
// impersonation applies to this cluster (see GetCookiePath).
//
// A non-nil error means no cookie was set (or, if one existed, it was cleared rather than left
// in place -- see the oversized-token case below). Callers must not report a successful
// login/token-set when this returns an error: a cleared cookie leaves the user logged out, but
// an error silently ignored would instead leave the PREVIOUS cookie's holder's identity (or no
// identity at all) in effect while the caller tells the user the new one took effect.
func SetTokenCookie(
	w http.ResponseWriter, r *http.Request, cluster, token, baseURL string, sessionTTL int,
	useDeploymentScope bool,
) error {
	if cluster == "" || token == "" {
		return errors.New("cluster and token must not be empty")
	}

	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return errors.New("invalid cluster name")
	}

	// Cleared unconditionally, even if the new token below turns out to be unstorable: a user
	// switching identity must not be left silently authenticated as whoever the previous
	// cookie belonged to just because storing the new one failed.
	ClearTokenCookie(w, r, cluster, baseURL)

	// if token is larger than maxCookieSize, split it into multiple cookies
	chunks := splitToken(token, chunkSize)
	if useDeploymentScope && len(chunks) > maxTokenChunks {
		// Rejected rather than stored: a token beyond maxTokenChunks would leave chunks
		// ClearTokenCookie's own floor cannot guarantee clearing later (see its doc comment and
		// maxTokenChunks's), and storing it partially would be worse than not storing it, since
		// GetTokenFromCookie would silently return a truncated, invalid token.
		//
		// This is only enforced when useDeploymentScope applies: that is what lets a cluster's
		// cookie scope change between logins (narrow to wide or back), which is what makes a
		// stale chunk beyond the floor actually reachable. A deployment that never uses
		// --oidc-use-impersonation, or a cluster it does not apply to, keeps the unbounded
		// behavior this package has always had -- docs/installation/in-cluster/oidc.md's
		// documented support for large JWTs via ingress tuning must keep working unchanged when
		// the flag is off.
		return fmt.Errorf("OIDC token for cluster %q needs more cookie chunks than the %d this "+
			"package guarantees can be cleared later", cluster, maxTokenChunks)
	}

	secure := IsSecureContext(r)
	path := GetCookiePath(baseURL, cluster, useDeploymentScope)

	for i, chunk := range chunks {
		// G124: Secure is set from IsSecureContext so localhost development still works;
		// HttpOnly and SameSite are set unconditionally.
		cookie := &http.Cookie{ //nolint:gosec
			Name:     fmt.Sprintf("%s%s.%d", authCookieNamePrefix, sanitizedCluster, i),
			Value:    chunk,
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteStrictMode,
			Path:     path,
			MaxAge:   sessionTTL,
		}

		http.SetCookie(w, cookie)
	}

	return nil
}

// GetTokenFromCookie retrieves an authentication cookie for a specific cluster. If no cookie
// exists under the current, hash-suffixed name (see SanitizeClusterName), it falls back to the
// pre-rollout name: that hash suffix changed every cookie's name the moment this package started
// appending it, even for a deployment where impersonation is off and nothing about the cookie's
// path changed, so without this fallback every existing browser session would be logged out by
// the upgrade alone. ClearTokenCookie clears a legacy cookie once a fresh login is set, so this
// fallback is only ever needed for a session that predates that first login after the upgrade.
func GetTokenFromCookie(r *http.Request, cluster string) (string, error) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return "", errors.New("invalid cluster name")
	}

	if token := readChunkedCookie(r, sanitizedCluster); token != "" {
		return token, nil
	}

	legacySanitized := legacySanitizedClusterName(cluster)
	if token := readChunkedCookie(r, legacySanitized); token != "" {
		return token, nil
	}

	return "", nil
}

// readChunkedCookie reassembles the chunks of one cookie name, as written by SetTokenCookie's
// chunking loop, returning "" if none are present.
func readChunkedCookie(r *http.Request, sanitizedName string) string {
	var token strings.Builder

	for i := 0; ; i++ {
		cookie, err := r.Cookie(fmt.Sprintf("%s%s.%d", authCookieNamePrefix, sanitizedName, i))
		if err != nil {
			break
		}

		token.WriteString(cookie.Value)
	}

	return token.String()
}

// ClearTokenCookie clears an authentication cookie for a specific cluster, at both cookie name
// formats this package has used (see legacySanitizedClusterName) and both path scopes (see
// GetCookiePath). Since useDeploymentScope can differ between one login and the next -- an
// operator can turn --oidc-use-impersonation on or off, and the same cluster can be reached
// through a non-impersonated and an impersonated context -- a cookie may exist under either
// scope regardless of the current setting. Cookies are matched by name and path together, so a
// stale one would otherwise never be cleared; left behind, it would keep shadowing a freshly
// issued cookie of the same name, since browsers send the more path-specific of two same-named
// cookies first and GetTokenFromCookie reads only that first match.
//
// It cannot rely purely on r.Cookie() to discover how many chunks exist: that only sees cookies
// whose Path matches the CURRENT request's path, so a caller on a deployment-wide route (for
// example /oidc-callback, where a fresh login is set) can never see a stale cluster-scoped
// cookie at all, even though it is exactly the case that matters most. So this always clears a
// minimum floor of chunk indices (minClearedCookieChunks) regardless of visibility, and keeps
// going past that floor only while visibility suggests more chunks exist.
func ClearTokenCookie(w http.ResponseWriter, r *http.Request, cluster, baseURL string) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return
	}

	legacySanitized := legacySanitizedClusterName(cluster)
	secure := IsSecureContext(r)
	paths := []string{
		GetCookiePath(baseURL, cluster, true),
		GetCookiePath(baseURL, cluster, false),
	}

	clear := func(name, path string) {
		// G124: Secure is set from IsSecureContext so localhost development still works;
		// HttpOnly and SameSite are set unconditionally.
		http.SetCookie(w, &http.Cookie{ //nolint:gosec
			Name:     name,
			Value:    "",
			HttpOnly: true,
			Secure:   secure,
			SameSite: http.SameSiteStrictMode,
			Path:     path,
			MaxAge:   -1,
		})
	}

	for i := 0; ; i++ {
		currentName := fmt.Sprintf("%s%s.%d", authCookieNamePrefix, sanitizedCluster, i)
		legacyName := fmt.Sprintf("%s%s.%d", authCookieNamePrefix, legacySanitized, i)

		_, currentErr := r.Cookie(currentName)
		_, legacyErr := r.Cookie(legacyName)

		visible := currentErr == nil || legacyErr == nil

		if i >= minClearedCookieChunks && !visible {
			// Past the guaranteed floor, and nothing suggests a chunk exists at this index
			// under either name.
			break
		}

		names := []string{currentName}
		if legacyName != currentName {
			names = append(names, legacyName)
		}

		for _, name := range names {
			for _, path := range paths {
				clear(name, path)
			}
		}
	}
}

// FilterAuthCookies returns the cookies on r other than Headlamp's own auth cookies (see
// SetTokenCookie). It is for handlers that forward a caller's Cookie header to a destination
// outside Headlamp's own cluster proxying -- where Headlamp's session cookies must never be
// forwarded, since they are scoped to the whole deployment and can carry every cluster's token,
// but a caller's own, unrelated cookies for that destination may legitimately need to be.
func FilterAuthCookies(r *http.Request) []*http.Cookie {
	cookies := r.Cookies()
	filtered := make([]*http.Cookie, 0, len(cookies))

	for _, cookie := range cookies {
		if strings.HasPrefix(cookie.Name, authCookieNamePrefix) {
			continue
		}

		filtered = append(filtered, cookie)
	}

	return filtered
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
