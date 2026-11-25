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

package spa

import (
	"path/filepath"
	"testing"
)

func TestURLToRelRejectsUnsafePaths(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{name: "parent escape", path: "/../outside.txt"},
		{name: "backslash separator", path: `/headlamp\\..\\..\\etc\\passwd`},
		{name: "windows volume path", path: "/C:/Windows/system32"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if rel, ok := urlToRel(tc.path); ok {
				t.Fatalf("expected path %q to be rejected, got rel=%q", tc.path, rel)
			}
		})
	}
}

func TestURLToRelAcceptsSafeRelativePath(t *testing.T) {
	rel, ok := urlToRel("/headlamp/assets/main.js")
	if !ok {
		t.Fatalf("expected safe path to be accepted")
	}

	// urlToRel returns an OS-relative path, so the expected value must use the
	// platform separator: "headlamp/assets/main.js" on Unix and
	// "headlamp\assets\main.js" on Windows.
	want := filepath.FromSlash("headlamp/assets/main.js")
	if rel != want {
		t.Fatalf("unexpected relative path: got %q, want %q", rel, want)
	}
}
