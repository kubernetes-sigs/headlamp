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
	"fmt"
	"net/http"
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
