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
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

// ClientAssertionTypeJWTBearer is the client assertion type registered by
// RFC 7523 for JWT bearer client authentication.
// See https://datatracker.ietf.org/doc/html/rfc7523#section-2.2
//
//nolint:gosec // G101: a URN naming the assertion type, not a credential
const ClientAssertionTypeJWTBearer = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"

// maxTokenResponseBytes caps how much of a token endpoint response is read, so
// a misbehaving or hostile endpoint cannot exhaust memory.
const maxTokenResponseBytes = 1 << 20 // 1 MiB

// ReadClientAssertion returns the JWT to send as the token request
// client_assertion.
//
// The file is read on every call so a credential rotated in place, such as a
// Kubernetes projected service account token, is picked up before the identity
// provider rejects an expired assertion.
func ReadClientAssertion(assertionFile string) (string, error) {
	contents, err := os.ReadFile(assertionFile) //nolint:gosec
	if err != nil {
		return "", fmt.Errorf("reading client assertion file: %w", err)
	}

	assertion := strings.TrimSpace(string(contents))
	if assertion == "" {
		return "", fmt.Errorf("client assertion file %q is empty", assertionFile)
	}

	return assertion, nil
}

// ClientAssertionAuthCodeOptions returns the extra token request parameters
// that authenticate the client with a JWT assertion when redeeming an
// authorization code with oauth2.Config.Exchange.
//
// It returns no options when no assertion file is configured.
//
// TODO: This is a temporary workaround for the lack of client assertion
// support in golang.org/x/oauth2. Once the upstream feature lands, drop this
// in favour of oauth2.Config.Exchange authenticating the client itself.
// See https://github.com/golang/oauth2/issues/744
func ClientAssertionAuthCodeOptions(assertionFile string) ([]oauth2.AuthCodeOption, error) {
	if assertionFile == "" {
		return nil, nil
	}

	assertion, err := ReadClientAssertion(assertionFile)
	if err != nil {
		return nil, err
	}

	return []oauth2.AuthCodeOption{
		oauth2.SetAuthURLParam("client_assertion_type", ClientAssertionTypeJWTBearer),
		oauth2.SetAuthURLParam("client_assertion", assertion),
	}, nil
}

// SetClientAssertionAuthStyle pins the token endpoint auth style to
// AuthStyleInParams when a client assertion is used, so the oauth2 package does
// not first probe the endpoint with HTTP Basic auth and an empty client secret.
func SetClientAssertionAuthStyle(endpoint oauth2.Endpoint, assertionFile string) oauth2.Endpoint {
	if assertionFile != "" {
		endpoint.AuthStyle = oauth2.AuthStyleInParams
	}

	return endpoint
}

// RefreshTokenWithClientAssertion exchanges a refresh token for a new token,
// authenticating the client with a JWT assertion (RFC 7523) instead of a
// client secret.
//
// TODO: This is a temporary workaround for the lack of client assertion
// support in golang.org/x/oauth2, where oauth2.Config.TokenSource also offers
// no way to add parameters to the refresh request. Once the upstream feature
// lands, drop this in favour of oauth2.Config.TokenSource.
// See https://github.com/golang/oauth2/issues/744
func RefreshTokenWithClientAssertion(ctx context.Context,
	tokenURL, clientID, assertionFile, refreshToken string,
) (*oauth2.Token, error) {
	assertion, err := ReadClientAssertion(assertionFile)
	if err != nil {
		return nil, err
	}

	params := url.Values{}
	params.Set("grant_type", "refresh_token")
	params.Set("refresh_token", refreshToken)
	params.Set("client_id", clientID)
	params.Set("client_assertion_type", ClientAssertionTypeJWTBearer)
	params.Set("client_assertion", assertion)

	token, err := requestToken(ctx, tokenURL, params)
	if err != nil {
		return nil, err
	}

	// Providers may answer a refresh without issuing a new refresh token. Keep
	// the current one then, as oauth2.Config.TokenSource does, so it stays
	// available for the next refresh.
	if token.RefreshToken == "" {
		token.RefreshToken = refreshToken
	}

	return token, nil
}

// requestToken posts params to the token endpoint and builds an oauth2.Token
// from the response. It uses the HTTP client carried by ctx, if any, so custom
// CA bundles and TLS settings configured for OIDC still apply.
//
// TODO: This is a temporary workaround for the lack of client assertion
// support in golang.org/x/oauth2. Only the refresh request needs it, so once
// the upstream feature lands, drop this and the response parsing helpers below
// in favour of oauth2.Config.TokenSource.
// See https://github.com/golang/oauth2/issues/744
func requestToken(ctx context.Context, tokenURL string, params url.Values) (*oauth2.Token, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(params.Encode()))
	if err != nil {
		return nil, fmt.Errorf("creating token request: %w", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	// A nil token source makes NewClient return the HTTP client carried by ctx.
	resp, err := oauth2.NewClient(ctx, nil).Do(req)
	if err != nil {
		return nil, fmt.Errorf("requesting token: %w", err)
	}

	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxTokenResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("reading token response: %w", err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("token endpoint returned %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}

	return tokenFromResponse(body, resp.Header.Get("Content-Type"))
}

// tokenFromResponse builds an oauth2.Token from a token endpoint response
// body, parsing it as JSON or as form-encoded per Content-Type, matching
// oauth2.Config.TokenSource.
// The whole response is attached as the token's extra data, so provider
// specific fields such as id_token stay reachable through Token.Extra.
func tokenFromResponse(body []byte, contentType string) (*oauth2.Token, error) {
	mediaType, _, _ := mime.ParseMediaType(contentType)

	var raw map[string]interface{}

	switch mediaType {
	case "application/x-www-form-urlencoded", "text/plain":
		vals, err := url.ParseQuery(string(body))
		if err != nil {
			return nil, fmt.Errorf("parsing token response: %w", err)
		}

		raw = make(map[string]interface{}, len(vals))
		for key, values := range vals {
			if len(values) > 0 {
				raw[key] = values[0]
			}
		}
	default:
		if err := json.Unmarshal(body, &raw); err != nil {
			return nil, fmt.Errorf("unmarshalling token response: %w", err)
		}
	}

	// RFC 6749 says errors use 400, but some providers don't comply and use
	// 2xx instead; check error/error_description first for compatibility.
	// https://cs.opensource.google/go/x/oauth2/+/refs/tags/v0.36.0:internal/token.go;l=323-328
	if errCode := stringFromTokenResponse(raw, "error"); errCode != "" {
		if desc := stringFromTokenResponse(raw, "error_description"); desc != "" {
			return nil, fmt.Errorf("token endpoint returned error %q: %s", errCode, desc)
		}

		return nil, fmt.Errorf("token endpoint returned error %q", errCode)
	}

	token := &oauth2.Token{
		AccessToken:  stringFromTokenResponse(raw, "access_token"),
		TokenType:    stringFromTokenResponse(raw, "token_type"),
		RefreshToken: stringFromTokenResponse(raw, "refresh_token"),
	}

	if token.AccessToken == "" {
		return nil, errors.New("token endpoint response has no access_token")
	}

	// oauth2.Token keeps the wire value separate from the computed expiry.
	if expiresIn, ok := expiresInFromTokenResponse(raw); ok {
		token.ExpiresIn = expiresIn
		token.Expiry = time.Now().Add(time.Duration(expiresIn) * time.Second)
	}

	return token.WithExtra(raw), nil
}

// stringFromTokenResponse returns the named string field of a token response,
// or the empty string when it is absent or not a string.
func stringFromTokenResponse(raw map[string]interface{}, field string) string {
	value, _ := raw[field].(string)

	return value
}

// expiresInFromTokenResponse returns the expires_in value of a token response
// in seconds. Providers are known to send it either as a JSON number or as a
// string, so both are accepted.
func expiresInFromTokenResponse(raw map[string]interface{}) (int64, bool) {
	switch value := raw["expires_in"].(type) {
	case float64:
		return int64(value), value != 0
	case string:
		seconds, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return 0, false
		}

		return seconds, seconds != 0
	default:
		return 0, false
	}
}
