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
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"golang.org/x/oauth2"
)

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
	setCalls []struct {
		key string
		val interface{}
	}
	setWithTTLCalls []struct {
		key string
		val interface{}
		ttl time.Duration
	}
	errOnSet, errOnSetWithTTL error
}

var _ cache.Cache[interface{}] = (*fakeCache)(nil)

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

const refreshNew = "REFRESH_NEW"

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
