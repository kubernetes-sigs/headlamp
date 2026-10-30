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
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gorilla/mux"
	"github.com/jmespath/go-jmespath"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	cfg "github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"golang.org/x/oauth2"
	"golang.org/x/sync/singleflight"
)

const (
	oldTokenTTL   = time.Second * 10 // seconds
	oidcKeyPrefix = "oidc-token-"
	// oidcIDTokenKeyPrefix namespaces cache entries retaining the ID token associated with an
	// auth token, so RP-initiated logout can still find the right id_token_hint after the auth
	// token has been refreshed (see retainIDTokenForRefreshedToken).
	oidcIDTokenKeyPrefix = "oidc-id-token-" // #nosec G101 -- cache key prefix, not a credential
	defaultIDTokenTTL    = 24 * time.Hour
	// refreshResultKeyPrefix namespaces the short-lived completed-refresh cache RefreshAndCacheNewToken
	// writes under the token it was asked to refresh (see its own doc comment for why this exists
	// alongside the singleflight group).
	refreshResultKeyPrefix = "oidc-refresh-result-" // #nosec G101 -- cache key prefix, not a credential
	// logFieldCluster is the structured-logging field name for a cluster name.
	logFieldCluster = "cluster"
	// latestIDTokenKeyPrefix namespaces cache entries recording what a specific stale token was
	// refreshed to. See LatestIDTokenCacheKey for why this is keyed by the stale token itself,
	// not by cluster.
	latestIDTokenKeyPrefix = "oidc-latest-for-" //nolint:gosec // cache key prefix, not a credential
	// LatestIDTokenTTL bounds how long a LatestIDTokenCacheKey entry is kept before it expires.
	// It has to outlive a realistic gap between a proactive refresh and a reactive caller still
	// holding the old token checking in -- chiefly the WebSocket multiplexer, which only checks
	// this cache reactively and may not reconnect for a while -- but it must not keep a live
	// credential (the refreshed token itself) in memory indefinitely. Every write under this key
	// uses this same TTL, whether from applyRefreshedToken's proactive path or
	// latestOrRefreshedIDToken's reactive one, so the entry can never outlive its bound no matter
	// which path last wrote it.
	LatestIDTokenTTL = 5 * time.Minute
)

// LatestIDTokenCacheKey returns the cache key recording what staleToken -- the specific token a
// caller presented and failed to verify because it had expired -- was refreshed to, if anything
// has refreshed it since. applyRefreshedToken writes it after every successful proactive
// refresh, keyed by the token it was refreshing; a caller with no response of its own to write
// a fresh cookie to -- the WebSocket multiplexer's reactive refresh, which otherwise has no way
// to let a later, unrelated request know its browser cookie is stale -- checks it, keyed by its
// own stale token, before performing its own refresh-token exchange, so it can reuse an
// already-fresh token instead.
//
// This is keyed by the stale token's own value, not by cluster: a cluster-keyed lookup would
// return whichever user's token was refreshed most recently for that cluster, regardless of
// who is asking -- letting one user's request that merely fails verification (an expired,
// malformed, or forged token; verification failure is not evidence of identity) be resolved
// against a completely different, unrelated user's still-valid session on a shared cluster.
// Keying by the exact stale token means only a caller that actually held that specific token
// can ever find a match, the same scoping oidcKeyPrefix's refresh-token entries already rely on.
func LatestIDTokenCacheKey(staleToken string) string {
	return latestIDTokenKeyPrefix + staleToken
}

const JWTExpirationTTL = 10 * time.Second // seconds

// errFieldMessage is the JSON field name used by writeMeJSON for error messages.
const errFieldMessage = "message"

// DecodeBase64JSON decodes a base64 URL-encoded JSON string into a map.
func DecodeBase64JSON(base64JSON string) (map[string]interface{}, error) {
	payloadBytes, err := base64.RawURLEncoding.DecodeString(base64JSON)
	if err != nil {
		return nil, err
	}

	var payloadMap map[string]interface{}
	if err := json.Unmarshal(payloadBytes, &payloadMap); err != nil {
		return nil, err
	}

	return payloadMap, nil
}

// clusterPathRegex matches /clusters/<cluster>/...
var clusterPathRegex = regexp.MustCompile(`^/clusters/([^/]+)/.*`)

// bearerTokenRegex matches valid bearer tokens as specified by RFC 6750:
// https://datatracker.ietf.org/doc/html/rfc6750#section-2.1
var bearerTokenRegex = regexp.MustCompile(`^[\x21-\x7E]+$`)

// BearerTokenValue returns the raw token from an Authorization header value.
func BearerTokenValue(token string) string {
	trimmedToken := strings.TrimLeft(token, " \t")

	const bearerScheme = "Bearer"
	if len(trimmedToken) > len(bearerScheme) && strings.EqualFold(trimmedToken[:len(bearerScheme)], bearerScheme) {
		credentials := trimmedToken[len(bearerScheme):]
		if credentials[0] == ' ' || credentials[0] == '\t' {
			return strings.TrimSpace(credentials)
		}
	}

	return strings.TrimSpace(token)
}

// ParseClusterAndToken extracts the cluster name from the URL path and
// the Bearer token from the Authorization header of the HTTP request, falling
// back to the cluster cookie when the header is missing.
func ParseClusterAndToken(r *http.Request) (string, string) {
	cluster, token, _ := ParseClusterAndTokenSource(r)
	return cluster, token
}

// TokenSource identifies where ParseClusterAndTokenSource found the request's token: the
// Authorization header a caller presented for this one request, or Headlamp's own auth cookie
// for this cluster. Distinguishing the two matters for anything that persists or widens that
// cookie afterward (see NewOIDCTokenRefreshMiddleware): a bearer token forwarded by some other
// caller -- pkg/serviceproxy, or any direct API client presenting its own credential -- is not a
// Headlamp login and must never be turned into, or have an existing cookie's scope widened as if
// it belonged to, a persistent Headlamp session.
type TokenSource int

const (
	TokenSourceNone TokenSource = iota
	TokenSourceAuthorizationHeader
	TokenSourceCookie
)

// ParseClusterAndTokenSource is ParseClusterAndToken, additionally reporting which of the
// Authorization header or the cluster's auth cookie the returned token came from.
func ParseClusterAndTokenSource(r *http.Request) (string, string, TokenSource) {
	cluster := ""

	matches := clusterPathRegex.FindStringSubmatch(r.URL.Path)
	if len(matches) > 1 {
		cluster = matches[1]
	}

	// Try Authorization header first (for backward compatibility)
	token := BearerTokenValue(r.Header.Get("Authorization"))
	if strings.Contains(token, ",") {
		return cluster, "", TokenSourceNone
	}

	source := TokenSourceAuthorizationHeader

	// If no auth header, try cookie
	if token == "" && cluster != "" {
		if cookieToken, err := GetTokenFromCookie(r, cluster); err == nil && cookieToken != "" {
			token = cookieToken
			source = TokenSourceCookie
		}
	}

	if token == "" {
		return cluster, "", TokenSourceNone
	}

	if !bearerTokenRegex.MatchString(token) {
		return cluster, "", TokenSourceNone
	}

	return cluster, token, source
}

// GetExpiryUnixTimeUTC expiration unix time UTC from a token payload map exp field.
//
// The exp field is UTC unix time in seconds.
// See https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation
// See exp field: https://www.rfc-editor.org/rfc/rfc7519#section-4.1.4
func GetExpiryUnixTimeUTC(tokenPayload map[string]interface{}) (time.Time, error) {
	// Numbers in JSON are floats (54-bit)
	exp, ok := tokenPayload["exp"].(float64)
	if !ok {
		return time.Time{}, errors.New("expiry time not found or invalid")
	}

	return time.Unix(int64(exp), 0).UTC(), nil
}

// IsTokenAboutToExpire reports whether the given token is within JWTExpirationTTL
// of its expiry time.
func IsTokenAboutToExpire(token string) bool {
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 || parts[1] == "" {
		return false
	}

	payload, err := DecodeBase64JSON(parts[1])
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to decode payload")
		return false
	}

	expiryUnixTimeUTC, err := GetExpiryUnixTimeUTC(payload)
	if err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to get expiry time")
		return false
	}

	// This time comparison is timezone aware, so it works correctly
	return time.Until(expiryUnixTimeUTC) <= JWTExpirationTTL
}

// CacheIDToken retains the ID token associated with the authentication token.
func CacheIDToken(
	ctx context.Context,
	tokenCache cache.Cache[interface{}],
	authToken, idToken string,
	ttl time.Duration,
) error {
	if authToken == "" || idToken == "" {
		return nil
	}

	if ttl <= 0 {
		ttl = defaultIDTokenTTL
	}

	if err := tokenCache.SetWithTTL(ctx, oidcIDTokenKeyPrefix+authToken, idToken, ttl); err != nil {
		return fmt.Errorf("caching ID token: %w", err)
	}

	return nil
}

func oauthTokenValue(token *oauth2.Token, tokenType string) string {
	if tokenType == "access_token" {
		return token.AccessToken
	}

	value, _ := token.Extra(tokenType).(string)

	return value
}

func retainIDTokenForRefreshedToken(
	ctx context.Context,
	token *oauth2.Token,
	oldAuthToken, newAuthToken string,
	tokenCache cache.Cache[interface{}],
	sessionTTL time.Duration,
) (*oauth2.Token, error) {
	idToken, _ := token.Extra("id_token").(string)
	if idToken == "" {
		cachedIDToken, err := tokenCache.Get(ctx, oidcIDTokenKeyPrefix+oldAuthToken)
		if err != nil && !errors.Is(err, cache.ErrNotFound) {
			return nil, fmt.Errorf("getting cached ID token: %w", err)
		}

		idToken, _ = cachedIDToken.(string)
	}

	if idToken == "" {
		return token, nil
	}

	if err := CacheIDToken(ctx, tokenCache, newAuthToken, idToken, sessionTTL); err != nil {
		return nil, err
	}

	return token.WithExtra(map[string]interface{}{"id_token": idToken}), nil
}

// CacheRefreshedToken updates the refresh token in the cache.
func CacheRefreshedToken(token *oauth2.Token, tokenType string, oldToken string,
	oldRefreshToken string, cache cache.Cache[interface{}],
) error {
	newToken := oauthTokenValue(token, tokenType)
	if newToken == "" {
		return nil
	}

	ctx := context.Background()

	if err := cache.Set(ctx, oidcKeyPrefix+newToken, token.RefreshToken); err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to cache refreshed token")
		return err
	}

	if newToken == oldToken {
		return nil
	}

	if err := cache.SetWithTTL(ctx, oidcKeyPrefix+oldToken, oldRefreshToken, oldTokenTTL); err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to cache refreshed token")
		return err
	}

	return nil
}

// GetNewToken uses the provided credentials and fetches the old refresh
// token from the cache to obtain a new OAuth2 token
// from the specified token URL endpoint.
func GetNewToken(clientID, clientSecret string, tokenCache cache.Cache[interface{}],
	tokenType string, token string, tokenURL string, ctx context.Context, sessionTTL time.Duration,
) (*oauth2.Token, error) {
	// get refresh token
	refreshToken, err := tokenCache.Get(ctx, oidcKeyPrefix+token)
	if err != nil {
		return nil, fmt.Errorf("getting refresh token: %w", err)
	}

	rToken, ok := refreshToken.(string)
	if !ok {
		return nil, fmt.Errorf("failed to get refresh token")
	}

	// Create OAuth2 config with client credentials and token endpoint
	conf := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint: oauth2.Endpoint{
			TokenURL: tokenURL,
		},
	}

	// Request new token using the refresh token
	newToken, err := conf.TokenSource(ctx, &oauth2.Token{RefreshToken: rToken}).Token()
	if err != nil {
		return nil, err
	}

	newAuthToken := oauthTokenValue(newToken, tokenType)
	if newAuthToken == "" && tokenType == "id_token" {
		newAuthToken = token
	}

	retainedToken, err := retainIDTokenForRefreshedToken(
		ctx,
		newToken,
		token,
		newAuthToken,
		tokenCache,
		sessionTTL,
	)
	if err != nil {
		return nil, fmt.Errorf("retaining refreshed ID token: %w", err)
	}

	// Update the refresh token cache after determining the effective authentication
	// token, since providers may omit id_token in refresh responses.
	if err := CacheRefreshedToken(retainedToken, tokenType, token, rToken, tokenCache); err != nil {
		return nil, fmt.Errorf("caching refreshed token: %w", err)
	}

	if newAuthToken != token {
		if err := tokenCache.UpdateTTL(ctx, oidcIDTokenKeyPrefix+token, oldTokenTTL); err != nil &&
			!errors.Is(err, cache.ErrNotFound) {
			return nil, fmt.Errorf("retaining previous cached ID token: %w", err)
		}
	}

	return retainedToken, nil
}

// oidcHTTPClientTimeout bounds every client this package installs for an OIDC provider or
// verifier. Without it, a stalled issuer can hang discovery, token exchange, or a signing-key
// fetch indefinitely: go-oidc keeps this client for its own later requests (for example a
// verifier's key-set refresh), which run on contexts of their own that a caller has no way to
// bound, so the client's own Timeout is the only lever that reaches every one of them. It is a
// var, not a const, so tests can shorten it rather than waiting out a real-sized timeout.
var oidcHTTPClientTimeout = 30 * time.Second

// ConfigureTLSContext configures TLS settings for the HTTP client in the context.
// When skipTLSVerify is true, a client that skips verification is installed.
// When caCert is provided, a client with that CA pool is installed and takes precedence,
// re-enabling verification while trusting the supplied certificate bundle.
func ConfigureTLSContext(ctx context.Context, skipTLSVerify *bool, caCert *string) context.Context {
	if skipTLSVerify != nil && *skipTLSVerify {
		base, ok := http.DefaultTransport.(*http.Transport)
		if !ok {
			logger.Log(logger.LevelError, nil,
				errors.New("http.DefaultTransport is not *http.Transport"),
				"failed to configure TLS transport")

			return ctx
		}

		tlsSkipTransport := base.Clone()

		tlsCfg := &tls.Config{InsecureSkipVerify: true} //nolint:gosec
		if base.TLSClientConfig != nil {
			tlsCfg = base.TLSClientConfig.Clone()
			tlsCfg.InsecureSkipVerify = true
		}

		tlsSkipTransport.TLSClientConfig = tlsCfg
		ctx = oidc.ClientContext(ctx, &http.Client{Transport: tlsSkipTransport, Timeout: oidcHTTPClientTimeout})
	}

	if caCert != nil && *caCert != "" {
		caCertPool := x509.NewCertPool()
		if !caCertPool.AppendCertsFromPEM([]byte(*caCert)) {
			logger.Log(logger.LevelError, nil,
				errors.New("failed to append ca cert to pool"), "couldn't add custom cert to context")

			return ctx
		}

		base, ok := http.DefaultTransport.(*http.Transport)
		if !ok {
			logger.Log(logger.LevelError, nil,
				errors.New("http.DefaultTransport is not *http.Transport"),
				"failed to configure TLS transport")

			return ctx
		}

		customTransport := base.Clone()

		tlsCfg := &tls.Config{RootCAs: caCertPool}
		if base.TLSClientConfig != nil {
			tlsCfg = base.TLSClientConfig.Clone()
			tlsCfg.RootCAs = caCertPool
		}

		tlsCfg.InsecureSkipVerify = false

		customTransport.TLSClientConfig = tlsCfg
		ctx = oidc.ClientContext(ctx, &http.Client{Transport: customTransport, Timeout: oidcHTTPClientTimeout})
	}

	return ctx
}

// RefreshAndCacheNewToken obtains a fresh OIDC token using the cached refresh token
// and re-populates the cache so subsequent requests can reuse it. When group is nil, the
// provided ctx controls cancellation and deadlines for all outbound requests during the refresh,
// as usual. When group is non-nil, the actual exchange runs detached from every individual
// caller's ctx cancellation (oidcHTTPClientTimeout still bounds it): the exchange's result is
// shared with every caller coordinated through group, not just whichever caller's goroutine
// happens to run it as the singleflight leader, so that leader's own request being cancelled
// must not abort the exchange for the others sharing it.
// validatorIssuerURL overrides the issuer expected by provider discovery when the
// discovery URL and returned issuer differ.
//
// group, when non-nil, coalesces this exchange with every other concurrent call for the exact
// same token (from ANY caller sharing this same *singleflight.Group instance -- not just other
// calls made through this same code path) into a single underlying refresh-token exchange,
// whose result every caller shares. This matters because token is a caller-presented, possibly
// rotating refresh token's key: two concurrent callers for the same stale token -- for example
// an HTTP request handled by NewOIDCTokenRefreshMiddleware's proactive refresh and a WebSocket
// message handled by the multiplexer's reactive refresh, which otherwise share no coordination
// at all -- would each read the same cached refresh token and both attempt to exchange it. A
// provider that rotates refresh tokens fails the second exchange outright; one with reuse
// detection can read two uses of the same refresh token as token theft and revoke the whole
// token family, turning a benign race into a forced re-login. Passing nil performs the exchange
// directly, uncoordinated with any other caller -- only correct when the caller already
// guarantees no other code path can be refreshing the same token concurrently.
//
// group.Do alone only shares an exchange with callers that arrive WHILE it is still running: once
// it returns to its caller(s), the group forgets token, so a caller that arrives afterward -- not
// overlapping with the first exchange at all, just shortly after it completed -- finds no
// in-flight call to join and starts a brand new exchange against the same now-consumed refresh
// token. To close that gap, a completed exchange's result is cached under token (see
// refreshResultKeyPrefix) for the same short window GetNewToken's own old-refresh-token cache entry
// uses, and checked both before calling Do and again from inside its callback. The second check
// matters on its own: a caller can miss the outer check, then become the LEADER for a brand new
// Do call (singleflight having forgotten token in the meantime) after some OTHER caller's entire
// Do call -- exchange, cache write, and return -- has already completed in between. Without the
// inner check, that caller's callback would run the real exchange again regardless of the cache.
//
//nolint:funlen // Coordinates the completed-refresh cache, the exchange itself, and singleflight.
func RefreshAndCacheNewToken(ctx context.Context, oidcAuthConfig *kubeconfig.OidcConfig,
	cache cache.Cache[interface{}],
	tokenType, token, issuerURL, validatorIssuerURL string,
	sessionTTL time.Duration,
	group *singleflight.Group,
) (*oauth2.Token, error) {
	if group != nil {
		if cached, err := cache.Get(ctx, refreshResultKeyPrefix+token); err == nil {
			if cachedToken, ok := cached.(*oauth2.Token); ok {
				return cachedToken, nil
			}
		}
	}

	exchange := func(exchangeCtx context.Context) (*oauth2.Token, error) {
		exchangeCtx = oidc.ClientContext(exchangeCtx, &http.Client{Timeout: oidcHTTPClientTimeout})
		exchangeCtx = ConfigureTLSContext(exchangeCtx, oidcAuthConfig.SkipTLSVerify, oidcAuthConfig.CACert)

		if validatorIssuerURL != "" {
			exchangeCtx = oidc.InsecureIssuerURLContext(exchangeCtx, validatorIssuerURL)
		}

		// get provider
		provider, err := oidc.NewProvider(exchangeCtx, issuerURL)
		if err != nil {
			return nil, fmt.Errorf("getting provider: %w", err)
		}
		// get refresh token
		newToken, err := GetNewToken(
			oidcAuthConfig.ClientID,
			oidcAuthConfig.ClientSecret,
			cache,
			tokenType,
			token,
			provider.Endpoint().TokenURL,
			exchangeCtx,
			sessionTTL,
		)
		if err != nil {
			return nil, fmt.Errorf("refreshing token: %w", err)
		}

		return newToken, nil
	}

	if group == nil {
		return exchange(ctx)
	}

	result, err, _ := group.Do(token, func() (interface{}, error) {
		// Re-check: this callback only runs for whichever caller becomes the leader for THIS
		// call to Do, which is not necessarily the same caller whose cache check above missed.
		// Another caller's entire Do call -- exchange, cache write, and return -- can complete
		// between this caller's own miss above and this callback actually running as a new
		// leader (singleflight having forgotten token in between), so without this recheck that
		// caller would still exchange the already-consumed refresh token a second time.
		if cached, err := cache.Get(ctx, refreshResultKeyPrefix+token); err == nil {
			if cachedToken, ok := cached.(*oauth2.Token); ok {
				return cachedToken, nil
			}
		}

		// Detached from ctx's cancellation, not from ctx itself: this exchange's result is
		// shared via Do with every caller coordinated through this group -- including ones with
		// their own, still-valid request contexts (e.g. a WebSocket multiplexer's reactive
		// refresh) -- not just the leader whose goroutine happens to run this callback. If that
		// leader's own request were cancelled (its HTTP client disconnected, its own context
		// done) partway through, it must not abort the exchange for everyone sharing it.
		// oidcHTTPClientTimeout above already bounds how long the exchange can run.
		newToken, err := exchange(context.WithoutCancel(ctx))
		if err != nil {
			return nil, err
		}

		if err := cache.SetWithTTL(ctx, refreshResultKeyPrefix+token, newToken, oldTokenTTL); err != nil {
			logger.Log(logger.LevelError, nil, err, "failed to cache completed token refresh result")
		}

		return newToken, nil
	})
	if err != nil {
		return nil, err
	}

	return result.(*oauth2.Token), nil //nolint:forcetypeassert
}

type MeHandlerOptions struct {
	// UsernamePaths is a list of JMESPath expressions to resolve the username claim.
	UsernamePaths string
	// EmailPaths is a list of JMESPath expressions to resolve the email claim.
	EmailPaths string
	// GroupsPaths is a list of JMESPath expressions to resolve group memberships.
	GroupsPaths string
	// UserInfoURL is the URL to fetch additional user info for the /me endpoint.
	UserInfoURL string
	// ProxyAuthEnabled indicates if the identity proxy bypass is enabled
	ProxyAuthEnabled        bool
	ProxyAuthUsernameHeader string
	ProxyAuthGroupHeader    string
	ProxyAuthEmailHeader    string
}

// HandleMe returns a handler that reads the per-cluster auth cookie and responds with user info.
func HandleMe(opts MeHandlerOptions) http.HandlerFunc {
	usernamePaths, emailPaths, groupsPaths, userInfoURL := cfg.ApplyMeDefaults(
		opts.UsernamePaths,
		opts.EmailPaths,
		opts.GroupsPaths,
		opts.UserInfoURL,
	)
	compiledUsernamePaths := compileJMESPaths(usernamePaths)
	compiledEmailPaths := compileJMESPaths(emailPaths)
	compiledGroupsPaths := compileJMESPaths(groupsPaths)

	return func(w http.ResponseWriter, r *http.Request) {
		clusterName := mux.Vars(r)["clusterName"]
		if clusterName == "" {
			writeMeJSON(w, http.StatusBadRequest, map[string]interface{}{errFieldMessage: "cluster not specified"})
			return
		}

		if tryProxyAuth(w, r, opts, userInfoURL) {
			return
		}

		requestCluster, token := ParseClusterAndToken(r)

		if requestCluster == "" {
			requestCluster = clusterName
		}

		if requestCluster != clusterName {
			writeMeJSON(w, http.StatusBadRequest, map[string]interface{}{errFieldMessage: "cluster mismatch"})
			return
		}

		if token == "" {
			writeMeJSON(w, http.StatusUnauthorized, map[string]interface{}{errFieldMessage: "unauthorized"})
			return
		}

		claims, status, errMsg := parseClaimsFromToken(token)
		if status != 0 {
			writeMeJSON(w, status, map[string]interface{}{errFieldMessage: errMsg})
			return
		}

		if expiry, err := GetExpiryUnixTimeUTC(claims); err != nil || time.Now().After(expiry) {
			writeMeJSON(w, http.StatusUnauthorized, map[string]interface{}{errFieldMessage: "token expired"})
			return
		}

		username := stringValueFromJMESPaths(claims, compiledUsernamePaths)
		email := stringValueFromJMESPaths(claims, compiledEmailPaths)
		groups := stringSliceFromJMESPaths(claims, compiledGroupsPaths)

		writeMeResponse(w, username, email, groups, userInfoURL)
	}
}

// CompiledPaths is a set of pre-compiled JMESPath expressions used to resolve a claim
// from a decoded JWT payload, in priority order.
type CompiledPaths []*jmespath.JMESPath

// CompileJMESPaths parses and compiles a comma-separated list of JMESPath expressions
// for repeated reuse (e.g. once per server startup, rather than once per request). It is
// exported so callers outside this package (e.g. the in-cluster impersonation proxy path)
// can reuse the same claim-resolution mechanism as the /me endpoint.
func CompileJMESPaths(pathCSV string) CompiledPaths {
	return compileJMESPaths(pathCSV)
}

// IdentityFromClaims resolves the user and groups to impersonate from ID token claims that
// have already been verified by IDTokenVerifier. The claims must never come from an
// unverified token: anyone can write a payload, only the provider's signature proves it.
func IdentityFromClaims(
	claims map[string]interface{}, usernamePaths, groupsPaths CompiledPaths,
) (kubeconfig.Impersonation, error) {
	username := stringValueFromJMESPaths(claims, usernamePaths)
	if username == "" {
		return kubeconfig.Impersonation{}, errors.New("could not resolve username claim")
	}

	// The verifier already rejected an expired token, so this is recorded only for later use:
	// refusing to reuse this identity on a connection an automatic reconnect re-establishes
	// after that token would have expired, without a fresh token to re-verify.
	expiry, _ := GetExpiryUnixTimeUTC(claims)

	groups := stringSliceFromJMESPaths(claims, groupsPaths)
	deduplicatedGroups := make([]string, 0, len(groups)+1)
	hasAuthenticatedGroup := false

	for _, group := range groups {
		if group == "system:authenticated" {
			if hasAuthenticatedGroup {
				continue
			}

			hasAuthenticatedGroup = true
		}

		deduplicatedGroups = append(deduplicatedGroups, group)
	}

	if !hasAuthenticatedGroup {
		deduplicatedGroups = append(deduplicatedGroups, "system:authenticated")
	}

	return kubeconfig.Impersonation{
		Username: username,
		Groups:   deduplicatedGroups,
		Expiry:   expiry,
	}, nil
}

// parseClaimsFromToken extracts the JWT claims from a token.
func parseClaimsFromToken(token string) (map[string]interface{}, int, string) {
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 || parts[1] == "" {
		return nil, http.StatusUnauthorized, "invalid token"
	}

	claims, err := DecodeBase64JSON(parts[1])
	if err != nil {
		return nil, http.StatusUnauthorized, "invalid token claims"
	}

	return claims, 0, ""
}

// tryProxyAuth checks if proxy auth is enabled and a proxy user header exists.
// If valid, it writes the response and returns true, allowing the caller to return early.
// Otherwise, it returns false.
func tryProxyAuth(w http.ResponseWriter, r *http.Request, opts MeHandlerOptions, userInfoURL string) bool {
	if !opts.ProxyAuthEnabled {
		return false
	}

	username := r.Header.Get(opts.ProxyAuthUsernameHeader)
	if username == "" {
		return false
	}

	email := r.Header.Get(opts.ProxyAuthEmailHeader)
	groupsRaw := r.Header.Get(opts.ProxyAuthGroupHeader)

	var groups []string

	if groupsRaw != "" {
		for _, group := range strings.Split(groupsRaw, ",") {
			group = strings.TrimSpace(group)
			if group != "" {
				groups = append(groups, group)
			}
		}
	}

	writeMeResponse(w, username, email, groups, userInfoURL)

	return true
}

// writeMeResponse writes the successful response for HandleMe with the standard cache-busting headers.
func writeMeResponse(w http.ResponseWriter, username, email string, groups []string, userInfoURL string) {
	writeMeJSON(w, http.StatusOK, map[string]interface{}{
		"username":    username,
		"email":       email,
		"groups":      groups,
		"userInfoURL": userInfoURL,
	})
}

// writeMeJSON sets the standard cache-control headers used by /me responses and writes the JSON payload.
func writeMeJSON(w http.ResponseWriter, status int, payload map[string]interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, private")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("Vary", "Cookie")
	w.Header().Del("ETag")

	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to encode me response")
	}
}

// stringValueFromJMESPaths iterates pre-compiled JMESPath expressions and returns the first string result.
func stringValueFromJMESPaths(payload map[string]interface{}, paths []*jmespath.JMESPath) string {
	for _, expr := range paths {
		res, err := expr.Search(payload)
		if err != nil || res == nil {
			continue
		}

		switch v := res.(type) {
		case string:
			if v != "" {
				return v
			}
		case fmt.Stringer:
			vs := v.String()
			if vs != "" {
				return vs
			}
		case float64:
			return fmt.Sprintf("%v", v)
		case int64:
			return fmt.Sprintf("%v", v)
		case map[string]interface{}:
			if encoded, ok := marshalToString(v); ok && encoded != "" {
				return encoded
			}
		}
	}

	return ""
}

// stringSliceFromJMESPaths iterates pre-compiled JMESPath expressions and returns the first []string result.
func stringSliceFromJMESPaths(payload map[string]interface{}, paths []*jmespath.JMESPath) []string {
	for _, expr := range paths {
		res, err := expr.Search(payload)
		if err != nil || res == nil {
			continue
		}

		switch v := res.(type) {
		case []interface{}:
			out := make([]string, 0, len(v))

			for _, it := range v {
				switch s := it.(type) {
				case string:
					out = append(out, s)
				case float64:
					out = append(out, fmt.Sprintf("%v", s))
				case int64:
					out = append(out, fmt.Sprintf("%v", s))
				default:
					if encoded, ok := marshalToString(it); ok && encoded != "" {
						out = append(out, encoded)
					}
				}
			}

			return out
		case []string:
			return v
		}
	}

	return []string{}
}

// compileJMESPaths parses and compiles a list of JMESPath expressions once.
func compileJMESPaths(pathCSV string) []*jmespath.JMESPath {
	if strings.TrimSpace(pathCSV) == "" {
		return []*jmespath.JMESPath{}
	}

	rawPaths := splitTopLevelCommas(pathCSV)
	compiled := make([]*jmespath.JMESPath, 0, len(rawPaths))

	for _, raw := range rawPaths {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}

		expr, err := jmespath.Compile(raw)
		if err != nil {
			logger.Log(logger.LevelWarn, map[string]string{"jmespath": raw}, err,
				"failed to compile JMESPath expression, skipping")

			continue
		}

		compiled = append(compiled, expr)
	}

	return compiled
}

// splitTopLevelCommas splits a comma-separated list of JMESPath expressions on commas that are
// not nested inside (), [], or {}, and not inside a quoted string literal. A plain strings.Split
// would otherwise shred a single list entry that is itself a function call or array/object
// literal using commas internally -- for example join('#', [iss, sub]), the issuer-qualified
// subject expression config.DefaultImpersonationUsernamePath falls back to -- into unrelated,
// syntactically invalid fragments. A backslash inside a quoted string escapes the next rune, so
// an escaped quote (e.g. "team\"name") does not end the string -- without tracking that, the
// scanner would close the string early and read everything after as if the escaped quote were
// the terminator, throwing off whether subsequent commas and quotes are seen as inside a string.
func splitTopLevelCommas(pathCSV string) []string {
	var (
		parts   []string
		depth   int
		start   int
		quote   rune
		escaped bool
	)

	for i, r := range pathCSV {
		switch {
		case escaped:
			escaped = false
		case quote != 0 && r == '\\':
			escaped = true
		case quote != 0:
			if r == quote {
				quote = 0
			}
		case r == '\'' || r == '"' || r == '`':
			quote = r
		case r == '(' || r == '[' || r == '{':
			depth++
		case r == ')' || r == ']' || r == '}':
			if depth > 0 {
				depth--
			}
		case r == ',' && depth == 0:
			parts = append(parts, pathCSV[start:i])
			start = i + 1
		}
	}

	parts = append(parts, pathCSV[start:])

	return parts
}

// marshalToString encodes the provided value as JSON and logs failures.
func marshalToString(val interface{}) (string, bool) {
	b, err := json.Marshal(val)
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "failed to marshal value to JSON string")
		return "", false
	}

	return string(b), true
}

// RefreshAndSetTokenParams groups the inputs required to refresh a token and
// update the Headlamp auth cookie.
type RefreshAndSetTokenParams struct {
	Ctx                       context.Context
	OIDCAuthConfig            *kubeconfig.OidcConfig
	Cache                     cache.Cache[interface{}]
	Token                     string
	Cluster                   string
	Span                      trace.Span
	Writer                    http.ResponseWriter
	Request                   *http.Request
	TelemetryHandler          *telemetry.RequestHandler
	OIDCUseAccessToken        bool
	OIDCIdpIssuerURL          string
	OIDCValidatorIdpIssuerURL string
	BaseURL                   string
	SessionTTL                int
	// UseDeploymentCookieScope widens the refreshed cookie's path to the whole deployment
	// instead of just Cluster; set it from the same impersonation-applicability check used
	// when the cookie was first set (see auth.GetCookiePath), not unconditionally.
	UseDeploymentCookieScope bool
	// SkipCookie, when true, refreshes Token for only this request -- updating its
	// Authorization header and the latest-known-good-token cache entry -- without writing any
	// Set-Cookie at all. Set it when Token came from the Authorization header rather than
	// Headlamp's own session cookie (see TokenSource): such a token is a caller-supplied,
	// pass-through credential for this one request, not a Headlamp login, and refreshing it
	// must never persist or widen a cookie on the caller's behalf.
	SkipCookie bool
	// TokenRefreshGroup, when set, is passed to RefreshAndCacheNewToken to coalesce this
	// exchange with any other concurrent refresh of the exact same Token sharing the same
	// *singleflight.Group instance -- including one reached through a completely different code
	// path (see RefreshAndCacheNewToken's doc comment). Callers that share a process-lifetime
	// token-refresh coordinator with other refresh paths must pass the same instance here;
	// leaving it nil performs this exchange uncoordinated with anything else.
	TokenRefreshGroup *singleflight.Group
}

func setRefreshedIDTokenCookie(
	params RefreshAndSetTokenParams,
	newToken *oauth2.Token,
	authToken string,
) {
	refreshedIDToken, _ := newToken.Extra("id_token").(string)
	if refreshedIDToken == "" && !params.OIDCUseAccessToken {
		refreshedIDToken = authToken
	}

	if refreshedIDToken == "" {
		return
	}

	if err := SetIDTokenCookie(
		params.Writer,
		params.Request,
		params.Cluster,
		refreshedIDToken,
		params.BaseURL,
		params.SessionTTL,
	); err != nil {
		logger.Log(logger.LevelWarn, map[string]string{logFieldCluster: params.Cluster},
			err, "failed to retain refreshed ID token for provider logout")
	}
}

func refreshedTokenString(newToken *oauth2.Token, useAccessToken bool) (string, error) {
	if useAccessToken {
		if newToken.AccessToken != "" {
			return newToken.AccessToken, nil
		}
	} else if idToken, ok := newToken.Extra("id_token").(string); ok && idToken != "" {
		return idToken, nil
	}

	return "", errors.New("refreshed token missing expected field")
}

// RefreshAndSetToken refreshes an expiring token, updates the auth cookie,
// and records telemetry based on the provided parameters.
func RefreshAndSetToken(params RefreshAndSetTokenParams) {
	// The token type to use
	tokenType := "id_token"
	if params.OIDCUseAccessToken {
		tokenType = "access_token"
	}

	idpIssuerURL := params.OIDCIdpIssuerURL
	if idpIssuerURL == "" {
		idpIssuerURL = params.OIDCAuthConfig.IdpIssuerURL
	}

	newToken, err := RefreshAndCacheNewToken(
		params.Ctx,
		params.OIDCAuthConfig,
		params.Cache,
		tokenType,
		params.Token,
		idpIssuerURL,
		params.OIDCValidatorIdpIssuerURL,
		time.Duration(params.SessionTTL)*time.Second,
		params.TokenRefreshGroup,
	)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldCluster: params.Cluster},
			err, "failed to refresh token")
		params.TelemetryHandler.RecordError(params.Span, err, "Token refresh failed")
		params.TelemetryHandler.RecordErrorCount(params.Ctx, attribute.String("error", "token_refresh_failure"))

		return
	}

	if newToken == nil {
		return
	}

	applyRefreshedToken(params, newToken)
}

// applyRefreshedToken extracts the refreshed token string from newToken, stores it in the auth
// cookie, and makes it visible to the rest of this same request's handling.
func applyRefreshedToken(params RefreshAndSetTokenParams, newToken *oauth2.Token) {
	newTokenString, err := refreshedTokenString(newToken, params.OIDCUseAccessToken)
	if err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldCluster: params.Cluster},
			err, "failed to extract token string")
		params.TelemetryHandler.RecordError(params.Span, err, "Token extraction failed")

		return
	}

	// Set refreshed token in cookie -- unless Token came from a bearer Authorization header
	// rather than Headlamp's own cookie (see TokenSource, RefreshAndSetTokenParams.SkipCookie):
	// that is some other caller's pass-through credential for this one request, not a Headlamp
	// login, and must never be persisted (or have an existing cookie widened) on its behalf. The
	// same reasoning applies to the ID-token-for-logout cookie below: a caller we are not giving
	// a session cookie to must not be given a persistent logout-hint cookie either.
	if !params.SkipCookie {
		if err := SetTokenCookie(params.Writer, params.Request, params.Cluster, newTokenString, params.BaseURL,
			params.SessionTTL, params.UseDeploymentCookieScope); err != nil {
			logger.Log(logger.LevelError, map[string]string{logFieldCluster: params.Cluster},
				err, "failed to set refreshed auth cookie")
			params.TelemetryHandler.RecordError(params.Span, err, "Failed to set refreshed cookie")

			return
		}

		setRefreshedIDTokenCookie(params, newToken, newTokenString)
	}

	// Make the refreshed token visible to the rest of THIS request's handling too, not just
	// the response: SetTokenCookie only updates the response's Set-Cookie, so params.Request's
	// own Cookie header -- what requestIDToken reads by default -- would otherwise still carry
	// the token that was just replaced. Left unset, a later verification in the same request
	// (for example impersonationForRequest's) would see that old token, fail if it had already
	// expired, and attempt its own refresh using the same refresh token this one just consumed
	// -- which a provider that rotates or invalidates refresh tokens after use would then
	// reject, turning this refresh's success into a 401 anyway. requestIDToken checks the
	// Authorization header before falling back to the cookie, so setting it here is enough.
	params.Request.Header.Set("Authorization", "Bearer "+newTokenString)

	// Record what params.Token -- the specific stale token this refresh was for -- was
	// refreshed to (see LatestIDTokenCacheKey): a caller presenting that exact same stale
	// token, with no cookie-writing response of its own, can then reuse this result instead of
	// performing its own refresh-token exchange. Keyed by the stale token itself, not the
	// cluster, so this can never resolve a different user's failed-verification request against
	// this one's session. Bounded by LatestIDTokenTTL rather than kept forever: with no TTL this
	// entry -- which holds a live, usable refreshed token -- would sit in the cache for the
	// lifetime of the process even long after every caller that could ever look it up (by this
	// exact stale token) has moved on.
	if err := params.Cache.SetWithTTL(
		params.Ctx, LatestIDTokenCacheKey(params.Token), newTokenString, LatestIDTokenTTL,
	); err != nil {
		logger.Log(logger.LevelError, map[string]string{logFieldCluster: params.Cluster}, err,
			"failed to cache latest refreshed token")
	}

	params.TelemetryHandler.RecordEvent(params.Span, "Token refreshed successfully")
}
