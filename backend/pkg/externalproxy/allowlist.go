/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package externalproxy

import (
	"fmt"

	"github.com/gobwas/glob"
)

// AllowlistEntry is a compiled ProxyURLs pattern.
type AllowlistEntry struct {
	Pattern string
	Matcher glob.Glob
}

// CompileAllowlist compiles ProxyURLs glob patterns used by /externalproxy.
func CompileAllowlist(patterns []string) ([]AllowlistEntry, error) {
	entries := make([]AllowlistEntry, 0, len(patterns))

	for _, pattern := range patterns {
		matcher, err := glob.Compile(pattern)
		if err != nil {
			return nil, fmt.Errorf("compiling proxy URL pattern %q: %w", pattern, err)
		}

		entries = append(entries, AllowlistEntry{
			Pattern: pattern,
			Matcher: matcher,
		})
	}

	return entries, nil
}

// MatchesAllowlist reports whether proxyURL matches any allowlist entry.
func MatchesAllowlist(proxyURL string, allowlist []AllowlistEntry) bool {
	for _, entry := range allowlist {
		if entry.Matcher.Match(proxyURL) {
			return true
		}
	}

	return false
}
