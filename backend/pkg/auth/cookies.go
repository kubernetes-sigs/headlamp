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
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	// chunkSize is the size of each token chunk, less than 4KB because of the size limit.
	chunkSize = 3800
	// maxIDTokenChunks bounds the ID-token-for-logout cookie (see SetIDTokenCookie), the
	// separate, deployment-agnostic cookie namespace RP-initiated logout uses to remember the
	// id_token_hint across refreshes. It does not share maxTokenChunks/maxTrackedTokenChunks
	// below: those bound and trust-track the headlamp-auth-* session cookie this file's own
	// SetTokenCookie/ClearTokenCookie/tokenCookieMetadata machinery manages, which the ID-token
	// cookie is intentionally kept separate from.
	maxIDTokenChunks = 16
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
	authCookieNamePrefix   = "headlamp-auth-"
	chunkCountCookiePrefix = authCookieNamePrefix + "chunks-"
	// cookieScopeCluster and cookieScopeDeployment are the two values the chunk-count
	// metadata's scope field can record (see SetTokenCookie and tokenCookieMetadata).
	cookieScopeCluster    = "cluster"
	cookieScopeDeployment = "deployment"
	// minClearedCookieChunks is the minimum number of chunk indices ClearTokenCookie always
	// clears, regardless of whether the current request's path can see that many chunks already
	// set. See ClearTokenCookie's doc comment for why visibility cannot be relied on here.
	//
	// It is set equal to maxTokenChunks -- not just a generous-looking guess -- because the two
	// must agree as a fallback for cookies issued before chunk-count metadata was introduced.
	// New cookies use their metadata to clear every chunk regardless of the request path.
	minClearedCookieChunks = maxTokenChunks
	// maxTokenChunks bounds how many chunks SetTokenCookie will ever split a token into when
	// useDeploymentScope applies -- about 19KB at chunkSize bytes each. This is tighter than
	// maxTrackedTokenChunks because ClearTokenCookie's floor (minClearedCookieChunks) must
	// guarantee full cleanup for a cookie whose scope can change between logins (narrow to wide
	// or back), which only a deployment-scoped cookie's cross-scope migration actually needs.
	maxTokenChunks = 5
	// maxTrackedTokenChunks bounds every chunk count this package will ever store or trust,
	// cluster-scoped tokens included -- about 76KB at chunkSize bytes each, comfortably past
	// the 64KiB docs/installation/in-cluster/oidc.md documents needing ingress buffer tuning
	// for. It serves two purposes that must share one number: it is the largest token
	// SetTokenCookie will accept for a cluster-scoped cookie (see its oversized-token check),
	// and it is the largest chunk count tokenCookieMetadata will trust from a cookie. If those
	// two disagreed, a token SetTokenCookie legitimately stored could record a chunk count its
	// own metadata read back as untrustworthy (see tokenCookieMetadata), silently losing the
	// exact-count guarantee for a token that was never rejected -- precisely the stale-tail
	// risk the metadata mechanism exists to close. It also bounds how many cleanup headers
	// ClearTokenCookie will generate from client-supplied cookies it cannot otherwise trust the
	// size of, which is the DoS concern this constant was first introduced for.
	maxTrackedTokenChunks = 20
	// maxLegacyAuthTokenChunks bounds readChunkedCookie's reassembly loop ONLY when reading the
	// legacy, pre-rollout cookie name (see legacySanitizedClusterName). Those cookies predate the
	// chunk-count metadata mechanism entirely -- metadata is never present for them -- and were
	// written by this package's previous implementation, whose own chunk cap was 32, not
	// maxTrackedTokenChunks's 20. A legacy session that happened to use 21-32 chunks is exactly
	// the case GetTokenFromCookie's legacy fallback exists to keep working across the upgrade
	// (see its doc comment); capping that read at the new, tighter maxTrackedTokenChunks would
	// silently truncate such a session's token on every request after the upgrade instead of
	// reassembling it, breaking authentication for no reason the metadata mechanism was meant to
	// guard against. It is still a small, fixed bound, so the DoS concern maxTrackedTokenChunks
	// exists for (see readChunkedCookie) is unaffected by the slightly higher ceiling.
	maxLegacyAuthTokenChunks = 32
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

// hashSuffixPattern matches the shape SanitizeClusterName's output always has: some prefix,
// a hyphen, then exactly clusterNameHashBytes bytes of lowercase hex (see clusterNameHashBytes).
var hashSuffixPattern = regexp.MustCompile(`-[0-9a-f]{32}$`)

// legacySanitizedClusterName returns the cookie-name identifier this package used before
// SanitizeClusterName appended a hash suffix. It exists only so ClearTokenCookie can also clear
// a cookie a client's browser may still be holding under that earlier format.
//
// If cluster's name alone (with no hash suffix) already has the exact shape SanitizeClusterName's
// output has -- some prefix, a hyphen, then clusterNameHashBytes of hex -- this returns "" instead
// of that name. Without this check, a cluster deliberately named like another cluster's
// SanitizeClusterName output (say, B named "main-0d6e4079e36703ebd37c00722f5891d2") would have
// legacySanitizedClusterName(B) collide with SanitizeClusterName("main"): reading or clearing B's
// cookie would then read or clear "main"'s current cookie instead, across a cluster boundary this
// package exists to keep separate. Legitimate legacy cookies essentially never have this shape, so
// losing the legacy-cookie fallback for that one, specially-crafted name is an acceptable trade for
// closing the collision.
func legacySanitizedClusterName(cluster string) string {
	reg := regexp.MustCompile(`[^a-zA-Z0-9\-_]`)
	sanitized := reg.ReplaceAllString(cluster, "")

	if len(sanitized) > maxSanitizedClusterNamePrefixLen {
		sanitized = sanitized[:maxSanitizedClusterNamePrefixLen]
	}

	if hashSuffixPattern.MatchString(sanitized) {
		return ""
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
// A non-nil error means no new cookie was set. In particular, oversized deployment-scoped tokens are
// rejected before ClearTokenCookie runs, so an existing cookie is left intact. Callers must not
// report a successful login/token-set when this returns an error, because the requested token did
// not take effect and the previous session (or no session at all) remains active.
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

	// if token is larger than maxCookieSize, split it into multiple cookies
	chunks := splitToken(token, chunkSize)

	// Deployment-scoped cookies get the tighter maxTokenChunks bound, since that is what
	// ClearTokenCookie's floor can unconditionally guarantee clearing for a cookie whose scope
	// can change between logins (see maxTokenChunks). Cluster-scoped cookies get the larger
	// maxTrackedTokenChunks bound instead of no bound at all: that is the most this package will
	// ever write chunk-count metadata for (see maxTrackedTokenChunks), so storing more here
	// would write metadata tokenCookieMetadata could not later trust, reintroducing the very
	// stale-tail risk the metadata exists to close -- just for an oversized cluster-scoped token
	// instead of a deployment-scoped one.
	maxChunksForScope := maxTrackedTokenChunks
	if useDeploymentScope {
		maxChunksForScope = maxTokenChunks
	}

	if len(chunks) > maxChunksForScope {
		// Rejected rather than stored: storing it partially (or with metadata this package
		// cannot later trust) would be worse than not storing it, since GetTokenFromCookie
		// would silently return a truncated, invalid token.
		return fmt.Errorf("OIDC token for cluster %q needs more cookie chunks than the %d this "+
			"package supports for its scope", cluster, maxChunksForScope)
	}

	ClearTokenCookie(w, r, cluster, baseURL)

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

	scope := cookieScopeCluster
	if useDeploymentScope {
		scope = cookieScopeDeployment
	}

	// G124: Secure is set from IsSecureContext so localhost development still works;
	// HttpOnly and SameSite are set unconditionally.
	http.SetCookie(w, &http.Cookie{ //nolint:gosec
		Name:     chunkCountCookieName(sanitizedCluster),
		Value:    fmt.Sprintf("%s:%d", scope, len(chunks)),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
		// Matches the real chunks' own path (not unconditionally the deployment-wide one): a
		// deployment that never uses --oidc-use-impersonation must not gain an extra
		// deployment-wide cookie per cluster a user logs into, which is exactly the
		// unconditional-width problem useDeploymentScope exists to avoid (see GetCookiePath).
		// A narrow-scoped login's metadata is therefore itself narrow-scoped, falling back to
		// the pre-metadata floor-and-visibility clearing for that cluster -- acceptable since
		// maxTokenChunks's cap (and so the need for an exact count) is also only enforced when
		// useDeploymentScope applies.
		Path:   path,
		MaxAge: sessionTTL,
	})

	return nil
}

// IsDeploymentScopedTokenCookie reports whether the cookie metadata records a deployment-scoped
// session for cluster. The metadata doubles as a one-time migration marker for impersonation:
// once a cluster-scoped session has been promoted, subsequent requests do not reissue its token.
func IsDeploymentScopedTokenCookie(r *http.Request, cluster string) bool {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return false
	}

	scope, _, ok := tokenCookieMetadata(r, sanitizedCluster)

	return ok && scope == cookieScopeDeployment
}

func chunkCountCookieName(sanitizedName string) string {
	return chunkCountCookiePrefix + sanitizedName
}

func tokenCookieMetadata(r *http.Request, sanitizedName string) (string, int, bool) {
	cookie, err := r.Cookie(chunkCountCookieName(sanitizedName))
	if err != nil {
		return "", 0, false
	}

	scope, count, ok := strings.Cut(cookie.Value, ":")
	if !ok || (scope != cookieScopeDeployment && scope != cookieScopeCluster) {
		return "", 0, false
	}

	chunks, err := strconv.Atoi(count)
	if err != nil || chunks < 1 || chunks > maxTrackedTokenChunks {
		return "", 0, false
	}

	return scope, chunks, true
}

// maxTrackedChunkCount returns the larger of the current and legacy cookie names' recorded
// chunk counts, or 0 if neither has metadata. ClearTokenCookie uses this, instead of either
// name's count alone, because either one could be the name actually in use.
func maxTrackedChunkCount(r *http.Request, sanitizedName, legacySanitizedName string) int {
	_, currentCount, currentHasMetadata := tokenCookieMetadata(r, sanitizedName)

	count := 0
	if currentHasMetadata {
		count = currentCount
	}

	if legacySanitizedName == "" {
		return count
	}

	_, legacyCount, legacyHasMetadata := tokenCookieMetadata(r, legacySanitizedName)
	if legacyHasMetadata && legacyCount > count {
		count = legacyCount
	}

	return count
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

	if token := readChunkedCookie(r, sanitizedCluster, maxTrackedTokenChunks); token != "" {
		return token, nil
	}

	legacySanitized := legacySanitizedClusterName(cluster)
	if legacySanitized != "" {
		// maxLegacyAuthTokenChunks, not maxTrackedTokenChunks: see its own doc comment.
		if token := readChunkedCookie(r, legacySanitized, maxLegacyAuthTokenChunks); token != "" {
			return token, nil
		}
	}

	return "", nil
}

// readChunkedCookie reassembles the chunks of one cookie name, as written by SetTokenCookie's
// chunking loop, returning "" if none are present. maxChunks bounds the loop; callers pass
// maxTrackedTokenChunks for the current cookie name and maxLegacyAuthTokenChunks for the legacy
// one (see that constant's doc comment for why they differ).
//
// The loop is bounded unconditionally, not only when hasMetadata: a legitimate token set by
// SetTokenCookie is never chunked past maxTrackedTokenChunks in the first place (see
// maxChunksForScope), so bounding the current name's read at that same number never truncates
// one. Without any bound, an unauthenticated caller with no metadata cookie at all -- so
// hasMetadata is false and the loop's only other exits are an r.Cookie miss or an empty value,
// both of which the caller fully controls by how many chunk cookies it sends -- could supply
// thousands of sequential, non-empty chunk cookies and force a correspondingly large number of
// r.Cookie lookups (each re-scanning the parsed Cookie header) before this package has verified
// anything about the caller at all.
func readChunkedCookie(r *http.Request, sanitizedName string, maxChunks int) string {
	var token strings.Builder

	_, count, hasMetadata := tokenCookieMetadata(r, sanitizedName)
	for i := 0; i < maxChunks; i++ {
		if hasMetadata && i >= count {
			break
		}

		cookie, err := r.Cookie(fmt.Sprintf("%s%s.%d", authCookieNamePrefix, sanitizedName, i))
		if err != nil {
			if hasMetadata {
				return ""
			}

			break
		}

		if cookie.Value == "" {
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
// example /oidc-callback, where a fresh login is set) can never see a stale cluster-scoped cookie.
// The chunk-count metadata records the exact count for new cookies, at the same path the real
// chunks themselves used (see SetTokenCookie), so it is visible wherever they would be; the
// minimum floor and visibility check also clean up cookies issued before metadata existed. The
// scan is capped at maxLegacyAuthTokenChunks (not the tighter maxTrackedTokenChunks) so visible
// client-supplied cookies cannot expand cleanup work or response headers beyond that bound,
// while still reaching every chunk a legacy, pre-rollout cookie (see legacySanitizedClusterName)
// could have been written with -- otherwise a legacy session above maxTrackedTokenChunks chunks
// would have its tail left behind on logout instead of cleared.
//
// The blind floor only applies to the cluster-scoped path, not the deployment-wide one. The
// deployment-wide path (see GetCookiePath) is always "/" under baseURL, which every Headlamp
// route -- including this one -- is itself mounted under, so a cookie set at that path is by
// construction always a prefix-match for the current request and therefore always visible to
// r.Cookie(), never blind the way a cluster-scoped cookie can be from a deployment-wide route.
// Floor-clearing it anyway would add response-header bytes on every single login (even a fresh
// one with nothing to clear at either scope) for a blind spot that path never actually has; with
// a sizeable ID token and its own logout-hint cookie in the same response, that unconditional
// floor could by itself push a login response past an upstream's response-header buffer.
//
//nolint:funlen
func ClearTokenCookie(w http.ResponseWriter, r *http.Request, cluster, baseURL string) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return
	}

	legacySanitized := legacySanitizedClusterName(cluster)
	secure := IsSecureContext(r)
	deploymentPath := GetCookiePath(baseURL, cluster, true)
	clusterPath := GetCookiePath(baseURL, cluster, false)
	trackedChunkCount := maxTrackedChunkCount(r, sanitizedCluster, legacySanitized)

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

	for i := 0; i < maxLegacyAuthTokenChunks; i++ {
		currentName := fmt.Sprintf("%s%s.%d", authCookieNamePrefix, sanitizedCluster, i)

		names := []string{currentName}
		visible := false

		if _, err := r.Cookie(currentName); err == nil {
			visible = true
		}

		if legacySanitized != "" {
			legacyName := fmt.Sprintf("%s%s.%d", authCookieNamePrefix, legacySanitized, i)
			if _, err := r.Cookie(legacyName); err == nil {
				visible = true
			}

			if legacyName != currentName {
				names = append(names, legacyName)
			}
		}

		withinTracked := i < trackedChunkCount

		if i >= minClearedCookieChunks && !withinTracked && !visible {
			// Past the fallback floor and every tracked chunk, with nothing visible at this
			// index under either name. The cluster-scoped path's own floor ends here too: with
			// nothing visible and nothing tracked, there is nothing left to blindly clear there
			// either.
			break
		}

		for _, name := range names {
			// The deployment-wide path is never blind (see this function's doc comment), so it
			// only needs clearing when something actually indicates a cookie could be there.
			if visible || withinTracked {
				clear(name, deploymentPath)
			}

			// The cluster-scoped path can be blind from a deployment-wide route, so it keeps
			// the unconditional floor through minClearedCookieChunks regardless of visibility.
			clear(name, clusterPath)
		}
	}

	metadataNames := []string{chunkCountCookieName(sanitizedCluster)}

	if legacySanitized != "" {
		if legacyMetadataName := chunkCountCookieName(legacySanitized); legacyMetadataName != metadataNames[0] {
			metadataNames = append(metadataNames, legacyMetadataName)
		}
	}

	metadataVisible := false

	for _, name := range metadataNames {
		if _, err := r.Cookie(name); err == nil {
			metadataVisible = true
			break
		}
	}

	// Cleared at both scopes, matching the write side's path (not unconditionally the
	// deployment-wide one): the metadata for a given login could be at either path depending
	// on whether that login used useDeploymentScope, the same reason the real chunks above
	// are cleared at both. As above, the deployment-wide path is skipped when nothing indicates
	// a metadata cookie could be there; the cluster-scoped path keeps its unconditional clear.
	for _, name := range metadataNames {
		if metadataVisible {
			clear(name, deploymentPath)
		}

		clear(name, clusterPath)
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
		cookie := &http.Cookie{ //nolint:gosec
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

// GetIDTokenFromCookie retrieves the ID token cookie for a specific cluster. If no cookie exists
// under the current, hash-suffixed name (see SanitizeClusterName), it falls back to the
// pre-rollout name -- the same fallback GetTokenFromCookie uses for the auth cookie, and for the
// same reason: SanitizeClusterName's hash suffix changed every cookie name this package sets,
// including this ID-token-for-logout cookie's, so a session that logged in (and so received this
// cookie) before that rollout would otherwise have it silently unreadable after an upgrade, and
// RP-initiated logout would have no id_token_hint to send the provider.
// Supports chunked cookies for large ID tokens.
func GetIDTokenFromCookie(r *http.Request, cluster string) (string, error) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return "", errors.New("invalid cluster name")
	}

	if idToken := readIDTokenChunks(r, sanitizedCluster); idToken != "" {
		return idToken, nil
	}

	if legacySanitized := legacySanitizedClusterName(cluster); legacySanitized != "" {
		if idToken := readIDTokenChunks(r, legacySanitized); idToken != "" {
			return idToken, nil
		}
	}

	return "", http.ErrNoCookie
}

// readIDTokenChunks reassembles the id_token_hint chunks SetIDTokenCookie wrote under
// sanitizedName, returning "" if none are present.
func readIDTokenChunks(r *http.Request, sanitizedName string) string {
	var idToken strings.Builder

	for i := 0; i < maxIDTokenChunks; i++ {
		cookie, err := r.Cookie(fmt.Sprintf("headlamp-id-token-%s.%d", sanitizedName, i))
		if err != nil {
			break
		}

		if cookie.Value == "" {
			break
		}

		idToken.WriteString(cookie.Value)
	}

	return idToken.String()
}

// ClearIDTokenCookie clears the ID token cookie for a specific cluster, at both the current,
// hash-suffixed name and the pre-rollout legacy name (see legacySanitizedClusterName and
// GetIDTokenFromCookie's own fallback) -- the same two-name clearing ClearTokenCookie already
// does for the auth cookie, and for the same reason. Chunk zero is always invalidated for each
// name, even when the request path hides the cookies.
func ClearIDTokenCookie(w http.ResponseWriter, r *http.Request, cluster, baseURL string) {
	sanitizedCluster := SanitizeClusterName(cluster)
	if sanitizedCluster == "" {
		return
	}

	secure := IsSecureContext(r)
	cookiePath := GetOIDCLogoutCookiePath(baseURL, cluster)

	clearIDTokenChunks(w, r, secure, cookiePath, sanitizedCluster)

	legacySanitized := legacySanitizedClusterName(cluster)
	if legacySanitized != "" && legacySanitized != sanitizedCluster {
		clearIDTokenChunks(w, r, secure, cookiePath, legacySanitized)
	}
}

func clearIDTokenChunks(w http.ResponseWriter, r *http.Request, secure bool, cookiePath, sanitizedName string) {
	for index := 0; index < maxIDTokenChunks; index++ {
		if _, err := r.Cookie(fmt.Sprintf("headlamp-id-token-%s.%d", sanitizedName, index)); index > 0 && err != nil {
			continue
		}

		clearIDTokenChunkCookie(w, secure, cookiePath, sanitizedName, index)
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
	cookie := &http.Cookie{ //nolint:gosec
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
