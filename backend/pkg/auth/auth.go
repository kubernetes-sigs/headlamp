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
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
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
// the Bearer token from the Authorization header of the HTTP request.
func ParseClusterAndToken(r *http.Request) (string, string) {
	cluster := ""

	matches := clusterPathRegex.FindStringSubmatch(r.URL.Path)
	if len(matches) > 1 {
		cluster = matches[1]
	}

	token := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.Contains(token, ",") {
		return cluster, ""
	}

	const bearerPrefix = "Bearer "
	if strings.HasPrefix(strings.ToLower(token), strings.ToLower(bearerPrefix)) {
		token = strings.TrimSpace(token[len(bearerPrefix):])
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

type Identity struct {
	Username string   `json:"username,omitempty"`
	Email    string   `json:"email,omitempty"`
	Groups   []string `json:"groups,omitempty"`
}

// JWTPayload returns the unverified payload of a JWT as a map.
func JWTPayload(token string) (map[string]interface{}, error) {
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 || parts[1] == "" {
		return nil, errors.New("invalid JWT")
	}
	return DecodeBase64JSON(parts[1])
}

// IdentityFromRequest extracts user info from oauth2-proxy headers or the OIDC JWT cookie.
// It supports env-configurable claim paths (dot notation) and sensible defaults.
func IdentityFromRequest(r *http.Request) (Identity, bool) {
	// 1) Prefer oauth2-proxy forwarded headers if present.
	email := strings.TrimSpace(r.Header.Get("X-Auth-Request-Email"))
	user := strings.TrimSpace(r.Header.Get("X-Auth-Request-User"))
	var groups []string
	if g := strings.TrimSpace(r.Header.Get("X-Auth-Request-Groups")); g != "" {
		groups = splitCSV(g)
	}
	if email != "" || user != "" || len(groups) > 0 {
		return Identity{Username: user, Email: email, Groups: groups}, true
	}

	// 2) Otherwise, parse the JWT from the cookie for the given cluster.
	cluster := r.URL.Query().Get("cluster")
	if cluster == "" {
		return Identity{}, false
	}
	token, err := GetTokenFromCookie(r, cluster)
	if err != nil || token == "" {
		return Identity{}, false
	}

	claims, err := JWTPayload(token)
	if err != nil {
		return Identity{}, false
	}

	// Allow overrides via env; fall back to common claim names.
	username := firstString(claims,
		os.Getenv("HEADLAMP_OIDC_USERNAME_CLAIM"),
		[]string{"preferred_username", "name", "upn", "sub"},
	)
	email = firstString(claims,
		os.Getenv("HEADLAMP_OIDC_EMAIL_CLAIM"),
		[]string{"email"},
	)
	groups = firstStringSlice(claims,
		os.Getenv("HEADLAMP_OIDC_GROUPS_CLAIM"),
		[]string{"groups", "realm_access.roles", "cognito:groups"},
	)

	return Identity{Username: username, Email: email, Groups: groups}, true
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if v := strings.TrimSpace(p); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func getByPath(m map[string]interface{}, path string) (interface{}, bool) {
	if path == "" {
		return nil, false
	}
	cur := any(m)
	for _, seg := range strings.Split(path, ".") {
		obj, ok := cur.(map[string]interface{})
		if !ok {
			return nil, false
		}
		next, ok := obj[seg]
		if !ok {
			return nil, false
		}
		cur = next
	}
	return cur, true
}

func firstString(m map[string]interface{}, override string, fallbacks []string) string {
	if v, ok := getByPath(m, override); ok {
		if s, ok2 := v.(string); ok2 {
			return s
		}
	}
	for _, k := range fallbacks {
		if v, ok := getByPath(m, k); ok {
			if s, ok2 := v.(string); ok2 {
				return s
			}
		}
	}
	return ""
}

func firstStringSlice(m map[string]interface{}, override string, fallbacks []string) []string {
	if v, ok := getByPath(m, override); ok {
		if out := toStringSlice(v); len(out) > 0 {
			return out
		}
	}
	for _, k := range fallbacks {
		if v, ok := getByPath(m, k); ok {
			if out := toStringSlice(v); len(out) > 0 {
				return out
			}
		}
	}
	return nil
}

func toStringSlice(v interface{}) []string {
	switch vv := v.(type) {
	case []interface{}:
		out := make([]string, 0, len(vv))
		for _, e := range vv {
			if s, ok := e.(string); ok && s != "" {
				out = append(out, s)
			}
		}
		return out
	case []string:
		return vv
	default:
		return nil
	}
}
