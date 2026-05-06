/*
Copyright 2026 The Kubernetes Authors.

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

package auth

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// MaxReturnToLen is the maximum length, in bytes, of a returnTo value after
// URL-decoding. The bound is intentionally generous to accommodate deep-links
// with several query parameters while still rejecting payload-shaped inputs.
const MaxReturnToLen = 2048

// ErrReturnToInvalid is returned by ValidateReturnTo when the input does not
// satisfy the safety rules. Callers should treat the input as untrusted and
// not echo it back to users in error responses.
var ErrReturnToInvalid = errors.New("invalid returnTo")

// ValidateReturnTo validates a returnTo URL fragment intended for an in-app
// redirect after OIDC login.
//
// The returned string is the cleaned value (path + raw query, no fragment).
// If baseURL is non-empty, the validated path is required to live under
// baseURL's path prefix. baseURL is interpreted as a URL for prefix matching;
// only its path is consulted.
//
// Rules:
//   - must start with "/"
//   - reject scheme-relative ("//host") and absolute ("http://", "https://", etc.)
//   - reject encoded traversal: literal "..", "%2e%2e" (case-insensitive)
//   - reject control characters (\x00-\x1f, \x7f) anywhere in the input
//   - max MaxReturnToLen bytes after URL-decoding
//   - fragments are rejected (callers must strip them before calling)
func ValidateReturnTo(s, baseURL string) (string, error) {
	if s == "" {
		return "", fmt.Errorf("%w: empty", ErrReturnToInvalid)
	}

	if len(s) > MaxReturnToLen {
		return "", fmt.Errorf("%w: too long", ErrReturnToInvalid)
	}

	// Reject control characters in the raw form. Decoding can hide them.
	for _, r := range s {
		if r < 0x20 || r == 0x7f {
			return "", fmt.Errorf("%w: control character", ErrReturnToInvalid)
		}
	}

	// Encoded traversal — case-insensitive. We check the raw form so that
	// callers can't sneak ".." past us via percent-encoding even before
	// url.Parse normalizes it.
	lower := strings.ToLower(s)
	if strings.Contains(lower, "%2e%2e") {
		return "", fmt.Errorf("%w: encoded traversal", ErrReturnToInvalid)
	}

	// Must start with a single "/" — reject scheme-relative ("//host") up front.
	if !strings.HasPrefix(s, "/") {
		return "", fmt.Errorf("%w: must start with /", ErrReturnToInvalid)
	}

	if strings.HasPrefix(s, "//") {
		return "", fmt.Errorf("%w: scheme-relative", ErrReturnToInvalid)
	}

	// Parse and inspect the URL. url.Parse does not by itself reject schemes,
	// so we have to check explicitly. A leading "/" already rules out most
	// absolute forms, but be defensive against URL-parser quirks.
	u, err := url.Parse(s)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrReturnToInvalid, err)
	}

	if u.Scheme != "" || u.Host != "" || u.User != nil {
		return "", fmt.Errorf("%w: must be path-only", ErrReturnToInvalid)
	}

	if u.Fragment != "" || strings.Contains(s, "#") {
		return "", fmt.Errorf("%w: fragment not allowed", ErrReturnToInvalid)
	}

	// Decoded-length check. url.Parse percent-decodes the path; query stays raw.
	decoded := u.Path
	if u.RawQuery != "" {
		decoded += "?" + u.RawQuery
	}

	if len(decoded) > MaxReturnToLen {
		return "", fmt.Errorf("%w: too long after decoding", ErrReturnToInvalid)
	}

	// Literal traversal segments in the decoded path.
	for _, seg := range strings.Split(u.Path, "/") {
		if seg == ".." {
			return "", fmt.Errorf("%w: traversal", ErrReturnToInvalid)
		}
	}

	// baseURL prefix constraint. We compare normalized paths to avoid trivial
	// suffix-of-name attacks ("/foobar" passing a "/foo" prefix).
	if baseURL != "" {
		bu, err := url.Parse(baseURL)
		if err != nil {
			return "", fmt.Errorf("%w: bad baseURL: %v", ErrReturnToInvalid, err)
		}

		basePath := bu.Path
		if basePath == "" {
			basePath = "/"
		}

		if !pathHasPrefix(u.Path, basePath) {
			return "", fmt.Errorf("%w: outside baseURL", ErrReturnToInvalid)
		}
	}

	out := u.Path
	if u.RawQuery != "" {
		out += "?" + u.RawQuery
	}

	return out, nil
}

// pathHasPrefix reports whether p is at or under prefix on path-segment
// boundaries. "/foobar" does not have prefix "/foo"; "/foo/bar" does.
func pathHasPrefix(p, prefix string) bool {
	if prefix == "/" || prefix == "" {
		return strings.HasPrefix(p, "/")
	}

	prefix = strings.TrimRight(prefix, "/")
	if p == prefix {
		return true
	}

	return strings.HasPrefix(p, prefix+"/")
}
