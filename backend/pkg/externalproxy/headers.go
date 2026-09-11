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
	"net/http"
	"strings"
)

// ShouldFilterRequestHeader reports whether a browser request header must not be
// forwarded to an external proxy target.
//
// Filtered headers include credentials, Headlamp-internal routing headers
// (both X-Headlamp-* and X-HEADLAMP_* forms), and hop-by-hop protocol headers.
func ShouldFilterRequestHeader(headerName string) bool {
	hLower := strings.ToLower(headerName)

	if hLower == "authorization" ||
		hLower == "cookie" ||
		hLower == "accept-encoding" ||
		hLower == "proxy-authorization" ||
		strings.HasPrefix(hLower, "x-headlamp-") ||
		strings.HasPrefix(hLower, "x-headlamp_") {
		return true
	}

	switch hLower {
	case "connection",
		"forward-to",
		"keep-alive",
		"proxy-connection",
		"proxy-to",
		"te",
		"trailer",
		"transfer-encoding",
		"upgrade":
		return true
	default:
		return false
	}
}

// ConnectionHeaderTokens returns lowercased header names listed in Connection.
func ConnectionHeaderTokens(headers http.Header) map[string]struct{} {
	tokens := map[string]struct{}{}

	for _, headerValue := range headers.Values("Connection") {
		for _, token := range strings.Split(headerValue, ",") {
			token = strings.ToLower(strings.TrimSpace(token))
			if token != "" {
				tokens[token] = struct{}{}
			}
		}
	}

	return tokens
}

// CopyFilteredHeaders copies non-sensitive request headers into dst.
func CopyFilteredHeaders(dst http.Header, src http.Header) {
	connectionTokens := ConnectionHeaderTokens(src)

	for name, values := range src {
		if ShouldFilterRequestHeader(name) {
			continue
		}

		if _, ok := connectionTokens[strings.ToLower(name)]; ok {
			continue
		}

		dst[name] = values
	}
}
