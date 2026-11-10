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
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"os"
	"strings"
)

const (
	backendTokenHeader         = "X-HEADLAMP_BACKEND-TOKEN"                         // #nosec G101
	backendTokenProtocolPrefix = "base64url.headlamp.backend.authorization.k8s.io." // #nosec G101
)

// CheckBackendToken verifies that a request carries the token configured by the desktop app.
func CheckBackendToken(useInCluster bool, w http.ResponseWriter, r *http.Request) error {
	backendTokenEnv := os.Getenv("HEADLAMP_BACKEND_TOKEN")
	// An empty token leaves the optional desktop trust boundary disabled for
	// standalone development and test servers; configuring a token opts in.
	if useInCluster || backendTokenEnv == "" {
		return nil
	}

	backendTokens := r.Header.Values(backendTokenHeader)

	if len(backendTokens) != 1 ||
		subtle.ConstantTimeCompare([]byte(backendTokens[0]), []byte(backendTokenEnv)) != 1 {
		http.Error(w, "access denied", http.StatusForbidden)
		return errors.New("X-HEADLAMP_BACKEND-TOKEN does not match HEADLAMP_BACKEND_TOKEN")
	}

	return nil
}

// NewBackendTokenMiddleware protects API requests when the desktop app configures
// a per-launch token and removes the private credential before forwarding.
func NewBackendTokenMiddleware(useInCluster bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if useInCluster || os.Getenv("HEADLAMP_BACKEND_TOKEN") == "" {
				next.ServeHTTP(w, r)
				return
			}

			if len(r.Header.Values(backendTokenHeader)) > 1 {
				http.Error(w, "access denied", http.StatusForbidden)
				return
			}

			if err := consumeBackendTokenProtocol(r); err != nil {
				http.Error(w, "access denied", http.StatusForbidden)
				return
			}

			if err := CheckBackendToken(false, w, r); err != nil {
				return
			}

			r.Header.Del(backendTokenHeader)
			next.ServeHTTP(w, r)
		})
	}
}

// consumeBackendTokenProtocol extracts one base64url-encoded backend token from
// the private WebSocket subprotocol, rejects conflicting credential transports,
// and sets the decoded token header used by CheckBackendToken. It removes the
// private credential protocol while preserving public protocols for downstream
// WebSocket negotiation.
func consumeBackendTokenProtocol(r *http.Request) error {
	protocolHeader := strings.Join(r.Header.Values("Sec-WebSocket-Protocol"), ",")
	if protocolHeader == "" {
		return nil
	}

	var (
		backendToken string
		protocols    []string
	)

	for _, protocol := range strings.Split(protocolHeader, ",") {
		protocol = strings.TrimSpace(protocol)
		if !strings.HasPrefix(protocol, backendTokenProtocolPrefix) {
			protocols = append(protocols, protocol)
			continue
		}

		if backendToken != "" {
			return errors.New("multiple backend token protocols")
		}

		encodedToken := strings.TrimPrefix(protocol, backendTokenProtocolPrefix)

		decodedToken, err := base64.RawURLEncoding.DecodeString(encodedToken)
		if err != nil || len(decodedToken) == 0 {
			return errors.New("invalid backend token protocol")
		}

		backendToken = string(decodedToken)
	}

	if backendToken == "" {
		return nil
	}

	if headerToken := r.Header.Get(backendTokenHeader); headerToken != "" && headerToken != backendToken {
		return errors.New("conflicting backend token transports")
	}

	r.Header.Set(backendTokenHeader, backendToken)

	if len(protocols) == 0 {
		r.Header.Del("Sec-WebSocket-Protocol")
	} else {
		r.Header.Set("Sec-WebSocket-Protocol", strings.Join(protocols, ", "))
	}

	return nil
}
