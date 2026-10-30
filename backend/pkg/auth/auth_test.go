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
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/internal/testutil"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
	"golang.org/x/sync/singleflight"
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
				Name:  "headlamp-auth-" + auth.SanitizeClusterName("cookie-cluster") + ".0",
				Value: "cookie-token",
			},
		},
	},
}

func TestBearerTokenValue(t *testing.T) {
	tests := []struct {
		name   string
		header string
		want   string
	}{
		{
			name:   "raw token",
			header: "raw-token",
			want:   "raw-token",
		},
		{
			name:   "bearer token",
			header: "Bearer raw-token",
			want:   "raw-token",
		},
		{
			name:   "case insensitive bearer token",
			header: "bearer raw-token",
			want:   "raw-token",
		},
		{
			name:   "uppercase bearer token",
			header: "BEARER raw-token",
			want:   "raw-token",
		},
		{
			name:   "trim whitespace",
			header: "  Bearer   raw-token  ",
			want:   "raw-token",
		},
		{
			name:   "tab separated bearer token",
			header: "Bearer\traw-token",
			want:   "raw-token",
		},
		{
			name:   "only bearer keyword is raw token",
			header: "Bearer",
			want:   "Bearer",
		},
		{
			name:   "bearer scheme without credentials",
			header: "Bearer ",
			want:   "",
		},
		{
			name:   "bearer-like raw token",
			header: "bearer",
			want:   "bearer",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, auth.BearerTokenValue(tt.header))
		})
	}
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

func (cacheStub) SetOnEvicted(callback func(key string, value interface{})) {
	// No-op for stub
}

func (cacheStub) Close() error {
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
	deleteCalls    []string
	updateTTLCalls []struct {
		key string
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

func (f *fakeCache) Delete(_ context.Context, key string) error {
	f.deleteCalls = append(f.deleteCalls, key)
	return nil
}

func (f *fakeCache) UpdateTTL(_ context.Context, key string, ttl time.Duration) error {
	f.updateTTLCalls = append(f.updateTTLCalls, struct {
		key string
		ttl time.Duration
	}{key, ttl})

	return nil
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

func newOIDCProviderServer(t *testing.T, issuerURL string, tokenHandler http.HandlerFunc) *httptest.Server {
	t.Helper()

	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		issuer := issuerURL
		if issuer == "" {
			issuer = srv.URL
		}

		cfg := map[string]any{
			"issuer":         issuer,
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

// findAuthCookie returns the final value a browser's cookie jar would hold for the named auth
// cookie, after applying every Set-Cookie header on resp in order. SetTokenCookie's ClearTokenCookie
// pre-step (see its doc comment) unconditionally emits its own clearing Set-Cookie headers before
// the real value is written, so the first header matching the name is not necessarily the one
// that ends up set; this takes the last one instead, and treats a clear (MaxAge < 0) as unsetting
// it unless a later Set-Cookie re-adds it.
func findAuthCookie(resp *http.Response, cluster string) (string, bool) {
	want := fmt.Sprintf("headlamp-auth-%s.0", auth.SanitizeClusterName(cluster))

	value, found := "", false

	for _, cookie := range resp.Cookies() {
		if cookie.Name != want {
			continue
		}

		if cookie.MaxAge < 0 {
			value, found = "", false
			continue
		}

		value, found = cookie.Value, true
	}

	return value, found
}

func findIDTokenCookie(resp *http.Response, cluster string) (string, bool) {
	want := fmt.Sprintf("headlamp-id-token-%s.0", auth.SanitizeClusterName(cluster))
	for _, cookie := range resp.Cookies() {
		if cookie.Name == want {
			return cookie.Value, true
		}
	}

	return "", false
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

	newTok, err := auth.GetNewToken("cid", "secret", fc, "id_token", "OLD", srv.URL, context.Background(), time.Hour)
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
	if len(fc.setCalls) != 1 || len(fc.setWithTTLCalls) != 2 {
		t.Fatalf("expected Set=1, SetWithTTL=2; got Set=%d, SetWithTTL=%d",
			len(fc.setCalls), len(fc.setWithTTLCalls))
	}

	if fc.setCalls[0].key != "oidc-token-NEW" || fc.setCalls[0].val != refreshNew {
		t.Fatalf("Set call = {%q,%v}, want {%q,%q}",
			fc.setCalls[0].key, fc.setCalls[0].val, "oidc-token-NEW", refreshNew)
	}

	idTokenCall := fc.setWithTTLCalls[0]
	if idTokenCall.key != "oidc-id-token-NEW" || idTokenCall.val != "NEW" || idTokenCall.ttl <= 0 {
		t.Fatalf("ID token SetWithTTL call = {%q,%v,%v}", idTokenCall.key, idTokenCall.val, idTokenCall.ttl)
	}

	call := fc.setWithTTLCalls[1]
	if call.key != "oidc-token-OLD" || call.val != "REFRESH_OLD" || call.ttl != 10*time.Second {
		t.Fatalf("SetWithTTL = {%q,%v,%v}, want {%q,%q,%v}",
			call.key, call.val, call.ttl, "oidc-token-OLD", "REFRESH_OLD", 10*time.Second)
	}

	assert.Empty(t, fc.deleteCalls)
	require.Len(t, fc.updateTTLCalls, 1)
	assert.Equal(t, "oidc-id-token-OLD", fc.updateTTLCalls[0].key)
	assert.Equal(t, 10*time.Second, fc.updateTTLCalls[0].ttl)
}

func TestGetNewToken_IDTokenOmittedRetainsRotatedRefreshToken(t *testing.T) {
	srv := newTokenServerJSON(t, http.StatusOK, map[string]any{
		"access_token":  "AT",
		"token_type":    "Bearer",
		"expires_in":    3600,
		"refresh_token": refreshNew,
	})
	fc := &fakeCache{store: map[string]interface{}{
		"oidc-token-OLD":    "REFRESH_OLD",
		"oidc-id-token-OLD": "OLD",
	}}

	newTok, err := auth.GetNewToken("cid", "secret", fc, "id_token", "OLD", srv.URL, context.Background(), time.Hour)
	require.NoError(t, err)
	assert.Equal(t, "OLD", newTok.Extra("id_token"))

	require.Len(t, fc.setCalls, 1)
	assert.Equal(t, "oidc-token-OLD", fc.setCalls[0].key)
	assert.Equal(t, refreshNew, fc.setCalls[0].val)
	require.Len(t, fc.setWithTTLCalls, 1)
	assert.Equal(t, "oidc-id-token-OLD", fc.setWithTTLCalls[0].key)
	assert.Empty(t, fc.deleteCalls)
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
			_, err := auth.GetNewToken(
				"cid", "secret", tc.cache, "id_token", "OLD", "http://127.0.0.1", context.Background(), time.Hour)
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

			if _, err := auth.GetNewToken(
				"cid", "secret", fc, "id_token", "OLD", srv.URL, context.Background(), time.Hour); err == nil {
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

			if _, err := auth.GetNewToken(
				"cid", "secret", fc, "id_token", "OLD", srv.URL, context.Background(), time.Hour); err == nil {
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
	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
		require.NoError(t, r.ParseForm())
		require.Equal(t, "refresh_token", r.PostForm.Get("grant_type"))
		require.Equal(t, "REFRESH_OLD", r.PostForm.Get("refresh_token"))

		authHeader := r.Header.Get("Authorization")
		require.True(t, strings.HasPrefix(authHeader, "Basic "), "expected Basic Authorization header")

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	config := &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"}
	tok, err := auth.RefreshAndCacheNewToken(
		context.Background(), config, fc, "id_token", oldToken, srv.URL, "", time.Hour, nil)
	require.NoError(t, err)
	assert.NotNil(t, tok)
	assert.Equal(t, refreshNew, tok.RefreshToken)

	require.Len(t, fc.setCalls, 1)
	assert.Equal(t, "oidc-token-NEW", fc.setCalls[0].key)
	assert.Equal(t, refreshNew, fc.setCalls[0].val)

	require.Len(t, fc.setWithTTLCalls, 2)
	assert.Equal(t, "oidc-id-token-NEW", fc.setWithTTLCalls[0].key)
	assert.Equal(t, "NEW", fc.setWithTTLCalls[0].val)
	assert.Positive(t, fc.setWithTTLCalls[0].ttl)
	assert.Equal(t, oldKey, fc.setWithTTLCalls[1].key)
	assert.Equal(t, "REFRESH_OLD", fc.setWithTTLCalls[1].val)
	assert.Equal(t, 10*time.Second, fc.setWithTTLCalls[1].ttl)
	assert.Empty(t, fc.deleteCalls)
	require.Len(t, fc.updateTTLCalls, 1)
	assert.Equal(t, "oidc-id-token-"+oldToken, fc.updateTTLCalls[0].key)
	assert.Equal(t, 10*time.Second, fc.updateTTLCalls[0].ttl)
}

func TestRefreshAndCacheNewToken_ValidatorIssuerOverride(t *testing.T) {
	const (
		oldToken     = "OLD"
		oldKey       = "oidc-token-" + oldToken
		issuerURL    = "https://issuer.example.com"
		refreshToken = "REFRESH_OLD"
	)

	fc := &fakeCache{store: map[string]interface{}{oldKey: refreshToken}}
	srv := newOIDCProviderServer(t, issuerURL, func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
		require.NoError(t, r.ParseForm())
		require.Equal(t, "refresh_token", r.PostForm.Get("grant_type"))
		require.Equal(t, refreshToken, r.PostForm.Get("refresh_token"))

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	config := &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"}
	_, err := auth.RefreshAndCacheNewToken(
		context.Background(), config, fc, "id_token", oldToken, srv.URL, "", time.Hour, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "did not match")

	tok, err := auth.RefreshAndCacheNewToken(
		context.Background(), config, fc, "id_token", oldToken, srv.URL, issuerURL, time.Hour, nil,
	)
	require.NoError(t, err)
	assert.NotNil(t, tok)
	assert.Equal(t, refreshNew, tok.RefreshToken)
}

// TestRefreshAndCacheNewToken_ReusesCompletedExchangeAfterGroupForgetsKey covers the gap
// singleflight's group.Do alone leaves open: it only shares an exchange with callers that arrive
// WHILE it is still running. A second, sequential call for the exact same token -- modeling a
// caller that arrives just after an overlapping singleflight.Do call already returned and the
// group forgot the key, not a caller racing it -- must reuse the completed result instead of
// attempting a second exchange against the refresh token the first call already consumed.
func TestRefreshAndCacheNewToken_ReusesCompletedExchangeAfterGroupForgetsKey(t *testing.T) {
	const oldToken = "OLD"

	realCache := cache.New[interface{}]()
	require.NoError(t, realCache.Set(context.Background(), "oidc-token-"+oldToken, "REFRESH_OLD"))

	var tokenEndpointHits int32

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, r *http.Request) {
		if hits := atomic.AddInt32(&tokenEndpointHits, 1); hits > 1 {
			t.Errorf("token endpoint hit %d times, want at most 1 -- the second call must reuse "+
				"the first call's completed result instead of exchanging the consumed refresh token again", hits)
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
		require.NoError(t, r.ParseForm())
		require.Equal(t, "REFRESH_OLD", r.PostForm.Get("refresh_token"))

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	config := &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"}
	group := &singleflight.Group{}

	first, err := auth.RefreshAndCacheNewToken(
		context.Background(), config, realCache, "id_token", oldToken, srv.URL, "", time.Hour, group)
	require.NoError(t, err)
	require.NotNil(t, first)
	assert.Equal(t, refreshNew, first.RefreshToken)

	// This second call happens strictly after the first group.Do call above has already
	// returned, so singleflight itself provides no sharing here -- only the completed-exchange
	// cache can prevent a second, real exchange against the already-consumed refresh token.
	second, err := auth.RefreshAndCacheNewToken(
		context.Background(), config, realCache, "id_token", oldToken, srv.URL, "", time.Hour, group)
	require.NoError(t, err)
	require.NotNil(t, second)
	assert.Equal(t, refreshNew, second.RefreshToken)
	assert.EqualValues(t, 1, atomic.LoadInt32(&tokenEndpointHits))
}

// pausingCache wraps a real cache.Cache so a test can deterministically control the exact
// interleaving between a caller's own completed-result cache check and another caller's
// unrelated Do call completing in between: the first Get for pauseKey runs the real lookup (a
// genuine miss, since this fires before anything is cached), then blocks until the test signals
// proceed, letting another caller's entire refresh -- exchange, cache write, and return -- happen
// in between. Later Get calls for the same key (including the recheck inside Do's own callback)
// pass straight through, so they observe whatever that other caller already wrote.
type pausingCache struct {
	cache.Cache[interface{}]
	pauseKey  string
	paused    chan struct{}
	proceed   chan struct{}
	triggered atomic.Bool
}

func (p *pausingCache) Get(ctx context.Context, key string) (interface{}, error) {
	val, err := p.Cache.Get(ctx, key)

	// CompareAndSwap, not sync.Once: the caller this pauses (B) shares this cache with the
	// OTHER caller (A) whose own Get call must return immediately, not block waiting for B's
	// paused call to finish -- which is exactly what sync.Once.Do would do, deadlocking both.
	if key == p.pauseKey && p.triggered.CompareAndSwap(false, true) {
		close(p.paused)
		<-p.proceed
	}

	return val, err
}

// TestRefreshAndCacheNewToken_RechecksCompletedResultInsideCallback covers the interleaving the
// sequential test above does not: caller B's own completed-result cache check misses, and only
// THEN -- not overlapping with B's check, and not sharing B's eventual Do call either, since B
// has not reached Do yet -- does caller A run an entire refresh to completion (exchange, cache
// write, Do returning). When B finally calls Do, singleflight has already forgotten the token
// (A's Do call came and went), so B becomes a brand new leader; without rechecking the cache from
// inside that leader's own callback, B would exchange the already-consumed refresh token again.
func TestRefreshAndCacheNewToken_RechecksCompletedResultInsideCallback(t *testing.T) {
	const oldToken = "OLD"

	realCache := cache.New[interface{}]()
	require.NoError(t, realCache.Set(context.Background(), "oidc-token-"+oldToken, "REFRESH_OLD"))

	var tokenEndpointHits int32

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, r *http.Request) {
		if hits := atomic.AddInt32(&tokenEndpointHits, 1); hits > 1 {
			t.Errorf("token endpoint hit %d times, want at most 1 -- caller B must recheck the "+
				"completed-result cache inside its own Do callback instead of exchanging again", hits)
		}

		r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
		require.NoError(t, r.ParseForm())
		require.Equal(t, "REFRESH_OLD", r.PostForm.Get("refresh_token"))

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	pc := &pausingCache{
		Cache:    realCache,
		pauseKey: "oidc-refresh-result-" + oldToken,
		paused:   make(chan struct{}),
		proceed:  make(chan struct{}),
	}

	config := &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"}
	group := &singleflight.Group{}

	var (
		second    *oauth2.Token
		secondErr error
		wg        sync.WaitGroup
	)

	wg.Add(1)

	go func() {
		defer wg.Done()

		second, secondErr = auth.RefreshAndCacheNewToken(
			context.Background(), config, pc, "id_token", oldToken, srv.URL, "", time.Hour, group)
	}()

	<-pc.paused // caller B's own check has genuinely missed and is now parked before calling Do.

	first, err := auth.RefreshAndCacheNewToken(
		context.Background(), config, pc, "id_token", oldToken, srv.URL, "", time.Hour, group)
	require.NoError(t, err)
	require.NotNil(t, first)

	close(pc.proceed) // let caller B resume: its Do callback must recheck the cache A just wrote.
	wg.Wait()

	require.NoError(t, secondErr)
	require.NotNil(t, second)
	assert.Equal(t, first.RefreshToken, second.RefreshToken)
	assert.EqualValues(t, 1, atomic.LoadInt32(&tokenEndpointHits))
}

// TestRefreshAndCacheNewToken_SharedExchangeSurvivesLeaderCancellation covers a hazard
// singleflight itself does not protect against: group.Do runs the shared function in whichever
// caller's goroutine becomes the leader, using whatever context that caller passed in. If the
// leader is an HTTP request whose own context is cancelled mid-exchange (client disconnected,
// its own deadline passed), that must not abort the exchange for every OTHER caller coordinated
// through the same group -- e.g. a WebSocket multiplexer's reactive refresh with its own,
// still-valid context -- who are all waiting on the exact same Do call for its result.
//
//nolint:funlen // Coordinates a fake server, two goroutines, and timing to force the exact race.
func TestRefreshAndCacheNewToken_SharedExchangeSurvivesLeaderCancellation(t *testing.T) {
	const oldToken = "OLD"

	realCache := cache.New[interface{}]()
	require.NoError(t, realCache.Set(context.Background(), "oidc-token-"+oldToken, "REFRESH_OLD"))

	requestReceived := make(chan struct{})
	releaseResponse := make(chan struct{})

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, r *http.Request) {
		close(requestReceived)
		<-releaseResponse

		r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
		require.NoError(t, r.ParseForm())
		require.Equal(t, "REFRESH_OLD", r.PostForm.Get("refresh_token"))

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	config := &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"}
	group := &singleflight.Group{}

	leaderCtx, cancelLeader := context.WithCancel(context.Background())

	var (
		leaderTok, followerTok *oauth2.Token
		leaderErr, followerErr error
		leaderWg, followerWg   sync.WaitGroup
	)

	leaderWg.Add(1)

	go func() {
		defer leaderWg.Done()

		leaderTok, leaderErr = auth.RefreshAndCacheNewToken(
			leaderCtx, config, realCache, "id_token", oldToken, srv.URL, "", time.Hour, group)
	}()

	<-requestReceived // the leader's exchange is now blocked in flight on the token endpoint.

	followerWg.Add(1)

	go func() {
		defer followerWg.Done()

		followerTok, followerErr = auth.RefreshAndCacheNewToken(
			context.Background(), config, realCache, "id_token", oldToken, srv.URL, "", time.Hour, group)
	}()

	// Give the follower a moment to reach and join the leader's still-in-flight Do call before
	// cancelling the leader -- the exact race this guards: a follower sharing an exchange whose
	// leader disappears out from under it.
	time.Sleep(50 * time.Millisecond)

	cancelLeader()
	time.Sleep(50 * time.Millisecond) // let the cancellation reach the transport, if it would.

	close(releaseResponse)

	leaderWg.Wait()
	followerWg.Wait()

	require.NoError(t, leaderErr, "leader's own cancellation must not fail the shared exchange")
	require.NoError(t, followerErr, "follower sharing the exchange must not fail from the leader's cancellation")
	require.NotNil(t, leaderTok)
	require.NotNil(t, followerTok)
	assert.Equal(t, refreshNew, leaderTok.RefreshToken)
	assert.Equal(t, refreshNew, followerTok.RefreshToken)
}

func TestRefreshAndCacheNewToken_ProviderError(t *testing.T) {
	config := &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "no discovery", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	_, err := auth.RefreshAndCacheNewToken(
		context.Background(), config, &fakeCache{}, "id_token", "OLD", srv.URL, "", time.Hour, nil,
	)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "getting provider")
}

func TestRefreshAndCacheNewToken_TokenError(t *testing.T) {
	const oldToken = "OLD"

	fc := &fakeCache{store: map[string]interface{}{"oidc-token-" + oldToken: "REFRESH_OLD"}}
	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "server_error"})
	})

	config := &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"}
	_, err := auth.RefreshAndCacheNewToken(
		context.Background(), config, fc, "id_token", oldToken, srv.URL, "", time.Hour, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "refreshing token")
	assert.Len(t, fc.setCalls, 0)
	assert.Len(t, fc.setWithTTLCalls, 0)
}

func TestRefreshAndSetToken_DefaultsToIDToken(t *testing.T) {
	const (
		oldToken = "OLD"
		cluster  = "test"
	)

	fc := &fakeCache{store: map[string]interface{}{"oidc-token-" + oldToken: "REFRESH_OLD"}}

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		require.NoError(t, r.ParseForm())
		require.Equal(t, "refresh_token", r.PostForm.Get("grant_type"))
		require.Equal(t, "REFRESH_OLD", r.PostForm.Get("refresh_token"))

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/"+cluster, nil)
	rr := httptest.NewRecorder()

	auth.RefreshAndSetToken(auth.RefreshAndSetTokenParams{
		Ctx:              context.Background(),
		OIDCAuthConfig:   &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret", IdpIssuerURL: srv.URL},
		Cache:            fc,
		Token:            oldToken,
		Cluster:          cluster,
		Writer:           rr,
		Request:          req,
		TelemetryHandler: &telemetry.RequestHandler{},
		OIDCIdpIssuerURL: "",
		BaseURL:          "",
	})

	resp := rr.Result()

	defer func() { _ = resp.Body.Close() }()

	cookieVal, ok := findAuthCookie(resp, cluster)
	require.True(t, ok, "expected auth cookie to be set")
	assert.Equal(t, "NEW", cookieVal)

	idToken, ok := findIDTokenCookie(resp, cluster)
	require.True(t, ok, "expected refreshed ID token cookie to be set")
	assert.Equal(t, "NEW", idToken)
}

func TestRefreshAndSetToken_UsesAccessToken(t *testing.T) {
	const (
		oldToken = "OLD"
		cluster  = "test"
	)

	fc := &fakeCache{store: map[string]interface{}{"oidc-token-" + oldToken: "REFRESH_OLD"}}

	tokenBody := map[string]any{
		"access_token":  "ACCESS_NEW",
		"token_type":    "Bearer",
		"expires_in":    3600,
		"refresh_token": refreshNew,
		"id_token":      "ID_NEW",
	}

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		require.NoError(t, r.ParseForm())
		require.Equal(t, "REFRESH_OLD", r.PostForm.Get("refresh_token"))

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(tokenBody))
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/"+cluster, nil)
	rr := httptest.NewRecorder()

	auth.RefreshAndSetToken(auth.RefreshAndSetTokenParams{
		Ctx:                context.Background(),
		OIDCAuthConfig:     &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"},
		Cache:              fc,
		Token:              oldToken,
		Cluster:            cluster,
		Writer:             rr,
		Request:            req,
		TelemetryHandler:   &telemetry.RequestHandler{},
		OIDCUseAccessToken: true,
		OIDCIdpIssuerURL:   srv.URL,
		BaseURL:            "",
		SessionTTL:         90,
	})

	resp := rr.Result()

	defer func() { _ = resp.Body.Close() }()

	cookieVal, ok := findAuthCookie(resp, cluster)
	require.True(t, ok, "expected auth cookie to be set")
	assert.Equal(t, "ACCESS_NEW", cookieVal)
	assert.Equal(t, "Bearer ACCESS_NEW", req.Header.Get("Authorization"))

	idToken, ok := findIDTokenCookie(resp, cluster)
	require.True(t, ok, "expected refreshed ID token cookie to be set")
	assert.Equal(t, "ID_NEW", idToken)
	assert.Equal(t, 90*time.Second, fc.setWithTTLCalls[0].ttl)
}

//nolint:funlen // The regression test covers the complete refresh and cookie/cache lifecycle.
func TestRefreshAndSetToken_AccessTokenWithoutIDTokenPreservesLogoutCookie(t *testing.T) {
	const (
		oldToken = "OLD"
		cluster  = "access-token-without-id-token"
	)

	fc := &fakeCache{store: map[string]interface{}{
		"oidc-token-" + oldToken:    "REFRESH_OLD",
		"oidc-id-token-" + oldToken: "ID_ORIGINAL",
	}}

	tokenBody := map[string]any{
		"access_token":  "ACCESS_NEW",
		"token_type":    "Bearer",
		"expires_in":    3600,
		"refresh_token": refreshNew,
	}

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		require.NoError(t, r.ParseForm())
		require.Equal(t, "REFRESH_OLD", r.PostForm.Get("refresh_token"))

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(tokenBody))
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/"+cluster, nil)
	rr := httptest.NewRecorder()

	auth.RefreshAndSetToken(auth.RefreshAndSetTokenParams{
		Ctx:                context.Background(),
		OIDCAuthConfig:     &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"},
		Cache:              fc,
		Token:              oldToken,
		Cluster:            cluster,
		Writer:             rr,
		Request:            req,
		TelemetryHandler:   &telemetry.RequestHandler{},
		OIDCUseAccessToken: true,
		OIDCIdpIssuerURL:   srv.URL,
		BaseURL:            "",
	})

	resp := rr.Result()

	defer func() { _ = resp.Body.Close() }()

	cookieVal, ok := findAuthCookie(resp, cluster)
	require.True(t, ok, "expected auth cookie to be set")
	assert.Equal(t, "ACCESS_NEW", cookieVal)

	idToken, ok := findIDTokenCookie(resp, cluster)
	require.True(t, ok, "expected cached ID token cookie to be renewed")
	assert.Equal(t, "ID_ORIGINAL", idToken)

	require.NotEmpty(t, fc.setWithTTLCalls)
	idTokenCacheCall := fc.setWithTTLCalls[0]
	assert.Equal(t, "oidc-id-token-ACCESS_NEW", idTokenCacheCall.key)
	assert.Equal(t, "ID_ORIGINAL", idTokenCacheCall.val)
	assert.Equal(t, 24*time.Hour, idTokenCacheCall.ttl)
	assert.Empty(t, fc.deleteCalls)
	require.Len(t, fc.updateTTLCalls, 1)
	assert.Equal(t, "oidc-id-token-"+oldToken, fc.updateTTLCalls[0].key)
	assert.Equal(t, 10*time.Second, fc.updateTTLCalls[0].ttl)
}

func TestTwoRefreshesFromOldAccessTokenRetainLogoutHint(t *testing.T) {
	tokenCache := cache.New[interface{}]()

	t.Cleanup(func() { require.NoError(t, tokenCache.Close()) })

	ctx := context.Background()
	require.NoError(t, tokenCache.Set(ctx, "oidc-token-OLD", "REFRESH_OLD"))
	require.NoError(t, auth.CacheIDToken(ctx, tokenCache, "OLD", "ID_ORIGINAL", time.Hour))

	srv := newTokenServerJSON(t, http.StatusOK, map[string]any{
		"access_token": "ACCESS_NEW", "token_type": "Bearer",
		"expires_in": 3600, "refresh_token": refreshNew,
	})

	for range 2 {
		token, err := auth.GetNewToken("cid", "secret", tokenCache, "access_token", "OLD", srv.URL, ctx, time.Hour)
		require.NoError(t, err)
		assert.Equal(t, "ID_ORIGINAL", token.Extra("id_token"))

		hint, err := tokenCache.Get(ctx, "oidc-id-token-ACCESS_NEW")
		require.NoError(t, err)
		assert.Equal(t, "ID_ORIGINAL", hint)
	}

	hint, err := tokenCache.Get(ctx, "oidc-id-token-OLD")
	require.NoError(t, err)
	assert.Equal(t, "ID_ORIGINAL", hint)
}

func TestAccessTokenExpiryDoesNotExpireSessionLogoutHint(t *testing.T) {
	tokenCache := cache.New[interface{}]()

	t.Cleanup(func() { require.NoError(t, tokenCache.Close()) })

	ctx := context.Background()
	require.NoError(t, tokenCache.Set(ctx, "oidc-token-OLD", "REFRESH_OLD"))
	require.NoError(t, auth.CacheIDToken(ctx, tokenCache, "OLD", "ID_ORIGINAL", time.Hour))

	srv := newTokenServerJSON(t, http.StatusOK, map[string]any{
		"access_token": "ACCESS_NEW", "token_type": "Bearer",
		"expires_in": 1, "refresh_token": refreshNew,
	})

	token, err := auth.GetNewToken("cid", "secret", tokenCache, "access_token", "OLD", srv.URL, ctx, time.Hour)
	require.NoError(t, err)
	assert.Equal(t, "ID_ORIGINAL", token.Extra("id_token"))
	time.Sleep(time.Until(token.Expiry) + 10*time.Millisecond)
	require.False(t, token.Valid())

	token, err = auth.GetNewToken("cid", "secret", tokenCache, "access_token", "ACCESS_NEW", srv.URL, ctx, time.Hour)
	require.NoError(t, err)
	assert.Equal(t, "ID_ORIGINAL", token.Extra("id_token"))
}

// TestRefreshAndSetToken_UpdatesRequestAuthorizationHeader locks in the fix for a race this
// package's own call sites can hit: NewOIDCTokenRefreshMiddleware refreshes and writes a new
// Set-Cookie on the response, then calls next.ServeHTTP with the SAME *http.Request -- whose
// Cookie header was never touched. A handler further down that chain (for example
// impersonationForRequest) reading that request's token would otherwise still see the one this
// refresh just replaced, fail verification if it had already expired, and attempt its own
// refresh using the same now-consumed refresh token -- which a provider that rotates or
// invalidates refresh tokens after use would reject, turning this refresh's success into a 401
// anyway. Setting the Authorization header here, which requestIDToken checks before falling
// back to the cookie, is what breaks that chain.
func TestRefreshAndSetToken_UpdatesRequestAuthorizationHeader(t *testing.T) {
	const (
		oldToken = "OLD"
		cluster  = "test"
	)

	fc := &fakeCache{store: map[string]interface{}{"oidc-token-" + oldToken: "REFRESH_OLD"}}

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		require.NoError(t, r.ParseForm())

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/"+cluster, nil)
	rr := httptest.NewRecorder()

	auth.RefreshAndSetToken(auth.RefreshAndSetTokenParams{
		Ctx:              context.Background(),
		OIDCAuthConfig:   &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret", IdpIssuerURL: srv.URL},
		Cache:            fc,
		Token:            oldToken,
		Cluster:          cluster,
		Writer:           rr,
		Request:          req,
		TelemetryHandler: &telemetry.RequestHandler{},
		BaseURL:          "",
	})

	assert.Equal(t, "Bearer NEW", req.Header.Get("Authorization"),
		"the same request's Authorization header must carry the refreshed token, "+
			"not just the response's Set-Cookie")
}

// TestRefreshAndSetToken_RecordsLatestKnownGoodToken locks in the write side of the fix behind
// auth.LatestIDTokenCacheKey: a caller with no response of its own to write a fresh cookie to --
// the WebSocket multiplexer's reactive refresh -- checks this cache entry before performing its
// own refresh-token exchange, so it can reuse an already-fresh token instead of consuming
// (and for a provider that rotates refresh tokens, permanently invalidating) the shared refresh
// token a second time. That only works if a proactive refresh like this one actually records it.
func TestRefreshAndSetToken_RecordsLatestKnownGoodToken(t *testing.T) {
	const (
		oldToken = "OLD"
		cluster  = "test"
	)

	fc := &fakeCache{store: map[string]interface{}{"oidc-token-" + oldToken: "REFRESH_OLD"}}

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		require.NoError(t, r.ParseForm())

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(oauthSuccessBody))
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/"+cluster, nil)
	rr := httptest.NewRecorder()

	auth.RefreshAndSetToken(auth.RefreshAndSetTokenParams{
		Ctx:              context.Background(),
		OIDCAuthConfig:   &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret", IdpIssuerURL: srv.URL},
		Cache:            fc,
		Token:            oldToken,
		Cluster:          cluster,
		Writer:           rr,
		Request:          req,
		TelemetryHandler: &telemetry.RequestHandler{},
		BaseURL:          "",
	})

	var recorded bool

	for _, call := range fc.setWithTTLCalls {
		if call.key == auth.LatestIDTokenCacheKey(oldToken) {
			recorded = true

			assert.Equal(t, "NEW", call.val)
			assert.Equal(t, auth.LatestIDTokenTTL, call.ttl,
				"the latest-known-good-token entry must expire, not be kept forever")
		}
	}

	assert.True(t, recorded, "expected the refreshed token to be recorded under LatestIDTokenCacheKey")
}

func TestRefreshAndSetToken_ErrorDoesNotSetCookie(t *testing.T) {
	const (
		oldToken = "OLD"
		cluster  = "test"
	)

	fc := &fakeCache{store: map[string]interface{}{"oidc-token-" + oldToken: "REFRESH_OLD"}}

	srv := newOIDCProviderServer(t, "", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "token refresh failed", http.StatusInternalServerError)
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/"+cluster, nil)
	rr := httptest.NewRecorder()

	auth.RefreshAndSetToken(auth.RefreshAndSetTokenParams{
		Ctx:              context.Background(),
		OIDCAuthConfig:   &kubeconfig.OidcConfig{ClientID: "cid", ClientSecret: "secret"},
		Cache:            fc,
		Token:            oldToken,
		Cluster:          cluster,
		Writer:           rr,
		Request:          req,
		TelemetryHandler: &telemetry.RequestHandler{},
		OIDCIdpIssuerURL: srv.URL,
		BaseURL:          "",
	})

	resp := rr.Result()

	defer func() { _ = resp.Body.Close() }()

	_, ok := findAuthCookie(resp, cluster)
	assert.False(t, ok, "expected no auth cookie to be set on error")
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

// TestConfigureTLSContext_EmptyCACert verifies that a non-nil pointer
// to an empty string is treated the same as nil (no custom CA configured).
func TestConfigureTLSContext_EmptyCACert(t *testing.T) {
	baseCtx := context.Background()
	emptyCert := ""
	resultCtx := auth.ConfigureTLSContext(baseCtx, nil, &emptyCert)
	assert.Equal(t, baseCtx, resultCtx, "Context should not be modified when caCert is empty")
}

// TestConfigureTLSContext_SkipTLS_PreservesDefaults verifies that cloning
// http.DefaultTransport preserves proxy and timeout settings.
func TestConfigureTLSContext_SkipTLS_PreservesDefaults(t *testing.T) {
	skipTLSVerify := true
	resultCtx := auth.ConfigureTLSContext(context.Background(), &skipTLSVerify, nil)

	client, ok := resultCtx.Value(oauth2.HTTPClient).(*http.Client)
	require.True(t, ok, "context should contain an *http.Client")

	tr, ok := client.Transport.(*http.Transport)
	require.True(t, ok, "transport should be *http.Transport")

	defaultTr, ok := http.DefaultTransport.(*http.Transport)
	require.True(t, ok, "http.DefaultTransport should be *http.Transport")

	assert.NotNil(t, tr.Proxy, "transport.Proxy should be preserved from DefaultTransport")
	assert.Equal(t, defaultTr.TLSHandshakeTimeout, tr.TLSHandshakeTimeout, "TLSHandshakeTimeout should be preserved")
	assert.Equal(t, defaultTr.IdleConnTimeout, tr.IdleConnTimeout, "IdleConnTimeout should be preserved")
	assert.True(t, tr.TLSClientConfig.InsecureSkipVerify, "InsecureSkipVerify should be true")
}

// TestConfigureTLSContext_CACert_PreservesDefaults verifies the caCert branch
// also preserves default transport settings.
func TestConfigureTLSContext_CACert_PreservesDefaults(t *testing.T) {
	caCertBytes, err := os.ReadFile("../../cmd/headlamp_testdata/ca.crt")
	require.NoError(t, err)

	caCert := string(caCertBytes)
	resultCtx := auth.ConfigureTLSContext(context.Background(), nil, &caCert)

	client, ok := resultCtx.Value(oauth2.HTTPClient).(*http.Client)
	require.True(t, ok, "context should contain an *http.Client")

	tr, ok := client.Transport.(*http.Transport)
	require.True(t, ok, "transport should be *http.Transport")

	defaultTr, ok := http.DefaultTransport.(*http.Transport)
	require.True(t, ok, "http.DefaultTransport should be *http.Transport")

	assert.NotNil(t, tr.Proxy, "transport.Proxy should be preserved from DefaultTransport")
	assert.Equal(t, defaultTr.TLSHandshakeTimeout, tr.TLSHandshakeTimeout, "TLSHandshakeTimeout should be preserved")
	assert.Equal(t, defaultTr.IdleConnTimeout, tr.IdleConnTimeout, "IdleConnTimeout should be preserved")
	assert.NotNil(t, tr.TLSClientConfig.RootCAs, "RootCAs should be set")
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

	token := testutil.MakeUnsignedJWT(t, claims)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/test/me", nil)
	req = mux.SetURLVars(req, map[string]string{"clusterName": "test"})
	req.AddCookie(&http.Cookie{
		Name:     fmt.Sprintf("headlamp-auth-%s.0", auth.SanitizeClusterName("test")),
		Value:    token,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
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

	token := testutil.MakeUnsignedJWT(t, claims)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/test/me", nil)
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

func TestHandleMe_ProxyAuth(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/test/me", nil)
	req = mux.SetURLVars(req, map[string]string{"clusterName": "test"})

	req.Header.Set("X-Forwarded-User", "proxy_alice")
	req.Header.Set("X-Forwarded-Email", "proxy_alice@example.com")
	req.Header.Set("X-Forwarded-Group", "dev, ops")

	rr := httptest.NewRecorder()

	handler := auth.HandleMe(auth.MeHandlerOptions{
		ProxyAuthEnabled:        true,
		ProxyAuthUsernameHeader: "X-Forwarded-User",
		ProxyAuthEmailHeader:    "X-Forwarded-Email",
		ProxyAuthGroupHeader:    "X-Forwarded-Group",
	})

	handler(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)

	var got struct {
		Username string   `json:"username"`
		Email    string   `json:"email"`
		Groups   []string `json:"groups"`
	}

	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &got))
	assert.Equal(t, "proxy_alice", got.Username)
	assert.Equal(t, "proxy_alice@example.com", got.Email)
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

	token := testutil.MakeUnsignedJWT(t, claims)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/test/me", nil)
	req = mux.SetURLVars(req, map[string]string{"clusterName": "test"})
	req.AddCookie(&http.Cookie{
		Name:     fmt.Sprintf("headlamp-auth-%s.0", auth.SanitizeClusterName("test")),
		Value:    token,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
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

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/clusters/test/me", nil)
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

func TestIdentityFromClaims_Success(t *testing.T) {
	t.Parallel()

	claims := map[string]interface{}{
		"email":  "alice@example.com",
		"groups": []interface{}{"dev", "ops"},
	}

	identity, err := auth.IdentityFromClaims(claims, auth.CompileJMESPaths("email"), auth.CompileJMESPaths("groups"))
	require.NoError(t, err)
	assert.Equal(t, "alice@example.com", identity.Username)
	assert.Equal(t, []string{"dev", "ops", "system:authenticated"}, identity.Groups)
}

func TestIdentityFromClaims_DeduplicatesAuthenticatedGroup(t *testing.T) {
	t.Parallel()

	claims := map[string]interface{}{
		"email":  "alice@example.com",
		"groups": []interface{}{"system:authenticated", "dev", "system:authenticated"},
	}

	identity, err := auth.IdentityFromClaims(claims, auth.CompileJMESPaths("email"), auth.CompileJMESPaths("groups"))
	require.NoError(t, err)
	assert.Equal(t, []string{"system:authenticated", "dev"}, identity.Groups)
}

func TestIdentityFromClaims_MissingUsernameClaim(t *testing.T) {
	t.Parallel()

	// Default me-username-path claims are absent; only "email" is present, so resolution must
	// fail unless the operator configured --me-username-path=email to match the IdP's claims.
	claims := map[string]interface{}{
		"email": "alice@example.com",
	}

	_, err := auth.IdentityFromClaims(
		claims,
		auth.CompileJMESPaths("preferred_username,upn,username,name"),
		auth.CompileJMESPaths("groups"),
	)
	require.Error(t, err)
}
