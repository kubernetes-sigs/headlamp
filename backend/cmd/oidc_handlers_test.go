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
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/coreos/go-oidc/v3/oidc/oidctest"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
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

// setTokenHandler swaps the /token response after construction, so a handler
// can close over the server's own issuer URL when minting tokens.
func (o *oidcTestServer) setTokenHandler(h http.HandlerFunc) {
	o.tokenHandler = h
}

// testKeyID is the `kid` advertised in the mock provider's JWKS and stamped
// into every token it signs.
const testKeyID = "test-key-id"

// The signing key is generated once for the whole package. A 2048-bit RSA
// keygen is slow enough that doing it per test server would dominate the
// runtime of this file. The key is immutable after initialization, so
// sharing it across parallel tests is safe.
var (
	testSigningKeyOnce sync.Once
	testSigningKey     *rsa.PrivateKey
	testSigningKeyErr  error
)

// signingKey returns the shared package test signing key.
func signingKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()

	testSigningKeyOnce.Do(func() {
		testSigningKey, testSigningKeyErr = rsa.GenerateKey(rand.Reader, 2048)
	})

	require.NoError(t, testSigningKeyErr, "generating package test signing key")

	return testSigningKey
}

// newOIDCTestServer starts an in-process OIDC mock and returns a handle.
// A nil tokenHandler causes /token to return 500.
func newOIDCTestServer(t *testing.T, tokenHandler http.HandlerFunc) *oidcTestServer {
	t.Helper()

	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	osrv := &oidctest.Server{
		PublicKeys: []oidctest.PublicKey{{
			PublicKey: signingKey(t).Public(),
			KeyID:     testKeyID,
			Algorithm: oidc.RS256,
		}},
	}
	osrv.SetIssuer(srv.URL)

	mux.Handle("/.well-known/openid-configuration", osrv)
	mux.Handle("/keys", osrv)

	o := &oidcTestServer{server: srv, tokenHandler: tokenHandler}

	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		if o.tokenHandler == nil {
			w.WriteHeader(http.StatusInternalServerError)

			return
		}

		o.tokenHandler(w, r)
	})

	return o
}

// URL returns the issuer URL of the mock OIDC server.
func (o *oidcTestServer) URL() string {
	return o.server.URL
}

// signToken mints an RS256 JWT signed by the shared test key, with issuer and
// audience matching what the handler under test will verify against. Supplied
// claims override the defaults.
func (o *oidcTestServer) signToken(t *testing.T, claims map[string]any) string {
	t.Helper()

	c := map[string]any{
		"iss": o.URL(),
		"aud": "test-client-id",
		"sub": "test-subject",
		"exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(),
	}
	for k, v := range claims {
		c[k] = v
	}

	raw, err := json.Marshal(c)
	require.NoError(t, err, "marshal token claims")

	return oidctest.SignIDToken(signingKey(t), testKeyID, oidc.RS256, string(raw))
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

// withCache injects a caller-held cache so a test can inspect what the
// callback handler wrote. Without it, newOIDCTestHandler's cache is private.
func withCache(c cache.Cache[interface{}]) oidcTestOption {
	return func(hc *HeadlampConfig) { hc.Cache = c }
}

// withAccessToken makes the callback read access_token instead of id_token.
func withAccessToken() oidcTestOption {
	return func(c *HeadlampConfig) { c.OidcUseAccessToken = true }
}

// withDevMode enables the DevMode redirect branch of the callback.
func withDevMode() oidcTestOption {
	return func(c *HeadlampConfig) { c.DevMode = true }
}

// withBaseURL sets the server base URL, which the callback prepends to the
// post-login redirect.
func withBaseURL(u string) oidcTestOption {
	return func(c *HeadlampConfig) { c.BaseURL = u }
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

	return createHeadlampHandler(newTestHandlerCtx(t), c), clusterName
}

// driveOIDCStart calls /oidc?cluster=<cluster> against the supplied handler
// and returns the redirect Location URL or fails the test.
func driveOIDCStart(t *testing.T, handler http.Handler, cluster string) *url.URL {
	t.Helper()

	return driveOIDCStartWithPrefix(t, handler, cluster, "")
}

// driveOIDCStartWithPrefix is driveOIDCStart with the request path prefixed
// by routePrefix, needed because a non-empty config.BaseURL mounts the whole
// router (including /oidc and /oidc-callback, not just the post-login
// redirect target) under that prefix. An empty
// routePrefix behaves exactly like driveOIDCStart.
func driveOIDCStartWithPrefix(t *testing.T, handler http.Handler, cluster, routePrefix string) *url.URL {
	t.Helper()

	target := "http://localhost:4466" + routePrefix + "/oidc?cluster=" + cluster

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, target, nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	require.Equal(t, http.StatusFound, rr.Code,
		"GET %s/oidc should 302 to the IdP; got %d body=%q", routePrefix, rr.Code, rr.Body.String())

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

// testAuthCode is the authorization code the callback tests exchange. The mock
// provider never validates it — only its presence on the request matters — so
// there is nothing for a caller to vary.
const testAuthCode = "auth-code"

// driveOIDCCallback calls /oidc-callback with the supplied state and returns
// the raw recorder so callers can assert status, body, and cookies.
func driveOIDCCallback(t *testing.T, handler http.Handler, state string) *httptest.ResponseRecorder {
	t.Helper()

	return driveOIDCCallbackWithPrefix(t, handler, state, "")
}

// driveOIDCCallbackWithPrefix is driveOIDCCallback with the request path
// prefixed by routePrefix; see driveOIDCStartWithPrefix.
func driveOIDCCallbackWithPrefix(
	t *testing.T, handler http.Handler, state, routePrefix string,
) *httptest.ResponseRecorder {
	t.Helper()

	target := "http://localhost:4466" + routePrefix + "/oidc-callback?state=" + url.QueryEscape(state) +
		"&code=" + url.QueryEscape(testAuthCode)

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, target, nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	return rr
}

// authCookieValue reassembles the chunked auth cookie that SetTokenCookie
// writes as headlamp-auth-<cluster>.0, .1, ... (see pkg/auth/cookies.go).
// Reading only chunk .0 would silently truncate any token past chunkSize.
//
// SetTokenCookie names cookies from auth.SanitizeClusterName(cluster), not
// the raw cluster name (cookies.go), mirrored here as
// GetTokenFromCookie does (cookies.go) — otherwise an awkward cluster
// name would silently find no cookies.
func authCookieValue(t *testing.T, rr *httptest.ResponseRecorder, cluster string) string {
	t.Helper()

	prefix := "headlamp-auth-" + auth.SanitizeClusterName(cluster) + "."

	type chunk struct {
		idx int
		val string
	}

	var chunks []chunk

	for _, c := range rr.Result().Cookies() {
		if !strings.HasPrefix(c.Name, prefix) || c.Value == "" {
			continue
		}

		idx, err := strconv.Atoi(strings.TrimPrefix(c.Name, prefix))
		require.NoError(t, err, "unexpected auth cookie name %q", c.Name)

		chunks = append(chunks, chunk{idx: idx, val: c.Value})
	}

	require.NotEmpty(t, chunks, "no headlamp-auth-%s.N cookies were set", cluster)

	sort.Slice(chunks, func(i, j int) bool { return chunks[i].idx < chunks[j].idx })

	var b strings.Builder
	for _, c := range chunks {
		b.WriteString(c.val)
	}

	return b.String()
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

// TestOIDCCallback_Success characterizes the full happy path: a signed
// id_token that the verifier accepts results in a redirect to the frontend
// with the token in the auth cookie.
func TestOIDCCallback_Success(t *testing.T) {
	srv := newOIDCTestServer(t, nil)
	handler, cluster := newOIDCTestHandler(t, srv)

	idToken := srv.signToken(t, map[string]any{"email": "user@example.com"})

	srv.setTokenHandler(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		_, _ = io.WriteString(w, `{"access_token":"opaque-access","token_type":"Bearer",`+
			`"refresh_token":"refresh-abc","id_token":"`+idToken+`"}`)
	})

	state := extractState(t, driveOIDCStart(t, handler, cluster))
	rr := driveOIDCCallback(t, handler, state)

	require.Equal(t, http.StatusSeeOther, rr.Code,
		"callback should 303 on success; body=%q", rr.Body.String())

	assert.Equal(t, idToken, authCookieValue(t, rr, cluster),
		"the verified id_token should be what lands in the auth cookie")

	assert.Equal(t, "/auth?cluster="+cluster, rr.Header().Get("Location"),
		"non-DevMode, empty BaseURL redirects to /auth?cluster=<cluster>")
}

// TestOIDCCallback_CachesRefreshToken characterizes where the callback stores
// the refresh token: keyed by the raw user token, so a later refresh can find
// it (see OIDCTokenRefreshMiddleware).
func TestOIDCCallback_CachesRefreshToken(t *testing.T) {
	srv := newOIDCTestServer(t, nil)
	c := cache.New[interface{}]()
	handler, cluster := newOIDCTestHandler(t, srv, withCache(c))

	idToken := srv.signToken(t, nil)

	srv.setTokenHandler(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		_, _ = io.WriteString(w, `{"access_token":"opaque-access","token_type":"Bearer",`+
			`"refresh_token":"refresh-xyz","id_token":"`+idToken+`"}`)
	})

	state := extractState(t, driveOIDCStart(t, handler, cluster))
	rr := driveOIDCCallback(t, handler, state)
	require.Equal(t, http.StatusSeeOther, rr.Code, "body=%q", rr.Body.String())

	got, err := c.Get(context.Background(), "oidc-token-"+idToken)
	require.NoError(t, err, "refresh token should be cached under oidc-token-<raw token>")
	assert.Equal(t, "refresh-xyz", got)
}

// TestOIDCCallback_TokenMissingFromResponse characterizes a token endpoint
// that succeeds but omits id_token entirely.
func TestOIDCCallback_TokenMissingFromResponse(t *testing.T) {
	srv := newOIDCTestServer(t, nil)
	handler, cluster := newOIDCTestHandler(t, srv)

	srv.setTokenHandler(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		_, _ = io.WriteString(w, `{"access_token":"opaque-access","token_type":"Bearer"}`)
	})

	state := extractState(t, driveOIDCStart(t, handler, cluster))
	rr := driveOIDCCallback(t, handler, state)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "No id_token field in oauth2 token")
}

// TestOIDCCallback_VerificationFailure characterizes a token that is well
// formed but signed by a key the provider does not advertise.
func TestOIDCCallback_VerificationFailure(t *testing.T) {
	srv := newOIDCTestServer(t, nil)
	handler, cluster := newOIDCTestHandler(t, srv)

	otherKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	claims := fmt.Sprintf(
		`{"iss":%q,"aud":"test-client-id","sub":"test-subject","exp":%s,"iat":%s}`,
		srv.URL(),
		strconv.FormatInt(time.Now().Add(time.Hour).Unix(), 10),
		strconv.FormatInt(time.Now().Unix(), 10),
	)
	badToken := oidctest.SignIDToken(otherKey, testKeyID, oidc.RS256, claims)

	srv.setTokenHandler(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		_, _ = io.WriteString(w, `{"access_token":"opaque-access","token_type":"Bearer",`+
			`"refresh_token":"refresh-abc","id_token":"`+badToken+`"}`)
	})

	state := extractState(t, driveOIDCStart(t, handler, cluster))
	rr := driveOIDCCallback(t, handler, state)

	require.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "Failed to verify ID Token")
}

// TestOIDCCallback_UsesAccessTokenWhenConfigured characterizes OidcUseAccessToken.
//
// The callback applies ID-token verification to the selected value, so this
// fixture uses a second signed JWT. Opaque access-token support is tracked
// by #6998.
func TestOIDCCallback_UsesAccessTokenWhenConfigured(t *testing.T) {
	srv := newOIDCTestServer(t, nil)
	handler, cluster := newOIDCTestHandler(t, srv, withAccessToken())

	idToken := srv.signToken(t, map[string]any{"sub": "id-token-subject"})
	accessToken := srv.signToken(t, map[string]any{"sub": "access-token-subject"})
	require.NotEqual(t, idToken, accessToken, "the two tokens must be distinguishable")

	srv.setTokenHandler(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		_, _ = io.WriteString(w, `{"access_token":"`+accessToken+`","token_type":"Bearer",`+
			`"refresh_token":"refresh-abc","id_token":"`+idToken+`"}`)
	})

	state := extractState(t, driveOIDCStart(t, handler, cluster))
	rr := driveOIDCCallback(t, handler, state)

	require.Equal(t, http.StatusSeeOther, rr.Code, "body=%q", rr.Body.String())
	assert.Equal(t, accessToken, authCookieValue(t, rr, cluster),
		"with OidcUseAccessToken, the access_token — not the id_token — reaches the cookie")
}

// TestOIDC_ValidatorOverrides keeps authorization settings separate from
// token validation: only the configured issuer or audience is accepted.
func TestOIDC_ValidatorOverrides(t *testing.T) {
	for _, tc := range []struct {
		name, claim, override, wantError string
	}{
		{"issuer", "iss", "https://validator.example.com", "issued by a different provider"},
		{"client ID", "aud", "validation-client-id", "expected audience"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv := newOIDCTestServer(t, nil)
			discovery := srv

			if tc.claim == "iss" {
				discovery = newOIDCIssuerOverrideServer(t, srv, tc.override)
			}

			for _, accepted := range []bool{true, false} {
				t.Run(fmt.Sprintf("override token=%t", accepted), func(t *testing.T) {
					handler, cluster := newOIDCTestHandler(t, discovery, func(c *HeadlampConfig) {
						if tc.claim == "iss" {
							c.OidcValidatorIdpIssuerURL = tc.override
						} else {
							c.OidcValidatorClientID = tc.override
						}
					})

					claims := map[string]any{}
					if accepted {
						claims[tc.claim] = tc.override
					}

					token := srv.signToken(t, claims)
					srv.setTokenHandler(func(w http.ResponseWriter, _ *http.Request) {
						w.Header().Set("Content-Type", "application/json")
						assert.NoError(t, json.NewEncoder(w).Encode(map[string]string{
							"access_token": "opaque-access", "token_type": "Bearer", "id_token": token,
						}))
					})

					loc := driveOIDCStart(t, handler, cluster)
					assert.Equal(t, "test-client-id", loc.Query().Get("client_id"))
					rr := driveOIDCCallback(t, handler, extractState(t, loc))

					if accepted {
						require.Equal(t, http.StatusSeeOther, rr.Code, "body=%q", rr.Body.String())
						assert.Equal(t, token, authCookieValue(t, rr, cluster))
					} else {
						assert.Equal(t, http.StatusInternalServerError, rr.Code)
						assert.Contains(t, rr.Body.String(), "Failed to verify ID Token")
						assert.Contains(t, rr.Body.String(), tc.wantError)
						assertNoOIDCAuthCookie(t, rr)
					}
				})
			}
		})
	}
}

// newOIDCIssuerOverrideServer changes only the advertised issuer, keeping
// authorization, exchange and signing-key endpoints on the original fixture.
func newOIDCIssuerOverrideServer(t *testing.T, srv *oidcTestServer, issuer string) *oidcTestServer {
	t.Helper()

	wrapper := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rr := httptest.NewRecorder()
		srv.server.Config.Handler.ServeHTTP(rr, r)

		var metadata map[string]any
		assert.NoError(t, json.Unmarshal(rr.Body.Bytes(), &metadata))

		metadata["issuer"] = issuer

		w.Header().Set("Content-Type", "application/json")
		assert.NoError(t, json.NewEncoder(w).Encode(metadata))
	}))
	t.Cleanup(wrapper.Close)

	return &oidcTestServer{server: wrapper}
}

// TestOIDC_InsecureTLSDiscovery needs no custom CA or per-provider skip flag.
func TestOIDC_InsecureTLSDiscovery(t *testing.T) {
	provider := &oidctest.Server{}
	tlsServer := httptest.NewTLSServer(provider)
	t.Cleanup(tlsServer.Close)
	provider.SetIssuer(tlsServer.URL)

	for _, insecure := range []bool{false, true} {
		t.Run(fmt.Sprintf("insecure=%t", insecure), func(t *testing.T) {
			handler, cluster := newOIDCTestHandler(t, &oidcTestServer{server: tlsServer},
				func(c *HeadlampConfig) { c.Insecure = insecure })
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/oidc?cluster="+cluster, nil))

			if insecure {
				require.Equal(t, http.StatusFound, rr.Code, "body=%q", rr.Body.String())
				loc, err := url.Parse(rr.Header().Get("Location"))
				require.NoError(t, err)
				assert.Equal(t, tlsServer.URL+"/auth", loc.Scheme+"://"+loc.Host+loc.Path)
				assert.Equal(t, "test-client-id", loc.Query().Get("client_id"))
			} else {
				assert.Equal(t, http.StatusInternalServerError, rr.Code)
				assert.Contains(t, rr.Body.String(), "certificate signed by unknown authority")
			}
		})
	}
}

// TestOIDC_StartFailures exercises the route with its required cluster query.
func TestOIDC_StartFailures(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "discovery unavailable", http.StatusServiceUnavailable)
	}))
	t.Cleanup(server.Close)

	for _, tc := range []struct {
		name, cluster, wantBody string
		wantStatus              int
		option                  oidcTestOption
	}{
		{"unknown cluster", "unknown-cluster", "404 page not found", http.StatusNotFound, nil},
		{
			"missing OIDC config", "oidc-char-test", "authProvider is nil", http.StatusInternalServerError,
			func(c *HeadlampConfig) {
				ctx, err := c.KubeConfigStore.GetContext("oidc-char-test")
				require.NoError(t, err)

				ctx.OidcConf = nil
				ctx.AuthInfo = &api.AuthInfo{}
			},
		},
		{
			"discovery failure", "oidc-char-test", "503 Service Unavailable: discovery unavailable",
			http.StatusInternalServerError, nil,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var opts []oidcTestOption
			if tc.option != nil {
				opts = append(opts, tc.option)
			}

			handler, _ := newOIDCTestHandler(t, &oidcTestServer{server: server}, opts...)
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/oidc?cluster="+tc.cluster, nil))

			assert.Equal(t, tc.wantStatus, rr.Code)
			assert.Contains(t, rr.Body.String(), tc.wantBody)
			assertNoOIDCAuthCookie(t, rr)
		})
	}
}

// TestOIDCCallback_MissingAccessToken fails at exchange, before token selection:
// oauth2 rejects a response without access_token even when id_token is valid.
func TestOIDCCallback_MissingAccessToken(t *testing.T) {
	srv := newOIDCTestServer(t, nil)
	handler, cluster := newOIDCTestHandler(t, srv, withAccessToken())
	token := srv.signToken(t, nil)
	srv.setTokenHandler(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		assert.NoError(t, json.NewEncoder(w).Encode(map[string]string{
			"token_type": "Bearer", "id_token": token,
		}))
	})

	state := extractState(t, driveOIDCStart(t, handler, cluster))
	rr := driveOIDCCallback(t, handler, state)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "Failed to exchange token: oauth2: server response missing access_token")
	assertNoOIDCAuthCookie(t, rr)
}

type oidcFailingSetCache struct {
	cache.Cache[interface{}]
	err error
	key string
}

func (c *oidcFailingSetCache) Set(_ context.Context, key string, _ interface{}) error {
	c.key = key

	return c.err
}

// TestOIDCCallback_CacheSetFailure must not issue authentication on a failed write.
func TestOIDCCallback_CacheSetFailure(t *testing.T) {
	srv := newOIDCTestServer(t, nil)
	c := &oidcFailingSetCache{Cache: cache.New[interface{}](), err: errors.New("test cache write failure")}

	t.Cleanup(func() { require.NoError(t, c.Close()) })
	handler, cluster := newOIDCTestHandler(t, srv, withCache(c))
	token := srv.signToken(t, nil)
	srv.setTokenHandler(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		assert.NoError(t, json.NewEncoder(w).Encode(map[string]string{
			"access_token": "opaque-access", "token_type": "Bearer", "id_token": token,
		}))
	})

	state := extractState(t, driveOIDCStart(t, handler, cluster))
	rr := driveOIDCCallback(t, handler, state)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "Failed to cache refresh token: "+c.err.Error())
	assert.Equal(t, "oidc-token-"+token, c.key)
	assertNoOIDCAuthCookie(t, rr)
}

// TestOIDC_InsecureInvalidTransport is deliberately not parallel because it
// temporarily replaces process-global transport after handler construction.
func TestOIDC_InsecureInvalidTransport(t *testing.T) {
	handler, cluster := newOIDCTestHandler(t, newOIDCTestServer(t, nil),
		func(c *HeadlampConfig) { c.Insecure = true })
	original := http.DefaultTransport

	t.Cleanup(func() { http.DefaultTransport = original })
	http.DefaultTransport = http.NewFileTransport(http.Dir(t.TempDir()))

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/oidc?cluster="+cluster, nil))

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "Failed to configure oidc transport")
	assertNoOIDCAuthCookie(t, rr)
}

func assertNoOIDCAuthCookie(t *testing.T, rr *httptest.ResponseRecorder) {
	t.Helper()

	for _, cookie := range rr.Result().Cookies() {
		assert.False(t, strings.HasPrefix(cookie.Name, "headlamp-auth-"),
			"unexpected authentication cookie %q", cookie.Name)
	}
}

// newSigningOIDCTestServer is like newOIDCTestServer but its /token endpoint
// returns an RS256 id_token that verifies against its /jwks, so
// /oidc-callback can run to the final redirect.
func newSigningOIDCTestServer(t *testing.T) *oidcTestServer {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	b64 := base64.RawURLEncoding.EncodeToString
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer":                                srv.URL,
			"authorization_endpoint":                srv.URL + "/auth",
			"token_endpoint":                        srv.URL + "/token",
			"jwks_uri":                              srv.URL + "/jwks",
			"id_token_signing_alg_values_supported": []string{"RS256"},
		})
	})

	mux.HandleFunc("/jwks", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kty": "RSA", "alg": "RS256", "use": "sig", "kid": "k",
			"n": b64(key.N.Bytes()), "e": b64(big.NewInt(int64(key.E)).Bytes()),
		}}})
	})

	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		header, _ := json.Marshal(map[string]string{"alg": "RS256", "kid": "k", "typ": "JWT"})
		claims, _ := json.Marshal(map[string]any{
			"iss": srv.URL, "sub": "user", "aud": "test-client-id",
			"iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix(),
		})
		signingInput := b64(header) + "." + b64(claims)
		sum := sha256.Sum256([]byte(signingInput))

		sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
		if err != nil {
			t.Errorf("sign id_token: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "access", "token_type": "Bearer", "expires_in": 3600,
			"id_token": signingInput + "." + b64(sig),
		})
	})

	return &oidcTestServer{server: srv}
}

// TestOIDCCallback_PopupMarkerRoundTrip checks that /oidc?popup=true is
// carried through the state entry to the frontend /auth redirect, so the
// frontend can detect popup mode without relying on window.opener.
func TestOIDCCallback_PopupMarkerRoundTrip(t *testing.T) {
	for _, tc := range []struct {
		name     string
		query    string
		wantAuth string
	}{
		{"popup", "&popup=true", "/auth?cluster=oidc-char-test&popup=true"},
		{"full page", "", "/auth?cluster=oidc-char-test"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handler, cluster := newOIDCTestHandler(t, newSigningOIDCTestServer(t))

			state := extractState(t, driveOIDCStart(t, handler, cluster+tc.query))
			rr := callOIDCCallback(t, handler, fmt.Sprintf("state=%s&code=fake", state))

			require.Equal(t, http.StatusSeeOther, rr.Code, "body=%q", rr.Body.String())
			assert.Equal(t, tc.wantAuth, rr.Header().Get("Location"))
		})
	}
}

// TestOIDCCallback_EscapesClusterInAuthRedirect checks that a cluster name
// with query-reserved characters survives the /auth redirect intact.
func TestOIDCCallback_EscapesClusterInAuthRedirect(t *testing.T) {
	const cluster = "team&prod"

	handler, _ := newOIDCTestHandler(t, newSigningOIDCTestServer(t), func(c *HeadlampConfig) {
		ctx, err := c.KubeConfigStore.GetContext("oidc-char-test")
		require.NoError(t, err)

		special := *ctx
		special.Name = cluster
		require.NoError(t, c.KubeConfigStore.AddContext(&special))
	})

	state := extractState(t, driveOIDCStart(t, handler, url.QueryEscape(cluster)))
	rr := callOIDCCallback(t, handler, fmt.Sprintf("state=%s&code=fake", state))

	require.Equal(t, http.StatusSeeOther, rr.Code, "body=%q", rr.Body.String())
	assert.Equal(t, "/auth?cluster=team%26prod", rr.Header().Get("Location"))
}

// TestOIDCCallback_RedirectTarget characterizes where a successful login sends
// the browser, across DevMode and BaseURL. In every case the target ends with
// auth?cluster=<cluster>; DevMode swaps the origin and BaseURL inserts a path
// segment ahead of it. The default redirect is already covered by the popup test.
func TestOIDCCallback_RedirectTarget(t *testing.T) {
	tests := []struct {
		name string
		opts []oidcTestOption
		// routePrefix mirrors config.BaseURL: when the router mounts routes
		// under a base URL, /oidc and /oidc-callback
		// themselves move under that prefix too, not just the post-login
		// redirect target being asserted below.
		routePrefix string
		want        string
	}{
		{
			name: "dev mode",
			opts: []oidcTestOption{withDevMode()},
			want: "http://localhost:3000/auth?cluster=oidc-char-test",
		},
		{
			name:        "base URL",
			opts:        []oidcTestOption{withBaseURL("/headlamp")},
			routePrefix: "/headlamp",
			want:        "/headlamp/auth?cluster=oidc-char-test",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			srv := newOIDCTestServer(t, nil)
			handler, cluster := newOIDCTestHandler(t, srv, tc.opts...)
			require.Equal(t, "oidc-char-test", cluster,
				"the want values above hardcode the cluster name")

			idToken := srv.signToken(t, nil)

			srv.setTokenHandler(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")

				_, _ = io.WriteString(w, `{"access_token":"opaque-access","token_type":"Bearer",`+
					`"refresh_token":"refresh-abc","id_token":"`+idToken+`"}`)
			})

			loc := driveOIDCStartWithPrefix(t, handler, cluster, tc.routePrefix)
			state := extractState(t, loc)
			rr := driveOIDCCallbackWithPrefix(t, handler, state, tc.routePrefix)

			require.Equal(t, http.StatusSeeOther, rr.Code, "body=%q", rr.Body.String())
			assert.Equal(t, tc.want, rr.Header().Get("Location"))
		})
	}
}
