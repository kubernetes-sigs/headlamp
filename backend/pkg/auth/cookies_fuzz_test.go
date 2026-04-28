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

	f.Fuzz(func(t *testing.T, input string) {
		result := auth.SanitizeClusterName(input)

		// Invariant 1: Result should never be longer than 50 characters
		if len(result) > 50 {
			t.Errorf("SanitizeClusterName(%q) returned result with length %d, expected <= 50", input, len(result))
		}

		// Invariant 2: Result should only contain alphanumeric characters, hyphens, and underscores
		if !validCharsRegex.MatchString(result) {
			t.Errorf("SanitizeClusterName(%q) = %q contains invalid characters", input, result)
		}

		// Invariant 3: Result should be a valid UTF-8 string
		if !utf8.ValidString(result) {
			t.Errorf("SanitizeClusterName(%q) = %q is not valid UTF-8", input, result)
		}

		// Invariant 4: If input is empty, result should be empty
		if input == "" && result != "" {
			t.Errorf("SanitizeClusterName(%q) = %q, expected empty string", input, result)
		}

		// Invariant 5: Result should be idempotent - sanitizing the result again should give the same result
		result2 := auth.SanitizeClusterName(result)
		if result != result2 {
			t.Errorf("SanitizeClusterName is not idempotent: first=%q, second=%q", result, result2)
		}

		// Invariant 6: Result length should never exceed input length (sanitization only removes characters)
		if len(input) > 0 && len(result) > len(input) {
			t.Errorf("SanitizeClusterName(%q) returned result longer than input: input_len=%d, result_len=%d",
				input, len(input), len(result))
		}
	})
}
