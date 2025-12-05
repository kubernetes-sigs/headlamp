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
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

const refreshNew = "REFRESH_NEW"

func TestDecodeBase64JSON(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		want        map[string]interface{}
		expectError bool
	}{
		{
			name:  "valid base64 JSON",
			input: "eyJ1c2VyIjoiam9obiIsImFnZSI6MzB9", // {"user":"john","age":30}
			want: map[string]interface{}{
				"user": "john",
				"age":  float64(30),
			},
			expectError: false,
		},
		{
			name:        "invalid base64 string",
			input:       "invalid_base64",
			want:        nil,
			expectError: true,
		},
		{
			name:        "valid base64 but invalid JSON",
			input:       "aW52YWxpZF9qc29u", // "invalid_json"
			want:        nil,
			expectError: true,
		},
		{
			name:        "empty JSON object",
			input:       "e30", // {}
			want:        map[string]interface{}{},
			expectError: false,
		},
		{
			name:        "empty string",
			input:       "",
			want:        nil,
			expectError: true,
		},
		{
			name: "URL-safe base64 with special characters",
			// {"url":"https://example.org/?q=123&r=abc","data":"test+/_-"}
			input: "eyJ1cmwiOiJodHRwczovL2V4YW1wbGUub3JnLz9xPTEyMyZyPWFiYyIsImRhdGEiOiJ0ZXN0Ky9fLSJ9",
			want: map[string]interface{}{
				"url":  "https://example.org/?q=123&r=abc",
				"data": "test+/_-",
			},
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := auth.DecodeBase64JSON(tt.input)
			if (err != nil) != tt.expectError {
				t.Errorf("DecodeBase64JSON() error = %v, expectError %v", err, tt.expectError)
				return
			}

			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("DecodeBase64JSON() got = %v, want %v", got, tt.want)
			}
		})
	}
}

var parseClusterAndTokenTests = []struct {
	name        string
	url         string
	authHeader  string
	wantCluster string
	wantToken   string
	cookies     []*http.Cookie
}{
	{
		name:        "standard case",
		url:         "/clusters/test-cluster/api",
		authHeader:  "Bearer test-token",
		wantCluster: "test-cluster",
		wantToken:   "test-token",
	},
	{
		name:        "lowercase bearer",
		url:         "/clusters/abc/api",
		authHeader:  "bearer token-lowercase",
		wantCluster: "abc",
		wantToken:   "token-lowercase",
	},
	{
		name:        "uppercase bearer",
		url:         "/clusters/xyz/api",
		authHeader:  "BEARER token-upper",
		wantCluster: "xyz",
		wantToken:   "token-upper",
	},
	{
		name:        "extra spaces before bearer",
		url:         "/clusters/extra/api",
		authHeader:  "   Bearer  spaced-token",
		wantCluster: "extra",
		wantToken:   "spaced-token",
	},
	{
		name:        "not a clusters path",
		url:         "/no-clusters-prefix/api",
		authHeader:  "Bearer test-token",
		wantCluster: "",
		wantToken:   "test-token",
	},
	{
		name:        "multiple bearer tokens",
		url:         "/clusters/test/api",
		authHeader:  "Bearer xxx, Bearer yyy",
		wantCluster: "test",
		wantToken:   "",
	},
	{
		name:        "no cluster in path",
		url:         "/clusters/",
		authHeader:  "Bearer some-token",
		wantCluster: "",
		wantToken:   "some-token",
	},
	{
		name:        "cookie fallback when header missing",
		url:         "/clusters/cookie-cluster/api",
		wantCluster: "cookie-cluster",
		wantToken:   "cookie-token",
		cookies: []*http.Cookie{
			{
				Name:  "headlamp-auth-cookie-cluster.0",
				Value: "cookie-token",
			},
		},
	},
}

func TestParseClusterAndToken(t *testing.T) {
	for _, tt := range parseClusterAndTokenTests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequestWithContext(context.Background(), "GET", tt.url, nil)
			if err != nil {
				t.Fatalf("ParseClusterAndToken() error = %v", err)
			}

			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}

			for _, cookie := range tt.cookies {
				req.AddCookie(cookie)
			}

			cluster, token := auth.ParseClusterAndToken(req)
			if cluster != tt.wantCluster {
				t.Errorf("ParseClusterAndToken() got cluster %q, want %q", cluster, tt.wantCluster)
			}

			if token != tt.wantToken {
				t.Errorf("ParseClusterAndToken() got token = %q, want %q", token, tt.wantToken)
			}
		})
	}
}

var berlinLocation = func() *time.Location {
	loc, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		panic(err)
	}
	return loc
}()

var getExpiryUnixTimeUTCTests = []struct {
	name         string
	tokenPayload map[string]interface{}
	want         time.Time
	wantDate     time.Time // a time in a different format to cross check
	expectError  bool
}{
	{
		name: "valid expiry time",
		tokenPayload: map[string]interface{}{
			"exp": float64(1609459200), // 2021-01-01 00:00:00 UTC
		},
		want:        time.Unix(1609459200, 0).UTC(),
		wantDate:    time.Date(2021, 1, 1, 0, 0, 0, 0, time.UTC),
		expectError: false,
	},
	{
		name: "cross check UTC handling is working, compare to UTC + 1 TZ",
		tokenPayload: map[string]interface{}{
			"exp": float64(1609459200), // 2021-01-01 00:00:00 UTC
		},
		want:        time.Unix(1609459200, 0).UTC(),
		wantDate:    time.Date(2021, 1, 1, 1, 0, 0, 0, berlinLocation), // 2021-01-01 01:00:00 CET
		expectError: false,
	},
	{
		name: "missing exp field",
		tokenPayload: map[string]interface{}{
			"other_field": "value",
		},
		want:        time.Time{},
		wantDate:    time.Time{},
		expectError: true,
	},
	{
		name: "invalid exp field type - string",
		tokenPayload: map[string]interface{}{
			"exp": "1609459200",
		},
		want:        time.Time{},
		wantDate:    time.Time{},
		expectError: true,
	},
	{
		name: "invalid exp field type - bool",
		tokenPayload: map[string]interface{}{
			"exp": true,
		},
		want:        time.Time{},
		wantDate:    time.Time{},
		expectError: true,
	},
	{
		name: "zero value for exp field",
		tokenPayload: map[string]interface{}{
			"exp": float64(0),
		},
		want:        time.Unix(0, 0).UTC(), // 1970-01-01 00:00:00 UTC
		wantDate:    time.Date(1970, 1, 1, 0, 0, 0, 0, time.UTC),
		expectError: false,
	},
	{
		name: "future expiry time",
		tokenPayload: map[string]interface{}{
			"exp": float64(32503680000), // 3000-01-01 00:00:00 UTC
		},
		want:        time.Unix(32503680000, 0).UTC(),
		wantDate:    time.Date(3000, 1, 1, 0, 0, 0, 0, time.UTC),
		expectError: false,
	},
}

func TestGetExpiryUnixTimeUTC(t *testing.T) {
	for _, tt := range getExpiryUnixTimeUTCTests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := auth.GetExpiryUnixTimeUTC(tt.tokenPayload)
			if (err != nil) != tt.expectError {
				t.Errorf("GetExpiryUnixTimeUTC() error = %v, expectError %v", err, tt.expectError)
				return
			}

			if !got.Equal(tt.want) {
				t.Errorf("GetExpiryUnixTimeUTC() got = %v, want %v", got, tt.want)
				return
			}

			// An extra check, to see if wantDate is also right.
			// To check we didn't typo entering the unix dates.
			// It also shows that there is not an error converting to UTC.
			if !got.Equal(tt.wantDate) {
				t.Errorf("GetExpiryUnixTimeUTC() got date = %v, wantDate %v", got, tt.wantDate)
				return
			}
		})
	}
}

const headerBase64 = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0"

func makeJWTWithPayload(t *testing.T, payload map[string]interface{}) string {
	t.Helper()

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("failed to marshal payload: %v", err)
	}

	payloadBase64 := base64.RawURLEncoding.EncodeToString(payloadBytes)

	// 3 segments: header.payload.signature (signature)
	return headerBase64 + "." + payloadBase64 + "."
}

func TestIsTokenAboutToExpire_Window(t *testing.T) {
	now := time.Now()
	tests := []struct {
		name string
		exp  time.Time
		want bool
	}{
		{"within window", now.Add(auth.JWTExpirationTTL / 2), true},
		{"beyond window", now.Add(auth.JWTExpirationTTL + 30*time.Second), false},
		{"already expired", now.Add(-5 * time.Second), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token := makeJWTWithPayload(t, map[string]interface{}{"exp": float64(tt.exp.Unix())})
			if got := auth.IsTokenAboutToExpire(token); got != tt.want {
				t.Fatalf("IsTokenAboutToExpire() = %v, want %v (exp=%v, now=%v)",
					got, tt.want, tt.exp.UTC(), now.UTC())
			}
		})
	}
}

func TestIsTokenAboutToExpire_InvalidInputs(t *testing.T) {
	tests := []struct {
		name  string
		token string
	}{
		{"not three parts", "not-a-jwt"},
		{"invalid base64 payload", headerBase64 + ".%%%." + "."},
		{"missing exp", makeJWTWithPayload(t, map[string]interface{}{})},
		{"non-numeric exp", makeJWTWithPayload(t, map[string]interface{}{"exp": "1609459200"})},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := auth.IsTokenAboutToExpire(tt.token); got {
				t.Fatalf("IsTokenAboutToExpire() = true, want false for %s", tt.name)
			}
		})
	}
}

type cacheStub struct{}

func (cacheStub) Delete(ctx context.Context, k string) error {
	return nil
}

func (cacheStub) Get(ctx context.Context, k string) (interface{}, error) {
	return nil, nil
}

func (cacheStub) GetAll(ctx context.Context, _ cache.Matcher) (map[string]interface{}, error) {
	return map[string]interface{}{}, nil
}

func (cacheStub) UpdateTTL(ctx context.Context, k string, ttl time.Duration) error {
	return nil
}

type fakeCache struct {
	cacheStub
	store    map[string]interface{}
	setCalls []struct {
		key string
		val interface{}
	}
	setWithTTLCalls []struct {
		key string
		val interface{}
		ttl time.Duration
	}
	errOnGet, errOnSet, errOnSetWithTTL error
}

var _ cache.Cache[interface{}] = (*fakeCache)(nil)

func (f *fakeCache) Get(_ context.Context, key string) (interface{}, error) {
	if f.errOnGet != nil {
		return nil, f.errOnGet
	}

	if f.store == nil {
		return nil, nil
	}

	return f.store[key], nil
}

func (f *fakeCache) Set(_ context.Context, key string, val interface{}) error {
	f.setCalls = append(f.setCalls, struct {
		key string
		val interface{}
	}{key, val})

	return f.errOnSet
}

func (f *fakeCache) SetWithTTL(_ context.Context, key string, val interface{}, ttl time.Duration) error {
	f.setWithTTLCalls = append(f.setWithTTLCalls, struct {
		key string
		val interface{}
		ttl time.Duration
	}{key, val, ttl})

	return f.errOnSetWithTTL
}

func tokenWithExtra(tokenType, tokenValue string) *oauth2.Token {
	token := &oauth2.Token{RefreshToken: refreshNew}
	if tokenType != "" {
		token = token.WithExtra(map[string]interface{}{tokenType: tokenValue})
	}

	return token
}

func TestCacheRefreshedToken_Success(t *testing.T) {
	fc := &fakeCache{}
	tok := tokenWithExtra("id_token", "NEW")

	err := auth.CacheRefreshedToken(tok, "id_token", "OLD", "REFRESH_OLD", fc)
	if err != nil {
		t.Fatalf("CacheRefreshedToken() unexpected error: %v", err)
	}

	if len(fc.setCalls) != 1 {
		t.Fatalf("expected 1 Set call, got %d", len(fc.setCalls))
	}

	if fc.setCalls[0].key != "oidc-token-NEW" {
		t.Errorf("new token key = %q, want %q", fc.setCalls[0].key, "oidc-token-NEW")
	}

	if fc.setCalls[0].val != "REFRESH_NEW" {
		t.Errorf("new token value = %v, want %v", fc.setCalls[0].val, "REFRESH_NEW")
	}

	if len(fc.setWithTTLCalls) != 1 {
		t.Fatalf("expected 1 SetWithTTL call, got %d", len(fc.setWithTTLCalls))
	}

	call := fc.setWithTTLCalls[0]
	if call.key != "oidc-token-OLD" {
		t.Errorf("old token key = %q, want %q", call.key, "oidc-token-OLD")
	}

	if call.val != "REFRESH_OLD" {
		t.Errorf("old token value = %v, want %v", call.val, "REFRESH_OLD")
	}

	if call.ttl != 10*time.Second {
		t.Errorf("ttl = %v, want %v", call.ttl, 10*time.Second)
	}
}

func TestCacheRefreshedToken_NoExtra_NoOp(t *testing.T) {
	fc := &fakeCache{}
	tok := tokenWithExtra("", "") // no extra set → Extra(tokenType) not ok

	err := auth.CacheRefreshedToken(tok, "id_token", "OLD", "REFRESH_OLD", fc)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(fc.setCalls) != 0 || len(fc.setWithTTLCalls) != 0 {
		t.Fatalf("expected no cache writes, got Set=%d, SetWithTTL=%d",
			len(fc.setCalls), len(fc.setWithTTLCalls))
	}
}

func TestCacheRefreshedToken_ExtraNotString_NoOp(t *testing.T) {
	fc := &fakeCache{}
	tok := (&oauth2.Token{RefreshToken: "REFRESH_NEW"}).WithExtra(
		map[string]interface{}{"id_token": 123}, // not a string → type assertion fails
	)

	err := auth.CacheRefreshedToken(tok, "id_token", "OLD", "REFRESH_OLD", fc)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(fc.setCalls) != 0 || len(fc.setWithTTLCalls) != 0 {
		t.Fatalf("expected no cache writes, got Set=%d, SetWithTTL=%d",
			len(fc.setCalls), len(fc.setWithTTLCalls))
	}
}

func TestCacheRefreshedToken_SetError_StopsEarly(t *testing.T) {
	fc := &fakeCache{errOnSet: errors.New("boom")}
	tok := tokenWithExtra("id_token", "NEW")

	err := auth.CacheRefreshedToken(tok, "id_token", "OLD", "REFRESH_OLD", fc)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if len(fc.setWithTTLCalls) != 0 {
		t.Fatalf("expected no SetWithTTL after Set error, got %d calls", len(fc.setWithTTLCalls))
	}
}

func TestCacheRefreshedToken_SetWithTTLError_Propagates(t *testing.T) {
	fc := &fakeCache{errOnSetWithTTL: errors.New("late-boom")}
	tok := tokenWithExtra("id_token", "NEW")

	err := auth.CacheRefreshedToken(tok, "id_token", "OLD", "REFRESH_OLD", fc)
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if len(fc.setCalls) != 1 || len(fc.setWithTTLCalls) != 1 {
		t.Fatalf("expected both Set and SetWithTTL to be called once; got Set=%d, SetWithTTL=%d",
			len(fc.setCalls), len(fc.setWithTTLCalls))
	}
}

// helper: minimal OAuth2 token endpoint responding with JSON
func newTokenServerJSON(t *testing.T, status int, body any) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)

		if err := json.NewEncoder(w).Encode(body); err != nil {
			t.Fatalf("encode response: %v", err)
		}
	}))
	t.Cleanup(srv.Close)

	return srv
}

func newOIDCProviderServer(t *testing.T, tokenHandler http.HandlerFunc) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		cfg := map[string]any{
			"issuer":         srv.URL,
			"token_endpoint": srv.URL + "/token",
			"jwks_uri":       srv.URL + "/jwks",
		}
		if err := json.NewEncoder(w).Encode(cfg); err != nil {
			t.Fatalf("encode discovery: %v", err)
		}
	})

	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if _, err := w.Write([]byte(`{"keys":[]}`)); err != nil {
			t.Fatalf("write jwks: %v", err)
		}
	})

	if tokenHandler != nil {
		mux.HandleFunc("/token", tokenHandler)
	} else {
		mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		})
	}

	return srv
}

var oauthSuccessBody = map[string]any{
	"access_token":  "AT",
	"token_type":    "Bearer",
	"expires_in":    3600,
	"refresh_token": refreshNew,
	"id_token":      "NEW",
}

func TestGetNewToken_Success(t *testing.T) {
	srv := newTokenServerJSON(t, http.StatusOK, oauthSuccessBody)

	// Seed cache with old token -> old refresh mapping
	fc := &fakeCache{store: map[string]interface{}{"oidc-token-OLD": "REFRESH_OLD"}}

	newTok, err := auth.GetNewToken("cid", "secret", fc, "id_token", "OLD", srv.URL, context.Background())
	if err != nil {
		t.Fatalf("GetNewToken unexpected error: %v", err)
	}

	if newTok.AccessToken != "AT" {
		t.Fatalf("access_token = %q, want %q", newTok.AccessToken, "AT")
	}

	if newTok.RefreshToken != refreshNew {
		t.Fatalf("refresh_token = %q, want %q", newTok.RefreshToken, refreshNew)
	}

	if idt, _ := newTok.Extra("id_token").(string); idt != "NEW" {
		t.Fatalf("id_token extra = %q, want %q", idt, "NEW")
	}

	// CacheRefreshedToken side-effects
	if len(fc.setCalls) != 1 || len(fc.setWithTTLCalls) != 1 {
		t.Fatalf("expected Set=1, SetWithTTL=1; got Set=%d, SetWithTTL=%d",
			len(fc.setCalls), len(fc.setWithTTLCalls))
	}

	if fc.setCalls[0].key != "oidc-token-NEW" || fc.setCalls[0].val != refreshNew {
		t.Fatalf("Set call = {%q,%v}, want {%q,%q}",
			fc.setCalls[0].key, fc.setCalls[0].val, "oidc-token-NEW", refreshNew)
	}

	call := fc.setWithTTLCalls[0]
	if call.key != "oidc-token-OLD" || call.val != "REFRESH_OLD" || call.ttl != 10*time.Second {
		t.Fatalf("SetWithTTL = {%q,%v,%v}, want {%q,%q,%v}",
			call.key, call.val, call.ttl, "oidc-token-OLD", "REFRESH_OLD", 10*time.Second)
	}
}

func TestGetNewToken_PreHTTPFailures(t *testing.T) {
	for _, tc := range []struct {
		name   string
		cache  *fakeCache
		expect string
	}{
		{
			"cache get error",
			&fakeCache{errOnGet: errors.New("boom")},
			"getting refresh token",
		},
		{
			"refresh token wrong type",
			&fakeCache{store: map[string]interface{}{"oidc-token-OLD": 123}},
			"failed to get refresh token",
		},
		{
			"missing refresh token",
			&fakeCache{store: map[string]interface{}{}},
			"failed to get refresh token",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// Fails before HTTP; no server needed.
			_, err := auth.GetNewToken("cid", "secret", tc.cache, "id_token", "OLD", "http://127.0.0.1", context.Background())
			if err == nil || !strings.Contains(err.Error(), tc.expect) {
				t.Fatalf("want error containing %q, got %v", tc.expect, err)
			}
		})
	}
}

func TestGetNewToken_EndpointFailures(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		body   any
	}{
		{"http 400 invalid_grant", http.StatusBadRequest, map[string]any{"error": "invalid_grant"}},
		{"200 ok but missing access_token", http.StatusOK, map[string]any{
			"token_type": "Bearer", "refresh_token": refreshNew, "id_token": "NEW",
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv := newTokenServerJSON(t, tc.status, tc.body)
			fc := &fakeCache{store: map[string]interface{}{"oidc-token-OLD": "REFRESH_OLD"}}

			if _, err := auth.GetNewToken("cid", "secret", fc, "id_token", "OLD", srv.URL, context.Background()); err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	}
}

func TestGetNewToken_CacheUpdateErrors(t *testing.T) {
	for _, tc := range []struct {
		name      string
		setErr    error
		setTTLErr error
	}{
		{"Set error", errors.New("cache-set-broke"), nil},
		{"SetWithTTL error", nil, errors.New("cache-ttl-broke")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv := newTokenServerJSON(t, http.StatusOK, oauthSuccessBody)
			fc := &fakeCache{
				store:           map[string]interface{}{"oidc-token-OLD": "REFRESH_OLD"},
				errOnSet:        tc.setErr,
				errOnSetWithTTL: tc.setTTLErr,
			}

			if _, err := auth.GetNewToken("cid", "secret", fc, "id_token", "OLD", srv.URL, context.Background()); err == nil {
				t.Fatal("expected error containing 'caching refreshed token', got nil")
			}
		})
	}
}

func TestRefreshAndCacheNewToken_Success(t *testing.T) {
	const (
		oldToken = "OLD"
		oldKey   = "oidc-token-" + oldToken
	)

	fc := &fakeCache{store: map[string]interface{}{oldKey: "REFRESH_OLD"}}
	srv := newOIDCProviderServer(t, func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, r.ParseForm())
		require.Equal(t, "refresh_token", r.PostForm.Get("grant_type"))
		require.Equal(t, "REFRESH_OLD", r.PostForm.Get("refresh_token"))

		authHeader := r.Header.Get("Authorization")
		require.True(t, strings.HasPrefix(authHeader, "Basic "), "expected Basic Authorization header")

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	config := &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"}
	tok, err := auth.RefreshAndCacheNewToken(context.Background(), config, fc, "id_token", oldToken, srv.URL)
	require.NoError(t, err)
	assert.NotNil(t, tok)
	assert.Equal(t, refreshNew, tok.RefreshToken)

	require.Len(t, fc.setCalls, 1)
	assert.Equal(t, "oidc-token-NEW", fc.setCalls[0].key)
	assert.Equal(t, refreshNew, fc.setCalls[0].val)

	require.Len(t, fc.setWithTTLCalls, 1)
	assert.Equal(t, oldKey, fc.setWithTTLCalls[0].key)
	assert.Equal(t, "REFRESH_OLD", fc.setWithTTLCalls[0].val)
	assert.Equal(t, 10*time.Second, fc.setWithTTLCalls[0].ttl)
}

func TestRefreshAndCacheNewToken_ProviderError(t *testing.T) {
	config := &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "no discovery", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	_, err := auth.RefreshAndCacheNewToken(context.Background(), config, &fakeCache{}, "id_token", "OLD", srv.URL)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "getting provider")
}

func TestRefreshAndCacheNewToken_TokenError(t *testing.T) {
	const oldToken = "OLD"
	fc := &fakeCache{store: map[string]interface{}{"oidc-token-" + oldToken: "REFRESH_OLD"}}
	srv := newOIDCProviderServer(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "server_error"})
	})

	config := &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"}
	_, err := auth.RefreshAndCacheNewToken(context.Background(), config, fc, "id_token", oldToken, srv.URL)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "refreshing token")
	assert.Len(t, fc.setCalls, 0)
	assert.Len(t, fc.setWithTTLCalls, 0)
}

// TestConfigureTLSContext_NoConfig tests when both skipTLSVerify and caCert are not set.
func TestConfigureTLSContext_NoConfig(t *testing.T) {
	baseCtx := context.Background()
	resultCtx := auth.ConfigureTLSContext(baseCtx, nil, nil)

	// Context should remain unchanged when no TLS configuration is provided
	assert.Equal(t, baseCtx, resultCtx, "Context should remain unchanged when no TLS configuration is provided")
}

// TestConfigureTLSContext_SkipTLS tests when skipTLSVerify is set to true.
// The OIDC library would use this context to make requests
// We can't directly extract the client, but we can verify the behavior
// by checking that the context was modified (indicating TLS config was applied).
func TestConfigureTLSContext_SkipTLS(t *testing.T) {
	// Create a test server that requires TLS
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, err := w.Write([]byte("TLS connection successful"))
		require.NoError(t, err)
	}))
	defer server.Close()

	baseCtx := context.Background()
	skipTLSVerify := true
	resultCtx := auth.ConfigureTLSContext(baseCtx, &skipTLSVerify, nil)

	// Context should be modified when skipTLSVerify is true
	assert.NotEqual(t, baseCtx, resultCtx, "Context should be modified when skipTLSVerify is true")

	// Test that the configured context can make TLS requests with skip verification
	// This verifies that the TLS configuration was actually applied
	_, err := http.NewRequestWithContext(resultCtx, "GET", server.URL, nil)
	require.NoError(t, err)
}

// TestConfigureTLSContext_CACert tests when caCert is provided.
func TestConfigureTLSContext_CACert(t *testing.T) {
	// Read the pre-generated CA certificate from testdata
	caCertBytes, err := os.ReadFile("../../cmd/headlamp_testdata/ca.crt")
	require.NoError(t, err)

	// Test the configureTLSContext function with the CA certificate
	baseCtx := context.Background()
	caCert := string(caCertBytes)
	resultCtx := auth.ConfigureTLSContext(baseCtx, nil, &caCert)

	// Context should be modified when caCert is provided
	assert.NotEqual(t, baseCtx, resultCtx, "Context should be modified when caCert is provided")

	// Verify that the CA certificate was parsed correctly by checking if it's valid PEM
	block, _ := pem.Decode([]byte(caCert))
	assert.NotNil(t, block, "CA certificate should be valid PEM format")
	assert.Equal(t, "CERTIFICATE", block.Type, "CA certificate should be of type CERTIFICATE")

	// Parse the CA certificate to verify it's valid
	caCertParsed, err := x509.ParseCertificate(block.Bytes)
	require.NoError(t, err)
	assert.True(t, caCertParsed.IsCA, "Generated certificate should be a CA certificate")
}

func makeTestToken(t *testing.T, claims map[string]interface{}) string {
	// helper to build unsigned JWT-like string for tests
	header := map[string]string{"alg": "none", "typ": "JWT"}
	headerJSON, err := json.Marshal(header)
	require.NoError(t, err)
	claimsJSON, err := json.Marshal(claims)
	require.NoError(t, err)

	return fmt.Sprintf("%s.%s.signature",
		base64.RawURLEncoding.EncodeToString(headerJSON),
		base64.RawURLEncoding.EncodeToString(claimsJSON),
	)
}

func TestHandleMe_Success(t *testing.T) {
	t.Parallel()

	expiry := time.Now().Add(time.Hour).Unix()
	claims := map[string]interface{}{
		"preferred_username": "alice",
		"email":              "alice@example.com",
		"groups":             []string{"dev", "ops"},
		"exp":                float64(expiry),
	}

	token := makeTestToken(t, claims)

	req := httptest.NewRequest(http.MethodGet, "/clusters/test/me", nil)
	req = mux.SetURLVars(req, map[string]string{"clusterName": "test"})
	req.AddCookie(&http.Cookie{
		Name:  fmt.Sprintf("headlamp-auth-%s.0", auth.SanitizeClusterName("test")),
		Value: token,
	})

	rr := httptest.NewRecorder()

	handler := auth.HandleMe(auth.MeHandlerOptions{
		UsernamePaths: "preferred_username",
		EmailPaths:    "email",
		GroupsPaths:   "groups",
	})

	handler(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var got struct {
		Username string   `json:"username"`
		Email    string   `json:"email"`
		Groups   []string `json:"groups"`
	}

	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))

	assert.Equal(t, "alice", got.Username)
	assert.Equal(t, "alice@example.com", got.Email)
	assert.Equal(t, []string{"dev", "ops"}, got.Groups)
	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))
	assert.Equal(t, "no-store, no-cache, must-revalidate, private", rr.Header().Get("Cache-Control"))
	assert.Equal(t, "Cookie", rr.Header().Get("Vary"))
}

func TestHandleMe_HeaderToken(t *testing.T) {
	t.Parallel()

	expiry := time.Now().Add(time.Hour).Unix()
	claims := map[string]interface{}{
		"preferred_username": "alice",
		"email":              "alice@example.com",
		"groups":             []string{"dev", "ops"},
		"exp":                float64(expiry),
	}

	token := makeTestToken(t, claims)

	req := httptest.NewRequest(http.MethodGet, "/clusters/test/me", nil)
	req = mux.SetURLVars(req, map[string]string{"clusterName": "test"})
	req.Header.Set("Authorization", "Bearer "+token)

	rr := httptest.NewRecorder()

	handler := auth.HandleMe(auth.MeHandlerOptions{
		UsernamePaths: "preferred_username",
		EmailPaths:    "email",
		GroupsPaths:   "groups",
	})

	handler(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var got struct {
		Username string   `json:"username"`
		Email    string   `json:"email"`
		Groups   []string `json:"groups"`
	}

	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
	assert.Equal(t, "alice", got.Username)
	assert.Equal(t, "alice@example.com", got.Email)
	assert.Equal(t, []string{"dev", "ops"}, got.Groups)
}

func TestHandleMe_ExpiredToken(t *testing.T) {
	t.Parallel()

	expiry := time.Now().Add(-time.Hour).Unix()
	claims := map[string]interface{}{
		"preferred_username": "alice",
		"email":              "alice@example.com",
		"groups":             []string{"dev", "ops"},
		"exp":                float64(expiry),
	}

	token := makeTestToken(t, claims)

	req := httptest.NewRequest(http.MethodGet, "/clusters/test/me", nil)
	req = mux.SetURLVars(req, map[string]string{"clusterName": "test"})
	req.AddCookie(&http.Cookie{
		Name:  fmt.Sprintf("headlamp-auth-%s.0", auth.SanitizeClusterName("test")),
		Value: token,
	})

	rr := httptest.NewRecorder()

	handler := auth.HandleMe(auth.MeHandlerOptions{
		UsernamePaths: "preferred_username",
		EmailPaths:    "email",
		GroupsPaths:   "groups",
	})

	handler(rr, req)

	require.Equal(t, http.StatusUnauthorized, rr.Code)

	var got struct {
		Message string `json:"message"`
	}

	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
	assert.Equal(t, "token expired", got.Message)
	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))
	assert.Equal(t, "no-store, no-cache, must-revalidate, private", rr.Header().Get("Cache-Control"))
	assert.Equal(t, "Cookie", rr.Header().Get("Vary"))
}

func TestHandleMe_MissingCookie(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/clusters/test/me", nil)
	req = mux.SetURLVars(req, map[string]string{"clusterName": "test"})

	rr := httptest.NewRecorder()

	handler := auth.HandleMe(auth.MeHandlerOptions{})

	handler(rr, req)

	require.Equal(t, http.StatusUnauthorized, rr.Code)

	var got struct {
		Message string `json:"message"`
	}

	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
	assert.Equal(t, "unauthorized", got.Message)
	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))
	assert.Equal(t, "no-store, no-cache, must-revalidate, private", rr.Header().Get("Cache-Control"))
	assert.Equal(t, "Cookie", rr.Header().Get("Vary"))
}
