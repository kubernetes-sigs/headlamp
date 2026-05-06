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
	"os"
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
//
// If signingKeyFile is non-empty, the handler is built with
// OidcStateSigningKeyFile pointing at it. This lets the multi-replica
// subtests assert behavior both with and without a shared signing key.
func newOIDCTestHandler(t *testing.T, oidcSrv *oidcTestServer) (http.Handler, string) {
	return newOIDCTestHandlerWithKey(t, oidcSrv, "")
}

func newOIDCTestHandlerWithKey(
	t *testing.T, oidcSrv *oidcTestServer, signingKeyFile string,
) (http.Handler, string) {
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
			Cache:                   cache.New[interface{}](),
			TelemetryConfig:         GetDefaultTestTelemetryConfig(),
			TelemetryHandler:        &telemetry.RequestHandler{},
			OidcStateSigningKeyFile: signingKeyFile,
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

// TestOIDCStart_StateIsSignedToken covers target #1: each /oidc call
// issues a fresh signed state token. Stage 3 of the PR-1 refactor
// replaced the original 32-byte random state with an HMAC-signed JSON
// payload (auth.StateSigner). The state now has the form
// "<base64url(payload)>.<base64url(HMAC-SHA256))>" — distinct per call
// because the embedded CSRF is a fresh 16 random bytes per call.
func TestOIDCStart_StateIsSignedToken(t *testing.T) {
	oidcSrv := newOIDCTestServer(t, nil)
	handler, cluster := newOIDCTestHandler(t, oidcSrv)

	seen := make(map[string]struct{})

	const calls = 5

	for i := 0; i < calls; i++ {
		loc := driveOIDCStart(t, handler, cluster)
		state := extractState(t, loc)

		// Format: "<bodyB64>.<sigB64>" where sigB64 decodes to 32 bytes.
		dot := strings.IndexByte(state, '.')
		require.Greater(t, dot, 0, "state %q missing payload/sig separator", state)

		bodyB64, sigB64 := state[:dot], state[dot+1:]
		require.NotEmpty(t, bodyB64, "state %q has empty payload segment", state)
		require.NotEmpty(t, sigB64, "state %q has empty signature segment", state)

		sig, err := base64.RawURLEncoding.DecodeString(sigB64)
		require.NoError(t, err, "signature %q should be base64.RawURLEncoding", sigB64)
		require.Equal(t, 32, len(sig), "signature should be 32 bytes (HMAC-SHA256)")

		_, dup := seen[state]
		require.False(t, dup, "state %q reused across /oidc calls (CSRF nonce should make every state distinct)", state)
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

// TestOIDCCallback_MultiReplica covers the #4019 regression two ways:
//
//   - without_shared_signing_key: each handler instance generates its own
//     per-process HMAC key at startup, so a state token issued by A is
//     rejected as bad-signature when delivered to B. This characterizes
//     the multi-replica failure mode operators get when they don't set
//     --oidc-state-signing-key-file.
//   - with_shared_signing_key: both handlers load the same key from the
//     same file. A state token issued by A is accepted by B (it
//     proceeds to token exchange, which fails on our stub /token; the
//     exact downstream status doesn't matter — what matters is that
//     state validation succeeded, i.e. the response is not 400 "invalid
//     request").
//
// Renamed from TestOIDCCallback_MultiReplicaStateLoss because the test
// now describes the fix, not the bug.
func TestOIDCCallback_MultiReplica(t *testing.T) {
	t.Run("without_shared_signing_key", func(t *testing.T) {
		oidcSrv := newOIDCTestServer(t, nil)

		handlerA, clusterA := newOIDCTestHandler(t, oidcSrv)
		handlerB, clusterB := newOIDCTestHandler(t, oidcSrv)

		require.Equal(t, clusterA, clusterB,
			"sanity: replicas reference the same cluster name")

		loc := driveOIDCStart(t, handlerA, clusterA)
		state := extractState(t, loc)

		rr := callOIDCCallback(t, handlerB, fmt.Sprintf("state=%s&code=fake", state))

		require.Equal(t, http.StatusBadRequest, rr.Code,
			"#4019 without shared signing key: B rejects A's signed state with 400")

		body := strings.TrimSpace(rr.Body.String())
		require.Contains(t, body, "invalid request",
			"failure mode is the generic invalid-state path; we deliberately "+
				"don't leak signature-vs-other distinctions to anonymous callers")
	})

	t.Run("with_shared_signing_key", func(t *testing.T) {
		oidcSrv := newOIDCTestServer(t, nil)

		// Write a shared signing key to a temp file used by both handlers.
		key := make([]byte, 32)
		for i := range key {
			key[i] = byte(0xA0 ^ i) // arbitrary deterministic 32 bytes
		}

		keyFile := writeTempKeyFile(t, key)

		handlerA, clusterA := newOIDCTestHandlerWithKey(t, oidcSrv, keyFile)
		handlerB, clusterB := newOIDCTestHandlerWithKey(t, oidcSrv, keyFile)

		require.Equal(t, clusterA, clusterB,
			"sanity: replicas reference the same cluster name")

		loc := driveOIDCStart(t, handlerA, clusterA)
		state := extractState(t, loc)

		rr := callOIDCCallback(t, handlerB, fmt.Sprintf("state=%s&code=fake", state))

		require.NotEqual(t, http.StatusBadRequest, rr.Code,
			"#4019 fix: with shared signing key, B should accept A's state and "+
				"proceed to the token-exchange step (which our test mock fails, "+
				"yielding 500 — but state validation has succeeded). got %d body=%q",
			rr.Code, rr.Body.String())
	})
}

// writeTempKeyFile writes the given key bytes to a temp file and returns
// the path. Used by the multi-replica subtests to give two handler
// instances the same signing key.
func writeTempKeyFile(t *testing.T, key []byte) string {
	t.Helper()

	dir := t.TempDir()
	path := dir + "/oidc-state-signing.key"

	if err := os.WriteFile(path, key, 0o600); err != nil {
		t.Fatalf("write key file: %v", err)
	}

	return path
}

// driveOIDCStartWithQuery is like driveOIDCStart but lets the caller
// supply a full query string. Used by stage 4 tests that want to add
// returnTo / mode parameters.
func driveOIDCStartWithQuery(t *testing.T, handler http.Handler, query string) (*url.URL, *httptest.ResponseRecorder) {
	t.Helper()

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet,
		"/oidc?"+query, nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusFound {
		return nil, rr
	}

	loc := rr.Header().Get("Location")
	require.NotEmpty(t, loc, "Location header missing on /oidc redirect")

	u, err := url.Parse(loc)
	require.NoError(t, err)

	return u, rr
}

// TestOIDCStart_RejectsBadReturnTo covers the /oidc returnTo validation
// added in stage 4. Open redirect attempts must be rejected with 400 at
// issue time, before the IdP redirect.
func TestOIDCStart_RejectsBadReturnTo(t *testing.T) {
	oidcSrv := newOIDCTestServer(t, nil)
	handler, cluster := newOIDCTestHandler(t, oidcSrv)

	cases := []string{
		"https://evil/",
		"//evil",
		"/foo/../etc",
		"javascript:alert(1)",
	}

	for _, bad := range cases {
		bad := bad
		t.Run(bad, func(t *testing.T) {
			query := fmt.Sprintf("cluster=%s&returnTo=%s", cluster, url.QueryEscape(bad))
			_, rr := driveOIDCStartWithQuery(t, handler, query)

			require.Equal(t, http.StatusBadRequest, rr.Code,
				"expected 400 rejecting unsafe returnTo %q, got %d body=%q",
				bad, rr.Code, rr.Body.String())
		})
	}
}

// TestOIDCStart_RejectsDesktopMode covers the explicit reservation of
// mode=desktop for PR 2 of #5401.
func TestOIDCStart_RejectsDesktopMode(t *testing.T) {
	oidcSrv := newOIDCTestServer(t, nil)
	handler, cluster := newOIDCTestHandler(t, oidcSrv)

	query := fmt.Sprintf("cluster=%s&mode=desktop", cluster)
	_, rr := driveOIDCStartWithQuery(t, handler, query)

	require.Equal(t, http.StatusBadRequest, rr.Code)
	require.Contains(t, rr.Body.String(), "PR 2",
		"error body should explain that desktop mode is reserved")
}

// callOIDCCallbackWithAccept invokes /oidc-callback with the given Accept
// header, used by the stage 5 HTML content-negotiation tests.
func callOIDCCallbackWithAccept(t *testing.T, handler http.Handler, rawQuery, accept string) *httptest.ResponseRecorder {
	t.Helper()

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet,
		"/oidc-callback?"+rawQuery, nil)
	require.NoError(t, err)

	if accept != "" {
		req.Header.Set("Accept", accept)
	}

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	return rr
}

// TestOIDCCallback_HTMLErrorPages covers stage 5: when Accept: text/html
// is present, the 4xx error responses render an HTML page with a link
// back to Headlamp; non-HTML callers continue to get the plain-text
// contract checked by the earlier characterization tests.
func TestOIDCCallback_HTMLErrorPages(t *testing.T) {
	oidcSrv := newOIDCTestServer(t, nil)
	handler, _ := newOIDCTestHandler(t, oidcSrv)

	t.Run("missing_state_html", func(t *testing.T) {
		rr := callOIDCCallbackWithAccept(t, handler, "code=anything", "text/html")

		require.Equal(t, http.StatusBadRequest, rr.Code)
		require.Contains(t, rr.Header().Get("Content-Type"), "text/html")
		body := rr.Body.String()
		require.Contains(t, body, "<html", "expected HTML page on text/html callers")
		require.Contains(t, body, "Return to Headlamp",
			"expected the page to offer a way back into the app")
	})

	t.Run("unknown_state_html", func(t *testing.T) {
		rr := callOIDCCallbackWithAccept(t, handler, "state=never-issued&code=fake", "text/html")

		require.Equal(t, http.StatusBadRequest, rr.Code)
		require.Contains(t, rr.Header().Get("Content-Type"), "text/html")
		require.Contains(t, rr.Body.String(), "Return to Headlamp")
	})

	t.Run("missing_state_json_unchanged", func(t *testing.T) {
		// Existing characterization-test contract: non-HTML callers still
		// get the plain-text body. Asserting alongside HTML test so a
		// regression in either direction is caught here.
		rr := callOIDCCallbackWithAccept(t, handler, "code=anything", "application/json")

		require.Equal(t, http.StatusBadRequest, rr.Code)
		require.NotContains(t, rr.Header().Get("Content-Type"), "text/html")
		require.Contains(t, rr.Body.String(), "invalid request state is empty")
	})

	t.Run("unknown_state_text_unchanged", func(t *testing.T) {
		rr := callOIDCCallbackWithAccept(t, handler, "state=bogus.bogus&code=fake", "")

		require.Equal(t, http.StatusBadRequest, rr.Code)
		require.NotContains(t, rr.Header().Get("Content-Type"), "text/html")
		require.Contains(t, rr.Body.String(), "invalid request")
	})
}
