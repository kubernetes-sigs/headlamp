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
// These tests document the CURRENT behavior of the OIDC login handlers as
// they exist in headlamp.go on main. They make no production-code changes
// and are intended as the regression net for the PR-1 work tracked in
// https://github.com/kubernetes-sigs/headlamp/issues/5401.
//
// They were added in response to maintainer feedback on #5401 asking for
// more tests before any refactor of this code (#3482 is the active auth
// extraction track; PR #4230 extracts RefreshAndSetToken).
//
// Coverage targets (each is a subtest below):
//
//   1. /oidc issues a 32-byte base64 random `state` parameter and includes
//      it in the IdP redirect URL; multiple calls produce different states.
//   2. /oidc populates the per-process oauthRequestMap such that a
//      subsequent /oidc-callback with the same state can find its entry.
//      (Verified via end-to-end behavior, not direct map inspection.)
//   3. /oidc-callback with a missing `state` query param returns 400 with
//      body "invalid request state is empty".
//   4. /oidc-callback with an unknown state returns 400 with body
//      "invalid request".
//   5. /oidc-callback with valid state but a token-exchange failure
//      returns 500 with body "Failed to exchange token: ...".
//   6. After the state is consumed, replaying the same state returns 400
//      "invalid request" (single-use semantics).
//   7. Multi-replica regression test for #4019: state issued by handler A,
//      callback delivered to handler B, returns 400 "invalid request".
//      This test currently asserts the BUG. When stage 3 of the PR-1 plan
//      lands (signed stateless state payload), this test must be updated
//      to assert the FIXED behavior, not deleted.
//
// Mocking strategy: each subtest spins up a small httptest.Server that
// implements the OIDC discovery + JWKS + token endpoints. The /token
// endpoint responses are configurable per test. We then wire a kubeconfig
// context whose OidcConf points at that server, build a HeadlampConfig +
// handler the same way other tests in this file do, and drive the two
// HTTP handlers through the standard handler.ServeHTTP path.

package main

import (
	"context"
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
	server       *httptest.Server
	tokenHandler http.HandlerFunc
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
			t.Fatalf("encode discovery: %v", err)
		}
	})

	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if _, err := w.Write([]byte(`{"keys":[]}`)); err != nil {
			t.Fatalf("write jwks: %v", err)
		}
	})

	if tokenHandler != nil {
		mux.HandleFunc("/token", tokenHandler)
	} else {
		mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		})
	}

	return &oidcTestServer{server: srv, tokenHandler: tokenHandler}
}

// URL returns the issuer URL of the mock OIDC server.
func (o *oidcTestServer) URL() string {
	return o.server.URL
}

// newOIDCTestHandler builds a Headlamp handler with one OIDC-configured
// kubeconfig context whose IdP issuer points at the supplied mock server.
// Returns the handler and the cluster name registered.
func newOIDCTestHandler(t *testing.T, oidcSrv *oidcTestServer) (http.Handler, string) {
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
	tokenHandler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)

		_, _ = io.WriteString(w, `{"error":"invalid_grant"}`)
	})
	oidcSrv := newOIDCTestServer(t, tokenHandler)
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
// The current handler at headlamp.go:799 calls delete(oauthRequestMap,
// state) BEFORE the token exchange runs, so any subsequent replay misses
// the map.
func TestOIDCCallback_StateIsSingleUse(t *testing.T) {
	tokenHandler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)

		_, _ = io.WriteString(w, `{"error":"invalid_grant"}`)
	})
	oidcSrv := newOIDCTestServer(t, tokenHandler)
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

// TestOIDCCallback_MultiReplicaStateLoss is the explicit regression test
// for #4019 (multi-replica state loss).
//
// Two independent handler instances are constructed; each has its own
// in-process oauthRequestMap because oauthRequestMap is allocated inside
// createHeadlampHandler at headlamp.go:673. We start the OIDC flow on
// instance A (which writes the state into A's map) and deliver the
// callback to instance B (whose map has no such entry). The current
// behavior is `400 invalid request`.
//
// This test currently asserts THE BUG. When stage 3 of the PR-1 plan in
// #5401 lands (signed stateless state payload that does not require a
// shared map), this test must be UPDATED — not deleted — to assert the
// new behavior:
//
//   - if both handlers share a signing key (the new --oidc-state-signing-
//     key-file flag), the callback to B should succeed (or get to the
//     token-exchange step, which our mock can be wired to either succeed
//     or fail at).
//   - if the handlers do NOT share a signing key, B should reject the
//     state with a signature-verification error, not a "lookup miss"
//     (different error path, similar 400).
//
// Until that update lands, this test serves as the canonical reproduction
// of the bug.
func TestOIDCCallback_MultiReplicaStateLoss(t *testing.T) {
	oidcSrv := newOIDCTestServer(t, nil)

	handlerA, clusterA := newOIDCTestHandler(t, oidcSrv)
	handlerB, clusterB := newOIDCTestHandler(t, oidcSrv)

	// Both replicas register the same cluster name (matches the
	// real-world deployment where two pods see the same kubeconfig).
	require.Equal(t, clusterA, clusterB,
		"sanity: replicas reference the same cluster name")

	// 1. /oidc on replica A. State is written into A's per-process map.
	loc := driveOIDCStart(t, handlerA, clusterA)
	state := extractState(t, loc)

	// 2. /oidc-callback on replica B with the state issued by A.
	rr := callOIDCCallback(t, handlerB, fmt.Sprintf("state=%s&code=fake", state))

	// Current behavior: B has no entry, rejects with 400.
	require.Equal(t, http.StatusBadRequest, rr.Code,
		"#4019 regression: callback to a different replica returns 400")

	body := strings.TrimSpace(rr.Body.String())
	require.Equal(t, "invalid request", body,
		"#4019 regression: failure mode is the unknown-state path, not a "+
			"different error type")

	// Sanity: the state IS recognized on the issuing replica, proving the
	// failure on B is specifically a per-process map lookup miss and not
	// some unrelated rejection (e.g. malformed state).
	rrA := callOIDCCallback(t, handlerA, fmt.Sprintf("state=%s&code=fake", state))
	require.NotEqual(t, http.StatusBadRequest, rrA.Code,
		"sanity: replica A should accept the state it issued (token exchange "+
			"is expected to fail downstream because the test mock is unwired, "+
			"but state lookup must succeed)")
}
