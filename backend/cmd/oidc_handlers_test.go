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
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gorilla/mux"
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

// oidcTestSetup holds what newOIDCTestHandler builds and its options may
// customize.
type oidcTestSetup struct {
	config   *HeadlampConfig
	oidcConf *kubeconfig.OidcConfig
	// authProviderConfig, when set, stores the OIDC settings as a kubeconfig
	// oidc auth-provider stanza of source instead of a prebuilt OidcConf.
	authProviderConfig map[string]string
	source             int
}

// oidcTestOption customizes what newOIDCTestHandler builds.
type oidcTestOption func(*oidcTestSetup)

// withPKCE enables the OidcUsePKCE code path on the handler under test.
func withPKCE() oidcTestOption {
	return func(s *oidcTestSetup) { s.config.OidcUsePKCE = true }
}

// withStateReader replaces the reader backing OIDC state generation, so a
// test can force the state-generation failure path.
func withStateReader(r io.Reader) oidcTestOption {
	return func(s *oidcTestSetup) { s.config.oidcStateReader = r }
}

// withClientAssertionFile makes the cluster context authenticate to the token
// endpoint with a JWT client assertion instead of a client secret.
func withClientAssertionFile(path string) oidcTestOption {
	return func(s *oidcTestSetup) {
		s.oidcConf.ClientAssertionFile = path
	}
}

// withKubeconfigAuthProvider stores the OIDC settings the way a kubeconfig
// carries them, so the handler resolves them and the checks on caller-supplied
// values are part of the path under test.
func withKubeconfigAuthProvider(source int, config map[string]string) oidcTestOption {
	return func(s *oidcTestSetup) {
		s.source = source
		s.authProviderConfig = config
	}
}

// newOIDCTestHandler builds a Headlamp handler with one OIDC-configured
// kubeconfig context whose IdP issuer points at the supplied mock server.
// Returns the handler and the cluster name registered.
func newOIDCTestHandler(t *testing.T, oidcSrv *oidcTestServer, opts ...oidcTestOption) (http.Handler, string) {
	t.Helper()

	const clusterName = "oidc-char-test"

	kubeConfigStore := kubeconfig.NewContextStore()

	oidcConf := &kubeconfig.OidcConfig{
		ClientID:     "test-client-id",
		ClientSecret: "test-client-secret",
		IdpIssuerURL: oidcSrv.URL(),
		Scopes:       []string{"profile", "email"},
	}

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

	setup := &oidcTestSetup{config: c, oidcConf: oidcConf, source: kubeconfig.KubeConfig}
	for _, opt := range opts {
		opt(setup)
	}

	storedContext := &kubeconfig.Context{
		Name: clusterName,
		Cluster: &api.Cluster{
			Server: "https://test-cluster.example.com",
		},
		AuthInfo: &api.AuthInfo{},
		OidcConf: oidcConf,
		Source:   setup.source,
	}

	if setup.authProviderConfig != nil {
		storedContext.OidcConf = nil
		storedContext.AuthInfo.AuthProvider = &api.AuthProviderConfig{
			Name:   "oidc",
			Config: setup.authProviderConfig,
		}
	}

	err := kubeConfigStore.AddContext(storedContext)
	require.NoError(t, err)

	return createHeadlampHandler(context.Background(), c), clusterName
}

// statelessOIDCKubeconfig returns the kubeconfig a caller would hand over in the
// KUBECONFIG header to have Headlamp read assertionFile and send it to issuerURL.
func statelessOIDCKubeconfig(issuerURL, assertionFile string) string {
	return fmt.Sprintf(`apiVersion: v1
clusters:
- cluster:
    server: https://test-cluster.example.com
  name: stateless-oidc
contexts:
- context:
    cluster: stateless-oidc
    user: stateless-user
  name: stateless-oidc
current-context: stateless-oidc
kind: Config
users:
- name: stateless-user
  user:
    auth-provider:
      config:
        client-id: "test-client-id"
        client-assertion-file: %q
        idp-issuer-url: %q
      name: oidc`, assertionFile, issuerURL)
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

// TestOIDCCallback_ClientAssertionSentOnExchange covers JWT bearer client
// authentication (RFC 7523). With an assertion file configured, /oidc-callback
// authenticates the code exchange with client_assertion instead of a client
// secret, and the assertion is read from disk at exchange time.
func TestOIDCCallback_ClientAssertionSentOnExchange(t *testing.T) {
	const assertion = "header.payload.signature"

	assertionFile := filepath.Join(t.TempDir(), "assertion.jwt")
	require.NoError(t, os.WriteFile(assertionFile, []byte(assertion+"\n"), 0o600))

	// The exchange form is recorded and then rejected, so the test observes the
	// request without needing to mint a signed ID token.
	var forms []url.Values

	oidcSrv := newOIDCTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err == nil {
			forms = append(forms, r.PostForm)
		}

		failingTokenHandler()(w, r)
	})

	handler, cluster := newOIDCTestHandler(t, oidcSrv, withClientAssertionFile(assertionFile))

	state := extractState(t, driveOIDCStart(t, handler, cluster))

	rr := callOIDCCallback(t, handler, fmt.Sprintf("state=%s&code=fake", state))
	require.Equal(t, http.StatusInternalServerError, rr.Code,
		"sanity: the exchange ran and failed at the mock /token")

	// The pinned AuthStyleInParams puts the credentials in the body right away,
	// so the endpoint is called once.
	require.Len(t, forms, 1)

	form := forms[0]
	assert.Equal(t, "test-client-id", form.Get("client_id"))
	assert.Equal(t, auth.ClientAssertionTypeJWTBearer, form.Get("client_assertion_type"))
	assert.Equal(t, assertion, form.Get("client_assertion"))
	assert.Empty(t, form.Get("client_secret"))
}

// TestOIDCCallback_UnreadableClientAssertionFails checks the callback reports a
// failure instead of falling back to an unauthenticated exchange when the
// configured assertion cannot be read.
func TestOIDCCallback_UnreadableClientAssertionFails(t *testing.T) {
	exchanges := 0

	oidcSrv := newOIDCTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		exchanges++

		failingTokenHandler()(w, r)
	})

	handler, cluster := newOIDCTestHandler(t, oidcSrv,
		withClientAssertionFile(filepath.Join(t.TempDir(), "absent.jwt")))

	state := extractState(t, driveOIDCStart(t, handler, cluster))

	rr := callOIDCCallback(t, handler, fmt.Sprintf("state=%s&code=fake", state))
	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "Failed to read client assertion")
	assert.Zero(t, exchanges, "no code should be exchanged without the client assertion")
}

// TestOIDCCallback_ClientSecretUnaffected checks the default client secret path
// keeps sending client_secret and no assertion parameters.
func TestOIDCCallback_ClientSecretUnaffected(t *testing.T) {
	var forms []url.Values

	oidcSrv := newOIDCTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err == nil {
			forms = append(forms, r.PostForm)
		}

		failingTokenHandler()(w, r)
	})

	handler, cluster := newOIDCTestHandler(t, oidcSrv)

	state := extractState(t, driveOIDCStart(t, handler, cluster))

	rr := callOIDCCallback(t, handler, fmt.Sprintf("state=%s&code=fake", state))
	require.Equal(t, http.StatusInternalServerError, rr.Code)

	require.NotEmpty(t, forms)

	for _, form := range forms {
		assert.Empty(t, form.Get("client_assertion"))
		assert.Empty(t, form.Get("client_assertion_type"))
	}
}

// TestOIDCStart_DynamicClusterClientAssertionRejected checks a kubeconfig
// supplied by the caller cannot make the server read a local file and post it
// to an identity provider of the caller's choosing.
func TestOIDCStart_DynamicClusterClientAssertionRejected(t *testing.T) {
	assertionFile := filepath.Join(t.TempDir(), "stolen.jwt")
	require.NoError(t, os.WriteFile(assertionFile, []byte("secret.token.value"), 0o600))

	idpRequests := 0

	idp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		idpRequests++

		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(idp.Close)

	handler, cluster := newOIDCTestHandler(t, &oidcTestServer{server: idp},
		withKubeconfigAuthProvider(kubeconfig.DynamicCluster, map[string]string{
			"client-id":             "test-client-id",
			"client-assertion-file": assertionFile,
			"idp-issuer-url":        idp.URL,
		}))

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet,
		"/oidc?cluster="+cluster, nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "client-assertion-file is not allowed in a dynamic cluster kubeconfig")
	assert.Empty(t, rr.Header().Get("Location"), "no login should start for a rejected context")
	assert.Zero(t, idpRequests, "the caller-supplied issuer should never be contacted")
}

// TestOIDCStart_StatelessDynamicClusterClientAssertionRejected walks the whole
// path a caller would take: a kubeconfig carrying the assertion file is handed
// over in the KUBECONFIG header of a cluster request, which caches it as a
// dynamic cluster context, and /oidc is then called for that context.
func TestOIDCStart_StatelessDynamicClusterClientAssertionRejected(t *testing.T) {
	const clusterName = "stateless-oidc"

	assertionFile := filepath.Join(t.TempDir(), "stolen.jwt")
	require.NoError(t, os.WriteFile(assertionFile, []byte("secret.token.value"), 0o600))

	idpRequests := 0
	idp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		idpRequests++

		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(idp.Close)

	kubeConfigStore := kubeconfig.NewContextStore()
	config := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				// The deployment mode this is reachable in. The flag itself gates
				// getContextKeyForRequest, which the test skips by calling
				// handleStatelessReq directly.
				EnableDynamicClusters: true,
				KubeConfigStore:       kubeConfigStore,
			},
			Cache:            cache.New[interface{}](),
			TelemetryConfig:  GetDefaultTestTelemetryConfig(),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}

	encodedKubeconfig := base64.StdEncoding.EncodeToString([]byte(statelessOIDCKubeconfig(idp.URL, assertionFile)))

	statelessReq := httptest.NewRequestWithContext(context.Background(), http.MethodGet,
		"/clusters/"+clusterName+"/api", nil)
	statelessReq = mux.SetURLVars(statelessReq, map[string]string{"clusterName": clusterName})

	// No X-HEADLAMP-USER-ID, so the cached context is keyed by cluster name alone
	// and /oidc?cluster=<name> reaches it.
	contextKey, err := config.handleStatelessReq(statelessReq, encodedKubeconfig)
	require.NoError(t, err)
	require.Equal(t, clusterName, contextKey)

	storedContext, err := kubeConfigStore.GetContext(contextKey)
	require.NoError(t, err)
	assert.Equal(t, kubeconfig.DynamicCluster, storedContext.Source)

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet,
		"/oidc?cluster="+contextKey, nil)
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	createHeadlampHandler(context.Background(), config).ServeHTTP(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "client-assertion-file is not allowed in a dynamic cluster kubeconfig")
	assert.Empty(t, rr.Header().Get("Location"), "no login should start for a rejected context")
	assert.Zero(t, idpRequests, "the caller-supplied issuer should never be contacted")
}

// TestOIDCStart_KubeconfigClientAssertionAccepted checks the same auth-provider
// key still works for a kubeconfig the server operator supplies.
func TestOIDCStart_KubeconfigClientAssertionAccepted(t *testing.T) {
	assertionFile := filepath.Join(t.TempDir(), "assertion.jwt")
	require.NoError(t, os.WriteFile(assertionFile, []byte("header.payload.signature"), 0o600))

	oidcSrv := newOIDCTestServer(t, nil)

	handler, cluster := newOIDCTestHandler(t, oidcSrv,
		withKubeconfigAuthProvider(kubeconfig.KubeConfig, map[string]string{
			"client-id":             "test-client-id",
			"client-assertion-file": assertionFile,
			"idp-issuer-url":        oidcSrv.URL(),
		}))

	state := extractState(t, driveOIDCStart(t, handler, cluster))
	assert.NotEmpty(t, state)
}

// newDynamicClusterHandler builds a handler that takes dynamic clusters and
// persists them under the test's own config dirs.
func newDynamicClusterHandler(t *testing.T, kubeConfigStore kubeconfig.ContextStore) http.Handler {
	t.Helper()

	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("APPDATA", t.TempDir())

	config := &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				EnableDynamicClusters: true,
				KubeConfigPath:        filepath.Join(t.TempDir(), "missing-kubeconfig"),
				KubeConfigStore:       kubeConfigStore,
			},
			Cache:            cache.New[interface{}](),
			TelemetryConfig:  GetDefaultTestTelemetryConfig(),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}

	return createHeadlampHandler(context.Background(), config)
}

// TestOIDCStart_RenamedDynamicClusterClientAssertionRejected covers the path a caller would
// take to launder a dynamic cluster into a trusted one. The caller first
// issues POST /cluster, then PUT /cluster/{name}, and finally hits /oidc
// under the new name. Renaming reloads the persisted kubeconfig, and any
// context that came back with the zero source would slip past the check
// in OidcConfig.
func TestOIDCStart_RenamedDynamicClusterClientAssertionRejected(t *testing.T) {
	const (
		clusterName = "stateless-oidc"
		renamedName = "renamed-oidc"
	)

	assertionFile := filepath.Join(t.TempDir(), "stolen.jwt")
	require.NoError(t, os.WriteFile(assertionFile, []byte("secret.token.value"), 0o600))

	idpRequests := 0
	idp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		idpRequests++

		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(idp.Close)

	kubeConfigStore := kubeconfig.NewContextStore()
	handler := newDynamicClusterHandler(t, kubeConfigStore)

	encodedKubeconfig := base64.StdEncoding.EncodeToString([]byte(statelessOIDCKubeconfig(idp.URL, assertionFile)))

	rr, err := getResponseFromRestrictedEndpoint(handler, http.MethodPost, "/cluster",
		ClusterReq{KubeConfig: &encodedKubeconfig})
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, rr.Code, "adding the dynamic cluster failed: %s", rr.Body.String())

	rr, err = getResponseFromRestrictedEndpoint(handler, http.MethodPut, "/cluster/"+clusterName,
		RenameClusterRequest{NewClusterName: renamedName, Source: "dynamic_cluster"})
	require.NoError(t, err)
	require.Equal(t, http.StatusCreated, rr.Code, "renaming the dynamic cluster failed: %s", rr.Body.String())

	storedContext, err := kubeConfigStore.GetContext(renamedName)
	require.NoError(t, err)
	assert.Equal(t, kubeconfig.DynamicCluster, storedContext.Source,
		"the rename must not clear the DynamicCluster mark")

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet,
		"/oidc?cluster="+renamedName, nil)
	require.NoError(t, err)

	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "client-assertion-file is not allowed in a dynamic cluster kubeconfig")
	assert.Empty(t, rr.Header().Get("Location"), "no login should start for a rejected context")
	assert.Zero(t, idpRequests, "the caller-supplied issuer should never be contacted")
}
