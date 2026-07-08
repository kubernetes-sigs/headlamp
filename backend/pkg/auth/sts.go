/*
Copyright 2026 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
you may obtain a copy of the License at

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
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"
)

var discoveryCache sync.Map

// STSOptions holds the configuration for the STS token exchange.
type STSOptions struct {
	Enabled                 bool
	IssuerURL               string
	ClientID                string
	ClientSecret            string
	AudienceMap             map[string]string
	ServiceAccountTokenPath string
}

// ParseAudienceMap parses a comma-separated key-value list (e.g. "c1=a1,c2=a2") into a map.
func ParseAudienceMap(s string) map[string]string {
	m := make(map[string]string)
	if s == "" {
		return m
	}

	pairs := strings.Split(s, ",")
	for _, pair := range pairs {
		kv := strings.SplitN(pair, "=", 2)
		if len(kv) == 2 {
			m[strings.TrimSpace(kv[0])] = strings.TrimSpace(kv[1])
		}
	}

	return m
}

// discoverTokenEndpoint queries the OIDC issuer's discovery endpoint to locate its token_endpoint.
func discoverTokenEndpoint(ctx context.Context, issuerURL string) (string, error) {
	if cached, ok := discoveryCache.Load(issuerURL); ok {
		if tokenEndpoint, ok := cached.(string); ok && tokenEndpoint != "" {
			return tokenEndpoint, nil
		}
	}

	wellKnownURL := strings.TrimSuffix(issuerURL, "/") + "/.well-known/openid-configuration"

	req, err := http.NewRequestWithContext(ctx, "GET", wellKnownURL, nil)
	if err != nil {
		return "", err
	}

	client, _ := ctx.Value(oauth2.HTTPClient).(*http.Client)
	if client == nil {
		client = &http.Client{}
	}

	httpClient := *client
	if httpClient.Timeout == 0 {
		httpClient.Timeout = 10 * time.Second
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("discovery request returned status: %s", resp.Status)
	}

	var metadata struct {
		TokenEndpoint string `json:"token_endpoint"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&metadata); err != nil {
		return "", err
	}

	if metadata.TokenEndpoint == "" {
		return "", fmt.Errorf("discovery response missing token_endpoint")
	}

	discoveryCache.Store(issuerURL, metadata.TokenEndpoint)

	return metadata.TokenEndpoint, nil
}

//nolint:gosec
var saTokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token"

// ExchangeTokenForCluster exchanges the subject token for a cluster-scoped token using RFC 8693.
//
//nolint:funlen
func ExchangeTokenForCluster(
	ctx context.Context,
	opts STSOptions,
	subjectToken string,
	clusterID string,
) (string, error) {
	if !opts.Enabled {
		return "", fmt.Errorf("STS is not enabled")
	}

	if opts.IssuerURL == "" {
		return "", fmt.Errorf("STS issuer URL is required")
	}

	audience, ok := opts.AudienceMap[clusterID]
	if !ok || audience == "" {
		return "", fmt.Errorf("no STS audience configured for cluster %s", clusterID)
	}

	// 1. Discover the token endpoint dynamically
	tokenURL, err := discoverTokenEndpoint(ctx, opts.IssuerURL)
	if err != nil {
		return "", fmt.Errorf("failed to discover token endpoint: %w", err)
	}

	// 2. Build the URL-encoded token-exchange POST body (RFC 8693)
	data := url.Values{}
	data.Set("grant_type", "urn:ietf:params:oauth:grant-type:token-exchange")
	data.Set("subject_token", subjectToken)
	data.Set("subject_token_type", "urn:ietf:params:oauth:token-type:jwt")
	data.Set("requested_token_type", "urn:ietf:params:oauth:token-type:access_token")
	data.Set("audience", audience)

	// Support Kubernetes Pod Service Account Token (Workload Identity) client authentication (RFC 7523)
	var useClientAssertion bool

	if opts.ClientID != "" {
		data.Set("client_id", opts.ClientID)
	}

	if opts.ClientID != "" && opts.ClientSecret == "" {
		tokenPath := opts.ServiceAccountTokenPath
		if tokenPath == "" {
			tokenPath = saTokenPath
		}

		cleanPath := filepath.Clean(tokenPath)
		// #nosec G304
		if tokenBytes, err := os.ReadFile(cleanPath); err == nil {
			data.Set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer")
			data.Set("client_assertion", strings.TrimSpace(string(tokenBytes)))

			useClientAssertion = true
		}
	}

	req, err := http.NewRequestWithContext(ctx, "POST", tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	// 3. Set client authentication if client credentials are provided via Basic Auth
	if opts.ClientID != "" && opts.ClientSecret != "" && !useClientAssertion {
		req.SetBasicAuth(opts.ClientID, opts.ClientSecret)
	}

	// 4. Execute the exchange request
	client, _ := ctx.Value(oauth2.HTTPClient).(*http.Client)
	if client == nil {
		client = &http.Client{}
	}

	httpClient := *client
	if httpClient.Timeout == 0 {
		httpClient.Timeout = 10 * time.Second
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("token exchange request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token exchange returned status: %s (token_url=%s)", resp.Status, tokenURL)
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("failed to decode token response: %w", err)
	}

	if tokenResp.AccessToken == "" {
		return "", fmt.Errorf("token exchange response missing access_token")
	}

	return tokenResp.AccessToken, nil
}
