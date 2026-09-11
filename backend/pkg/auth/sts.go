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
	"crypto/sha256"
	"encoding/json"
	"errors"
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

var (
	discoveryCache  sync.Map
	stsTokenCacheMu sync.Mutex
	stsTokenCache   = make(map[string]tokenCacheEntry)
	stsInflight     = make(map[string]*tokenExchangeFlight)
)

type tokenCacheEntry struct {
	token     string
	expiresAt time.Time
}

type tokenExchangeFlight struct {
	wg    sync.WaitGroup
	token string
	err   error
}

// ResetSTSCache clears all cached STS discovery metadata and exchanged tokens (used in testing).
func ResetSTSCache() {
	discoveryCache = sync.Map{}

	stsTokenCacheMu.Lock()
	stsTokenCache = make(map[string]tokenCacheEntry)
	stsInflight = make(map[string]*tokenExchangeFlight)
	stsTokenCacheMu.Unlock()
}

// STSError represents an error during STS token exchange with an associated HTTP status code.
type STSError struct {
	StatusCode int
	Message    string
	Err        error
}

func (e *STSError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}

	return e.Message
}

func (e *STSError) Unwrap() error {
	return e.Err
}

// GetSTSErrorStatusCode returns the HTTP status code from an error if it is an STSError,
// or http.StatusInternalServerError.
func GetSTSErrorStatusCode(err error) int {
	var stsErr *STSError
	if errors.As(err, &stsErr) && stsErr.StatusCode != 0 {
		return stsErr.StatusCode
	}

	return http.StatusInternalServerError
}

// STSOptions holds the configuration for the STS token exchange.
type STSOptions struct {
	Enabled                 bool
	IssuerURL               string
	ClientID                string
	ClientSecret            string
	SubjectTokenType        string
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
		if len(kv) != 2 {
			continue
		}

		key := strings.TrimSpace(kv[0])
		val := strings.TrimSpace(kv[1])

		if key == "" || val == "" {
			continue
		}

		m[key] = val
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
		return "", &STSError{
			StatusCode: http.StatusInternalServerError,
			Message:    "failed to create discovery request",
			Err:        err,
		}
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
		return "", &STSError{StatusCode: http.StatusBadGateway, Message: "discovery request failed", Err: err}
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", &STSError{
			StatusCode: http.StatusBadGateway,
			Message:    fmt.Sprintf("discovery request returned status: %s", resp.Status),
		}
	}

	var metadata struct {
		TokenEndpoint string `json:"token_endpoint"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&metadata); err != nil {
		return "", &STSError{
			StatusCode: http.StatusBadGateway,
			Message:    "failed to decode discovery response",
			Err:        err,
		}
	}

	if metadata.TokenEndpoint == "" {
		return "", &STSError{StatusCode: http.StatusBadGateway, Message: "discovery response missing token_endpoint"}
	}

	discoveryCache.Store(issuerURL, metadata.TokenEndpoint)

	return metadata.TokenEndpoint, nil
}

//nolint:gosec
var saTokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token"

//nolint:gosec
const defaultSubjectTokenType = "urn:ietf:params:oauth:token-type:jwt"

// ExchangeTokenForCluster exchanges the subject token for a cluster-scoped token using RFC 8693.
// Exchanged tokens are cached in memory and deduplicated across concurrent requests.
//
//nolint:funlen
func ExchangeTokenForCluster(
	ctx context.Context,
	opts STSOptions,
	subjectToken string,
	clusterID string,
) (string, error) {
	if !opts.Enabled {
		return "", &STSError{StatusCode: http.StatusInternalServerError, Message: "STS is not enabled"}
	}

	if opts.IssuerURL == "" {
		return "", &STSError{StatusCode: http.StatusInternalServerError, Message: "STS issuer URL is required"}
	}

	if strings.TrimSpace(subjectToken) == "" {
		return "", &STSError{StatusCode: http.StatusBadRequest, Message: "subject token is required"}
	}

	if strings.TrimSpace(clusterID) == "" {
		return "", &STSError{StatusCode: http.StatusBadRequest, Message: "cluster ID is required"}
	}

	audience, ok := opts.AudienceMap[clusterID]
	if !ok || audience == "" {
		return "", &STSError{
			StatusCode: http.StatusInternalServerError,
			Message:    fmt.Sprintf("no STS audience configured for cluster %s", clusterID),
		}
	}

	subjectTokenType := opts.SubjectTokenType
	if subjectTokenType == "" {
		subjectTokenType = defaultSubjectTokenType
	} else if !strings.HasPrefix(subjectTokenType, "urn:") {
		subjectTokenType = "urn:ietf:params:oauth:token-type:" + subjectTokenType
	}

	// Cache key: issuer|cluster|audience|subjectTokenType|sha256(subjectToken)
	tokenHash := sha256.Sum256([]byte(subjectToken))
	cacheKey := fmt.Sprintf("%s|%s|%s|%s|%x", opts.IssuerURL, clusterID, audience, subjectTokenType, tokenHash[:])

	stsTokenCacheMu.Lock()
	if entry, found := stsTokenCache[cacheKey]; found {
		if time.Now().Before(entry.expiresAt) {
			stsTokenCacheMu.Unlock()
			return entry.token, nil
		}

		delete(stsTokenCache, cacheKey)
	}

	if flight, inFlight := stsInflight[cacheKey]; inFlight {
		stsTokenCacheMu.Unlock()
		flight.wg.Wait()

		return flight.token, flight.err
	}

	flight := &tokenExchangeFlight{}
	flight.wg.Add(1)
	stsInflight[cacheKey] = flight
	stsTokenCacheMu.Unlock()

	var (
		resultToken string
		resultErr   error
	)

	defer func() {
		stsTokenCacheMu.Lock()
		delete(stsInflight, cacheKey)

		flight.token = resultToken
		flight.err = resultErr
		flight.wg.Done()
		stsTokenCacheMu.Unlock()
	}()

	resultToken, expiresIn, err := performTokenExchange(ctx, opts, subjectToken, subjectTokenType, audience)
	if err != nil {
		resultErr = err
		return "", err
	}

	ttl := time.Duration(expiresIn) * time.Second
	if expiresIn <= 0 {
		ttl = 5 * time.Minute
	}

	buffer := 30 * time.Second
	if ttl <= 60*time.Second {
		buffer = 5 * time.Second
	}

	expiresAt := time.Now().Add(ttl - buffer)
	if expiresAt.After(time.Now()) {
		stsTokenCacheMu.Lock()
		stsTokenCache[cacheKey] = tokenCacheEntry{
			token:     resultToken,
			expiresAt: expiresAt,
		}
		stsTokenCacheMu.Unlock()
	}

	return resultToken, nil
}

// performTokenExchange executes the actual RFC 8693 HTTP exchange request.
//
//nolint:funlen
func performTokenExchange(
	ctx context.Context,
	opts STSOptions,
	subjectToken string,
	subjectTokenType string,
	audience string,
) (string, int64, error) {
	tokenURL, err := discoverTokenEndpoint(ctx, opts.IssuerURL)
	if err != nil {
		return "", 0, fmt.Errorf("failed to discover token endpoint: %w", err)
	}

	data := url.Values{}
	data.Set("grant_type", "urn:ietf:params:oauth:grant-type:token-exchange")
	data.Set("subject_token", subjectToken)
	data.Set("subject_token_type", subjectTokenType)
	data.Set("requested_token_type", "urn:ietf:params:oauth:token-type:access_token")
	data.Set("audience", audience)

	if opts.ClientID != "" {
		data.Set("client_id", opts.ClientID)
	}

	var useClientAssertion bool

	if opts.ClientID != "" && opts.ClientSecret == "" {
		tokenPath := opts.ServiceAccountTokenPath
		if tokenPath == "" {
			tokenPath = saTokenPath
		}

		cleanPath := filepath.Clean(tokenPath)
		// #nosec G304
		tokenBytes, err := os.ReadFile(cleanPath)
		if err != nil {
			return "", 0, &STSError{
				StatusCode: http.StatusInternalServerError,
				Message:    fmt.Sprintf("failed to read service account token: %v", err),
				Err:        err,
			}
		}

		assertion := strings.TrimSpace(string(tokenBytes))
		if assertion == "" {
			return "", 0, &STSError{
				StatusCode: http.StatusInternalServerError,
				Message:    "service account token file is empty",
			}
		}

		data.Set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer")
		data.Set("client_assertion", assertion)

		useClientAssertion = true
	}

	req, err := http.NewRequestWithContext(ctx, "POST", tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return "", 0, &STSError{
			StatusCode: http.StatusInternalServerError,
			Message:    "failed to create token exchange request",
			Err:        err,
		}
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	if opts.ClientID != "" && opts.ClientSecret != "" && !useClientAssertion {
		req.SetBasicAuth(opts.ClientID, opts.ClientSecret)
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
		return "", 0, &STSError{StatusCode: http.StatusBadGateway, Message: "token exchange request failed", Err: err}
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		statusCode := http.StatusBadGateway
		if resp.StatusCode == http.StatusBadRequest ||
			resp.StatusCode == http.StatusUnauthorized ||
			resp.StatusCode == http.StatusForbidden {
			statusCode = http.StatusUnauthorized
		}

		msg := fmt.Sprintf("token exchange returned status: %s (token_url=%s)", resp.Status, tokenURL)

		return "", 0, &STSError{StatusCode: statusCode, Message: msg}
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", 0, &STSError{
			StatusCode: http.StatusBadGateway,
			Message:    "failed to decode token response",
			Err:        err,
		}
	}

	if tokenResp.AccessToken == "" {
		return "", 0, &STSError{
			StatusCode: http.StatusBadGateway,
			Message:    "token exchange response missing access_token",
		}
	}

	return tokenResp.AccessToken, tokenResp.ExpiresIn, nil
}
