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

package gcp //nolint:testpackage // Tests access internal functions

import (
	"context"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

// mockCache is a simple in-memory cache for testing.
type mockCache struct {
	data map[string]interface{}
}

func newMockCache() *mockCache {
	return &mockCache{
		data: make(map[string]interface{}),
	}
}

func (m *mockCache) Get(ctx context.Context, key string) (interface{}, error) {
	val, ok := m.data[key]
	if !ok {
		return nil, assert.AnError
	}

	return val, nil
}

func (m *mockCache) Set(ctx context.Context, key string, value interface{}) error {
	m.data[key] = value
	return nil
}

func (m *mockCache) SetWithTTL(ctx context.Context, key string, value interface{}, ttl time.Duration) error {
	m.data[key] = value
	return nil
}

func (m *mockCache) Delete(ctx context.Context, key string) error {
	delete(m.data, key)
	return nil
}

func (m *mockCache) GetAll(ctx context.Context, selectFunc cache.Matcher) (map[string]interface{}, error) {
	result := make(map[string]interface{})

	for k, v := range m.data {
		if selectFunc == nil || selectFunc(k) {
			result[k] = v
		}
	}

	return result, nil
}

func (m *mockCache) UpdateTTL(ctx context.Context, key string, ttl time.Duration) error {
	// No-op for mock
	return nil
}

func TestNewGCPAuthenticator(t *testing.T) {
	cache := newMockCache()
	auth := NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	assert.NotNil(t, auth)
	assert.Equal(t, "test-client-id", auth.clientID)
	assert.Equal(t, "test-secret", auth.clientSecret)
	assert.NotNil(t, auth.oauth2Config)
	assert.NotNil(t, auth.cache)
}

func TestGetAuthCodeURL(t *testing.T) {
	cache := newMockCache()
	auth := NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	tests := []struct {
		name          string
		state         string
		codeChallenge string
		wantContains  []string
	}{
		{
			name:         "without PKCE",
			state:        "test-state",
			wantContains: []string{"test-state", "access_type=offline", "prompt=consent"},
		},
		{
			name:          "with PKCE",
			state:         "test-state",
			codeChallenge: "test-challenge",
			wantContains:  []string{"test-state", "code_challenge=test-challenge", "code_challenge_method=S256"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url := auth.GetAuthCodeURL(tt.state, tt.codeChallenge)
			assert.NotEmpty(t, url)

			for _, want := range tt.wantContains {
				assert.Contains(t, url, want)
			}
		})
	}
}

func TestGetGKEAccessToken(t *testing.T) {
	cache := newMockCache()
	auth := NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	tests := []struct {
		name       string
		token      *oauth2.Token
		wantErr    bool
		wantErrMsg string
		wantToken  string
	}{
		{
			name:       "nil token",
			token:      nil,
			wantErr:    true,
			wantErrMsg: "oauth2 token is nil",
		},
		{
			name: "expired token",
			token: &oauth2.Token{
				AccessToken: "test-token",
				Expiry:      time.Now().Add(-1 * time.Hour),
			},
			wantErr:    true,
			wantErrMsg: "oauth2 token is invalid or expired",
		},
		{
			name: "valid token",
			token: &oauth2.Token{
				AccessToken: "test-access-token",
				Expiry:      time.Now().Add(1 * time.Hour),
			},
			wantErr:   false,
			wantToken: "test-access-token",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token, err := auth.GetGKEAccessToken(context.Background(), tt.token)

			if tt.wantErr {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErrMsg)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.wantToken, token)
			}
		})
	}
}

func TestCacheRefreshToken(t *testing.T) {
	cache := newMockCache()
	auth := NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	ctx := context.Background()
	cluster := "test-cluster"
	accessToken := "test-access-token"
	refreshToken := "test-refresh-token"

	err := auth.CacheRefreshToken(ctx, cluster, accessToken, refreshToken)
	assert.NoError(t, err)

	// Verify token was cached
	cachedToken, err := auth.GetCachedRefreshToken(ctx, cluster, accessToken)
	assert.NoError(t, err)
	assert.Equal(t, refreshToken, cachedToken)
}

func TestGetCachedRefreshToken(t *testing.T) {
	cache := newMockCache()
	auth := NewGCPAuthenticator("test-client-id", "test-secret", "http://localhost/callback", cache)

	ctx := context.Background()
	cluster := "test-cluster"
	accessToken := "test-access-token"

	// No cached token
	_, err := auth.GetCachedRefreshToken(ctx, cluster, accessToken)
	assert.Error(t, err)

	// Cache a token
	refreshToken := "test-refresh-token"
	err = auth.CacheRefreshToken(ctx, cluster, accessToken, refreshToken)
	require.NoError(t, err)

	// Retrieve it
	cachedToken, err := auth.GetCachedRefreshToken(ctx, cluster, accessToken)
	assert.NoError(t, err)
	assert.Equal(t, refreshToken, cachedToken)
}

func TestGenerateRandomState(t *testing.T) {
	state1, err := GenerateRandomState()
	assert.NoError(t, err)
	assert.NotEmpty(t, state1)

	state2, err := GenerateRandomState()
	assert.NoError(t, err)
	assert.NotEmpty(t, state2)

	// States should be different
	assert.NotEqual(t, state1, state2)
}

func TestGenerateCodeVerifier(t *testing.T) {
	verifier1, err := GenerateCodeVerifier()
	assert.NoError(t, err)
	assert.NotEmpty(t, verifier1)

	verifier2, err := GenerateCodeVerifier()
	assert.NoError(t, err)
	assert.NotEmpty(t, verifier2)

	// Verifiers should be different
	assert.NotEqual(t, verifier1, verifier2)
}

func TestGenerateCodeChallenge(t *testing.T) {
	verifier := "test-verifier"
	challenge := GenerateCodeChallenge(verifier)

	assert.NotEmpty(t, challenge)
	// Challenge should be deterministic for same verifier
	challenge2 := GenerateCodeChallenge(verifier)
	assert.Equal(t, challenge, challenge2)
}

func TestIsGKECluster(t *testing.T) {
	tests := []struct {
		name       string
		clusterURL string
		want       bool
	}{
		{
			name:       "GKE cluster with googleapis.com",
			clusterURL: "https://35.123.45.67.gke.googleapis.com",
			want:       true,
		},
		{
			name:       "GKE cluster with container.cloud.google.com",
			clusterURL: "https://container.cloud.google.com/v1/projects/...",
			want:       true,
		},
		{
			name:       "non-GKE cluster",
			clusterURL: "https://kubernetes.default.svc",
			want:       false,
		},
		{
			name:       "empty URL",
			clusterURL: "",
			want:       false,
		},
		{
			name:       "EKS cluster",
			clusterURL: "https://ABC123.gr7.us-west-2.eks.amazonaws.com",
			want:       false,
		},
		{
			name:       "AKS cluster",
			clusterURL: "https://myaks-dns-12345678.hcp.westus.azmk8s.io",
			want:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsGKECluster(tt.clusterURL)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestHashToken(t *testing.T) {
	token := "test-token"
	hash1 := hashToken(token)

	assert.NotEmpty(t, hash1)
	assert.Len(t, hash1, 16) // Should be truncated to 16 characters

	// Hash should be deterministic
	hash2 := hashToken(token)
	assert.Equal(t, hash1, hash2)

	// Different tokens should produce different hashes
	hash3 := hashToken("different-token")
	assert.NotEqual(t, hash1, hash3)
}
