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

package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

const (
	// oidcTestCallbackPort must match the redirectURIs entry in
	// headlamp_testdata/dex-integration.yaml. Dex matches redirect URIs
	// exactly, so the test server cannot take an ephemeral port.
	oidcTestCallbackPort = 18080
	oidcTestCluster      = "oidc-test"
	oidcTestClientID     = "headlamp-test"
	oidcTestClientSecret = "headlamp-test-secret" // #nosec G101 -- static Dex test-fixture secret, not a real credential
)

// requireDexIssuer skips unless the integration suite is enabled and a Dex
// issuer URL was supplied. Both are required: backend-test.yml sets
// HEADLAMP_RUN_INTEGRATION_TESTS for the whole workflow, so gating on it
// alone would fail every backend PR on runners without Dex.
func requireDexIssuer(t *testing.T) string {
	t.Helper()

	if os.Getenv("HEADLAMP_RUN_INTEGRATION_TESTS") != "true" {
		t.Skip("skipping integration test")
	}

	issuer := os.Getenv("HEADLAMP_TEST_OIDC_ISSUER")
	if issuer == "" {
		t.Skip("skipping OIDC integration test: HEADLAMP_TEST_OIDC_ISSUER is not set")
	}

	return issuer
}

// newOIDCIntegrationConfig builds a server config whose single cluster carries
// an OIDC provider. OidcConf is set directly, so no kubeconfig file is needed:
// Context.OidcConfig returns OidcConf verbatim when it is non-nil
// (backend/pkg/kubeconfig/kubeconfig.go:342).
func newOIDCIntegrationConfig(t *testing.T, issuer string) *HeadlampConfig {
	t.Helper()

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: oidcTestCluster,
		// Never dialled: neither /oidc nor /oidc-callback contacts the API server.
		Cluster:  &api.Cluster{Server: "https://127.0.0.1:6443"},
		AuthInfo: &api.AuthInfo{},
		OidcConf: &kubeconfig.OidcConfig{
			ClientID:     oidcTestClientID,
			ClientSecret: oidcTestClientSecret,
			IdpIssuerURL: issuer,
			// offline_access is what makes Dex issue a refresh token.
			Scopes: []string{"email", "groups", "offline_access"},
		},
	}))

	return &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore: store,
			},
			OidcCallbackURL: fmt.Sprintf(
				"http://127.0.0.1:%d/oidc-callback", oidcTestCallbackPort),
			Cache:            cache.New[interface{}](),
			TelemetryConfig:  GetDefaultTestTelemetryConfig(),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}
}

// startOIDCIntegrationServer serves the real router on the fixed callback port.
func startOIDCIntegrationServer(t *testing.T, cfg *HeadlampConfig) *httptest.Server {
	t.Helper()

	lc := net.ListenConfig{}

	ln, err := lc.Listen(context.Background(), "tcp", fmt.Sprintf("127.0.0.1:%d", oidcTestCallbackPort))
	require.NoError(t, err, "port %d busy; another test server may still be running",
		oidcTestCallbackPort)

	// createHeadlampHandler starts a state-eviction goroutine that only stops
	// on ctx.Done() (backend/cmd/headlamp.go:868-880). Each test builds a fresh
	// server, so a cancelable context is required here to stop that goroutine
	// on cleanup instead of leaking it for the life of the test binary.
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	srv := httptest.NewUnstartedServer(createHeadlampHandler(ctx, cfg))
	require.NoError(t, srv.Listener.Close())
	srv.Listener = ln
	srv.Start()
	t.Cleanup(srv.Close)

	return srv
}

// runOIDCLoginFlow drives GET /oidc through Dex and back to /oidc-callback.
// With skipApprovalScreen and a lone mockCallback connector, every hop is a
// redirect, so the default client policy walks the entire flow.
func runOIDCLoginFlow(t *testing.T, srv *httptest.Server) (*http.Response, *cookiejar.Jar) {
	t.Helper()

	jar, err := cookiejar.New(nil)
	require.NoError(t, err)

	client := &http.Client{Jar: jar}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet,
		fmt.Sprintf("%s/oidc?cluster=%s", srv.URL, oidcTestCluster), nil)
	require.NoError(t, err)

	resp, err := client.Do(req)
	require.NoError(t, err)

	defer func() { _ = resp.Body.Close() }()

	return resp, jar
}

// authTokenFromJar reads the auth cookie back through the production reader,
// which reassembles the chunked cookie the handler writes.
func authTokenFromJar(t *testing.T, srv *httptest.Server, jar *cookiejar.Jar) string {
	t.Helper()

	u, err := url.Parse(srv.URL)
	require.NoError(t, err)

	// The cookie is scoped to GetCookiePath("", cluster) == "/clusters/<cluster>"
	// (backend/pkg/auth/cookies.go:33). cookiejar only hands back cookies whose
	// path matches the request URL, so querying the jar at "/" returns nothing.
	u.Path = "/clusters/" + oidcTestCluster

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
	for _, c := range jar.Cookies(u) {
		req.AddCookie(c)
	}

	token, err := auth.GetTokenFromCookie(req, oidcTestCluster)
	require.NoError(t, err)
	// GetTokenFromCookie returns ("", nil) when nothing is present
	// (cookies.go:135), so a missing value is silent without this.
	require.NotEmpty(t, token, "no auth cookie found in jar for %s", u.Path)

	return token
}

func TestOIDCIntegration_LoginSucceeds(t *testing.T) {
	issuer := requireDexIssuer(t)

	cfg := newOIDCIntegrationConfig(t, issuer)
	srv := startOIDCIntegrationServer(t, cfg)

	resp, jar := runOIDCLoginFlow(t, srv) //nolint:bodyclose // closed inside runOIDCLoginFlow via defer

	// The callback ends with 303 -> /auth?cluster=<name>. The client follows
	// it; the SPA route is not served here, so only the path is asserted.
	require.Equal(t, oidcTestCluster, resp.Request.URL.Query().Get("cluster"))
	assert.Equal(t, "/auth", resp.Request.URL.Path)

	// A token reached the browser, and it is a real JWT: /oidc-callback only
	// gets this far after Verifier.Verify checks the signature against Dex's
	// live JWKS. No test on main exercises that path.
	rawToken := authTokenFromJar(t, srv, jar)
	require.NotEmpty(t, rawToken)
	assert.Len(t, strings.Split(rawToken, "."), 3, "ID token should be a JWT")

	// The handler caches the refresh token under oidc-token-<raw>. Dex issues
	// one because the config requests offline_access.
	cached, err := cfg.Cache.Get(context.Background(), "oidc-token-"+rawToken)
	require.NoError(t, err)

	refreshToken, ok := cached.(string)
	require.True(t, ok, "cached refresh token should be a string")
	assert.NotEmpty(t, refreshToken)
}

func TestOIDCIntegration_LoginSucceedsWithPKCE(t *testing.T) {
	issuer := requireDexIssuer(t)

	cfg := newOIDCIntegrationConfig(t, issuer)
	// Sends code_challenge on /oidc and code_verifier on exchange.
	cfg.OidcUsePKCE = true

	srv := startOIDCIntegrationServer(t, cfg)

	resp, jar := runOIDCLoginFlow(t, srv) //nolint:bodyclose // closed inside runOIDCLoginFlow via defer

	// Dex rejects a mismatched or malformed verifier at the token endpoint,
	// which surfaces as a 500 from /oidc-callback rather than this redirect.
	require.Equal(t, oidcTestCluster, resp.Request.URL.Query().Get("cluster"))
	assert.Equal(t, "/auth", resp.Request.URL.Path)

	rawToken := authTokenFromJar(t, srv, jar)
	assert.Len(t, strings.Split(rawToken, "."), 3, "ID token should be a JWT")
}
