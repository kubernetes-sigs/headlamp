package spa

import (
	"path/filepath"
	"strings"
)

// urlToRel converts a URL path to a relative OS path for use with os.Root.
//
// Three checks are applied in order:
//  1. Backslash rejection — a backslash is a path separator on Windows and
//     could be used for traversal.
//  2. Leading-slash stripping — URL paths begin with '/'; the result must be
//     relative so it can be passed to os.Root.
//  3. Parent-escape rejection — after cleaning (which resolves any ".."
//     components), any path that escapes the root directory is rejected.
//     os.Root enforces containment at the OS level, but detecting escapes
//     here lets us return 400 Bad Request rather than an internal error.
//
// Returns ("", false) when the path must be rejected.
func urlToRel(urlPath string) (string, bool) {
	if strings.ContainsRune(urlPath, '\\') {
		return "", false
	}

	rel := filepath.Clean(filepath.FromSlash(strings.TrimLeft(urlPath, "/")))

	// Reject absolute or volume-qualified paths (for example, "C:..." on
	// Windows) so URL paths cannot resolve outside the root.
	if filepath.IsAbs(rel) || filepath.VolumeName(rel) != "" || hasWindowsDrivePrefix(rel) {
		return "", false
	}

	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false
	}

	return rel, true
}

func hasWindowsDrivePrefix(p string) bool {
	if len(p) < 2 || p[1] != ':' {
		return false
	}

	c := p[0]

	return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')
}
