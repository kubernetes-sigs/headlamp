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
	"sync"

	"github.com/coreos/go-oidc/v3/oidc"
)

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
	ctx := ConfigureTLSContext(context.Background(), &skipTLSVerify, caCert)

	if v.validatorIssuerURL != "" {
		ctx = oidc.InsecureIssuerURLContext(ctx, v.validatorIssuerURL)
	}

	provider, err := oidc.NewProvider(ctx, v.issuerURL)
	if err != nil {
		return nil, fmt.Errorf("getting OIDC provider: %w", err)
	}

	v.verifier = provider.Verifier(&oidc.Config{ClientID: v.clientID})

	return v.verifier, nil
}
