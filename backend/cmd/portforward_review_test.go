package main

import (
	"bytes"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
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

func TestPortForwardExecCredentialHelper(t *testing.T) {
	if os.Getenv("HEADLAMP_TEST_PORTFORWARD_EXEC") != "1" {
		t.Skip("exec credential subprocess")
	}
	//nolint:gosec // The parent test supplies this marker inside its private temporary directory.
	if err := os.WriteFile(os.Getenv("HEADLAMP_TEST_PORTFORWARD_MARKER"), []byte("called"), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := fmt.Fprintln(os.Stdout,
		`{"apiVersion":"client.authentication.k8s.io/v1","kind":"ExecCredential","status":{"token":"alice"}}`)
	if err != nil {
		t.Fatal(err)
	}

	os.Exit(0)
}

//nolint:funlen // Covers upload, persistence reload, and credential isolation through the production routes.
func TestPortForwardStoredUploadsRespectCredentialProvenance(t *testing.T) {
	t.Setenv("HEADLAMP_BACKEND_TOKEN", "desktop-token")
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("KUBERNETES_SERVICE_PORT", "")

	for _, test := range []struct {
		name       string
		inCluster  bool
		caFile     bool
		embedded   bool
		wantStatus int
	}{
		{name: "in-cluster-token-file", inCluster: true, wantStatus: http.StatusUnauthorized},
		{name: "in-cluster-ca-file", inCluster: true, caFile: true, wantStatus: http.StatusBadRequest},
		{name: "in-cluster-embedded-credentials", inCluster: true, embedded: true, wantStatus: http.StatusUnauthorized},
		{name: "desktop-token-file", wantStatus: http.StatusOK},
		{name: "desktop-ca-file", caFile: true, wantStatus: http.StatusOK},
	} {
		t.Run(test.name, func(t *testing.T) {
			upstream, seen := portForwardReviewIdentityAPI(t)
			tokenFile := filepath.Join(t.TempDir(), "backend-local-token")
			require.NoError(t, os.WriteFile(tokenFile, []byte("alice"), 0o600))
			caFile := filepath.Join(t.TempDir(), "backend-local-ca.pem")
			require.NoError(t, os.WriteFile(caFile,
				pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: upstream.Certificate().Raw}), 0o600))
			cluster := &api.Cluster{Server: upstream.URL, InsecureSkipTLSVerify: !test.caFile}
			info := &api.AuthInfo{TokenFile: tokenFile}
			token := ""
			want := "Bearer alice"

			if test.embedded {
				info = &api.AuthInfo{Token: "alice"}
			}

			if test.caFile {
				cluster.CertificateAuthority = caFile
				info = &api.AuthInfo{Token: "alice"}
				token = "bob"
				want = "Bearer bob"
			}

			sessions := cache.New[interface{}]()

			t.Cleanup(func() { _ = sessions.Close() })
			config := &HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{
						UseInCluster: test.inCluster, KubeConfigStore: kubeconfig.NewContextStore(),
						EnableDynamicClusters: true, KubeConfigPath: filepath.Join(t.TempDir(), "missing"),
						KubeConfigDir: t.TempDir(),
					},
					Cache: sessions,
				},
			}
			config.UnsafeUseServiceAccountToken = test.inCluster
			handler := createHeadlampHandler(t.Context(), config)
			data, err := clientcmd.Write(api.Config{
				Clusters:       map[string]*api.Cluster{"api": cluster},
				AuthInfos:      map[string]*api.AuthInfo{"user": info},
				Contexts:       map[string]*api.Context{"shared": {Cluster: "api", AuthInfo: "user"}},
				CurrentContext: "shared",
			})
			require.NoError(t, err)

			encoded := base64.StdEncoding.EncodeToString(data)
			upload, err := makeJSONReq(http.MethodPost, "/cluster", ClusterReq{KubeConfig: &encoded})
			require.NoError(t, err)
			upload.Header.Set("X-HEADLAMP_BACKEND-TOKEN", "desktop-token")

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, upload)
			require.Equal(t, http.StatusCreated, response.Code, response.Body.String())

			for _, reload := range []bool{false, true} {
				if reload {
					config.KubeConfigStore = kubeconfig.NewContextStore()
					loadDynamicClusters(config, filepath.Join(config.KubeConfigDir, "config"), nil)
				}

				stored, err := config.KubeConfigStore.GetContext("shared")
				require.NoError(t, err)
				require.Equal(t, kubeconfig.DynamicCluster, stored.Source)
				require.False(t, stored.Internal, "the trust decision must not rely on the internal routing flag")
				request := httptest.NewRequestWithContext(t.Context(), http.MethodGet,
					"/clusters/shared/portforward/list", nil)
				request.Header.Set("X-HEADLAMP_BACKEND-TOKEN", "desktop-token")

				if token != "" {
					request.Header.Set("Authorization", "Bearer "+token)
				}

				response = httptest.NewRecorder()
				handler.ServeHTTP(response, request)

				require.Equal(t, test.wantStatus, response.Code, response.Body.String())

				if test.wantStatus != http.StatusOK {
					require.Empty(t, seen, "a restricted stored upload must not contact the upstream API")
				} else {
					require.Len(t, seen, 1)
					require.Equal(t, want, <-seen)
				}
			}

			if !test.caFile {
				require.NoError(t, os.Remove(tokenFile))
				request := httptest.NewRequestWithContext(t.Context(), http.MethodGet,
					"/clusters/shared/portforward/list", nil)
				request.Header.Set("X-HEADLAMP_BACKEND-TOKEN", "desktop-token")
				request.Header.Set("Authorization", "Bearer bob")

				response = httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				require.Equal(t, http.StatusOK, response.Code, response.Body.String())
				require.Len(t, seen, 1)
				require.Equal(t, "Bearer bob", <-seen, "a request token must replace the stored credentials")
			}
		})
	}
}

//nolint:funlen // Verifies local credential methods and backend-token rejection through the desktop routes.
func TestPortForwardDesktopUploadedCredentials(t *testing.T) {
	t.Setenv("HEADLAMP_BACKEND_TOKEN", "desktop-token")
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("KUBERNETES_SERVICE_PORT", "")
	provider := newSigningOIDCTestServer(t)
	idToken := provider.signToken(t, nil)

	var (
		identityCalls, permissionCalls atomic.Int32
		clientCertificate              []byte
	)

	upstream := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")

		clientAuthenticated := len(r.TLS.PeerCertificates) != 0 &&
			bytes.Equal(r.TLS.PeerCertificates[0].Raw, clientCertificate)
		if header != "Bearer alice" && header != "Bearer "+idToken && !clientAuthenticated {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		w.Header().Set("Content-Type", "application/json")

		if r.URL.Path == "/apis/authentication.k8s.io/v1/selfsubjectreviews" {
			identityCalls.Add(1)

			_, err := w.Write([]byte(`{"apiVersion":"authentication.k8s.io/v1","kind":"SelfSubjectReview",` +
				`"status":{"userInfo":{"username":"alice","uid":"alice-id"}}}`))
			require.NoError(t, err)

			return
		}

		permissionCalls.Add(1)

		_, err := w.Write([]byte(`{"apiVersion":"authorization.k8s.io/v1","kind":"SelfSubjectAccessReview",` +
			`"status":{"allowed":false,"reason":"desktop credential permission check reached"}}`))
		require.NoError(t, err)
	}))
	upstream.TLS = &tls.Config{MinVersion: tls.VersionTLS12, ClientAuth: tls.RequestClientCert}
	upstream.StartTLS()
	t.Cleanup(upstream.Close)
	clientCertificate = upstream.Certificate().Raw
	caFile := filepath.Join(t.TempDir(), "ca.pem")
	require.NoError(t, os.WriteFile(caFile,
		pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: clientCertificate}), 0o600))

	key, err := x509.MarshalPKCS8PrivateKey(upstream.TLS.Certificates[0].PrivateKey)
	require.NoError(t, err)
	keyFile := filepath.Join(t.TempDir(), "client.key")
	require.NoError(t, os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: key}), 0o600))
	tokenFile := filepath.Join(t.TempDir(), "token")
	require.NoError(t, os.WriteFile(tokenFile, []byte("alice"), 0o600))

	executable, err := os.Executable()
	require.NoError(t, err)

	marker := filepath.Join(t.TempDir(), "exec-called")
	for _, test := range []struct {
		name   string
		info   *api.AuthInfo
		header string
	}{
		{name: "token-file", info: &api.AuthInfo{TokenFile: tokenFile}},
		{name: "client-files", info: &api.AuthInfo{ClientCertificate: caFile, ClientKey: keyFile}},
		{name: "oidc-provider", info: &api.AuthInfo{AuthProvider: &api.AuthProviderConfig{
			Name: "oidc", Config: map[string]string{
				"client-id": "test-client-id", "idp-issuer-url": provider.URL(), "id-token": idToken,
			},
		}}},
		{name: "exec-provider", info: &api.AuthInfo{Exec: &api.ExecConfig{
			Command: executable, Args: []string{"-test.run=^TestPortForwardExecCredentialHelper$"},
			APIVersion: "client.authentication.k8s.io/v1", InteractiveMode: api.NeverExecInteractiveMode,
			Env: []api.ExecEnvVar{
				{Name: "HEADLAMP_TEST_PORTFORWARD_EXEC", Value: "1"},
				{Name: "HEADLAMP_TEST_PORTFORWARD_MARKER", Value: marker},
			},
		}}},
		{name: "ca-file-with-request-token", info: &api.AuthInfo{}, header: "Bearer alice"},
	} {
		t.Run(test.name, func(t *testing.T) {
			sessions := cache.New[interface{}]()

			t.Cleanup(func() { _ = sessions.Close() })
			handler := createHeadlampHandler(t.Context(), &HeadlampConfig{
				HeadlampConfig: &headlampconfig.HeadlampConfig{
					HeadlampCFG: &headlampconfig.HeadlampCFG{
						KubeConfigStore: kubeconfig.NewContextStore(), EnableDynamicClusters: true,
						KubeConfigPath: filepath.Join(t.TempDir(), "missing"), KubeConfigDir: t.TempDir(),
					},
					Cache: sessions,
				},
			})
			data, err := clientcmd.Write(api.Config{
				Clusters:       map[string]*api.Cluster{"api": {Server: upstream.URL, CertificateAuthority: caFile}},
				AuthInfos:      map[string]*api.AuthInfo{"user": test.info},
				Contexts:       map[string]*api.Context{"shared": {Cluster: "api", AuthInfo: "user"}},
				CurrentContext: "shared",
			})
			require.NoError(t, err)

			for _, operation := range []struct{ backendToken, method string }{
				{"", http.MethodGet},
				{"wrong", http.MethodPost},
				{"desktop-token", http.MethodGet},
				{"desktop-token", http.MethodPost},
			} {
				request := httptest.NewRequestWithContext(t.Context(), operation.method, "/clusters/shared/portforward",
					strings.NewReader(`{"id":"probe","pod":"p","namespace":"default","port":"8080","targetPort":"80"}`))
				if operation.method == http.MethodGet {
					request.URL.Path += "/list"
				}

				request.Header.Set("KUBECONFIG", base64.StdEncoding.EncodeToString(data))
				request.Header.Set("X-HEADLAMP-USER-ID", "desktop")
				request.Header.Set("X-HEADLAMP_BACKEND-TOKEN", operation.backendToken)

				if test.header != "" {
					request.Header.Set("Authorization", test.header)
				}

				before := identityCalls.Load() + permissionCalls.Load()
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)

				switch {
				case operation.backendToken != "desktop-token":
					require.Equal(t, http.StatusForbidden, response.Code)
					require.Equal(t, before, identityCalls.Load()+permissionCalls.Load())

					if test.name == "exec-provider" {
						_, err := os.Stat(marker)
						require.ErrorIs(t, err, os.ErrNotExist)
					}
				case operation.method == http.MethodGet:
					require.Equal(t, http.StatusOK, response.Code, response.Body.String())
					require.Equal(t, before+1, identityCalls.Load()+permissionCalls.Load())
				default:
					require.Equal(t, http.StatusInternalServerError, response.Code)
					require.Contains(t, response.Body.String(), "desktop credential permission check reached")
					require.Equal(t, before+2, identityCalls.Load()+permissionCalls.Load())
				}
			}
		})
	}
}

func TestPortForwardUploadedOIDCWithoutCredentialsIsUnauthorized(t *testing.T) {
	t.Setenv("HEADLAMP_BACKEND_TOKEN", "desktop-token")

	for _, inCluster := range []bool{false, true} {
		sessions := cache.New[interface{}]()

		t.Cleanup(func() { _ = sessions.Close() })
		handler := createHeadlampHandler(t.Context(), &HeadlampConfig{
			HeadlampConfig: &headlampconfig.HeadlampConfig{
				HeadlampCFG: &headlampconfig.HeadlampCFG{
					UseInCluster: inCluster, KubeConfigStore: kubeconfig.NewContextStore(), EnableDynamicClusters: true,
					KubeConfigPath: filepath.Join(t.TempDir(), "missing"), KubeConfigDir: t.TempDir(),
				},
				Cache: sessions,
			},
		})
		data, err := clientcmd.Write(api.Config{
			Clusters:       map[string]*api.Cluster{"api": {Server: "https://unused.example"}},
			AuthInfos:      map[string]*api.AuthInfo{"user": {AuthProvider: &api.AuthProviderConfig{Name: "oidc"}}},
			Contexts:       map[string]*api.Context{"shared": {Cluster: "api", AuthInfo: "user"}},
			CurrentContext: "shared",
		})
		require.NoError(t, err)
		request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/clusters/shared/portforward/list", nil)
		request.Header.Set("KUBECONFIG", base64.StdEncoding.EncodeToString(data))
		request.Header.Set("X-HEADLAMP_BACKEND-TOKEN", "desktop-token")

		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		require.Equal(t, http.StatusUnauthorized, response.Code, response.Body.String())
		require.Contains(t, response.Body.String(), "user authentication is required for this OIDC connection")
	}
}

func TestPortForwardOIDCProxyAuthorizationHeader(t *testing.T) {
	upstream, seen := portForwardReviewIdentityAPI(t)
	for _, header := range []string{"Authorization", "authorization", "AUTHORIZATION", "X-Forwarded-Token"} {
		t.Run(header, func(t *testing.T) {
			store := kubeconfig.NewContextStore()
			kContext := portForwardReviewContext(upstream.URL, "")
			kContext.OidcConf = &kubeconfig.OidcConfig{ClientID: "headlamp"}
			require.NoError(t, store.AddContext(kContext))

			server := portForwardReviewServer(t, store, header, false)
			for _, values := range [][]string{{"alice"}, {"Bearer alice", "Bearer alice"}} {
				request, err := http.NewRequestWithContext(t.Context(), http.MethodGet,
					server.URL+"/clusters/shared/portforward/list", nil)
				require.NoError(t, err)

				request.Header[http.CanonicalHeaderKey(header)] = values
				response, err := http.DefaultClient.Do(request)
				require.NoError(t, err)

				_ = response.Body.Close()
				if len(values) != 1 {
					require.Equal(t, http.StatusUnauthorized, response.StatusCode)

					select {
					case got := <-seen:
						t.Fatalf("duplicate proxy credentials reached Kubernetes: %q", got)
					default:
					}

					continue
				}

				require.Equal(t, http.StatusOK, response.StatusCode)

				select {
				case got := <-seen:
					require.Equal(t, "Bearer alice", got)
				case <-time.After(time.Second):
					t.Fatal("proxy credential was not authenticated")
				}
			}
		})
	}
}

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

func portForwardReviewContext(server, token string) *kubeconfig.Context {
	const name = "shared"

	return &kubeconfig.Context{
		Name: name, Source: kubeconfig.KubeConfig,
		Cluster:     &api.Cluster{Server: server, InsecureSkipTLSVerify: true},
		KubeContext: &api.Context{Cluster: name, AuthInfo: name}, AuthInfo: &api.AuthInfo{Token: token},
	}
}

func TestPortForwardProxyAuthorizationNormalization(t *testing.T) {
	upstream, seen := portForwardReviewIdentityAPI(t)
	for _, proxyHeader := range []string{"Authorization", "authorization", "AUTHORIZATION", "X-Forwarded-Token"} {
		t.Run(proxyHeader, func(t *testing.T) {
			store := kubeconfig.NewContextStore()
			require.NoError(t, store.AddContext(portForwardReviewContext(upstream.URL, "bob")))

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
	victim := portForwardReviewContext(upstream.URL, "alice")
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
	victim := portForwardReviewContext(upstream.URL, "alice")
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
