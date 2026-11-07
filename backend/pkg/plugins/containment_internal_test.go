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

package plugins

import (
	"path/filepath"
	"testing"
)

// isSubdirectory guards two paths that take a plugin name from a request, so the
// escapes below are the cases that matter. The names beginning with a dot are here
// because the previous implementation rejected them, and they are legal directory
// names a plugin author may pick.
func TestIsSubdirectory(t *testing.T) {
	base := filepath.FromSlash("/plugins")

	tests := []struct {
		name  string
		child string
		want  bool
	}{
		{name: "plain child", child: "normal", want: true},
		{name: "nested child", child: "a/b", want: true},
		{name: "traversal that resolves back inside", child: "a/../b", want: true},

		{name: "leading dot is a legal name", child: ".hidden", want: true},
		{name: "leading double dot is a legal name", child: "..foo", want: true},
		{name: "three dots is a legal name", child: "...", want: true},

		{name: "parent", child: "..", want: false},
		{name: "escape", child: "../escape", want: false},
		{name: "escape from a nested path", child: "a/../../escape", want: false},
		{name: "the directory itself", child: ".", want: false},
		{name: "empty name resolves to the directory itself", child: "", want: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := isSubdirectory(base, filepath.Join(base, tc.child))
			if got != tc.want {
				t.Errorf("isSubdirectory(%q, %q) = %v, want %v", base, tc.child, got, tc.want)
			}
		})
	}
}

// The previous check compared string prefixes against the whole relative path, so its
// answer for the same directory name changed with nesting depth: "..foo" was rejected
// and "sub/..foo" was accepted. Both are children and both must be accepted.
func TestIsSubdirectoryDoesNotDependOnDepth(t *testing.T) {
	base := filepath.FromSlash("/plugins")

	shallow := isSubdirectory(base, filepath.Join(base, "..foo"))
	nested := isSubdirectory(base, filepath.Join(base, "sub", "..foo"))

	if shallow != nested {
		t.Errorf("same directory name judged differently by depth: %q=%v, %q=%v",
			"..foo", shallow, "sub/..foo", nested)
	}
}

// Paths outside the tree are rejected however they are written, including a sibling
// whose name starts with the parent's name.
func TestIsSubdirectoryRejectsOutsidePaths(t *testing.T) {
	base := filepath.FromSlash("/plugins")

	for _, outside := range []string{"/etc/passwd", "/plugins-evil/x", "/"} {
		p := filepath.FromSlash(outside)
		if isSubdirectory(base, p) {
			t.Errorf("isSubdirectory(%q, %q) = true, want false", base, p)
		}
	}
}
