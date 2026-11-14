package main

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/auth"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	authenticationv1 "k8s.io/api/authentication/v1"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

func portForwardReviewIdentityAPI(t *testing.T) (*httptest.Server, chan string) {
	t.Helper()

	seen := make(chan string, 64)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		seen <- header

		if r.URL.Path != "/apis/authentication.k8s.io/v1/selfsubjectreviews" {
			http.Error(w, "permission denied", http.StatusForbidden)
			return
		}

		user := ""

		switch header {
		case "Bearer alice":
			user = "alice"
		case "Bearer bob":
			user = "bob"
		default:
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		review := authenticationv1.SelfSubjectReview{}
		review.APIVersion, review.Kind = "authentication.k8s.io/v1", "SelfSubjectReview"

		review.Status.UserInfo = authenticationv1.UserInfo{Username: user, UID: user + "-id"}
		if err := json.NewEncoder(w).Encode(review); err != nil {
			t.Error(err)
		}
	}))
	t.Cleanup(server.Close)

	return server, seen
}

func portForwardReviewServer(t *testing.T, store kubeconfig.ContextStore,
	proxyHeader string, dynamic bool,
) *httptest.Server {
	t.Helper()
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("KUBERNETES_SERVICE_PORT", "")

	sessions := cache.New[interface{}]()

	t.Cleanup(func() { _ = sessions.Close() })
	handler := createHeadlampHandler(t.Context(), &HeadlampConfig{
		HeadlampConfig: &headlampconfig.HeadlampConfig{
			HeadlampCFG: &headlampconfig.HeadlampCFG{
				UseInCluster: true, KubeConfigStore: store, EnableDynamicClusters: dynamic,
				KubeConfigPath: filepath.Join(t.TempDir(), "missing"), KubeConfigDir: t.TempDir(),
			},
			Cache: sessions, ProxyAuthEnabled: proxyHeader != "", ProxyAuthTokenHeader: proxyHeader,
		},
	})
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	return server
}

func portForwardReviewContext(name, server, token string) *kubeconfig.Context {
	return &kubeconfig.Context{
		Name: name, Cluster: &api.Cluster{Server: server, InsecureSkipTLSVerify: true},
		KubeContext: &api.Context{Cluster: name, AuthInfo: name}, AuthInfo: &api.AuthInfo{Token: token},
	}
}

func TestPortForwardProxyAuthorizationNormalization(t *testing.T) {
	upstream, seen := portForwardReviewIdentityAPI(t)
	for _, proxyHeader := range []string{"Authorization", "authorization", "AUTHORIZATION", "X-Forwarded-Token"} {
		t.Run(proxyHeader, func(t *testing.T) {
			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(portForwardReviewContext("shared", upstream.URL, "bob")))

			server := portForwardReviewServer(t, store, proxyHeader, false)
			for _, test := range []struct {
				value string
				want  int
				wire  string
			}{
				{"alice", http.StatusOK, "Bearer alice"},
				{"Bearer alice", http.StatusOK, "Bearer alice"},
				{"bEaReR alice", http.StatusOK, "Bearer alice"},
				{"forged", http.StatusUnauthorized, "Bearer forged"},
				{"Bearer forged", http.StatusUnauthorized, "Bearer forged"},
				{"", http.StatusUnauthorized, ""},
				{"Bearer \u00a0", http.StatusUnauthorized, ""},
			} {
				request, err := http.NewRequestWithContext(t.Context(), http.MethodGet,
					server.URL+"/clusters/shared/portforward/list", nil)
				require.NoError(t, err)
				request.Header.Set(proxyHeader, test.value)

				cookies := httptest.NewRecorder()
				require.NoError(t, auth.SetTokenCookie(cookies, request, "shared", "alice", "", 3600))

				for _, cookie := range cookies.Result().Cookies() {
					if cookie.MaxAge > 0 {
						request.AddCookie(cookie)
					}
				}

				response, err := http.DefaultClient.Do(request)
				require.NoError(t, err)

				_ = response.Body.Close()
				require.Equal(t, test.want, response.StatusCode, "%s: %q", proxyHeader, test.value)

				if test.wire == "" {
					select {
					case got := <-seen:
						t.Fatalf("invalid supplied credential used upstream authentication: %q", got)
					default:
					}
				} else {
					select {
					case got := <-seen:
						require.Equal(t, test.wire, got)
					case <-time.After(time.Second):
						t.Fatal("authentication request missing")
					}
				}
			}
		})
	}
}

func portForwardReviewKubeconfig(t *testing.T, server, token string) string {
	t.Helper()

	data, err := clientcmd.Write(api.Config{
		Clusters:       map[string]*api.Cluster{"api": {Server: server, InsecureSkipTLSVerify: true}},
		AuthInfos:      map[string]*api.AuthInfo{"user": {Token: token}},
		Contexts:       map[string]*api.Context{"shared": {Cluster: "api", AuthInfo: "user"}},
		CurrentContext: "shared",
	})
	require.NoError(t, err)

	return base64.StdEncoding.EncodeToString(data)
}

func TestPortForwardStatelessRequestDoesNotBorrowCachedCredentials(t *testing.T) {
	upstream, seen := portForwardReviewIdentityAPI(t)
	store := kubeconfig.NewContextStore()
	key := statelessContextKey("shared", "known-routing-id")
	victim := portForwardReviewContext("shared", upstream.URL, "alice")
	victim.Internal = true
	require.NoError(t, store.AddContextWithKeyAndTTL(victim, key, time.Minute))

	server := portForwardReviewServer(t, store, "", true)
	for _, token := range []string{"", "forged", "bob", "alice"} {
		request, err := http.NewRequestWithContext(t.Context(), http.MethodGet,
			server.URL+"/clusters/shared/portforward/list", nil)
		require.NoError(t, err)
		request.Header.Set("KUBECONFIG", portForwardReviewKubeconfig(t, upstream.URL, token))
		request.Header.Set("X-HEADLAMP-USER-ID", "known-routing-id")
		response, err := http.DefaultClient.Do(request)
		require.NoError(t, err)

		_ = response.Body.Close()
		if token == "" || token == "forged" {
			require.Equal(t, http.StatusUnauthorized, response.StatusCode)
		} else {
			require.Equal(t, http.StatusOK, response.StatusCode)
		}

		want := ""
		if token != "" {
			want = "Bearer " + token
		}

		select {
		case got := <-seen:
			require.Equal(t, want, got, "must authenticate the supplied kubeconfig, not the cached victim")
		case <-time.After(time.Second):
			t.Fatal("authentication request missing")
		}

		cached, err := store.GetContext(key)
		require.NoError(t, err)
		require.Same(t, victim, cached)
	}

	request, err := http.NewRequestWithContext(t.Context(), http.MethodGet,
		server.URL+"/clusters/"+url.PathEscape(key)+"/portforward/list", nil)
	require.NoError(t, err)
	response, err := http.DefaultClient.Do(request)
	require.NoError(t, err)

	_ = response.Body.Close()
	require.Equal(t, http.StatusUnauthorized, response.StatusCode)

	select {
	case got := <-seen:
		t.Fatalf("routing-key-only request borrowed credentials: %s", strings.TrimSpace(got))
	default:
	}
}

func TestPortForwardStatelessCreationPinsRequestCredentials(t *testing.T) {
	upstream, seen := portForwardReviewIdentityAPI(t)
	store := kubeconfig.NewContextStore()
	key := statelessContextKey("shared", "known-routing-id")
	victim := portForwardReviewContext("shared", upstream.URL, "alice")
	victim.Internal = true
	require.NoError(t, store.AddContextWithKeyAndTTL(victim, key, time.Minute))
	server := portForwardReviewServer(t, store, "", true)
	request, err := http.NewRequestWithContext(t.Context(), http.MethodPost,
		server.URL+"/clusters/shared/portforward",
		strings.NewReader(`{"id":"probe","pod":"p","namespace":"default","port":"8080","targetPort":"80"}`))
	require.NoError(t, err)
	request.Header.Set("KUBECONFIG", portForwardReviewKubeconfig(t, upstream.URL, "bob"))
	request.Header.Set("X-HEADLAMP-USER-ID", "known-routing-id")
	response, err := http.DefaultClient.Do(request)
	require.NoError(t, err)

	_ = response.Body.Close()
	require.Equal(t, http.StatusInternalServerError, response.StatusCode,
		"mock rejects permission before a real forward is created")

	for range 2 {
		select {
		case got := <-seen:
			require.Equal(t, "Bearer bob", got, "identity and permission checks must use the request credentials")
		case <-time.After(time.Second):
			t.Fatal("authentication or permission check missing")
		}
	}
}

func TestPortForwardStatelessCannotReadBackendTokenFile(t *testing.T) {
	upstream, seen := portForwardReviewIdentityAPI(t)
	store := kubeconfig.NewContextStore()
	server := portForwardReviewServer(t, store, "", true)
	tokenFile := filepath.Join(t.TempDir(), "backend-token")
	require.NoError(t, os.WriteFile(tokenFile, []byte("alice"), 0o600))
	data, err := clientcmd.Write(api.Config{
		Clusters:       map[string]*api.Cluster{"api": {Server: upstream.URL, InsecureSkipTLSVerify: true}},
		AuthInfos:      map[string]*api.AuthInfo{"user": {TokenFile: tokenFile}},
		Contexts:       map[string]*api.Context{"shared": {Cluster: "api", AuthInfo: "user"}},
		CurrentContext: "shared",
	})
	require.NoError(t, err)
	request, err := http.NewRequestWithContext(t.Context(), http.MethodGet,
		server.URL+"/clusters/shared/portforward/list", nil)
	require.NoError(t, err)
	request.Header.Set("KUBECONFIG", base64.StdEncoding.EncodeToString(data))
	request.Header.Set("X-HEADLAMP-USER-ID", "known-routing-id")
	response, err := http.DefaultClient.Do(request)
	require.NoError(t, err)

	_ = response.Body.Close()
	require.Equal(t, http.StatusBadRequest, response.StatusCode)

	select {
	case leaked := <-seen:
		t.Fatalf("stateless request sent a backend-local credential upstream: %q", leaked)
	default:
	}

	request, err = http.NewRequestWithContext(t.Context(), http.MethodGet,
		server.URL+"/clusters/shared/portforward/list", nil)
	require.NoError(t, err)
	request.Header.Set("KUBECONFIG", base64.StdEncoding.EncodeToString(data))
	request.Header.Set("Authorization", "Bearer bob")
	response, err = http.DefaultClient.Do(request)
	require.NoError(t, err)

	_ = response.Body.Close()
	require.Equal(t, http.StatusOK, response.StatusCode)

	select {
	case got := <-seen:
		require.Equal(t, "Bearer bob", got, "independent request credentials must replace local providers")
	case <-time.After(time.Second):
		t.Fatal("request token was not authenticated")
	}
}
