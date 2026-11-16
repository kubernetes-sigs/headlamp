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

func TestIsSubdirectory(t *testing.T) {
	parent := filepath.Join(string(filepath.Separator), "plugins")

	testCases := []struct {
		name string
		dir  string
		want bool
	}{
		{name: "normal child", dir: filepath.Join(parent, "my-plugin"), want: true},
		{name: "hidden child", dir: filepath.Join(parent, ".my-plugin"), want: true},
		{name: "nested child", dir: filepath.Join(parent, "my-plugin", "sub"), want: true},
		{name: "hidden nested child", dir: filepath.Join(parent, ".my-plugin", "sub"), want: true},
		{name: "root itself", dir: parent, want: false},
		{name: "parent escape", dir: filepath.Join(parent, "..", "etc"), want: false},
		{name: "parent directory", dir: filepath.Join(parent, ".."), want: false},
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
