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
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func newSetTokenConfig(t *testing.T, disableTokenLogin bool, contexts ...*kubeconfig.Context) *HeadlampConfig {
	t.Helper()

	store := kubeconfig.NewContextStore()
	for _, c := range contexts {
		require.NoError(t, store.AddContext(c))
	}

	return &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				KubeConfigStore:   store,
				DisableTokenLogin: disableTokenLogin,
			},
			Cache:            cache.New[interface{}](),
			TelemetryHandler: &telemetry.RequestHandler{},
		},
	}
}

const ssoCluster = "sso-cluster"

func oidcContext() *kubeconfig.Context {
	return &kubeconfig.Context{
		Name:     ssoCluster,
		Cluster:  &api.Cluster{Server: "https://example.invalid"},
		AuthInfo: &api.AuthInfo{},
		OidcConf: &kubeconfig.OidcConfig{IdpIssuerURL: "https://idp.example.invalid", ClientID: "test-client"},
	}
}

func postSetToken(t *testing.T, cfg *HeadlampConfig, cluster, token string) *httptest.ResponseRecorder {
	t.Helper()

	req, err := makeJSONReq(http.MethodPost, "/clusters/"+cluster+"/set-token", map[string]string{"token": token})
	require.NoError(t, err)

	rr := httptest.NewRecorder()
	createHeadlampHandler(context.Background(), cfg).ServeHTTP(rr, req)

	return rr
}

func TestSetToken_DisableTokenLogin_AllowsClearingTokenForOIDCCluster(t *testing.T) {
	setupTestEnv(t)

	cfg := newSetTokenConfig(t, true, oidcContext())

	rr := postSetToken(t, cfg, ssoCluster, "")

	require.Equal(t, http.StatusOK, rr.Code)
	require.NotEmpty(t, rr.Result().Cookies(), "clearing a session must still expire the auth cookie")
}

func TestSetToken_DisableTokenLogin_AllowsTokenForNonOIDCCluster(t *testing.T) {
	setupTestEnv(t)

	tokenOnly := &kubeconfig.Context{
		Name:     "token-cluster",
		Cluster:  &api.Cluster{Server: "https://example.invalid"},
		AuthInfo: &api.AuthInfo{},
	}
	cfg := newSetTokenConfig(t, true, tokenOnly)

	rr := postSetToken(t, cfg, "token-cluster", "pasted-service-account-token")

	require.Equal(t, http.StatusOK, rr.Code)
	require.NotEmpty(t, rr.Result().Cookies(), "a cluster without OIDC must keep accepting tokens")
}

func TestSetToken_TokenLoginEnabledByDefault_AllowsTokenForOIDCCluster(t *testing.T) {
	setupTestEnv(t)

	cfg := newSetTokenConfig(t, false, oidcContext())

	rr := postSetToken(t, cfg, ssoCluster, "pasted-service-account-token")

	require.Equal(t, http.StatusOK, rr.Code)
	require.NotEmpty(t, rr.Result().Cookies(), "without the flag, token login must behave as before")
}

// A cluster that is not in the store (for example a stateless cluster built from a
// user supplied kubeconfig) is not an administrator-managed SSO cluster, so it is not blocked.
func TestSetToken_DisableTokenLogin_DoesNotBlockUnknownCluster(t *testing.T) {
	setupTestEnv(t)

	cfg := newSetTokenConfig(t, true, oidcContext())

	rr := postSetToken(t, cfg, "not-in-store", "pasted-service-account-token")

	require.Equal(t, http.StatusOK, rr.Code)
}

// The cookie name drops non [a-zA-Z0-9-_] characters and Go drops invalid bytes (such as ';')
// from the cookie path, so "sso-cluster;" would store a cookie that is sent to "sso-cluster".
func TestSetToken_DisableTokenLogin_RejectsAliasOfOIDCCluster(t *testing.T) {
	setupTestEnv(t)

	cfg := newSetTokenConfig(t, true, oidcContext())

	rr := postSetToken(t, cfg, ssoCluster+"%3B", "pasted-service-account-token")

	require.Equal(t, http.StatusForbidden, rr.Code)
	require.Empty(t, rr.Result().Cookies(), "an alias of an OIDC cluster must not get a token cookie")
}

func TestSetToken_DisableTokenLogin_RejectsNonASCIIAliasOfOIDCCluster(t *testing.T) {
	setupTestEnv(t)

	cfg := newSetTokenConfig(t, true, oidcContext())

	rr := postSetToken(t, cfg, ssoCluster+"%C3%A9", "pasted-service-account-token")

	require.Equal(t, http.StatusForbidden, rr.Code)
	require.Empty(t, rr.Result().Cookies(), "an alias of an OIDC cluster must not get a token cookie")
}

// Browsers trim trailing spaces from the cookie path and the cookie name drops them too.
func TestSetToken_DisableTokenLogin_RejectsTrailingSpaceAliasOfOIDCCluster(t *testing.T) {
	setupTestEnv(t)

	cfg := newSetTokenConfig(t, true, oidcContext())

	rr := postSetToken(t, cfg, ssoCluster+"%20", "pasted-service-account-token")

	require.Equal(t, http.StatusForbidden, rr.Code)
	require.Empty(t, rr.Result().Cookies(), "an alias of an OIDC cluster must not get a token cookie")
}

func TestSetToken_DisableTokenLogin_RejectsTokenForOIDCCluster(t *testing.T) {
	setupTestEnv(t)

	cfg := newSetTokenConfig(t, true, oidcContext())

	rr := postSetToken(t, cfg, ssoCluster, "pasted-service-account-token")

	require.Equal(t, http.StatusForbidden, rr.Code)
	require.Empty(t, rr.Result().Cookies(), "a rejected token must not be stored in a cookie")
}
