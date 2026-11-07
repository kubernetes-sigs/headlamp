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
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
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

// TestIDTokenVerifier_ConcurrentDiscoveryCoalescesIntoOneRequest locks in a fix for a gap
// where a slow or failing issuer's discovery call held keyVerifier's lock for the whole
// attempt (up to discoveryTimeout): every other, otherwise unrelated, verification request
// would queue up behind that one lock, turning one stalled issuer into an outage for every
// request this process was handling. Discovery now runs outside that lock, coalesced through a
// singleflight group so concurrent callers still share one discovery attempt rather than each
// firing their own.
func TestIDTokenVerifier_ConcurrentDiscoveryCoalescesIntoOneRequest(t *testing.T) {
	t.Parallel()

	var hits atomic.Int32

	gate := make(chan struct{})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		<-gate
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	verifier := newTestVerifier(srv.URL)

	const concurrency = 5

	var wg sync.WaitGroup

	for range concurrency {
		wg.Add(1)

		go func() {
			defer wg.Done()

			_, _ = verifier.Verify(t.Context(), "irrelevant-token")
		}()
	}

	require.Eventually(t, func() bool { return hits.Load() >= 1 }, time.Second, 5*time.Millisecond)

	// singleflight.Do blocks every other caller on the single in-flight call for this key, so
	// as long as the one request already in has not been released, hits cannot have advanced
	// past 1 regardless of how many of the concurrency goroutines have reached Verify by now.
	assert.EqualValues(t, 1, hits.Load(),
		"concurrent callers during an outage must coalesce into a single discovery request, not one each")

	close(gate)
	wg.Wait()

	assert.EqualValues(t, 1, hits.Load(), "releasing the shared call must not trigger any further request")
}
