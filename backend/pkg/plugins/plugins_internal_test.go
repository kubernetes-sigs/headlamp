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
	"runtime"
	"testing"
)

func TestIsSubdirectory(t *testing.T) {
	parent := filepath.FromSlash("/plugins")

	testCases := []struct {
		name string
		dir  string
		want bool
	}{
		{name: "normal child", dir: filepath.Join(parent, "my-plugin"), want: true},
		{name: "hidden child", dir: filepath.Join(parent, ".my-plugin"), want: true},
		{name: "leading double dot is a legal name", dir: filepath.Join(parent, "..foo"), want: true},
		{name: "nested child", dir: filepath.Join(parent, "my-plugin", "sub"), want: true},
		{name: "hidden nested child", dir: filepath.Join(parent, ".my-plugin", "sub"), want: true},
		{name: "traversal that resolves back inside", dir: filepath.Join(parent, "a", "..", "b"), want: true},
		{name: "three dots is valid on unix only", dir: filepath.Join(parent, "..."), want: runtime.GOOS != "windows"},
		{name: "dot space is valid on unix only", dir: filepath.Join(parent, ". "), want: runtime.GOOS != "windows"},
		{name: "root itself", dir: parent, want: false},
		{name: "empty child", dir: filepath.Join(parent, ""), want: false},
		{name: "parent escape", dir: filepath.Join(parent, "..", "etc"), want: false},
		{name: "escape from nested path", dir: filepath.Join(parent, "a", "..", "..", "escape"), want: false},
		{name: "parent directory", dir: filepath.Join(parent, ".."), want: false},
		{name: "sibling prefix path", dir: filepath.FromSlash("/plugins-evil/x"), want: false},
		{name: "unrelated outside path", dir: filepath.FromSlash("/etc/passwd"), want: false},
		{name: "filesystem root", dir: filepath.FromSlash("/"), want: false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := isSubdirectory(parent, tc.dir)
			if got != tc.want {
				t.Fatalf("isSubdirectory(%q, %q) = %v, want %v", parent, tc.dir, got, tc.want)
			}
		})
	}
}

func TestIsSubdirectoryDoesNotDependOnDepth(t *testing.T) {
	parent := filepath.FromSlash("/plugins")

	shallow := isSubdirectory(parent, filepath.Join(parent, "..foo"))
	nested := isSubdirectory(parent, filepath.Join(parent, "sub", "..foo"))

	if shallow != nested {
		t.Fatalf("same directory name judged differently by depth: %q=%v, %q=%v",
			"..foo", shallow, "sub/..foo", nested)
	}
}

func TestHasWindowsDotAlias(t *testing.T) {
	testCases := []struct {
		rel  string
		want bool
	}{
		{rel: "...", want: true},
		{rel: ". ", want: true},
		{rel: ".. ", want: true},
		{rel: `sub\...`, want: true},
		{rel: "sub/. ", want: true},
		{rel: ".hidden", want: false},
		{rel: "..foo", want: false},
		{rel: "sub/..foo", want: false},
	}

	for _, tc := range testCases {
		t.Run(tc.rel, func(t *testing.T) {
			if got := hasWindowsDotAlias(tc.rel); got != tc.want {
				t.Fatalf("hasWindowsDotAlias(%q) = %v, want %v", tc.rel, got, tc.want)
			}
		})
	}
}
