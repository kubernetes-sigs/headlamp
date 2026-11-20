package main

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestPortForwardRoutesRejectForgedCredentials(t *testing.T) {
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("KUBERNETES_SERVICE_PORT", "")
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())

	var authenticationCalls atomic.Int32

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/apis/authentication.k8s.io/v1/selfsubjectreviews", r.URL.Path)
		require.Equal(t, "Bearer forged", r.Header.Get("Authorization"))
		authenticationCalls.Add(1)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	}))
	t.Cleanup(upstream.Close)

	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: "shared", Cluster: &api.Cluster{Server: upstream.URL},
		KubeContext: &api.Context{Cluster: "shared", AuthInfo: "oidc"}, AuthInfo: &api.AuthInfo{},
	}))

	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })

	handler := createHeadlampHandler(t.Context(), &HeadlampConfig{
		//nolint:gosec // ProxyAuthTokenHeader names an HTTP header, not a credential.
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				UseInCluster: true, KubeConfigStore: store,
				KubeConfigPath: filepath.Join(t.TempDir(), "missing-kubeconfig"),
			},
			Cache:                sessions,
			ProxyAuthEnabled:     true,
			ProxyAuthTokenHeader: "X-Forwarded-Token",
		},
	})

	for _, test := range []struct{ method, path, body string }{
		{http.MethodGet, "/clusters/shared/portforward/list", ""},
		{http.MethodGet, "/clusters/shared/portforward?id=victim", ""},
		{http.MethodDelete, "/clusters/shared/portforward", `{"id":"victim","stopOrDelete":false}`},
		{http.MethodPost, "/clusters/shared/portforward", `{"pod":"p","namespace":"default","targetPort":"80"}`},
	} {
		for _, header := range []string{"Authorization", "X-Forwarded-Token"} {
			request := httptest.NewRequestWithContext(t.Context(), test.method, test.path, strings.NewReader(test.body))
			if header == "Authorization" {
				request.Header.Set(header, "Bearer forged")
			} else {
				request.Header.Set(header, "forged")
			}

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			require.Equal(t, http.StatusUnauthorized, response.Code, test.path)
		}
	}

	require.EqualValues(t, 8, authenticationCalls.Load())
}
