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

package gcp

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/logger"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const (
	// GCP OAuth scopes required for GKE authentication.
	scopeOpenID        = "openid"
	scopeEmail         = "email"
	scopeProfile       = "profile"
	scopeCloudPlatform = "https://www.googleapis.com/auth/cloud-platform"
	scopeUserInfoEmail = "https://www.googleapis.com/auth/userinfo.email"

	// Cache key prefix for refresh tokens.
	refreshTokenCachePrefix = "gcp-refresh-" //nolint:gosec // G101: This is a cache key prefix, not a credential
)

// GCPAuthenticator handles GCP-specific OAuth authentication for GKE clusters.
type GCPAuthenticator struct {
	clientID     string
	clientSecret string
	oauth2Config *oauth2.Config
	cache        cache.Cache[interface{}]
}

// NewGCPAuthenticator creates a new GCP authenticator for OAuth flows.
func NewGCPAuthenticator(clientID, clientSecret, redirectURL string, cache cache.Cache[interface{}]) *GCPAuthenticator {
	return &GCPAuthenticator{
		clientID:     clientID,
		clientSecret: clientSecret,
		cache:        cache,
		oauth2Config: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Scopes: []string{
				scopeOpenID,
				scopeEmail,
				scopeProfile,
				scopeCloudPlatform,
				scopeUserInfoEmail,
			},
			Endpoint: google.Endpoint,
		},
	}
}

// GetAuthCodeURL returns the URL for OAuth authorization with PKCE support.
func (g *GCPAuthenticator) GetAuthCodeURL(state string, codeChallenge string) string {
	opts := []oauth2.AuthCodeOption{
		oauth2.SetAuthURLParam("access_type", "offline"),
		oauth2.SetAuthURLParam("prompt", "consent"),
	}

	if codeChallenge != "" {
		// PKCE support for enhanced security
		opts = append(opts,
			oauth2.SetAuthURLParam("code_challenge", codeChallenge),
			oauth2.SetAuthURLParam("code_challenge_method", "S256"),
		)
	}

	return g.oauth2Config.AuthCodeURL(state, opts...)
}

// Exchange exchanges an authorization code for an OAuth token.
func (g *GCPAuthenticator) Exchange(ctx context.Context, code string, codeVerifier string) (*oauth2.Token, error) {
	opts := []oauth2.AuthCodeOption{}

	if codeVerifier != "" {
		opts = append(opts, oauth2.SetAuthURLParam("code_verifier", codeVerifier))
	}

	token, err := g.oauth2Config.Exchange(ctx, code, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to exchange code for token: %w", err)
	}

	return token, nil
}

// GetGKEAccessToken returns the access token suitable for GKE authentication.
// This mimics what gke-gcloud-auth-plugin does internally.
func (g *GCPAuthenticator) GetGKEAccessToken(ctx context.Context, oauth2Token *oauth2.Token) (string, error) {
	if oauth2Token == nil {
		return "", fmt.Errorf("oauth2 token is nil")
	}

	if !oauth2Token.Valid() {
		return "", fmt.Errorf("oauth2 token is invalid or expired")
	}

	// The OAuth token with cloud-platform scope is what GKE accepts directly!
	// This is exactly what gke-gcloud-auth-plugin does internally.
	return oauth2Token.AccessToken, nil
}

// RefreshToken refreshes an expired token using the refresh token.
func (g *GCPAuthenticator) RefreshToken(ctx context.Context, refreshToken string) (*oauth2.Token, error) {
	if refreshToken == "" {
		return nil, fmt.Errorf("refresh token is empty")
	}

	token := &oauth2.Token{
		RefreshToken: refreshToken,
	}

	tokenSource := g.oauth2Config.TokenSource(ctx, token)

	newToken, err := tokenSource.Token()
	if err != nil {
		return nil, fmt.Errorf("failed to refresh token: %w", err)
	}

	return newToken, nil
}

// CacheRefreshToken stores the refresh token in the cache for later use.
func (g *GCPAuthenticator) CacheRefreshToken(ctx context.Context, cluster, accessToken, refreshToken string) error {
	if refreshToken == "" {
		logger.Log(logger.LevelInfo, map[string]string{"cluster": cluster}, nil, "no refresh token to cache")
		return nil
	}

	cacheKey := g.getRefreshTokenCacheKey(cluster, accessToken)
	if err := g.cache.Set(ctx, cacheKey, refreshToken); err != nil {
		return fmt.Errorf("failed to cache refresh token: %w", err)
	}

	logger.Log(logger.LevelInfo, map[string]string{"cluster": cluster}, nil, "cached refresh token")

	return nil
}

// GetCachedRefreshToken retrieves the refresh token from cache.
func (g *GCPAuthenticator) GetCachedRefreshToken(ctx context.Context, cluster, accessToken string) (string, error) {
	cacheKey := g.getRefreshTokenCacheKey(cluster, accessToken)

	refreshToken, err := g.cache.Get(ctx, cacheKey)
	if err != nil {
		return "", fmt.Errorf("failed to get cached refresh token: %w", err)
	}

	refreshTokenStr, ok := refreshToken.(string)
	if !ok {
		return "", fmt.Errorf("cached refresh token is not a string")
	}

	return refreshTokenStr, nil
}

// getRefreshTokenCacheKey generates a cache key for storing refresh tokens.
func (g *GCPAuthenticator) getRefreshTokenCacheKey(cluster, accessToken string) string {
	return fmt.Sprintf("%s%s-%s", refreshTokenCachePrefix, cluster, hashToken(accessToken))
}

// hashToken creates a short hash of the token for cache key purposes.
func hashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return base64.URLEncoding.EncodeToString(hash[:])[:16]
}

// GenerateRandomState generates a cryptographically secure random state for CSRF protection.
func GenerateRandomState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("failed to generate random state: %w", err)
	}

	return base64.URLEncoding.EncodeToString(b), nil
}

// GenerateCodeVerifier generates a PKCE code verifier.
func GenerateCodeVerifier() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("failed to generate code verifier: %w", err)
	}

	return base64.URLEncoding.EncodeToString(b), nil
}

// GenerateCodeChallenge generates a PKCE code challenge from a verifier.
func GenerateCodeChallenge(verifier string) string {
	hash := sha256.Sum256([]byte(verifier))
	// Use RawURLEncoding (no padding) as per RFC 7636 PKCE specification
	return base64.RawURLEncoding.EncodeToString(hash[:])
}

// IsGKECluster detects if a cluster URL is a GKE cluster.
func IsGKECluster(clusterURL string) bool {
	if clusterURL == "" {
		return false
	}

	clusterURL = strings.ToLower(clusterURL)

	return strings.Contains(clusterURL, ".googleapis.com") ||
		strings.Contains(clusterURL, "container.cloud.google.com")
}
