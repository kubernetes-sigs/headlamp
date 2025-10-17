package kubeconfig

import "net/http"

// This file exports internal functions and types for testing purposes only.
// These exports are only available during testing and won't be included in production builds.

// BuildUserAgent is exported for testing.
var BuildUserAgent = buildUserAgent

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
