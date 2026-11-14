//nolint:testpackage // Exercises owner-scoped cached records through the authenticated handler.
package portforward

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	authenticationv1 "k8s.io/api/authentication/v1"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestPortForwardRejectsEmptySuppliedCredentials(t *testing.T) {
	upstream := newPortForwardTestAPI(t)
	store := portForwardTestStore(t, upstream.server.URL)
	kContext, err := store.GetContext("shared")
	require.NoError(t, err)

	kContext.AuthInfo.Token = "alice"
	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })

	router := mux.NewRouter()
	router.HandleFunc("/clusters/{clusterName}/portforward/list", func(w http.ResponseWriter, r *http.Request) {
		RequestHandler(store, sessions, false, "shared", w, r)
	})
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)

	for _, header := range []string{"", " ", "Bearer \u00a0", "Bearer\t\u00a0"} {
		request, err := http.NewRequestWithContext(t.Context(), http.MethodGet,
			server.URL+"/clusters/shared/portforward/list", nil)
		require.NoError(t, err)
		request.Header.Set("Authorization", header)
		response, err := http.DefaultClient.Do(request)
		require.NoError(t, err)

		_ = response.Body.Close()
		require.Equal(t, http.StatusUnauthorized, response.StatusCode, "%q", header)
	}

	require.Zero(t, upstream.calls.Load(), "invalid supplied credentials must not use stored authentication")
}

func TestPortForwardUnicodeStaticContext(t *testing.T) {
	upstream := newPortForwardTestAPI(t)
	store := kubeconfig.NewContextStore()

	const cluster = "\u751f\u4ea7\u96c6\u7fa4"
	require.NoError(t, store.AddContext(&kubeconfig.Context{
		Name: cluster, Cluster: &api.Cluster{Server: upstream.server.URL, InsecureSkipTLSVerify: true},
		KubeContext: &api.Context{Cluster: cluster, AuthInfo: cluster}, AuthInfo: &api.AuthInfo{Token: "alice"},
	}))

	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/portforward/list", nil)
	request = mux.SetURLVars(request, map[string]string{"clusterName": cluster})
	response := httptest.NewRecorder()
	RequestHandler(store, sessions, false, cluster, response, request)
	require.Equal(t, http.StatusOK, response.Code)
	require.JSONEq(t, "[]", response.Body.String())
}

//nolint:funlen // Covers context replacement, preserved sessions and original-authority restoration.
func TestPortForwardContextReplacementPinsAuthority(t *testing.T) {
	upstream := newPortForwardTestAPI(t)
	store := portForwardTestStore(t, upstream.server.URL)
	victim, err := store.GetContext("shared")
	require.NoError(t, err)

	contextKey := "shared\x00known-routing-id"
	victim = victim.Copy()
	victim.Internal = true
	require.NoError(t, store.AddContextWithKeyAndTTL(victim, contextKey, time.Minute))

	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })

	key := portForwardOwnerKey(contextKey, victim.Cluster, authenticationv1.UserInfo{Username: "alice", UID: "alice-id"})
	closed := make(chan struct{})
	portforwardstore(sessions, portForward{
		ID: "victim", Cluster: "shared", cacheKey: key, Pod: "private-pod",
		Status: RUNNING, closeChan: closed,
	})

	router := mux.NewRouter()
	router.PathPrefix("/clusters/{clusterName}/portforward").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		RequestHandler(store, sessions, false, contextKey, w, r)
	})
	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	status, body := portForwardTestRequest(t, server.URL, http.MethodGet,
		"/clusters/shared/portforward/list", "alice", "")
	require.Equal(t, http.StatusOK, status)
	require.Contains(t, body, "private-pod")

	impostor := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, err := w.Write([]byte(`{"apiVersion":"authentication.k8s.io/v1","kind":"SelfSubjectReview",` +
			`"status":{"userInfo":{"username":"alice","uid":"alice-id"}}}`))
		require.NoError(t, err)
	}))
	t.Cleanup(impostor.Close)

	replacement := victim.Copy()
	replacement.Cluster.Server = impostor.URL

	require.NoError(t, store.RemoveContext(contextKey))
	require.NoError(t, store.AddContextWithKeyAndTTL(replacement, contextKey, time.Minute))

	status, body = portForwardTestRequest(t, server.URL, http.MethodGet,
		"/clusters/shared/portforward/list", "forged", "")
	require.Equal(t, http.StatusOK, status)
	require.JSONEq(t, "[]", body)

	for _, test := range []struct{ method, path, body string }{
		{http.MethodGet, "/clusters/shared/portforward?id=victim", ""},
		{http.MethodDelete, "/clusters/shared/portforward", `{"id":"victim","stopOrDelete":true}`},
		{http.MethodDelete, "/clusters/shared/portforward", `{"id":"victim","stopOrDelete":false}`},
	} {
		status, _ = portForwardTestRequest(t, server.URL, test.method, test.path, "forged", test.body)
		require.Equal(t, http.StatusNotFound, status)
	}

	select {
	case <-closed:
		t.Fatal("replacement authority stopped the original session")
	default:
	}

	require.NoError(t, store.RemoveContext(contextKey))
	require.NoError(t, store.AddContextWithKeyAndTTL(victim, contextKey, time.Minute))
	status, body = portForwardTestRequest(t, server.URL, http.MethodGet,
		"/clusters/shared/portforward/list", "alice-refreshed", "")
	require.Equal(t, http.StatusOK, status)
	require.Contains(t, body, "private-pod")
}

func TestPortForwardOwnerScopePinsTransportTrust(t *testing.T) {
	cluster := &api.Cluster{Server: "https://api.example"}
	user := authenticationv1.UserInfo{Username: "alice", UID: "alice-id"}
	original := portForwardOwnerKey("shared", cluster, user)

	for _, test := range []struct {
		name   string
		change func(*api.Cluster)
	}{
		{"endpoint", func(c *api.Cluster) { c.Server = "https://other.example" }},
		{"tls-name", func(c *api.Cluster) { c.TLSServerName = "other.example" }},
		{"insecure-tls", func(c *api.Cluster) { c.InsecureSkipTLSVerify = true }},
		{"ca-file", func(c *api.Cluster) { c.CertificateAuthority = "/configured/ca.pem" }},
		{"ca-data", func(c *api.Cluster) { c.CertificateAuthorityData = []byte("different trust root") }},
		{"proxy", func(c *api.Cluster) { c.ProxyURL = "https://proxy.example" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			replacement := cluster.DeepCopy()
			test.change(replacement)
			require.NotEqual(t, original, portForwardOwnerKey("shared", replacement, user))
		})
	}

	require.Equal(t, original, portForwardOwnerKey("shared", cluster.DeepCopy(), user))
}
