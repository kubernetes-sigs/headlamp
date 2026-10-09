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
	"net/http"
)

type allowlistContextKey struct{}

const maxRedirects = 10

func newTransport() http.RoundTripper {
	defaultTransport, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		return &http.Transport{
			DisableCompression: true,
		}
	}

	transport := defaultTransport.Clone()
	transport.DisableCompression = true

	return transport
}

// NewHTTPClient returns an HTTP client that follows redirects only when the
// redirect target matches the allowlist stored in the request context.
func NewHTTPClient() *http.Client {
	return &http.Client{
		Transport: newTransport(),
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= maxRedirects {
				return fmt.Errorf("stopped after %d redirects", maxRedirects)
			}

			allowlist, ok := req.Context().Value(allowlistContextKey{}).([]AllowlistEntry)
			if !ok || len(allowlist) == 0 {
				return http.ErrUseLastResponse
			}

			if err := validateProxyURL(req.URL); err != nil {
				return fmt.Errorf("redirect target is invalid: %w", err)
			}

			if !MatchesAllowlist(req.URL.String(), allowlist) {
				return fmt.Errorf("redirect target not in allowlist")
			}

			return nil
		},
	}
}
