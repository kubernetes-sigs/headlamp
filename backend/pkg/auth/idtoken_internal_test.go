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

// This file is package auth (whitebox), not auth_test, because it needs to shorten the
// unexported discoveryTimeout so the test does not have to wait out a real-sized one.
package auth

import (
	"context"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/internal/testutil"
	"github.com/stretchr/testify/require"
)

// testStalledIssuerRecovery is the shared body behind TestIDTokenVerifier_RecoversAfterStalledDiscovery
// and TestIDTokenVerifier_RecoversAfterStalledJWKS: arm, through armStall, a one-shot stall on
// whichever fake-issuer endpoint that test is targeting, then check that the stall neither blocks
// past the shortened timeout the caller has already set up nor permanently breaks the verifier --
// a later attempt, once the issuer responds promptly, must succeed.
//
// This intentionally does not assert on elapsed wall-clock time: CI runs this on architectures
// under heavy emulation (for example ppc64le via QEMU), where even a short, correctly-bounded
// deadline can take far longer in wall-clock terms than on native hardware, which would make a
// tight time bound here flaky rather than meaningful. The functional outcome -- an error from
// the stalled attempt, success from the one after it -- already proves it was the shortened
// timeout that cut the first attempt short, without depending on how fast that happens to be on
// any given runner.
func testStalledIssuerRecovery(
	t *testing.T, armStall func(issuer *testutil.FakeOIDCIssuer, onStall func(r *http.Request)),
) {
	t.Helper()

	const clientID = "headlamp"

	issuer := testutil.NewFakeOIDCIssuer(t)

	var attempts int32

	armStall(issuer, func(r *http.Request) {
		// Only the first attempt stalls; later ones respond immediately, simulating a
		// transient issuer hiccup. The stall unblocks as soon as the client gives up
		// (r.Context().Done()) rather than waiting out the full safety-cap delay, so this
		// does not hold up the fake issuer's own shutdown once the test is done.
		if atomic.AddInt32(&attempts, 1) == 1 {
			select {
			case <-r.Context().Done():
			case <-time.After(30 * time.Second):
			}
		}
	})

	token := issuer.Sign(t, map[string]interface{}{
		"iss": issuer.URL,
		"aud": clientID,
		"sub": "alice",
		"iat": float64(time.Now().Unix()),
		"exp": float64(time.Now().Add(time.Hour).Unix()),
	})

	verifier := NewIDTokenVerifier(issuer.URL, "", clientID, false, "")

	_, err := verifier.Verify(context.Background(), token)
	require.Error(t, err, "a stalled issuer must not block verification forever")

	_, err = verifier.Verify(context.Background(), token)
	require.NoError(t, err, "verification must recover once the issuer responds promptly")
}

// TestIDTokenVerifier_RecoversAfterStalledDiscovery checks that a discovery request bound by
// discoveryTimeout neither blocks past it nor permanently breaks the verifier.
func TestIDTokenVerifier_RecoversAfterStalledDiscovery(t *testing.T) {
	original := discoveryTimeout
	discoveryTimeout = 50 * time.Millisecond

	t.Cleanup(func() { discoveryTimeout = original })

	testStalledIssuerRecovery(t, func(issuer *testutil.FakeOIDCIssuer, onStall func(r *http.Request)) {
		issuer.BeforeDiscovery = onStall
	})
}

// TestIDTokenVerifier_RecoversAfterStalledJWKS checks that a stalled signing-key fetch is bound
// too, not just discovery. go-oidc shares one in-flight key fetch across every verification
// waiting on it, so a background fetch stuck on a client with no timeout would block all of
// them, with no way for an individual caller's own context to unblock it.
func TestIDTokenVerifier_RecoversAfterStalledJWKS(t *testing.T) {
	original := oidcHTTPClientTimeout
	oidcHTTPClientTimeout = 50 * time.Millisecond

	t.Cleanup(func() { oidcHTTPClientTimeout = original })

	testStalledIssuerRecovery(t, func(issuer *testutil.FakeOIDCIssuer, onStall func(r *http.Request)) {
		issuer.BeforeKeys = onStall
	})
}
