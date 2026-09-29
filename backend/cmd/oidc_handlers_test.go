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

// Characterization tests for the /oidc and /oidc-callback handlers.
//
// These tests document the CURRENT behavior of the OIDC login handlers in
// headlamp.go. They make no production-code changes, and exist as a
// regression net for the OIDC login flow consolidation tracked in
// https://github.com/kubernetes-sigs/headlamp/issues/5401, in response to
// maintainer feedback there asking for more tests before any refactor.
//
// Existing tests in headlamp_test.go cover the OIDC state helpers as units
// (generateOidcState, evictExpiredOidcStates) and one handler error path.
// These tests instead drive both handlers end to end through the router, so
// a refactor that preserves the helpers but changes how they are wired is
// still caught.
//
// Coverage targets:
//
//   1. /oidc issues a 32-byte base64url random `state` parameter and
//      includes it in the IdP redirect URL; multiple calls produce
//      different states.
//   2. /oidc redirects to the configured IdP authorization endpoint with
//      the expected client_id, response_type, scope, and redirect_uri.
//   3. /oidc-callback with a missing `state` query param returns 400 with
//      body "invalid request state is empty".
//   4. /oidc-callback with an unknown state returns 400 with body
//      "invalid request".
//   5. /oidc-callback with valid state but a token-exchange failure
//      returns 500 with body "Failed to exchange token: ...".
//   6. After the state is consumed, replaying the same state returns 400
//      "invalid request" (single-use semantics).
//   7. State is scoped to the process that issued it: a state minted by
//      one handler instance is not accepted by another.
//   8. With OidcUsePKCE set, /oidc adds an S256 code_challenge to the
//      redirect and /oidc-callback sends the matching code_verifier on the
//      token exchange; without it, neither parameter is sent.
//
// Mocking strategy: each test spins up a small httptest.Server that
// implements the OIDC discovery + JWKS + token endpoints. The /token
// endpoint responses are configurable per test. We then wire a kubeconfig
// context whose OidcConf points at that server, build a HeadlampConfig +
// handler, and drive the handlers through the standard handler.ServeHTTP
// path.

package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

// oidcTestServer is a minimal mock OIDC provider exposing the discovery,
// JWKS, and token endpoints required to drive /oidc and /oidc-callback.
type oidcTestServer struct {
	server *httptest.Server
}

// newOIDCTestServer starts an in-process OIDC mock and returns a handle.
// If tokenHandler is nil, /token returns 500 (used for tests that only need
// to drive /oidc, not /oidc-callback).
func newOIDCTestServer(t *testing.T, tokenHandler http.HandlerFunc) *oidcTestServer {
	t.Helper()

	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		cfg := map[string]any{
			"issuer":                                srv.URL,
			"authorization_endpoint":                srv.URL + "/auth",
			"token_endpoint":                        srv.URL + "/token",
			"jwks_uri":                              srv.URL + "/jwks",
			"id_token_signing_alg_values_supported": []string{"RS256"},
		}
		if err := json.NewEncoder(w).Encode(cfg); err != nil {
			t.Errorf("encode discovery: %v", err)
		}
	})

	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if _, err := w.Write([]byte(`{"keys":[]}`)); err != nil {
			t.Errorf("write jwks: %v", err)
		}
	})

	if tokenHandler != nil {
		mux.HandleFunc("/token", tokenHandler)
	} else {
		mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		})
	}

	return &oidcTestServer{server: srv}
}

// URL returns the issuer URL of the mock OIDC server.
func (o *oidcTestServer) URL() string {
	return o.server.URL
}

// failingTokenHandler returns a /token handler that rejects every exchange,
// so callback tests reach the exchange step and fail there deterministically.
func failingTokenHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)

		_, _ = io.WriteString(w, `{"error":"invalid_grant"}`)
	}
}

// oidcTestOption customizes the HeadlampConfig built by newOIDCTestHandler.
type oidcTestOption func(*HeadlampConfig)

// withPKCE enables the OidcUsePKCE code path on the handler under test.
func withPKCE() oidcTestOption {
	return func(c *HeadlampConfig) { c.OidcUsePKCE = true }
}

// withStateReader replaces the reader backing OIDC state generation, so a
// test can force the state-generation failure path.
func withStateReader(r io.Reader) oidcTestOption {
	return func(c *HeadlampConfig) { c.oidcStateReader = r }
}

// newOIDCTestHandler builds a Headlamp handler with one OIDC-configured
// kubeconfig context whose IdP issuer points at the supplied mock server.
// Returns the handler and the cluster name registered.
func newOIDCTestHandler(t *testing.T, oidcSrv *oidcTestServer, opts ...oidcTestOption) (http.Handler, string) {
	t.Helper()

	const clusterName = "oidc-char-test"

	kubeConfigStore := kubeconfig.NewContextStore()

	err := kubeConfigStore.AddContext(&kubeconfig.Context{
		Name: clusterName,
		Cluster: &api.Cluster{
			Server: "https://test-cluster.example.com",
		},
		AuthInfo: &api.AuthInfo{},
		OidcConf: &kubeconfig.OidcConfig{
			ClientID:     "test-client-id",
			ClientSecret: "test-client-secret",
			IdpIssuerURL: oidcSrv.URL(),
			Scopes:       []string{"profile", "email"},
		},
		Source: kubeconfig.KubeConfig,
	})
	require.NoError(t, err)

	c := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				UseInCluster:    false,
				KubeConfigStore: kubeConfigStore,
			},
			Cache:            cache.New[interface{}](),
			TelemetryConfig:  GetDefaultTestTelemetryConfig(),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}

	for _, opt := range opts {
		opt(c)
	}

	return createHeadlampHandler(context.Background(), c), clusterName
}

// driveOIDCStart calls /oidc?cluster=<cluster> against the supplied handler
// and returns the redirect Location URL or fails the test.
func driveOIDCStart(t *testing.T, handler http.Handler, cluster string) *url.URL {
	t.Helper()

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet,
		"/oidc?cluster="+cluster, nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	require.Equal(t, http.StatusFound, rr.Code,
		"GET /oidc should 302 to the IdP; got %d body=%q", rr.Code, rr.Body.String())

	loc := rr.Header().Get("Location")
	require.NotEmpty(t, loc, "Location header missing on /oidc redirect")

	u, err := url.Parse(loc)
	require.NoError(t, err)

	return u
}

// extractState returns the `state` query parameter from a parsed URL,
// asserting non-empty.
func extractState(t *testing.T, u *url.URL) string {
	t.Helper()

	state := u.Query().Get("state")
	require.NotEmpty(t, state, "state parameter missing from %s", u.String())

	return state
}

// callOIDCCallback invokes /oidc-callback with the supplied query string
// against the given handler and returns the response.
func callOIDCCallback(t *testing.T, handler http.Handler, rawQuery string) *httptest.ResponseRecorder {
	t.Helper()

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet,
		"/oidc-callback?"+rawQuery, nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	return rr
}

// TestOIDCStart_StateIsRandom32Bytes covers target #1: each /oidc call
// issues a fresh, base64-url-encoded 32-byte random state.
func TestOIDCStart_StateIsRandom32Bytes(t *testing.T) {
	oidcSrv := newOIDCTestServer(t, nil)
	handler, cluster := newOIDCTestHandler(t, oidcSrv)

	seen := make(map[string]struct{})

	const calls = 5

	for i := 0; i < calls; i++ {
		loc := driveOIDCStart(t, handler, cluster)
		state := extractState(t, loc)

		// state is base64.RawURLEncoding-encoded; decode and assert 32 bytes.
		raw, err := base64.RawURLEncoding.DecodeString(state)
		require.NoError(t, err, "state %q should be base64.RawURLEncoding", state)
		require.Equal(t, 32, len(raw),
			"state should decode to 32 random bytes; got %d bytes", len(raw))

		_, dup := seen[state]
		require.False(t, dup, "state %q reused across /oidc calls (collision or bug)", state)
		seen[state] = struct{}{}
	}

	require.Len(t, seen, calls, "expected %d distinct states across %d calls", calls, calls)
}

// TestOIDCStart_RedirectsToIdP covers target #1 (continued): the redirect
// target is the configured IdP authorization endpoint and carries the
// expected client_id, response_type, scope, redirect_uri.
func TestOIDCStart_RedirectsToIdP(t *testing.T) {
	oidcSrv := newOIDCTestServer(t, nil)
	handler, cluster := newOIDCTestHandler(t, oidcSrv)

	loc := driveOIDCStart(t, handler, cluster)

	require.Equal(t, oidcSrv.URL()+"/auth", loc.Scheme+"://"+loc.Host+loc.Path,
		"redirect should point at the IdP authorization endpoint")

	q := loc.Query()
	assert.Equal(t, "test-client-id", q.Get("client_id"))
	assert.Equal(t, "code", q.Get("response_type"))
	assert.Contains(t, q.Get("scope"), "openid")
	assert.NotEmpty(t, q.Get("redirect_uri"), "redirect_uri must be set")
}

// TestOIDCCallback_MissingState covers target #3: calling /oidc-callback
// with no `state` query param returns 400 with the documented error body.
func TestOIDCCallback_MissingState(t *testing.T) {
	oidcSrv := newOIDCTestServer(t, nil)
	handler, _ := newOIDCTestHandler(t, oidcSrv)

	rr := callOIDCCallback(t, handler, "code=anything")

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid request state is empty",
		"body wording is part of the public contract; downstream tooling matches on it")
}

// TestOIDCCallback_UnknownState covers target #4: calling /oidc-callback
// with a state value that was never issued returns 400 "invalid request".
func TestOIDCCallback_UnknownState(t *testing.T) {
	oidcSrv := newOIDCTestServer(t, nil)
	handler, _ := newOIDCTestHandler(t, oidcSrv)

	rr := callOIDCCallback(t, handler, "state=never-issued&code=fake")

	assert.Equal(t, http.StatusBadRequest, rr.Code)

	body := strings.TrimSpace(rr.Body.String())
	assert.Equal(t, "invalid request", body,
		"body wording is part of the contract reproduced by the multi-replica failure mode")
}

// TestOIDCCallback_TokenExchangeFailure covers target #5: with a valid
// state but a token endpoint that fails, /oidc-callback returns 500 and
// the state is consumed (single-use, target #6 boundary case).
func TestOIDCCallback_TokenExchangeFailure(t *testing.T) {
	// /token endpoint deliberately rejects the exchange.
	oidcSrv := newOIDCTestServer(t, failingTokenHandler())
	handler, cluster := newOIDCTestHandler(t, oidcSrv)

	loc := driveOIDCStart(t, handler, cluster)
	state := extractState(t, loc)

	rr := callOIDCCallback(t, handler, fmt.Sprintf("state=%s&code=fake", state))

	assert.Equal(t, http.StatusInternalServerError, rr.Code,
		"token exchange failure should surface as 500")
	assert.Contains(t, rr.Body.String(), "Failed to exchange token",
		"error body should identify the failure stage; current handler echoes the IdP error")
}

// TestOIDCCallback_StateIsSingleUse covers target #6: a state is consumed
// once. The first callback (with our failing /token mock) returns 500;
// the second replay of the same state returns 400 "invalid request"
// because the entry was deleted on first use, regardless of the exchange
// outcome.
//
// The current handler deletes the map entry BEFORE the token exchange
// runs, so any subsequent replay misses the map regardless of whether the
// exchange succeeded.
func TestOIDCCallback_StateIsSingleUse(t *testing.T) {
	oidcSrv := newOIDCTestServer(t, failingTokenHandler())
	handler, cluster := newOIDCTestHandler(t, oidcSrv)

	loc := driveOIDCStart(t, handler, cluster)
	state := extractState(t, loc)

	// First call: state lookup succeeds, token exchange fails → 500.
	rr1 := callOIDCCallback(t, handler, fmt.Sprintf("state=%s&code=fake", state))
	require.Equal(t, http.StatusInternalServerError, rr1.Code,
		"sanity: first callback exercised the consumed code path")

	// Second call with the same state: lookup fails → 400 invalid request.
	rr2 := callOIDCCallback(t, handler, fmt.Sprintf("state=%s&code=fake", state))
	assert.Equal(t, http.StatusBadRequest, rr2.Code,
		"replaying a consumed state should fail")
	assert.Contains(t, rr2.Body.String(), "invalid request",
		"replay rejection uses the same body wording as unknown-state")
}

// TestOIDCCallback_StateIsProcessScoped covers target #7: OIDC state is
// only meaningful to the process that issued it.
//
// oauthRequestMap is allocated inside createHeadlampHandler, so each handler
// instance gets its own. We start the flow on instance A (which writes the
// state into A's map) and deliver the callback to instance B (whose map has
// no such entry). The current behavior is `400 invalid request` — the same
// response as a state that was never issued at all.
//
// This is a property of the current design, not a bug being asserted: it is
// pinned here because it is exactly what changes if the login flow moves to
// a stateless (e.g. signed) state payload, or to shared state storage. A
// change of that kind should UPDATE this test to assert the new contract
// rather than delete it — at minimum, B should distinguish "state I cannot
// verify" from "state I have never seen".
//
// Note that this also bounds deployability: with more than one
// headlamp-server replica and no session affinity, a callback routed to a
// different replica than the one that issued the state cannot succeed.
func TestOIDCCallback_StateIsProcessScoped(t *testing.T) {
	oidcSrv := newOIDCTestServer(t, nil)

	handlerA, clusterA := newOIDCTestHandler(t, oidcSrv)
	handlerB, clusterB := newOIDCTestHandler(t, oidcSrv)

	// Both instances register the same cluster name, matching a deployment
	// where two replicas read the same kubeconfig.
	require.Equal(t, clusterA, clusterB,
		"sanity: both instances reference the same cluster name")

	// 1. /oidc on instance A. State is written into A's per-process map.
	loc := driveOIDCStart(t, handlerA, clusterA)
	state := extractState(t, loc)

	// 2. /oidc-callback on instance B with the state issued by A.
	rr := callOIDCCallback(t, handlerB, fmt.Sprintf("state=%s&code=fake", state))

	// Current behavior: B has no entry, rejects with 400.
	require.Equal(t, http.StatusBadRequest, rr.Code,
		"callback delivered to a different instance is rejected")

	body := strings.TrimSpace(rr.Body.String())
	require.Equal(t, "invalid request", body,
		"rejection is indistinguishable from the unknown-state path")

	// Sanity: the state IS recognized on the issuing instance, proving the
	// failure on B is specifically a per-process map lookup miss and not
	// some unrelated rejection (e.g. a malformed state value).
	rrA := callOIDCCallback(t, handlerA, fmt.Sprintf("state=%s&code=fake", state))
	require.NotEqual(t, http.StatusBadRequest, rrA.Code,
		"sanity: instance A accepts the state it issued (the token exchange "+
			"then fails downstream because the mock /token is unwired, but "+
			"state lookup must succeed)")
}

// TestOIDCStart_PKCEChallenge covers target #8 for the /oidc leg: with
// OidcUsePKCE set the redirect carries an S256 code_challenge, and without
// it no PKCE parameters are sent at all.
func TestOIDCStart_PKCEChallenge(t *testing.T) {
	t.Run("enabled", func(t *testing.T) {
		oidcSrv := newOIDCTestServer(t, nil)
		handler, cluster := newOIDCTestHandler(t, oidcSrv, withPKCE())

		q := driveOIDCStart(t, handler, cluster).Query()

		assert.Equal(t, "S256", q.Get("code_challenge_method"),
			"Headlamp uses S256; the plain method is not acceptable")
		challenge := q.Get("code_challenge")
		assert.NotEmpty(t, challenge, "code_challenge must be present when PKCE is on")

		// The challenge is the base64url SHA-256 of the verifier, so it must
		// be decodable and 32 bytes — never the raw verifier itself.
		raw, err := base64.RawURLEncoding.DecodeString(challenge)
		require.NoError(t, err, "code_challenge %q should be base64url", challenge)
		assert.Len(t, raw, 32, "S256 challenge should decode to a 32-byte digest")
	})

	t.Run("disabled", func(t *testing.T) {
		oidcSrv := newOIDCTestServer(t, nil)
		handler, cluster := newOIDCTestHandler(t, oidcSrv)

		q := driveOIDCStart(t, handler, cluster).Query()

		assert.Empty(t, q.Get("code_challenge"),
			"no code_challenge should be sent when PKCE is off")
		assert.Empty(t, q.Get("code_challenge_method"),
			"no code_challenge_method should be sent when PKCE is off")
	})
}

// TestOIDCCallback_PKCEVerifierSentOnExchange covers target #8 for the
// callback leg: the code_verifier held against the state is replayed on the
// token exchange when PKCE is on, and omitted when it is off.
//
// The verifier is asserted against the challenge issued by /oidc, so this
// pins the pair rather than merely the presence of a parameter.
func TestOIDCCallback_PKCEVerifierSentOnExchange(t *testing.T) {
	// capturingTokenHandler records the exchange form and then fails, so the
	// test observes the request without needing to mint a signed ID token.
	capturingTokenHandler := func(form *url.Values) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if err := r.ParseForm(); err == nil {
				*form = r.PostForm
			}

			failingTokenHandler()(w, r)
		}
	}

	t.Run("enabled", func(t *testing.T) {
		var form url.Values

		oidcSrv := newOIDCTestServer(t, capturingTokenHandler(&form))
		handler, cluster := newOIDCTestHandler(t, oidcSrv, withPKCE())

		loc := driveOIDCStart(t, handler, cluster)
		state := extractState(t, loc)
		challenge := loc.Query().Get("code_challenge")
		require.NotEmpty(t, challenge)

		rr := callOIDCCallback(t, handler, fmt.Sprintf("state=%s&code=fake", state))
		require.Equal(t, http.StatusInternalServerError, rr.Code,
			"sanity: the exchange ran and failed at the mock /token")

		verifier := form.Get("code_verifier")
		require.NotEmpty(t, verifier, "code_verifier must be sent on the exchange")

		// The verifier must hash to the challenge advertised at /oidc.
		sum := sha256.Sum256([]byte(verifier))
		assert.Equal(t, challenge, base64.RawURLEncoding.EncodeToString(sum[:]),
			"code_verifier does not match the code_challenge issued by /oidc")
	})

	t.Run("disabled", func(t *testing.T) {
		var form url.Values

		oidcSrv := newOIDCTestServer(t, capturingTokenHandler(&form))
		handler, cluster := newOIDCTestHandler(t, oidcSrv)

		loc := driveOIDCStart(t, handler, cluster)
		state := extractState(t, loc)

		rr := callOIDCCallback(t, handler, fmt.Sprintf("state=%s&code=fake", state))
		require.Equal(t, http.StatusInternalServerError, rr.Code,
			"sanity: the exchange ran and failed at the mock /token")

		assert.Empty(t, form.Get("code_verifier"),
			"no code_verifier should be sent when PKCE is off")
	})
}
