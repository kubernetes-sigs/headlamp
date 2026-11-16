package kubeconfig_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"

	// The oidc auth provider is registered by the headlamp binary; register it
	// here too so kubeconfig contexts with an oidc auth-provider build a
	// transport the same way they do in production.
	_ "k8s.io/client-go/plugin/pkg/client/auth/oidc"
)

func testCAPEM(t *testing.T) string {
	t.Helper()

	caBytes, err := os.ReadFile(filepath.Join(getTestDataPath(), "oidc_ca.pem")) // #nosec G304 -- test fixture
	require.NoError(t, err)

	return string(caBytes)
}

type parseAPIProxyConfigTest struct {
	name    string
	cfg     map[string]string
	want    *kubeconfig.APIProxySettings
	wantErr string
}

func parseAPIProxyConfigTests(t *testing.T) []parseAPIProxyConfigTest {
	t.Helper()

	pem := testCAPEM(t)
	encoded := base64.StdEncoding.EncodeToString([]byte(pem))

	return []parseAPIProxyConfigTest{
		{
			name: "url_only",
			cfg:  map[string]string{"api-proxy": "https://proxy.example.com/kubernetes"},
			want: &kubeconfig.APIProxySettings{URL: "https://proxy.example.com/kubernetes"},
		},
		{
			name: "ca_data_valid",
			cfg:  map[string]string{"api-proxy": "https://proxy.example.com", "api-proxy-ca-data": encoded},
			want: &kubeconfig.APIProxySettings{URL: "https://proxy.example.com", CACert: pem},
		},
		{
			name:    "ca_data_invalid_base64",
			cfg:     map[string]string{"api-proxy": "https://proxy.example.com", "api-proxy-ca-data": "!!!"},
			wantErr: "api-proxy-ca-data",
		},
		{
			name: "ca_data_not_a_certificate",
			cfg: map[string]string{
				"api-proxy":         "https://proxy.example.com",
				"api-proxy-ca-data": base64.StdEncoding.EncodeToString([]byte("not a pem")),
			},
			wantErr: "PEM",
		},
		{
			name: "skip_tls_verify_case_insensitive",
			cfg:  map[string]string{"api-proxy": "https://proxy.example.com", "api-proxy-skip-tls-verify": "TRUE"},
			want: &kubeconfig.APIProxySettings{URL: "https://proxy.example.com", SkipTLSVerify: true},
		},
		{
			name: "skip_tls_verify_false",
			cfg:  map[string]string{"api-proxy": "https://proxy.example.com", "api-proxy-skip-tls-verify": "false"},
			want: &kubeconfig.APIProxySettings{URL: "https://proxy.example.com"},
		},
		{
			name:    "invalid_url",
			cfg:     map[string]string{"api-proxy": "proxy.example.com"},
			wantErr: "not a valid http(s) URL",
		},
		{name: "empty_config_means_no_proxy", cfg: map[string]string{}},
		{name: "ca_without_url_means_no_proxy", cfg: map[string]string{"api-proxy-ca-data": encoded}},
	}
}

// TestParseAPIProxyConfig exercises the auth-provider key parsing directly
// via the exported alias in export_test.go.
func TestParseAPIProxyConfig(t *testing.T) {
	for _, tt := range parseAPIProxyConfigTests(t) {
		t.Run(tt.name, func(t *testing.T) {
			got, err := kubeconfig.ParseAPIProxyConfig(tt.cfg)

			if tt.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErr)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func oidcKubeconfig(apiProxyKeys string) string {
	return `apiVersion: v1
clusters:
- cluster:
    server: https://kube-apiserver.invalid:6443
  name: c
contexts:
- context:
    cluster: c
    user: u
  name: ctx
current-context: ctx
kind: Config
users:
- name: u
  user:
    auth-provider:
      config:
        client-id: "cid"
        idp-issuer-url: "https://oidc.example.com"
        scope: "profile,email"
` + apiProxyKeys + `      name: oidc`
}

// TestAPIProxyFromLoadedKubeconfig verifies that contexts loaded from a
// kubeconfig resolve the api-proxy keys of their auth-provider even though
// OidcConf is not populated for them.
func TestAPIProxyFromLoadedKubeconfig(t *testing.T) {
	t.Run("all_fields_from_file", func(t *testing.T) {
		contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(
			filepath.Join(getTestDataPath(), "kubeconfig_oidc_api_proxy"), kubeconfig.DynamicCluster)
		require.NoError(t, err)
		require.Empty(t, contextErrors)
		require.Len(t, contexts, 1)

		assert.Nil(t, contexts[0].OidcConf, "loaded kubeconfig contexts do not pre-populate OidcConf")

		apiProxy, err := contexts[0].APIProxy()
		require.NoError(t, err)
		require.NotNil(t, apiProxy)
		assert.Equal(t, "https://api-proxy.example.com/kubernetes", apiProxy.URL)
		assert.Contains(t, apiProxy.CACert, "-----BEGIN CERTIFICATE-----")
		assert.False(t, apiProxy.SkipTLSVerify)

		oidcConf, err := contexts[0].OidcConfig()
		require.NoError(t, err)
		assert.Equal(t, apiProxy, oidcConf.APIProxy)
	})

	t.Run("no_api_proxy_keys", func(t *testing.T) {
		tempFile := createTempKubeconfig(t, oidcKubeconfig(""))
		defer func() { _ = os.Remove(tempFile) }()

		contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(tempFile, kubeconfig.DynamicCluster)
		require.NoError(t, err)
		require.Empty(t, contextErrors)
		require.Len(t, contexts, 1)

		apiProxy, err := contexts[0].APIProxy()
		require.NoError(t, err)
		assert.Nil(t, apiProxy)
	})

	t.Run("invalid_api_proxy_is_a_load_error", func(t *testing.T) {
		tempFile := createTempKubeconfig(t, oidcKubeconfig(`        api-proxy: "not-a-url"
`))
		defer func() { _ = os.Remove(tempFile) }()

		contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(tempFile, kubeconfig.DynamicCluster)
		require.NoError(t, err)
		require.Empty(t, contexts, "a context with an invalid api-proxy must not be loaded")
		require.Len(t, contextErrors, 1)
		assert.Equal(t, "ctx", contextErrors[0].ContextName)
		assert.Contains(t, contextErrors[0].Error.Error(), "api-proxy")
	})
}

// TestContextCopyPreservesAPIProxy verifies that Context.Copy() deep-copies
// the api-proxy settings.
func TestContextCopyPreservesAPIProxy(t *testing.T) {
	original := &kubeconfig.Context{
		Name: "test-context",
		OidcConf: &kubeconfig.OidcConfig{
			ClientID: "cid",
			APIProxy: &kubeconfig.APIProxySettings{URL: "https://proxy.example.com/k8s", CACert: "pem"},
		},
	}

	copied := original.Copy()
	require.NotNil(t, copied)
	require.NotNil(t, copied.OidcConf)
	require.NotNil(t, copied.OidcConf.APIProxy)

	assert.Equal(t, *original.OidcConf.APIProxy, *copied.OidcConf.APIProxy)
	assert.NotSame(t, original.OidcConf.APIProxy, copied.OidcConf.APIProxy)

	copied.OidcConf.APIProxy.CACert = "mutated"
	assert.Equal(t, "pem", original.OidcConf.APIProxy.CACert)
}

func contextWithClusterCreds(apiProxy *kubeconfig.APIProxySettings) *kubeconfig.Context {
	return &kubeconfig.Context{
		Name: "ctx",
		KubeContext: &api.Context{
			Cluster:  "c",
			AuthInfo: "u",
		},
		Cluster: &api.Cluster{
			Server:                   "https://kube-apiserver.invalid:6443",
			CertificateAuthorityData: []byte("cluster-ca"),
		},
		AuthInfo: &api.AuthInfo{
			ClientCertificateData: []byte("client-cert"),
			ClientKeyData:         []byte("client-key"),
		},
		OidcConf: &kubeconfig.OidcConfig{ClientID: "cid", APIProxy: apiProxy},
	}
}

// TestRESTConfigWithAPIProxy verifies that every REST config derived from a
// context with an api-proxy targets the proxy with the proxy TLS settings, so
// Helm, port-forward, cache and multiplexer clients share the gateway.
func TestRESTConfigWithAPIProxy(t *testing.T) {
	t.Run("proxy_with_ca", func(t *testing.T) {
		ctx := contextWithClusterCreds(&kubeconfig.APIProxySettings{
			URL:    "https://proxy.example.com/kubernetes",
			CACert: "proxy-ca",
		})

		restConf, err := ctx.RESTConfig()
		require.NoError(t, err)

		assert.Equal(t, "https://proxy.example.com/kubernetes", restConf.Host)
		assert.Equal(t, []byte("proxy-ca"), restConf.CAData)
		assert.False(t, restConf.Insecure)
		assert.Equal(t, []string{"http/1.1"}, restConf.NextProtos, "HTTP/2 must be disabled")
		assert.Empty(t, restConf.CertData, "client certificates are not sent to the proxy")
		assert.Empty(t, restConf.KeyData)

		// The clientcmd.ClientConfig used by Helm must agree.
		helmConf, err := ctx.ClientConfig().ClientConfig()
		require.NoError(t, err)
		assert.Equal(t, restConf.Host, helmConf.Host)
		assert.Equal(t, restConf.TLSClientConfig, helmConf.TLSClientConfig)
	})

	t.Run("proxy_with_skip_tls_verify", func(t *testing.T) {
		ctx := contextWithClusterCreds(&kubeconfig.APIProxySettings{
			URL:           "https://proxy.example.com",
			CACert:        "ignored-when-insecure",
			SkipTLSVerify: true,
		})

		restConf, err := ctx.RESTConfig()
		require.NoError(t, err)

		assert.Equal(t, "https://proxy.example.com", restConf.Host)
		assert.True(t, restConf.Insecure)
		assert.Empty(t, restConf.CAData, "client-go rejects CA data together with Insecure")
	})

	t.Run("no_proxy_keeps_cluster_settings", func(t *testing.T) {
		ctx := contextWithClusterCreds(nil)

		restConf, err := ctx.RESTConfig()
		require.NoError(t, err)

		assert.Equal(t, "https://kube-apiserver.invalid:6443", restConf.Host)
		assert.Equal(t, []byte("cluster-ca"), restConf.CAData)
		assert.Equal(t, []byte("client-cert"), restConf.CertData)
		assert.Empty(t, restConf.NextProtos)
	})
}

// TestSetupProxyWithAPIProxy verifies that SetupProxy routes requests through
// the api-proxy URL when the context has one.
func TestSetupProxyWithAPIProxy(t *testing.T) {
	received := make(chan *http.Request, 1)

	mockProxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received <- r.Clone(r.Context())

		w.WriteHeader(http.StatusOK)
	}))
	defer mockProxy.Close()

	ctx := &kubeconfig.Context{
		Name: "proxy-ctx",
		Cluster: &api.Cluster{
			Server: "https://kube-apiserver.invalid:6443",
		},
		OidcConf: &kubeconfig.OidcConfig{
			APIProxy: &kubeconfig.APIProxySettings{URL: mockProxy.URL + "/kubernetes"},
		},
	}

	require.NoError(t, ctx.SetupProxy(), "SetupProxy must not fail when APIProxy is set")

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v1/namespaces", nil)
	w := httptest.NewRecorder()

	require.NoError(t, ctx.ProxyRequest(w, req))

	select {
	case r := <-received:
		assert.Equal(t, "/kubernetes/api/v1/namespaces", r.URL.Path, "proxy path prefix must be preserved")
	default:
		t.Fatal("expected the request to reach the api-proxy mock server")
	}
}

// TestLoadedKubeconfigRoutesThroughAPIProxy is the end-to-end check for a
// kubeconfig context: both the reverse proxy and the Kubernetes clientset
// (the path used by Helm, port-forward and the cache) must reach the proxy
// with the user's token instead of the cluster server.
func TestLoadedKubeconfigRoutesThroughAPIProxy(t *testing.T) {
	var paths, auths []string

	mockProxy := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		auths = append(auths, r.Header.Get("Authorization"))

		w.Header().Set("Content-Type", "application/json")

		if strings.HasSuffix(r.URL.Path, "/version") {
			_, _ = w.Write([]byte(`{"major":"1","minor":"33","gitVersion":"v1.33.0"}`))
			return
		}

		_, _ = w.Write([]byte(`{"kind":"NamespaceList","items":[]}`))
	}))
	defer mockProxy.Close()

	tempFile := createTempKubeconfig(t, oidcKubeconfig(
		"        api-proxy: \""+mockProxy.URL+"/gateway\"\n"+
			"        api-proxy-skip-tls-verify: \"true\"\n"))
	defer func() { _ = os.Remove(tempFile) }()

	contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(tempFile, kubeconfig.KubeConfig)
	require.NoError(t, err)
	require.Empty(t, contextErrors)
	require.Len(t, contexts, 1)

	kContext := &contexts[0]

	// Reverse proxy path (browser requests).
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v1/namespaces", nil)
	req.Header.Set("Authorization", "Bearer user-token")

	rec := httptest.NewRecorder()

	require.NoError(t, kContext.ProxyRequest(rec, req))
	assert.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	// Clientset path (Helm, port-forward, cache authorization checks).
	clientset, err := kContext.ClientSetWithToken("user-token")
	require.NoError(t, err)

	_, err = clientset.Discovery().ServerVersion()
	require.NoError(t, err)

	assert.Equal(t, []string{"/gateway/api/v1/namespaces", "/gateway/version"}, paths)

	for _, auth := range auths {
		assert.Equal(t, "Bearer user-token", auth)
	}
}

// unsignedIDToken returns a JWT-shaped id-token that client-go's oidc auth
// provider accepts as unexpired. Only the payload is inspected.
func unsignedIDToken(subject string) string {
	enc := base64.RawURLEncoding

	return enc.EncodeToString([]byte(`{"alg":"none"}`)) + "." +
		enc.EncodeToString([]byte(`{"sub":"`+subject+`","exp":4102444800}`)) + "." +
		enc.EncodeToString([]byte("sig"))
}

// sharedProxyKubeconfig returns a kubeconfig with two contexts whose users
// share the oidc issuer and client ID but have different id-tokens, and
// which both reach the cluster through the same API proxy.
func sharedProxyKubeconfig(proxyURL string) string {
	user := func(name string) string {
		return `- name: ` + name + `
  user:
    auth-provider:
      config:
        client-id: "shared-cid"
        idp-issuer-url: "https://oidc-shared-proxy.example.com"
        id-token: "` + unsignedIDToken(name) + `"
        api-proxy: "` + proxyURL + `"
        api-proxy-skip-tls-verify: "true"
      name: oidc
`
	}

	return `apiVersion: v1
clusters:
- cluster:
    server: https://kube-apiserver.invalid:6443
  name: c
contexts:
- context:
    cluster: c
    user: alice
  name: ctx-alice
- context:
    cluster: c
    user: bob
  name: ctx-bob
current-context: ctx-alice
kind: Config
users:
` + user("alice") + user("bob")
}

// TestAPIProxyAuthProviderIsPerContext verifies that contexts sharing an API
// proxy, oidc issuer and client ID do not share client-go's cached auth
// provider: requests without their own bearer token must carry the id-token
// of their own context, never the one of the context that was used first.
func TestAPIProxyAuthProviderIsPerContext(t *testing.T) {
	var lastAuth string

	mockProxy := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		lastAuth = r.Header.Get("Authorization")

		w.Header().Set("Content-Type", "application/json")

		if strings.HasSuffix(r.URL.Path, "/version") {
			_, _ = w.Write([]byte(`{"major":"1","minor":"33","gitVersion":"v1.33.0"}`))
			return
		}

		_, _ = w.Write([]byte(`{"kind":"NamespaceList","items":[]}`))
	}))
	defer mockProxy.Close()

	tempFile := createTempKubeconfig(t, sharedProxyKubeconfig(mockProxy.URL))
	defer func() { _ = os.Remove(tempFile) }()

	contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(tempFile, kubeconfig.KubeConfig)
	require.NoError(t, err)
	require.Empty(t, contextErrors)
	require.Len(t, contexts, 2)

	for i := range contexts {
		kContext := &contexts[i]
		subject := strings.TrimPrefix(kContext.Name, "ctx-")
		want := "Bearer " + unsignedIDToken(subject)

		t.Run(kContext.Name, func(t *testing.T) {
			// Reverse proxy path without a user token.
			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v1/namespaces", nil)
			rec := httptest.NewRecorder()

			require.NoError(t, kContext.ProxyRequest(rec, req))
			assert.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			assert.Equal(t, want, lastAuth, "reverse proxy must use the context's own id-token")

			// Clientset path without a user token (background clients).
			clientset, err := kContext.ClientSetWithToken("")
			require.NoError(t, err)

			_, err = clientset.Discovery().ServerVersion()
			require.NoError(t, err)
			assert.Equal(t, want, lastAuth, "clientset must use the context's own id-token")
		})
	}
}

// rotatingIssuer is a mock OIDC issuer that rotates refresh tokens: each one
// is valid for a single use and using it again fails with invalid_grant.
type rotatingIssuer struct {
	mu           sync.Mutex
	subjects     map[string]string // live refresh token -> subject
	clientSecret string            // when set, required on every refresh
	refreshes    int
}

func (i *rotatingIssuer) serveHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if strings.HasSuffix(r.URL.Path, "/.well-known/openid-configuration") {
		_ = json.NewEncoder(w).Encode(map[string]string{"token_endpoint": "http://" + r.Host + "/token"})
		return
	}

	i.mu.Lock()
	defer i.mu.Unlock()

	if !i.validClientSecret(r) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid_client"}`))

		return
	}

	refreshToken := r.PostFormValue("refresh_token")

	subject, live := i.subjects[refreshToken]
	if !live {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))

		return
	}

	i.refreshes++
	delete(i.subjects, refreshToken)

	rotated := fmt.Sprintf("%s-rotated-%d", refreshToken, i.refreshes)
	i.subjects[rotated] = subject

	_ = json.NewEncoder(w).Encode(map[string]any{
		"access_token":  "access",
		"token_type":    "Bearer",
		"refresh_token": rotated,
		"id_token":      unsignedIDToken(subject),
	})
}

// validClientSecret reports whether r carries the issuer's client secret,
// either as HTTP basic auth or in the form, as oauth2 may send it both ways.
func (i *rotatingIssuer) validClientSecret(r *http.Request) bool {
	if i.clientSecret == "" {
		return true
	}

	if _, password, ok := r.BasicAuth(); ok {
		return password == i.clientSecret
	}

	return r.PostFormValue("client_secret") == i.clientSecret
}

// oidcLogin is the refresh state of one kubeconfig user.
type oidcLogin struct {
	refreshToken string
	clientSecret string
}

// refreshTokenKubeconfig returns a kubeconfig with one context per entry of
// logins (context name -> login). Every context reaches the cluster through
// the same API proxy, uses the same oidc issuer and client ID, and has no
// id-token, so its first request has to refresh.
func refreshTokenKubeconfig(proxyURL, issuerURL string, logins map[string]oidcLogin) string {
	var contexts, users strings.Builder

	for name, login := range logins {
		contexts.WriteString(`- context:
    cluster: c
    user: ` + name + `
  name: ` + name + `
`)
		users.WriteString(`- name: ` + name + `
  user:
    auth-provider:
      config:
        client-id: "shared-cid"
        idp-issuer-url: "` + issuerURL + `"
        client-secret: "` + login.clientSecret + `"
        refresh-token: "` + login.refreshToken + `"
        api-proxy: "` + proxyURL + `"
        api-proxy-skip-tls-verify: "true"
      name: oidc
`)
	}

	return `apiVersion: v1
clusters:
- cluster:
    server: https://kube-apiserver.invalid:6443
  name: c
contexts:
` + contexts.String() + `kind: Config
users:
` + users.String()
}

// newAuthRecordingProxy starts a mock API proxy and returns it with a pointer
// to the Authorization header of the last request it received.
func newAuthRecordingProxy(t *testing.T) (*httptest.Server, *string) {
	t.Helper()

	lastAuth := new(string)

	proxy := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*lastAuth = r.Header.Get("Authorization")

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"kind":"NamespaceList","items":[]}`))
	}))
	t.Cleanup(proxy.Close)

	return proxy, lastAuth
}

// loadContextsByName loads a kubeconfig and returns its contexts by name.
func loadContextsByName(t *testing.T, content string) map[string]*kubeconfig.Context {
	t.Helper()

	tempFile := createTempKubeconfig(t, content)
	t.Cleanup(func() { _ = os.Remove(tempFile) })

	contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(tempFile, kubeconfig.KubeConfig)
	require.NoError(t, err)
	require.Empty(t, contextErrors)

	byName := make(map[string]*kubeconfig.Context, len(contexts))
	for i := range contexts {
		byName[contexts[i].Name] = &contexts[i]
	}

	return byName
}

// proxyWithoutToken sends a request without a user token through kContext.
func proxyWithoutToken(t *testing.T, kContext *kubeconfig.Context) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v1/namespaces", nil)
	rec := httptest.NewRecorder()

	require.NoError(t, kContext.ProxyRequest(rec, req))

	return rec
}

// TestAPIProxyAuthProviderSharesRefreshState verifies that contexts holding
// the same refresh token share one auth provider, so that an issuer rotating
// refresh tokens does not reject the second context, while a context with a
// different refresh token keeps its own login.
func TestAPIProxyAuthProviderSharesRefreshState(t *testing.T) {
	mockProxy, lastAuth := newAuthRecordingProxy(t)

	issuer := &rotatingIssuer{subjects: map[string]string{"rt-alice": "alice", "rt-carol": "carol"}}

	mockIssuer := httptest.NewServer(http.HandlerFunc(issuer.serveHTTP))
	defer mockIssuer.Close()

	byName := loadContextsByName(t, refreshTokenKubeconfig(mockProxy.URL, mockIssuer.URL, map[string]oidcLogin{
		"alice-ns-a": {refreshToken: "rt-alice"},
		"alice-ns-b": {refreshToken: "rt-alice"},
		"carol-ns-a": {refreshToken: "rt-carol"},
	}))

	for _, name := range []string{"alice-ns-a", "alice-ns-b", "carol-ns-a"} {
		rec := proxyWithoutToken(t, byName[name])
		require.Equal(t, http.StatusOK, rec.Code, "%s: %s", name, rec.Body.String())

		subject, _, _ := strings.Cut(name, "-")
		assert.Equal(t, "Bearer "+unsignedIDToken(subject), *lastAuth, name)
	}

	assert.Equal(t, 2, issuer.refreshes, "each login must be refreshed exactly once")
}

// TestAPIProxyAuthProviderSeparatesClientSecrets verifies that contexts with
// the same refresh token but different client secrets do not share a
// provider, so a context with a stale secret cannot break the current one.
func TestAPIProxyAuthProviderSeparatesClientSecrets(t *testing.T) {
	mockProxy, lastAuth := newAuthRecordingProxy(t)

	issuer := &rotatingIssuer{subjects: map[string]string{"rt-alice": "alice"}, clientSecret: "new-secret"}

	mockIssuer := httptest.NewServer(http.HandlerFunc(issuer.serveHTTP))
	defer mockIssuer.Close()

	byName := loadContextsByName(t, refreshTokenKubeconfig(mockProxy.URL, mockIssuer.URL, map[string]oidcLogin{
		"alice-stale":   {refreshToken: "rt-alice", clientSecret: "old-secret"},
		"alice-current": {refreshToken: "rt-alice", clientSecret: "new-secret"},
	}))

	rec := proxyWithoutToken(t, byName["alice-stale"])
	require.Equal(t, http.StatusBadGateway, rec.Code, "the stale client secret must be rejected")

	rec = proxyWithoutToken(t, byName["alice-current"])
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.Equal(t, "Bearer "+unsignedIDToken("alice"), *lastAuth)
}
