//nolint:testpackage // Exercises owner-scoped cached records through the authenticated handler.
package portforward

import (
	"crypto/tls"
	"encoding/base64"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	authenticationv1 "k8s.io/api/authentication/v1"
	"k8s.io/client-go/tools/clientcmd/api"
)

func portForwardProxyReviewContext(server, gateway string, ca []byte, provider bool) *kubeconfig.Context {
	kContext := &kubeconfig.Context{
		Name: "shared", Cluster: &api.Cluster{Server: server, InsecureSkipTLSVerify: true},
		KubeContext: &api.Context{Cluster: "api", AuthInfo: "user"}, AuthInfo: &api.AuthInfo{Token: "alice"},
	}
	if provider {
		kContext.AuthInfo = &api.AuthInfo{AuthProvider: &api.AuthProviderConfig{
			Name: "oidc", Config: map[string]string{
				"api-proxy": gateway, "api-proxy-ca-data": base64.StdEncoding.EncodeToString(ca),
			},
		}}
	} else {
		kContext.OidcConf = &kubeconfig.OidcConfig{APIProxy: &kubeconfig.APIProxySettings{
			URL: gateway, CACert: string(ca),
		}}
	}

	return kContext
}

//nolint:funlen // Verifies both proxy configuration sources and both request-token sources through creation.
func TestPortForwardRequestTokensPreserveAPIProxy(t *testing.T) {
	direct := newPortForwardTestAPI(t)

	var identityCalls, permissionCalls atomic.Int32

	gateway := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer alice", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")

		switch r.URL.Path {
		case "/gateway/apis/authentication.k8s.io/v1/selfsubjectreviews":
			identityCalls.Add(1)

			_, err := w.Write([]byte(`{"apiVersion":"authentication.k8s.io/v1","kind":"SelfSubjectReview",` +
				`"status":{"userInfo":{"username":"alice","uid":"alice-id"}}}`))
			require.NoError(t, err)
		case "/gateway/apis/authorization.k8s.io/v1/selfsubjectaccessreviews":
			permissionCalls.Add(1)

			_, err := w.Write([]byte(`{"apiVersion":"authorization.k8s.io/v1","kind":"SelfSubjectAccessReview",` +
				`"status":{"allowed":false,"reason":"gateway permission check reached"}}`))
			require.NoError(t, err)
		default:
			t.Errorf("unexpected gateway path %q", r.URL.Path)
			http.Error(w, "unexpected path", http.StatusNotFound)
		}
	}))
	t.Cleanup(gateway.Close)
	ca := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: gateway.Certificate().Raw})

	for _, test := range []struct{ provider, cookie bool }{
		{false, false}, {false, true}, {true, false}, {true, true},
	} {
		kContext := portForwardProxyReviewContext(direct.server.URL, gateway.URL+"/gateway", ca, test.provider)
		kContext.Cluster.CertificateAuthority = filepath.Join(t.TempDir(), "unused-api-server-ca.pem")
		store := kubeconfig.NewContextStore()
		require.NoError(t, store.AddContext(kContext))

		sessions := cache.New[interface{}]()

		t.Cleanup(func() { _ = sessions.Close() })

		for _, method := range []string{http.MethodGet, http.MethodPost} {
			request := httptest.NewRequestWithContext(t.Context(), method, "/clusters/shared/portforward",
				strings.NewReader(`{"id":"probe","pod":"p","namespace":"default","port":"8080","targetPort":"80"}`))
			if method == http.MethodGet {
				request.URL.Path += "/list"
			}

			request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})

			if test.cookie {
				cookies := httptest.NewRecorder()
				require.NoError(t, auth.SetTokenCookie(cookies, request, "shared", "alice", "", 3600))

				for _, value := range cookies.Result().Cookies() {
					if value.MaxAge > 0 {
						request.AddCookie(value)
					}
				}
			} else {
				request.Header.Set("Authorization", "Bearer alice")
			}

			before := identityCalls.Load()
			response := httptest.NewRecorder()
			RequestHandler(store, sessions, false, false, "shared", response, request)

			if method == http.MethodGet {
				require.Equal(t, http.StatusOK, response.Code, response.Body.String())
			} else {
				require.Equal(t, http.StatusInternalServerError, response.Code)
				require.Contains(t, response.Body.String(), "gateway permission check reached")
			}

			require.Equal(t, before+1, identityCalls.Load())
			require.Zero(t, direct.calls.Load(), "the direct API endpoint must not be used")
		}

		resolved, err := kContext.APIProxy()
		require.NoError(t, err)
		require.Equal(t, gateway.URL+"/gateway", resolved.URL, "the stored context must not be changed")
	}

	require.EqualValues(t, 4, permissionCalls.Load())
}

func TestPortForwardRejectsAPIProxyURLCredentials(t *testing.T) {
	direct := newPortForwardTestAPI(t)

	var calls atomic.Int32

	gateway := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, err := w.Write([]byte(`{"apiVersion":"authentication.k8s.io/v1","kind":"SelfSubjectReview",` +
			`"status":{"userInfo":{"username":"alice","uid":"alice-id"}}}`))
		require.NoError(t, err)
	}))
	t.Cleanup(gateway.Close)
	ca := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: gateway.Certificate().Raw})
	credentialed, err := url.Parse(gateway.URL)
	require.NoError(t, err)

	credentialed.User = url.UserPassword("configured-user", "configured-password")

	for _, provider := range []bool{false, true} {
		kContext := portForwardProxyReviewContext(direct.server.URL, credentialed.String(), ca, provider)
		store := kubeconfig.NewContextStore()
		require.NoError(t, store.AddContext(kContext))

		sessions := cache.New[interface{}]()

		t.Cleanup(func() { _ = sessions.Close() })

		for _, operation := range []struct{ method, path, body string }{
			{http.MethodGet, "/portforward/list", ""},
			{http.MethodGet, "/portforward?id=victim", ""},
			{http.MethodDelete, "/portforward", `{"id":"victim","stopOrDelete":true}`},
			{http.MethodPost, "/portforward", `{"pod":"p","namespace":"default","targetPort":"80"}`},
		} {
			request := httptest.NewRequestWithContext(t.Context(), operation.method, operation.path,
				strings.NewReader(operation.body))
			request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})
			request.Header.Set("Authorization", "Bearer forged")

			response := httptest.NewRecorder()
			RequestHandler(store, sessions, false, false, "shared", response, request)
			require.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())
			require.Zero(t, calls.Load(), "URL credentials must be rejected before contacting the gateway")
			require.Zero(t, direct.calls.Load())
		}
	}
}

//nolint:funlen // Exercises gateway, CA, and verification changes against surviving owner-scoped sessions.
func TestPortForwardAPIProxyReplacementIsolatesSessions(t *testing.T) {
	for _, change := range []string{"gateway", "ca", "skip-verification"} {
		t.Run(change, func(t *testing.T) {
			first, firstCA := portForwardTestAuthority(t)
			second, secondCA := portForwardTestAuthority(t)

			var certificate atomic.Pointer[tls.Certificate]
			certificate.Store(&first)

			var calls atomic.Int32

			handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.Header().Set("Content-Type", "application/json")

				if r.URL.Path == "/apis/authentication.k8s.io/v1/selfsubjectreviews" {
					_, err := w.Write([]byte(`{"apiVersion":"authentication.k8s.io/v1","kind":"SelfSubjectReview",` +
						`"status":{"userInfo":{"username":"alice","uid":"alice-id"}}}`))
					require.NoError(t, err)

					return
				}

				_, err := w.Write([]byte(`{"apiVersion":"authorization.k8s.io/v1","kind":"SelfSubjectAccessReview",` +
					`"status":{"allowed":false,"reason":"replacement gateway permission check reached"}}`))
				require.NoError(t, err)
			})
			gateway := httptest.NewUnstartedServer(handler)
			gateway.TLS = &tls.Config{
				MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{first},
				GetConfigForClient: func(*tls.ClientHelloInfo) (*tls.Config, error) {
					return &tls.Config{MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{*certificate.Load()}}, nil
				},
			}
			gateway.StartTLS()
			t.Cleanup(gateway.Close)

			other := httptest.NewUnstartedServer(handler)
			other.TLS = &tls.Config{MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{first}}
			other.StartTLS()
			t.Cleanup(other.Close)

			kContext := portForwardProxyReviewContext("https://unused.example", gateway.URL, firstCA, false)
			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(kContext))

			sessions := cache.New[interface{}]()

			t.Cleanup(func() { _ = sessions.Close() })

			key := portForwardOwnerKey("shared", &api.Cluster{
				Server: gateway.URL, CertificateAuthorityData: firstCA,
			}, authenticationv1.UserInfo{Username: "alice", UID: "alice-id"})
			closed := make(chan struct{})
			portforwardstore(sessions, portForward{
				ID: "victim", Cluster: "shared", cacheKey: key, Pod: "private-pod", Status: RUNNING, closeChan: closed,
			})

			router := mux.NewRouter()
			router.PathPrefix("/clusters/{clusterName}/portforward").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				RequestHandler(store, sessions, false, false, "shared", w, r)
			})
			server := httptest.NewServer(router)
			t.Cleanup(server.Close)
			status, body := portForwardTestRequest(t, server.URL, http.MethodGet,
				"/clusters/shared/portforward/list", "alice", "")
			require.Equal(t, http.StatusOK, status)
			require.Contains(t, body, "private-pod")

			original := *kContext.OidcConf.APIProxy

			switch change {
			case "gateway":
				kContext.OidcConf.APIProxy.URL = other.URL
			case "ca":
				certificate.Store(&second)

				kContext.OidcConf.APIProxy.CACert = string(secondCA)
			case "skip-verification":
				kContext.OidcConf.APIProxy.SkipTLSVerify = true
			}

			gateway.CloseClientConnections()

			before := calls.Load()
			status, body = portForwardTestRequest(t, server.URL, http.MethodGet,
				"/clusters/shared/portforward/list", "alice", "")
			require.Equal(t, http.StatusOK, status, body)
			require.JSONEq(t, "[]", body)
			require.Greater(t, calls.Load(), before, "the replacement must authenticate successfully")

			for _, operation := range []struct{ method, path, body string }{
				{http.MethodGet, "/clusters/shared/portforward?id=victim", ""},
				{http.MethodDelete, "/clusters/shared/portforward", `{"id":"victim","stopOrDelete":true}`},
				{http.MethodDelete, "/clusters/shared/portforward", `{"id":"victim","stopOrDelete":false}`},
			} {
				status, _ = portForwardTestRequest(t, server.URL, operation.method, operation.path, "alice", operation.body)
				require.Equal(t, http.StatusNotFound, status)
			}

			status, body = portForwardTestRequest(t, server.URL, http.MethodPost, "/clusters/shared/portforward",
				"alice", `{"id":"victim","pod":"p","namespace":"default","port":"8080","targetPort":"80"}`)
			require.Equal(t, http.StatusInternalServerError, status, body)
			require.Contains(t, body, "replacement gateway permission check reached")

			select {
			case <-closed:
				t.Fatal("replacement gateway stopped the original session")
			default:
			}

			*kContext.OidcConf.APIProxy = original

			certificate.Store(&first)
			gateway.CloseClientConnections()

			status, body = portForwardTestRequest(t, server.URL, http.MethodGet,
				"/clusters/shared/portforward/list", "alice-refreshed", "")
			require.Equal(t, http.StatusOK, status)
			require.Contains(t, body, "private-pod")
		})
	}
}

//nolint:funlen // Covers URL Basic-auth compatibility and request-token rejection on every operation.
func TestPortForwardRejectsURLCredentialsWithRequestToken(t *testing.T) {
	var calls atomic.Int32

	headers := make(chan string, 1)
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)

		user, password, ok := r.BasicAuth()
		if !ok || user != "configured-user" || password != "configured-password" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		select {
		case headers <- r.Header.Get("Authorization"):
		default:
		}

		w.Header().Set("Content-Type", "application/json")
		_, err := w.Write([]byte(`{"apiVersion":"authentication.k8s.io/v1","kind":"SelfSubjectReview",` +
			`"status":{"userInfo":{"username":"alice","uid":"alice-id"}}}`))
		require.NoError(t, err)
	}))
	t.Cleanup(upstream.Close)
	serverURL, err := url.Parse(upstream.URL)
	require.NoError(t, err)

	serverURL.User = url.UserPassword("configured-user", "configured-password")
	kContext := &kubeconfig.Context{
		Name: "shared", Source: kubeconfig.KubeConfig,
		Cluster:     &api.Cluster{Server: serverURL.String(), InsecureSkipTLSVerify: true},
		KubeContext: &api.Context{Cluster: "shared", AuthInfo: "shared"}, AuthInfo: &api.AuthInfo{},
	}
	store := kubeconfig.NewContextStore()
	require.NoError(t, store.AddContext(kContext))

	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })

	closed := make(chan struct{})
	key := portForwardOwnerKey("shared", kContext.Cluster,
		authenticationv1.UserInfo{Username: "alice", UID: "alice-id"})
	portforwardstore(sessions, portForward{
		ID: "victim", Cluster: "shared", cacheKey: key, Pod: "private-pod", Status: RUNNING, closeChan: closed,
	})

	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/portforward/list", nil)
	request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})
	response := httptest.NewRecorder()
	RequestHandler(store, sessions, false, false, "shared", response, request)
	require.Equal(t, http.StatusOK, response.Code, "trusted configured URL credentials remain supported")
	require.Contains(t, response.Body.String(), "private-pod")

	expected := &http.Request{Header: make(http.Header)}
	expected.SetBasicAuth("configured-user", "configured-password")
	require.Equal(t, expected.Header.Get("Authorization"), <-headers, "URL credentials become upstream Basic auth")

	for _, stateless := range []bool{false, true} {
		for _, token := range []string{"forged", "alice"} {
			for _, test := range []struct{ method, path, body string }{
				{http.MethodGet, "/portforward/list", ""},
				{http.MethodGet, "/portforward?id=victim", ""},
				{http.MethodDelete, "/portforward", `{"id":"victim","stopOrDelete":true}`},
				{http.MethodDelete, "/portforward", `{"id":"victim","stopOrDelete":false}`},
				{http.MethodPost, "/portforward", `{"pod":"p","namespace":"default","port":"8080","targetPort":"80"}`},
			} {
				request := httptest.NewRequestWithContext(t.Context(), test.method, test.path, strings.NewReader(test.body))
				request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})
				request.Header.Set("Authorization", "Bearer "+token)

				response := httptest.NewRecorder()
				before := calls.Load()

				if stateless {
					RequestHandlerWithContext(kContext, sessions, false, false, "shared", response, request)
				} else {
					RequestHandler(store, sessions, false, false, "shared", response, request)
				}

				require.Equal(t, http.StatusBadRequest, response.Code)
				require.Equal(t, before, calls.Load(), "request tokens must not reach URL Basic authentication")
				require.NotContains(t, response.Body.String(), "private-pod")
			}
		}
	}

	select {
	case <-closed:
		t.Fatal("a request token stopped the URL-authenticated session")
	default:
	}
}

//nolint:funlen // Verifies client-go's scheme-less credentials and IP normalization through real HTTP requests.
func TestPortForwardNormalizesSchemeLessServerCredentials(t *testing.T) {
	var calls atomic.Int32

	var header atomic.Value

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		header.Store(r.Header.Get("Authorization"))

		w.Header().Set("Content-Type", "application/json")
		_, err := w.Write([]byte(`{"apiVersion":"authentication.k8s.io/v1","kind":"SelfSubjectReview",` +
			`"status":{"userInfo":{"username":"alice","uid":"alice-id"}}}`))
		require.NoError(t, err)
	}))
	t.Cleanup(upstream.Close)

	host := strings.TrimPrefix(upstream.URL, "http://")
	for _, test := range []struct {
		name        string
		server      string
		credentials bool
	}{
		{name: "ip-port", server: host},
		{name: "credentials", server: "configured-user:configured-password@" + host, credentials: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			kContext := &kubeconfig.Context{
				Name: "shared", Source: kubeconfig.KubeConfig, Cluster: &api.Cluster{Server: test.server},
				KubeContext: &api.Context{Cluster: "shared", AuthInfo: "shared"}, AuthInfo: &api.AuthInfo{},
			}
			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(kContext))

			sessions := cache.New[interface{}]()

			t.Cleanup(func() { _ = sessions.Close() })

			key := portForwardOwnerKey("shared", kContext.Cluster,
				authenticationv1.UserInfo{Username: "alice", UID: "alice-id"})
			closed := make(chan struct{})
			portforwardstore(sessions, portForward{
				ID: "victim", Cluster: "shared", cacheKey: key, Pod: "private-pod", Status: RUNNING, closeChan: closed,
			})

			request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/portforward/list", nil)
			request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})
			response := httptest.NewRecorder()
			RequestHandler(store, sessions, false, false, "shared", response, request)
			require.Equal(t, http.StatusOK, response.Code, "configured scheme-less servers must remain supported")
			require.Contains(t, response.Body.String(), "private-pod")

			if test.credentials {
				expected := &http.Request{Header: make(http.Header)}
				expected.SetBasicAuth("configured-user", "configured-password")
				require.Equal(t, expected.Header.Get("Authorization"), header.Load())
			} else {
				require.Empty(t, header.Load())
			}

			for _, fresh := range []bool{false, true} {
				request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/portforward/list", nil)
				request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})
				request.Header.Set("Authorization", "Bearer request-token")

				response := httptest.NewRecorder()
				before := calls.Load()

				if fresh {
					RequestHandlerWithContext(kContext, sessions, false, false, "shared", response, request)
				} else {
					RequestHandler(store, sessions, false, false, "shared", response, request)
				}

				if test.credentials {
					require.Equal(t, http.StatusBadRequest, response.Code)
					require.Equal(t, before, calls.Load(), "credentials must be rejected before authentication")
					require.NotContains(t, response.Body.String(), "private-pod")
				} else {
					require.Equal(t, http.StatusOK, response.Code, "valid IP:port must pass URL validation")
					require.Greater(t, calls.Load(), before)
					require.Equal(t, "Bearer request-token", header.Load())
				}
			}
		})
	}
}

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
		RequestHandler(store, sessions, false, false, "shared", w, r)
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
		Name: cluster, Source: kubeconfig.KubeConfig,
		Cluster:     &api.Cluster{Server: upstream.server.URL, InsecureSkipTLSVerify: true},
		KubeContext: &api.Context{Cluster: cluster, AuthInfo: cluster}, AuthInfo: &api.AuthInfo{Token: "alice"},
	}))

	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/portforward/list", nil)
	request = mux.SetURLVars(request, map[string]string{"clusterName": cluster})
	response := httptest.NewRecorder()
	RequestHandler(store, sessions, false, false, cluster, response, request)
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
		RequestHandler(store, sessions, false, false, contextKey, w, r)
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

func TestRequestContextRejectsLocalCredentialProviders(t *testing.T) {
	upstream := newPortForwardTestAPI(t)
	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })

	for _, test := range []struct {
		name string
		info *api.AuthInfo
		want int
	}{
		{"token-file", &api.AuthInfo{TokenFile: "/backend/token"}, http.StatusBadRequest},
		{"certificate-file", &api.AuthInfo{ClientCertificate: "/backend/client.crt"}, http.StatusBadRequest},
		{"key-file", &api.AuthInfo{ClientKey: "/backend/client.key"}, http.StatusBadRequest},
		{"exec", &api.AuthInfo{Exec: &api.ExecConfig{Command: "/backend/provider"}}, http.StatusBadRequest},
		{"auth-provider", &api.AuthInfo{AuthProvider: &api.AuthProviderConfig{Name: "oidc"}}, http.StatusUnauthorized},
	} {
		t.Run(test.name, func(t *testing.T) {
			kContext := &kubeconfig.Context{
				Name: "shared", Cluster: &api.Cluster{Server: upstream.server.URL, InsecureSkipTLSVerify: true},
				KubeContext: &api.Context{Cluster: "api", AuthInfo: "user"}, AuthInfo: test.info,
			}
			request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/portforward/list", nil)
			request = mux.SetURLVars(request, map[string]string{"clusterName": "shared"})
			response := httptest.NewRecorder()
			before := upstream.calls.Load()

			RequestHandlerWithContext(kContext, sessions, true, false, "shared", response, request)
			require.Equal(t, test.want, response.Code)
			require.Equal(t, before, upstream.calls.Load(), "provider must not be resolved before rejection")
			request.Header.Set("Authorization", "Bearer bob")

			response = httptest.NewRecorder()
			RequestHandlerWithContext(kContext, sessions, true, false, "shared", response, request)
			require.Equal(t, http.StatusOK, response.Code)
			require.Equal(t, test.info, kContext.AuthInfo, "request authentication must not modify the original context")
		})
	}
}
