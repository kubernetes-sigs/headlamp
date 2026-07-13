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
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
)

// FuzzDecodeBase64JSON tests DecodeBase64JSON with various inputs.
func FuzzDecodeBase64JSON(f *testing.F) {
	// Seed corpus with representative inputs.
	f.Add("eyJmb28iOiJiYXIifQ")  // base64url of {"foo":"bar"}
	f.Add("")                    // empty
	f.Add("not-valid-base64!!!") // invalid base64url
	f.Add("YWJj")                // valid base64url of "abc", invalid JSON
	f.Add("bnVsbA")              // valid base64url of "null"

	f.Fuzz(func(t *testing.T, input string) {
		_, _ = auth.DecodeBase64JSON(input)
	})
}
