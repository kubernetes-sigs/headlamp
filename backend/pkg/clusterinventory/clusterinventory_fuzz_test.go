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

//nolint:testpackage // fuzz target covers unexported normalizeServerURL behavior.
package clusterinventory

import (
	"strings"
	"testing"
)

// FuzzNormalizeServerURL tests normalizeServerURL with various inputs.
func FuzzNormalizeServerURL(f *testing.F) {
	f.Add("https://example.com/")
	f.Add("https://example.com/path/")
	f.Add("http://example.com:9123/api/v1/?q=1#fragment")
	f.Add("")
	f.Add("/")
	f.Add("not a url")
	f.Add("://bad")

	f.Fuzz(func(t *testing.T, host string) {
		result := normalizeServerURL(host)

		// Invariant: result should not end with a trailing slash.
		if strings.HasSuffix(result, "/") {
			t.Errorf("normalizeServerURL(%q) = %q ends with a trailing slash", host, result)
		}
	})
}
