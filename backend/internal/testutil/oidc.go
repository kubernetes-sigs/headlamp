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

package testutil

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

const fakeOIDCKeyID = "test-key"

// FakeOIDCIssuer is an OpenID Connect identity provider with a single RSA signing key. It
// serves discovery and JWKS documents, so the production verifier can check tokens it signs.
type FakeOIDCIssuer struct {
	URL string

	key *rsa.PrivateKey

	// BeforeDiscovery, if set, is called synchronously at the start of each discovery
	// request, before the response is written, with that request. Tests use it to simulate
	// a slow or intermittently unresponsive issuer. A hook that blocks should watch
	// r.Context().Done() so it unblocks as soon as the client gives up, rather than only on
	// a fixed delay: this server's Close() waits for in-flight handlers to return, so a
	// delay that outlives the client making the test's own cleanup wait for it too.
	BeforeDiscovery func(r *http.Request)

	// BeforeKeys is BeforeDiscovery's counterpart for the JWKS endpoint, so tests can also
	// simulate a stalled or intermittently unresponsive signing-key fetch.
	BeforeKeys func(r *http.Request)
}

// NewFakeOIDCIssuer starts a fake issuer that is shut down when the test finishes.
func NewFakeOIDCIssuer(t *testing.T) *FakeOIDCIssuer {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	issuer := &FakeOIDCIssuer{key: key}

	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		if issuer.BeforeDiscovery != nil {
			issuer.BeforeDiscovery(r)
		}

		writeJSONDocument(w, map[string]interface{}{
			"issuer":                                issuer.URL,
			"jwks_uri":                              issuer.URL + "/keys",
			"authorization_endpoint":                issuer.URL + "/auth",
			"token_endpoint":                        issuer.URL + "/token",
			"id_token_signing_alg_values_supported": []string{"RS256"},
		})
	})
	mux.HandleFunc("/keys", func(w http.ResponseWriter, r *http.Request) {
		if issuer.BeforeKeys != nil {
			issuer.BeforeKeys(r)
		}

		writeJSONDocument(w, map[string]interface{}{
			"keys": []map[string]string{{
				"kty": "RSA",
				"alg": "RS256",
				"use": "sig",
				"kid": fakeOIDCKeyID,
				"n":   base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
				"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
			}},
		})
	})

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	issuer.URL = server.URL

	return issuer
}

// Sign returns an RS256 ID token carrying claims, signed with the issuer's key.
func (f *FakeOIDCIssuer) Sign(t *testing.T, claims map[string]interface{}) string {
	t.Helper()

	header := map[string]string{"alg": "RS256", "typ": "JWT", "kid": fakeOIDCKeyID}

	signingInput := encodeSegment(t, header) + "." + encodeSegment(t, claims)

	digest := sha256.Sum256([]byte(signingInput))

	signature, err := rsa.SignPKCS1v15(rand.Reader, f.key, crypto.SHA256, digest[:])
	require.NoError(t, err)

	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature)
}

func encodeSegment(t *testing.T, value interface{}) string {
	t.Helper()

	data, err := json.Marshal(value)
	require.NoError(t, err)

	return base64.RawURLEncoding.EncodeToString(data)
}

func writeJSONDocument(w http.ResponseWriter, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}
