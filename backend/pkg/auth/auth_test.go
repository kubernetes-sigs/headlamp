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
	"net/http"
	"reflect"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
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
