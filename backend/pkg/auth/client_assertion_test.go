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

package auth_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

const testAssertion = "header.payload.signature"

func writeAssertionFile(t *testing.T, contents string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "assertion.jwt")
	require.NoError(t, os.WriteFile(path, []byte(contents), 0o600))

	return path
}

// tokenRequests records the form of every request a test token endpoint
// receives. The mutex guards the slice because handlers run on their own
// goroutine while the test goroutine reads it.
type tokenRequests struct {
	mu    sync.Mutex
	forms []url.Values
}

func (r *tokenRequests) add(form url.Values) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.forms = append(r.forms, form)
}

func (r *tokenRequests) all() []url.Values {
	r.mu.Lock()
	defer r.mu.Unlock()

	return append([]url.Values(nil), r.forms...)
}

// tokenEndpoint serves body as the token response and records the requests.
func tokenEndpoint(t *testing.T, body map[string]any) (string, *tokenRequests) {
	t.Helper()

	requests := &tokenRequests{}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Handlers run off the test goroutine, so they report with assert
		// rather than require, whose FailNow is only valid on it.
		if !assert.NoError(t, r.ParseForm()) {
			return
		}

		requests.add(r.PostForm)

		w.Header().Set("Content-Type", "application/json")
		assert.NoError(t, json.NewEncoder(w).Encode(body))
	}))
	t.Cleanup(srv.Close)

	return srv.URL, requests
}

// rawTokenEndpoint serves body verbatim, for responses an encoder would reject.
func rawTokenEndpoint(t *testing.T, status int, body string) string {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)

		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)

	return srv.URL
}

func TestReadClientAssertion(t *testing.T) {
	t.Run("trims surrounding whitespace", func(t *testing.T) {
		// Projected token files and kubectl create token both end in a newline.
		assertion, err := auth.ReadClientAssertion(writeAssertionFile(t, "\n"+testAssertion+"\n"))
		require.NoError(t, err)
		assert.Equal(t, testAssertion, assertion)
	})

	t.Run("missing file", func(t *testing.T) {
		_, err := auth.ReadClientAssertion(filepath.Join(t.TempDir(), "absent.jwt"))
		require.Error(t, err)
		assert.Contains(t, err.Error(), "reading client assertion file")
	})

	t.Run("empty file", func(t *testing.T) {
		_, err := auth.ReadClientAssertion(writeAssertionFile(t, " \n"))
		require.Error(t, err)
		assert.Contains(t, err.Error(), "is empty")
	})
}

func TestClientAssertionAuthCodeOptions(t *testing.T) {
	t.Run("no assertion file", func(t *testing.T) {
		opts, err := auth.ClientAssertionAuthCodeOptions("")
		require.NoError(t, err)
		assert.Empty(t, opts)
	})

	t.Run("missing file", func(t *testing.T) {
		_, err := auth.ClientAssertionAuthCodeOptions(filepath.Join(t.TempDir(), "absent.jwt"))
		require.Error(t, err)
		assert.Contains(t, err.Error(), "reading client assertion file")
	})

	t.Run("empty file", func(t *testing.T) {
		_, err := auth.ClientAssertionAuthCodeOptions(writeAssertionFile(t, "\n"))
		require.Error(t, err)
		assert.Contains(t, err.Error(), "is empty")
	})
}

func TestSetClientAssertionAuthStyle(t *testing.T) {
	const idp = "https://idp.example"

	endpoint := oauth2.Endpoint{AuthURL: idp + "/auth", TokenURL: idp + "/token"}

	t.Run("assertion pins the auth style", func(t *testing.T) {
		got := auth.SetClientAssertionAuthStyle(endpoint, "/var/run/assertion.jwt")
		assert.Equal(t, oauth2.AuthStyleInParams, got.AuthStyle)
		assert.Equal(t, endpoint.TokenURL, got.TokenURL)
	})

	t.Run("no assertion leaves the endpoint untouched", func(t *testing.T) {
		// A client secret deployment must keep oauth2 probing Basic auth first.
		assert.Equal(t, endpoint, auth.SetClientAssertionAuthStyle(endpoint, ""))
	})
}

func TestClientAssertionAuthCodeOptions_SentOnExchange(t *testing.T) {
	testAutorizationCode := "test-authorization-code"

	tokenURL, requests := tokenEndpoint(t, oauthSuccessBody)
	clientAssertionFile := writeAssertionFile(t, testAssertion)

	opts, err := auth.ClientAssertionAuthCodeOptions(clientAssertionFile)
	require.NoError(t, err)

	endpoint := auth.SetClientAssertionAuthStyle(
		oauth2.Endpoint{TokenURL: tokenURL}, clientAssertionFile)
	conf := &oauth2.Config{ClientID: "cid", Endpoint: endpoint}

	_, err = conf.Exchange(context.Background(), testAutorizationCode, opts...)
	require.NoError(t, err)

	forms := requests.all()
	require.Len(t, forms, 1)

	assert.Equal(t, testAutorizationCode, forms[0].Get("code"))
	// client_id in the body is what the pinned AuthStyleInParams buys: with the
	// oauth2 default it would be probed in an Authorization: Basic header first.
	assert.Equal(t, "cid", forms[0].Get("client_id"))
	assert.Equal(t, auth.ClientAssertionTypeJWTBearer, forms[0].Get("client_assertion_type"))
	assert.Equal(t, testAssertion, forms[0].Get("client_assertion"))
	assert.Empty(t, forms[0].Get("client_secret"))
}

func TestRefreshTokenWithClientAssertion_Success(t *testing.T) {
	tokenURL, requests := tokenEndpoint(t, oauthSuccessBody)
	clientAssertionFile := writeAssertionFile(t, testAssertion)

	token, err := auth.RefreshTokenWithClientAssertion(context.Background(),
		tokenURL, "cid", clientAssertionFile, "REFRESH_OLD")
	require.NoError(t, err)

	assert.Equal(t, "AT", token.AccessToken)
	assert.Equal(t, "Bearer", token.TokenType)
	assert.Equal(t, refreshNew, token.RefreshToken)
	assert.Equal(t, "NEW", token.Extra("id_token"))
	assert.WithinDuration(t, time.Now().Add(time.Hour), token.Expiry, time.Minute)

	forms := requests.all()
	require.Len(t, forms, 1)

	assert.Equal(t, "refresh_token", forms[0].Get("grant_type"))
	assert.Equal(t, "REFRESH_OLD", forms[0].Get("refresh_token"))
	assert.Equal(t, "cid", forms[0].Get("client_id"))
	assert.Equal(t, auth.ClientAssertionTypeJWTBearer, forms[0].Get("client_assertion_type"))
	assert.Equal(t, testAssertion, forms[0].Get("client_assertion"))
	assert.Empty(t, forms[0].Get("client_secret"))
}

func TestRefreshTokenWithClientAssertion_RereadsAssertionFile(t *testing.T) {
	tokenURL, requests := tokenEndpoint(t, oauthSuccessBody)
	clientAssertionFile := writeAssertionFile(t, testAssertion)

	_, err := auth.RefreshTokenWithClientAssertion(context.Background(),
		tokenURL, "cid", clientAssertionFile, "REFRESH_OLD")
	require.NoError(t, err)

	const rotatedAssertion = "rotated.payload.signature"

	require.NoError(t, os.WriteFile(clientAssertionFile, []byte(rotatedAssertion), 0o600))

	_, err = auth.RefreshTokenWithClientAssertion(context.Background(),
		tokenURL, "cid", clientAssertionFile, "REFRESH_OLD")
	require.NoError(t, err)

	forms := requests.all()
	require.Len(t, forms, 2)
	assert.Equal(t, testAssertion, forms[0].Get("client_assertion"))
	assert.Equal(t, rotatedAssertion, forms[1].Get("client_assertion"))
}

func TestRefreshTokenWithClientAssertion_Expiry(t *testing.T) {
	tests := []struct {
		name string
		// expiresIn is the expires_in value of the response, omitted when nil.
		expiresIn any
		// wantExpiresIn is 0 for the responses that yield no expiry at all.
		wantExpiresIn int64
	}{
		{name: "json number", expiresIn: 3600, wantExpiresIn: 3600},
		// Some providers send expires_in as a JSON string.
		{name: "json string", expiresIn: "300", wantExpiresIn: 300},
		{name: "absent", expiresIn: nil},
		{name: "zero", expiresIn: 0},
		{name: "zero as string", expiresIn: "0"},
		{name: "unparsable string", expiresIn: "soon"},
		{name: "unexpected type", expiresIn: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := map[string]any{"access_token": "AT", "token_type": "Bearer"}
			if tt.expiresIn != nil {
				body["expires_in"] = tt.expiresIn
			}

			tokenURL, _ := tokenEndpoint(t, body)

			token, err := auth.RefreshTokenWithClientAssertion(context.Background(),
				tokenURL, "cid", writeAssertionFile(t, testAssertion), "REFRESH_OLD")
			require.NoError(t, err, "an unusable expires_in must not fail the refresh")
			assert.Equal(t, tt.wantExpiresIn, token.ExpiresIn)

			if tt.wantExpiresIn == 0 {
				assert.True(t, token.Expiry.IsZero())

				return
			}

			assert.WithinDuration(t, time.Now().Add(time.Duration(tt.wantExpiresIn)*time.Second),
				token.Expiry, time.Minute)
		})
	}
}

func TestRefreshTokenWithClientAssertion_KeepsRefreshToken(t *testing.T) {
	tokenURL, _ := tokenEndpoint(t, map[string]any{
		"access_token": "AT",
		"token_type":   "Bearer",
		"expires_in":   3600,
		"id_token":     "NEW",
	})

	token, err := auth.RefreshTokenWithClientAssertion(context.Background(),
		tokenURL, "cid", writeAssertionFile(t, testAssertion), "REFRESH_OLD")
	require.NoError(t, err)
	assert.Equal(t, "REFRESH_OLD", token.RefreshToken)
}

func TestRefreshTokenWithClientAssertion_Errors(t *testing.T) {
	assertionFile := writeAssertionFile(t, testAssertion)

	tests := []struct {
		name          string
		status        int
		body          string
		errorContains string
	}{
		{
			name:          "token endpoint rejects the assertion",
			status:        http.StatusUnauthorized,
			body:          `{"error":"invalid_client"}`,
			errorContains: "invalid_client",
		},
		{
			name:          "token endpoint fails without a body",
			status:        http.StatusInternalServerError,
			errorContains: "token endpoint returned 500 Internal Server Error",
		},
		{
			name:          "response is not JSON",
			status:        http.StatusOK,
			body:          "not json",
			errorContains: "unmarshalling token response",
		},
		{
			name:          "response has no access token",
			status:        http.StatusOK,
			body:          `{"token_type":"Bearer"}`,
			errorContains: "no access_token",
		},
		{
			// Fields are read leniently, so a non-string access_token reads as
			// absent rather than as a type error.
			name:          "access token is not a string",
			status:        http.StatusOK,
			body:          `{"access_token":123,"token_type":"Bearer"}`,
			errorContains: "no access_token",
		},
		{
			// Truncating at maxTokenResponseBytes leaves the JSON unparsable.
			name:          "response exceeds the read cap",
			status:        http.StatusOK,
			body:          `{"padding":"` + strings.Repeat("x", 1<<20) + `","access_token":"AT"}`,
			errorContains: "unmarshalling token response",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := auth.RefreshTokenWithClientAssertion(context.Background(),
				rawTokenEndpoint(t, tt.status, tt.body), "cid", assertionFile, "REFRESH_OLD")
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.errorContains)
		})
	}
}

func TestRefreshTokenWithClientAssertion_UnparsableTokenURL(t *testing.T) {
	_, err := auth.RefreshTokenWithClientAssertion(context.Background(),
		"http://idp.example/\x7f", "cid", writeAssertionFile(t, testAssertion), "REFRESH_OLD")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "creating token request")
}

func TestRefreshTokenWithClientAssertion_TruncatedResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		// Promising more than is written makes net/http close the connection,
		// so the client fails while reading the body rather than the headers.
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Length", "2048")

		_, _ = w.Write([]byte(`{"access_token":`))
	}))
	t.Cleanup(srv.Close)

	_, err := auth.RefreshTokenWithClientAssertion(context.Background(),
		srv.URL, "cid", writeAssertionFile(t, testAssertion), "REFRESH_OLD")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "reading token response")
}

func TestRefreshTokenWithClientAssertion_CanceledContext(t *testing.T) {
	tokenURL, requests := tokenEndpoint(t, oauthSuccessBody)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := auth.RefreshTokenWithClientAssertion(ctx,
		tokenURL, "cid", writeAssertionFile(t, testAssertion), "REFRESH_OLD")
	require.ErrorIs(t, err, context.Canceled)
	assert.Empty(t, requests.all(), "a canceled context should not reach the token endpoint")
}

func TestRefreshTokenWithClientAssertion_MissingAssertionFile(t *testing.T) {
	tokenURL, requests := tokenEndpoint(t, oauthSuccessBody)

	_, err := auth.RefreshTokenWithClientAssertion(context.Background(),
		tokenURL, "cid", filepath.Join(t.TempDir(), "absent.jwt"), "REFRESH_OLD")
	require.Error(t, err)
	assert.Empty(t, requests.all(), "no token request should be made without an assertion")
}

func TestRefreshTokenWithClientAssertion_UsesContextHTTPClient(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		assert.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	}))
	t.Cleanup(srv.Close)

	assertionFile := writeAssertionFile(t, testAssertion)

	_, err := auth.RefreshTokenWithClientAssertion(context.Background(),
		srv.URL, "cid", assertionFile, "REFRESH_OLD")
	require.Error(t, err, "the default client does not trust the test server certificate")

	// oidc.ClientContext and oauth2 both store the client under this key.
	ctx := context.WithValue(context.Background(), oauth2.HTTPClient, srv.Client())

	token, err := auth.RefreshTokenWithClientAssertion(ctx, srv.URL, "cid", assertionFile, "REFRESH_OLD")
	require.NoError(t, err)
	assert.Equal(t, "AT", token.AccessToken)
}

func TestRefreshAndCacheNewToken_ClientAssertion(t *testing.T) {
	const oldToken = "OLD"

	fc := &fakeCache{store: map[string]interface{}{"oidc-token-" + oldToken: "REFRESH_OLD"}}
	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, r *http.Request) {
		if !assert.NoError(t, r.ParseForm()) {
			return
		}

		assert.Equal(t, "refresh_token", r.PostForm.Get("grant_type"))
		assert.Equal(t, "REFRESH_OLD", r.PostForm.Get("refresh_token"))
		assert.Equal(t, auth.ClientAssertionTypeJWTBearer, r.PostForm.Get("client_assertion_type"))
		assert.Equal(t, testAssertion, r.PostForm.Get("client_assertion"))
		// The client is authenticated by the assertion, never by a secret.
		assert.Empty(t, r.Header.Get("Authorization"))
		assert.Empty(t, r.PostForm.Get("client_secret"))

		w.Header().Set("Content-Type", "application/json")
		assert.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	oidcConfig := &kubeconfig.OidcConfig{
		ClientID:            "cid",
		ClientAssertionFile: writeAssertionFile(t, testAssertion),
	}

	tok, err := auth.RefreshAndCacheNewToken(context.Background(), oidcConfig, fc,
		"id_token", oldToken, srv.URL, "")
	require.NoError(t, err)
	assert.Equal(t, refreshNew, tok.RefreshToken)
	assert.Equal(t, "NEW", tok.Extra("id_token"))
}

func TestGetNewToken_ClientAssertion(t *testing.T) {
	tokenURL, requests := tokenEndpoint(t, oauthSuccessBody)
	fc := &fakeCache{store: map[string]interface{}{"oidc-token-OLD": "REFRESH_OLD"}}

	params := newTokenParams(fc, tokenURL)
	params.ClientSecret = ""
	params.ClientAssertionFile = writeAssertionFile(t, testAssertion)

	newTok, err := auth.GetNewToken(context.Background(), params)
	require.NoError(t, err)
	assert.Equal(t, "AT", newTok.AccessToken)

	forms := requests.all()
	require.Len(t, forms, 1)
	assert.Equal(t, auth.ClientAssertionTypeJWTBearer, forms[0].Get("client_assertion_type"))
	assert.Equal(t, testAssertion, forms[0].Get("client_assertion"))

	// The refreshed token replaces the cached one, keyed by the new id_token.
	require.Len(t, fc.setCalls, 1)
	assert.Equal(t, "oidc-token-NEW", fc.setCalls[0].key)
	assert.Equal(t, refreshNew, fc.setCalls[0].val)
	require.Len(t, fc.setWithTTLCalls, 1)
	assert.Equal(t, "oidc-token-OLD", fc.setWithTTLCalls[0].key)
}
