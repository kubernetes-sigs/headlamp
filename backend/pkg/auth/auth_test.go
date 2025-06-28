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

func TestIsTokenAboutToExpire(t *testing.T) {
	tests := []struct {
		name        string
		token       string
		expectTrue  bool
		description string
	}{
		{
			name:        "Token expiring soon",
			token:       "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MTIzNjE2MDB9.7vl9iBWGDQdXUTbEsqFHiHoaNWxKn4UwLhO9QDhXrpM", // exp: Jan 2021
			expectTrue:  true,
			description: "Token has already expired",
		},
		{
			name:        "Malformed token",
			token:       "bad.token.string",
			expectTrue:  false,
			description: "Malformed token should return false",
		},
		{
			name:        "Invalid payload characters",
			token:       "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MTIzNjE2MDB9==.7vl9iBWGDQdXUTbEsqFHiHoaNWxKn4UwLhO9QDhXrpM",
			expectTrue:  false,
			description: "Base64 payload with invalid format should return false",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := auth.IsTokenAboutToExpire(tt.token)
			if result != tt.expectTrue {
				t.Errorf("%s: expected %v, got %v", tt.description, tt.expectTrue, result)
			}
		})
	}
}

