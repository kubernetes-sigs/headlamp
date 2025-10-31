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
	"golang.org/x/oauth2"
)

const (
	oldTokenTTL   = time.Second * 10 // seconds
	oidcKeyPrefix = "oidc-token-"
)

const JWTExpirationTTL = 10 * time.Second // seconds

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

// ParseClusterAndToken extracts the cluster name from the URL path and
// the Bearer token from the Authorization header of the HTTP request, falling
// back to the cluster cookie when the header is missing.
func ParseClusterAndToken(r *http.Request) (string, string) {
	cluster := ""

	matches := clusterPathRegex.FindStringSubmatch(r.URL.Path)
	if len(matches) > 1 {
		cluster = matches[1]
	}

	// Try Authorization header first (for backward compatibility)
	token := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.Contains(token, ",") {
		return cluster, ""
	}

	const bearerPrefix = "Bearer "
	if strings.HasPrefix(strings.ToLower(token), strings.ToLower(bearerPrefix)) {
		token = strings.TrimSpace(token[len(bearerPrefix):])
	}

	// If no auth header, try cookie
	if token == "" && cluster != "" {
		if cookieToken, err := GetTokenFromCookie(r, cluster); err == nil && cookieToken != "" {
			token = cookieToken
		}
	}

	if token != "" && !bearerTokenRegex.MatchString(token) {
		return cluster, ""
	}

	return cluster, token
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

// CacheRefreshedToken updates the refresh token in the cache.
func CacheRefreshedToken(token *oauth2.Token, tokenType string, oldToken string,
	oldRefreshToken string, cache cache.Cache[interface{}],
) error {
	newToken, ok := token.Extra(tokenType).(string)
	if !ok {
		return nil
	}

	ctx := context.Background()

	if err := cache.Set(ctx, oidcKeyPrefix+newToken, token.RefreshToken); err != nil {
		logger.Log(logger.LevelError, nil, err, "failed to cache refreshed token")
		return err
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
func GetNewToken(clientID, clientSecret string, cache cache.Cache[interface{}],
	tokenType string, token string, tokenURL string,
) (*oauth2.Token, error) {
	ctx := context.Background()

	// get refresh token
	refreshToken, err := cache.Get(ctx, oidcKeyPrefix+token)
	if err != nil {
		return nil, fmt.Errorf("getting refresh token: %v", err)
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

	// update the refresh token in the cache
	if err := CacheRefreshedToken(newToken, tokenType, token, rToken, cache); err != nil {
		return nil, fmt.Errorf("caching refreshed token: %v", err)
	}

	return newToken, nil
}

// ConfigureTLSContext configures TLS settings for the HTTP client in the context.
// When skipTLSVerify is true, a client that skips verification is installed.
// When caCert is provided, a client with that CA pool is installed and takes precedence,
// re-enabling verification while trusting the supplied certificate bundle.
func ConfigureTLSContext(ctx context.Context, skipTLSVerify *bool, caCert *string) context.Context {
	if skipTLSVerify != nil && *skipTLSVerify {
		tlsSkipTransport := &http.Transport{
			// the gosec linter is disabled here because we are explicitly requesting to skip TLS verification.
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, //nolint:gosec
		}
		ctx = oidc.ClientContext(ctx, &http.Client{Transport: tlsSkipTransport})
	}

	if caCert != nil {
		caCertPool := x509.NewCertPool()
		if !caCertPool.AppendCertsFromPEM([]byte(*caCert)) {
			// Log error but continue with original context
			logger.Log(logger.LevelError, nil,
				errors.New("failed to append ca cert to pool"), "couldn't add custom cert to context")
			return ctx
		}

		// the gosec linter is disabled because gosec promotes using a minVersion of TLS 1.2 or higher.
		// since we are using a custom CA cert configured by the user, we are not forcing a minVersion.
		customTransport := &http.Transport{
			TLSClientConfig: &tls.Config{ //nolint:gosec
				RootCAs: caCertPool,
			},
		}

		ctx = oidc.ClientContext(ctx, &http.Client{Transport: customTransport})
	}

	return ctx
}

// RefreshAndCacheNewToken obtains a fresh OIDC token using the cached refresh token
// and re-populates the cache so subsequent requests can reuse it. The provided ctx
// controls cancellation and deadlines for all outbound requests during the refresh.
func RefreshAndCacheNewToken(ctx context.Context, oidcAuthConfig *kubeconfig.OidcConfig,
	cache cache.Cache[interface{}],
	tokenType, token, issuerURL string,
) (*oauth2.Token, error) {
	ctx = ConfigureTLSContext(ctx, oidcAuthConfig.SkipTLSVerify, oidcAuthConfig.CACert)

	// get provider
	provider, err := oidc.NewProvider(ctx, issuerURL)
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
	)
	if err != nil {
		return nil, fmt.Errorf("refreshing token: %w", err)
	}

	return newToken, nil
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
			writeMeJSON(w, http.StatusBadRequest, map[string]interface{}{"message": "cluster not specified"})
			return
		}

		requestCluster, token := ParseClusterAndToken(r)

		if requestCluster == "" {
			requestCluster = clusterName
		}

		if requestCluster != clusterName {
			writeMeJSON(w, http.StatusBadRequest, map[string]interface{}{"message": "cluster mismatch"})
			return
		}

		if token == "" {
			writeMeJSON(w, http.StatusUnauthorized, map[string]interface{}{"message": "unauthorized"})
			return
		}

		claims, status, errMsg := parseClaimsFromToken(token)
		if status != 0 {
			writeMeJSON(w, status, map[string]interface{}{"message": errMsg})
			return
		}

		if expiry, err := GetExpiryUnixTimeUTC(claims); err != nil || time.Now().After(expiry) {
			writeMeJSON(w, http.StatusUnauthorized, map[string]interface{}{"message": "token expired"})
			return
		}

		username := stringValueFromJMESPaths(claims, compiledUsernamePaths)
		email := stringValueFromJMESPaths(claims, compiledEmailPaths)
		groups := stringSliceFromJMESPaths(claims, compiledGroupsPaths)

		writeMeResponse(w, username, email, groups, userInfoURL)
	}
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

// writeMeResponse serializes the identity payload with the standard cache-busting headers.
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

	rawPaths := strings.Split(pathCSV, ",")
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

// marshalToString encodes the provided value as JSON and logs failures.
func marshalToString(val interface{}) (string, bool) {
	b, err := json.Marshal(val)
	if err != nil {
		logger.Log(logger.LevelWarn, nil, err, "failed to marshal value to JSON string")
		return "", false
	}

	return string(b), true
}
