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
	"regexp"
	"testing"
	"unicode/utf8"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
)

// FuzzSanitizeClusterName tests the SanitizeClusterName function with various inputs
// to ensure it handles edge cases, special characters, and maintains its invariants.
func FuzzSanitizeClusterName(f *testing.F) {
	// Seed corpus with known interesting test cases
	f.Add("my-cluster")
	f.Add("my_cluster")
	f.Add("cluster123")
	f.Add("my-cluster@#$%")
	f.Add("")
	f.Add("very-long-cluster-name-that-exceeds-fifty-characters-limit")
	f.Add("special!@#$%^&*()chars")
	f.Add("unicode-日本語-cluster")
	f.Add("spaces in name")
	f.Add("trailing-dash-")
	f.Add("-leading-dash")
	f.Add("___underscores___")
	f.Add("UPPERCASE")
	f.Add("MixedCase123")

	validCharsRegex := regexp.MustCompile(`^[a-zA-Z0-9\-_]*$`)
	invalidCharRegex := regexp.MustCompile(`[^a-zA-Z0-9\-_]`)

	f.Fuzz(func(t *testing.T, input string) {
		if len(input) > 256 {
			t.Skip()
		}

		result := auth.SanitizeClusterName(input)

		// Invariant 1: the human-readable prefix is bounded at 50 characters, plus a fixed
		// "-" + 32 hex character (128-bit) hash suffix, except when the input sanitizes to
		// nothing.
		const maxLen = 50 + 1 + 32
		if len(result) > maxLen {
			t.Errorf("SanitizeClusterName(%q) returned result with length %d, expected <= %d",
				input, len(result), maxLen)
		}

		// Invariant 2: Result should only contain alphanumeric characters, hyphens, and underscores
		if !validCharsRegex.MatchString(result) {
			t.Errorf("SanitizeClusterName(%q) = %q contains invalid characters", input, result)
		}

		// Invariant 3: Result should be a valid UTF-8 string
		if !utf8.ValidString(result) {
			t.Errorf("SanitizeClusterName(%q) = %q is not valid UTF-8", input, result)
		}

		// Invariant 4: an input that sanitizes to nothing (including the empty string) still
		// produces an empty result, preserving callers' "invalid cluster name" check.
		if invalidCharRegex.ReplaceAllString(input, "") == "" && result != "" {
			t.Errorf("SanitizeClusterName(%q) = %q, expected empty string", input, result)
		}

		// Invariant 5 (not idempotent by design): a result is not meant to be re-sanitized --
		// the hash suffix makes two different non-colliding original inputs still collide if
		// fed back through SanitizeClusterName a second time, since a result containing a
		// "-" is itself a valid cluster name shape. Note: this is only ever called once, on
		// the original cluster name.
	})
}
