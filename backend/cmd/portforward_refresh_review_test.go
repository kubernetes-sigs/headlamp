package main

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

//nolint:funlen // Exercises credential rejection before a real refresh through the fully wrapped server handler.
func TestPortForwardValidatesAuthorizationBeforeRefresh(t *testing.T) {
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("KUBERNETES_SERVICE_PORT", "")
	upstream, seen := portForwardReviewIdentityAPI(t)

	var (
		refreshCalls atomic.Int32
		issuer       *httptest.Server
	)

	issuer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			if err := json.NewEncoder(w).Encode(map[string]string{
				"issuer": issuer.URL, "token_endpoint": issuer.URL + "/token", "jwks_uri": issuer.URL + "/jwks",
			}); err != nil {
				t.Error(err)
			}
		case "/token":
			refreshCalls.Add(1)

			_, err := w.Write([]byte(`{"access_token":"alice","id_token":"alice","token_type":"Bearer",` +
				`"expires_in":3600,"refresh_token":"next"}`))
			if err != nil {
				t.Error(err)
			}
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(issuer.Close)

	store := kubeconfig.NewContextStore()
	kContext := portForwardReviewContext(upstream.URL, "bob")
	kContext.OidcConf = &kubeconfig.OidcConfig{
		ClientID: "test-client", IdpIssuerURL: issuer.URL, Scopes: []string{"openid"},
	}
	require.NoError(t, store.AddContext(kContext))

	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })

	expiry, err := json.Marshal(map[string]int64{"exp": time.Now().Add(auth.JWTExpirationTTL / 2).Unix()})
	require.NoError(t, err)

	oldToken := "e30." + base64.RawURLEncoding.EncodeToString(expiry) + ".signature"
	require.True(t, auth.IsTokenAboutToExpire(oldToken))
	cached := (&oauth2.Token{RefreshToken: "refresh"}).WithExtra(map[string]interface{}{"id_token": oldToken})
	require.NoError(t, auth.CacheRefreshedToken(cached, "id_token", oldToken, "refresh", sessions))
	config := &HeadlampConfig{HeadlampConfig: &headlampconfig.HeadlampConfig{
		HeadlampCFG: &headlampconfig.HeadlampCFG{
			UseInCluster: true, KubeConfigStore: store, KubeConfigDir: t.TempDir(), SessionTTL: 3600,
			KubeConfigPath: filepath.Join(t.TempDir(), "missing"),
		},
		Cache: sessions, TelemetryHandler: &telemetry.RequestHandler{},
	}}
	handler, err := serverHandler(t.Context(), config)
	require.NoError(t, err)

	requestFor := func(headers []string) *http.Request {
		t.Helper()

		request := httptest.NewRequestWithContext(t.Context(), http.MethodGet,
			"/clusters/shared/portforward/list", nil)
		if headers != nil {
			request.Header["Authorization"] = headers
		}

		cookies := httptest.NewRecorder()
		require.NoError(t, auth.SetTokenCookie(cookies, request, "shared", oldToken, "", 3600))

		for _, cookie := range cookies.Result().Cookies() {
			if cookie.MaxAge > 0 {
				request.AddCookie(cookie)
			}
		}

		return request
	}

	for _, headers := range [][]string{{""}, {"Bearer \u00a0"}, {"Bearer " + oldToken, "Bearer forged"}} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, requestFor(headers))
		require.Equal(t, http.StatusUnauthorized, response.Code)
		require.Empty(t, response.Result().Cookies(), "invalid credentials must not receive refreshed cookies")
		require.Zero(t, refreshCalls.Load(), "validation must precede refresh")

		select {
		case got := <-seen:
			t.Fatalf("invalid request reached Kubernetes with %q", got)
		default:
		}
	}

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, requestFor(nil))
	require.Equal(t, http.StatusOK, response.Code)
	require.EqualValues(t, 1, refreshCalls.Load(), "legitimate cookie-only refresh must still work")

	select {
	case got := <-seen:
		require.Equal(t, "Bearer alice", got)
	case <-time.After(time.Second):
		t.Fatal("renewed credential did not reach Kubernetes")
	}
}
