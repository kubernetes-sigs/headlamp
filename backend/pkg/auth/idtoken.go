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

package auth

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
)

// discoveryTimeout bounds the OIDC provider discovery request, so a stalled issuer cannot block
// a verification request -- and every other request waiting on the same mutex -- forever. It is
// a var, not a const, so tests can shorten it rather than waiting out a real-sized timeout.
var discoveryTimeout = 10 * time.Second

// IDTokenVerifier checks OIDC ID tokens against the identity provider's signing keys,
// so claims are only trusted once the signature, issuer, audience and expiry are verified.
type IDTokenVerifier struct {
	issuerURL          string
	validatorIssuerURL string
	clientID           string
	skipTLSVerify      bool
	caCert             string

	mu       sync.Mutex
	verifier *oidc.IDTokenVerifier
}

// NewIDTokenVerifier returns a verifier for tokens issued by issuerURL to clientID. The
// provider is discovered on first use and retried on later uses if discovery fails.
func NewIDTokenVerifier(
	issuerURL, validatorIssuerURL, clientID string, skipTLSVerify bool, caCert string,
) *IDTokenVerifier {
	return &IDTokenVerifier{
		issuerURL:          issuerURL,
		validatorIssuerURL: validatorIssuerURL,
		clientID:           clientID,
		skipTLSVerify:      skipTLSVerify,
		caCert:             caCert,
	}
}

// Verify returns the claims of rawToken if it is a valid, unexpired ID token signed by the
// identity provider for this client. Any other token is rejected.
func (v *IDTokenVerifier) Verify(ctx context.Context, rawToken string) (map[string]interface{}, error) {
	verifier, err := v.keyVerifier()
	if err != nil {
		return nil, err
	}

	idToken, err := verifier.Verify(ctx, rawToken)
	if err != nil {
		return nil, fmt.Errorf("verifying ID token: %w", err)
	}

	var claims map[string]interface{}
	if err := idToken.Claims(&claims); err != nil {
		return nil, fmt.Errorf("decoding ID token claims: %w", err)
	}

	return claims, nil
}

func (v *IDTokenVerifier) keyVerifier() (*oidc.IDTokenVerifier, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	if v.verifier != nil {
		return v.verifier, nil
	}

	// The provider keeps its key set (and its TLS client) for later requests, so it is built
	// from a context that outlives any single request.
	var caCert *string
	if v.caCert != "" {
		caCert = &v.caCert
	}

	skipTLSVerify := v.skipTLSVerify

	// A timeout-bound client by default, so a stalled issuer cannot hang a signing-key fetch
	// forever even without custom TLS settings. ConfigureTLSContext overrides this with its own
	// client (also timeout-bound) when skip-TLS or a custom CA is configured.
	ctx := oidc.ClientContext(context.Background(), &http.Client{Timeout: oidcHTTPClientTimeout})
	ctx = ConfigureTLSContext(ctx, &skipTLSVerify, caCert)

	if v.validatorIssuerURL != "" {
		ctx = oidc.InsecureIssuerURLContext(ctx, v.validatorIssuerURL)
	}

	// Discovery gets an additional, tighter deadline of its own: go-oidc keeps the *http.Client
	// found via ctx (not ctx itself, whose deadline does not carry over) for the signing-key
	// refreshes a Verifier does later, each on its own context.Background() -- those stay
	// bounded only by the client's own Timeout set above.
	discoverCtx, cancel := context.WithTimeout(ctx, discoveryTimeout)
	defer cancel()

	provider, err := oidc.NewProvider(discoverCtx, v.issuerURL)
	if err != nil {
		return nil, fmt.Errorf("getting OIDC provider: %w", err)
	}

	v.verifier = provider.Verifier(&oidc.Config{ClientID: v.clientID})

	return v.verifier, nil
}
