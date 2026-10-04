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

package auth_test

import (
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/internal/testutil"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testClientID = "headlamp"

func validClaims(issuerURL string) map[string]interface{} {
	return map[string]interface{}{
		"iss":    issuerURL,
		"aud":    testClientID,
		"sub":    "alice",
		"email":  "alice@example.com",
		"groups": []interface{}{"dev"},
		"iat":    float64(time.Now().Unix()),
		"exp":    float64(time.Now().Add(time.Hour).Unix()),
	}
}

func newTestVerifier(issuerURL string) *auth.IDTokenVerifier {
	return auth.NewIDTokenVerifier(issuerURL, "", testClientID, false, "")
}

func TestIDTokenVerifier_AcceptsSignedToken(t *testing.T) {
	t.Parallel()

	issuer := testutil.NewFakeOIDCIssuer(t)
	token := issuer.Sign(t, validClaims(issuer.URL))

	claims, err := newTestVerifier(issuer.URL).Verify(t.Context(), token)
	require.NoError(t, err)
	assert.Equal(t, "alice@example.com", claims["email"])
}

func TestIDTokenVerifier_RejectsTokenSignedByOtherKey(t *testing.T) {
	t.Parallel()

	issuer := testutil.NewFakeOIDCIssuer(t)
	attacker := testutil.NewFakeOIDCIssuer(t)

	// A forged token claims the trusted issuer but is signed with a different key.
	forged := attacker.Sign(t, validClaims(issuer.URL))

	_, err := newTestVerifier(issuer.URL).Verify(t.Context(), forged)
	require.Error(t, err)
}

func TestIDTokenVerifier_RejectsUnsignedToken(t *testing.T) {
	t.Parallel()

	issuer := testutil.NewFakeOIDCIssuer(t)
	unsigned := testutil.MakeUnsignedJWT(t, validClaims(issuer.URL))

	_, err := newTestVerifier(issuer.URL).Verify(t.Context(), unsigned)
	require.Error(t, err)
}

func TestIDTokenVerifier_RejectsExpiredToken(t *testing.T) {
	t.Parallel()

	issuer := testutil.NewFakeOIDCIssuer(t)

	claims := validClaims(issuer.URL)
	claims["exp"] = float64(time.Now().Add(-time.Hour).Unix())

	_, err := newTestVerifier(issuer.URL).Verify(t.Context(), issuer.Sign(t, claims))
	require.Error(t, err)
}

func TestIDTokenVerifier_RejectsWrongAudience(t *testing.T) {
	t.Parallel()

	issuer := testutil.NewFakeOIDCIssuer(t)

	claims := validClaims(issuer.URL)
	claims["aud"] = "some-other-client"

	_, err := newTestVerifier(issuer.URL).Verify(t.Context(), issuer.Sign(t, claims))
	require.Error(t, err)
}

func TestIDTokenVerifier_RejectsMalformedToken(t *testing.T) {
	t.Parallel()

	issuer := testutil.NewFakeOIDCIssuer(t)

	_, err := newTestVerifier(issuer.URL).Verify(t.Context(), "not-a-jwt")
	require.Error(t, err)
}
