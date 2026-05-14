/*
Copyright 2026 The Kubernetes Authors.

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
	"errors"
	"strings"
	"testing"
)

func TestValidateReturnTo_Accept(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		in   string
		want string
	}{
		{"root", "/", "/"},
		{"deep cluster path", "/c/main/pods/default/foo", "/c/main/pods/default/foo"},
		{"with query", "/c/main/pods/default/foo?view=logs", "/c/main/pods/default/foo?view=logs"},
		{"trailing slash", "/c/main/", "/c/main/"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := ValidateReturnTo(tc.in, "")
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}

func TestValidateReturnTo_Reject(t *testing.T) {
	t.Parallel()

	long := "/" + strings.Repeat("a", MaxReturnToLen+1)

	cases := []struct {
		name string
		in   string
	}{
		{"empty", ""},
		{"https absolute", "https://evil/"},
		{"http absolute", "http://evil/"},
		{"scheme relative", "//evil"},
		{"literal traversal", "/foo/../etc"},
		{"encoded lower", "%2e%2e/etc"},
		{"encoded upper", "%2E%2E/etc"},
		{"encoded mixed", "/foo/%2e%2E/bar"},
		{"javascript scheme", "javascript:alert(1)"},
		{"data scheme", "data:text/html,<script>"},
		{"NUL", "/foo\x00"},
		{"control 0x1f", "/foo\x1f"},
		{"DEL", "/foo\x7f"},
		{"oversized", long},
		{"fragment", "/foo#bar"},
		{"missing leading slash", "foo/bar"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			_, err := ValidateReturnTo(tc.in, "")
			if err == nil {
				t.Fatalf("expected error for %q", tc.in)
			}

			if !errors.Is(err, ErrReturnToInvalid) {
				t.Fatalf("expected ErrReturnToInvalid, got %v", err)
			}
		})
	}
}

func TestValidateReturnTo_BaseURL(t *testing.T) {
	t.Parallel()

	t.Run("under base", func(t *testing.T) {
		t.Parallel()

		got, err := ValidateReturnTo("/headlamp/c/main/pods", "https://example.com/headlamp/")
		if err != nil {
			t.Fatalf("unexpected: %v", err)
		}

		if got != "/headlamp/c/main/pods" {
			t.Fatalf("unexpected output %q", got)
		}
	})

	t.Run("equal to base", func(t *testing.T) {
		t.Parallel()

		got, err := ValidateReturnTo("/headlamp", "https://example.com/headlamp")
		if err != nil {
			t.Fatalf("unexpected: %v", err)
		}

		if got != "/headlamp" {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("escapes base", func(t *testing.T) {
		t.Parallel()

		_, err := ValidateReturnTo("/other/page", "https://example.com/headlamp")
		if err == nil {
			t.Fatalf("expected escape rejection")
		}
	})

	t.Run("suffix-of-name not under prefix", func(t *testing.T) {
		t.Parallel()

		_, err := ValidateReturnTo("/headlamper/x", "https://example.com/headlamp")
		if err == nil {
			t.Fatalf("expected suffix-of-name rejection")
		}
	})
}
