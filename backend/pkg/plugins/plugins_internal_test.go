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
	"os"
	"path/filepath"
	"runtime"
	"strings"
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

func TestTryDeletePluginValidatesSubdirectoryBeforeStat(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "plugins")
	outsideDir := filepath.Join(root, "outside")
	outsideFile := filepath.Join(root, "outside-file")

	for _, d := range []string{dir, outsideDir} {
		if err := os.MkdirAll(d, 0o750); err != nil {
			t.Fatalf("mkdir %q: %v", d, err)
		}
	}

	if err := os.WriteFile(outsideFile, []byte("x"), 0o600); err != nil {
		t.Fatalf("write %q: %v", outsideFile, err)
	}

	testCases := []struct {
		name      string
		filename  string
		mustExist string
	}{
		{name: "non-existent traversal", filename: "../nonexistent"},
		{name: "existing outside directory", filename: "../outside", mustExist: outsideDir},
		{name: "traversal through outside regular file", filename: "../outside-file/secret", mustExist: outsideFile},
		{name: "nested escape", filename: "sub/../../nonexistent"},
		{name: "empty filename", filename: "", mustExist: dir},
		{name: "current dir", filename: ".", mustExist: dir},
		{name: "parent dir", filename: "..", mustExist: dir},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			deleted, err := tryDeletePlugin(dir, tc.filename)
			if deleted {
				t.Fatalf("tryDeletePlugin(%q, %q) deleted = true, want false", dir, tc.filename)
			}

			if err == nil || !strings.Contains(err.Error(), "is not a subdirectory of") {
				t.Fatalf("tryDeletePlugin(%q, %q) err = %v, want subdirectory error", dir, tc.filename, err)
			}

			if tc.mustExist != "" {
				if _, statErr := os.Stat(tc.mustExist); statErr != nil {
					t.Fatalf("expected %q to still exist: %v", tc.mustExist, statErr)
				}
			}
		})
	}
}

func TestTryDeletePluginValidPaths(t *testing.T) {
	dir := t.TempDir()

	if deleted, err := tryDeletePlugin("", "../escape"); deleted || err != nil {
		t.Fatalf("tryDeletePlugin(\"\", \"../escape\") = (%v, %v), want (false, nil)", deleted, err)
	}

	if deleted, err := tryDeletePlugin(dir, "missing-plugin"); deleted || err != nil {
		t.Fatalf("tryDeletePlugin(dir, \"missing-plugin\") = (%v, %v), want (false, nil)", deleted, err)
	}

	for _, name := range []string{"valid-plugin", "..foo"} {
		target := filepath.Join(dir, name)
		if err := os.MkdirAll(target, 0o750); err != nil {
			t.Fatalf("mkdir %q: %v", target, err)
		}

		deleted, err := tryDeletePlugin(dir, name)
		if !deleted || err != nil {
			t.Fatalf("tryDeletePlugin(dir, %q) = (%v, %v), want (true, nil)", name, deleted, err)
		}

		if _, statErr := os.Stat(target); !os.IsNotExist(statErr) {
			t.Fatalf("expected %q to be deleted, stat err = %v", target, statErr)
		}
	}
}

func TestTryDeletePluginFilesystemErrors(t *testing.T) {
	t.Run("os.Stat non-IsNotExist error", func(t *testing.T) {
		if runtime.GOOS == "windows" {
			t.Skip("ENOTDIR behavior for file-as-dir is Unix-specific")
		}

		fileAsDir := filepath.Join(t.TempDir(), "not-a-dir")
		if err := os.WriteFile(fileAsDir, []byte("x"), 0o600); err != nil {
			t.Fatalf("write %q: %v", fileAsDir, err)
		}

		deleted, err := tryDeletePlugin(fileAsDir, "child")
		if deleted || err == nil || strings.Contains(err.Error(), "is not a subdirectory of") {
			t.Fatalf("tryDeletePlugin(fileAsDir, \"child\") = (%v, %v), want os.Stat error", deleted, err)
		}
	})

	t.Run("os.RemoveAll error", func(t *testing.T) {
		if runtime.GOOS == "windows" || os.Geteuid() == 0 {
			t.Skip("directory permission test requires non-root Unix")
		}

		dir := filepath.Join(t.TempDir(), "readonly-plugins")
		target := filepath.Join(dir, "locked-plugin")

		if err := os.MkdirAll(target, 0o750); err != nil {
			t.Fatalf("mkdir %q: %v", target, err)
		}

		if err := os.Chmod(dir, 0o500); err != nil { //nolint:gosec // Make temp dir read-only to test os.RemoveAll error.
			t.Fatalf("chmod %q: %v", dir, err)
		}

		t.Cleanup(func() {
			_ = os.Chmod(dir, 0o700) //nolint:gosec // Restore temp directory permissions for cleanup.
		})

		deleted, err := tryDeletePlugin(dir, "locked-plugin")
		if deleted || err == nil {
			t.Fatalf("tryDeletePlugin(dir, \"locked-plugin\") = (%v, %v), want permission error", deleted, err)
		}
	})
}
