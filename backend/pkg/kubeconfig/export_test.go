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

package kubeconfig

import "net/http"

// This file exports internal functions and types for testing purposes only.
// These exports are only available during testing and won't be included in production builds.

// BuildUserAgent is exported for testing.
var BuildUserAgent = buildUserAgent

var DeriveInClusterName = deriveInClusterName

// ResolveKubeconfigPaths is exported for testing.
var ResolveKubeconfigPaths = resolveKubeconfigPaths

// SyncContexts is exported for testing.
var SyncContexts = syncContexts

// ReAddMissingFiles is exported for testing.
var ReAddMissingFiles = reAddMissingFiles

// ParseAPIProxyConfig is exported for testing.
var ParseAPIProxyConfig = parseAPIProxyConfig

// NewFileWatcher is exported for testing.
var NewFileWatcher = newFileWatcher

// UserAgentRoundTripper is exported for testing.
type UserAgentRoundTripper struct {
	Base      roundTripperInterface
	UserAgent string
}

type roundTripperInterface interface {
	RoundTrip(*http.Request) (*http.Response, error)
}

// RoundTrip implements the http.RoundTripper interface.
func (rt *UserAgentRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	urt := &userAgentRoundTripper{
		base:      rt.Base,
		userAgent: rt.UserAgent,
	}

	return urt.RoundTrip(req)
}

// ExecCredentialRetryRoundTripper is exported for testing.
type ExecCredentialRetryRoundTripper struct {
	Base roundTripperInterface
}

// RoundTrip implements the http.RoundTripper interface.
func (rt *ExecCredentialRetryRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	retryRT := &execCredentialRetryRoundTripper{base: rt.Base}

	return retryRT.RoundTrip(req)
}
