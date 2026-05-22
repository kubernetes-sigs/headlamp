package kubeconfig_test

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

type parseAPIProxyConfigTest struct {
	name      string
	cfg       map[string]string
	wantProxy string
	wantCA    *string
	wantSkip  *bool
	wantErr   string
}

func ptrTo[T any](v T) *T {
	return &v
}

// TestParseAPIProxyConfig exercises the parseAPIProxyConfig helper directly
// via the exported alias in export_test.go.
func TestParseAPIProxyConfig(t *testing.T) {
	for _, tt := range parseAPIProxyConfigTests() {
		t.Run(tt.name, func(t *testing.T) {
			assertParseAPIProxyConfig(t, tt)
		})
	}
}

func parseAPIProxyConfigTests() []parseAPIProxyConfigTest {
	pem := "-----BEGIN CERTIFICATE-----\nMIIBIjANBg==\n-----END CERTIFICATE-----"
	encoded := base64.StdEncoding.EncodeToString([]byte(pem))

	return []parseAPIProxyConfigTest{
		{
			name:      "url_only",
			cfg:       map[string]string{"api-proxy": "https://proxy.example.com/kubernetes"},
			wantProxy: "https://proxy.example.com/kubernetes",
		},
		{
			name: "ca_data_valid_base64",
			cfg: map[string]string{
				"api-proxy":         "https://proxy.example.com",
				"api-proxy-ca-data": encoded,
			},
			wantProxy: "https://proxy.example.com",
			wantCA:    &pem,
		},
		{
			name: "ca_data_invalid_base64",
			cfg: map[string]string{
				"api-proxy":         "https://proxy.example.com",
				"api-proxy-ca-data": "!!!not-valid-base64!!!",
			},
			wantErr: "api-proxy-ca-data",
		},
		{
			name: "skip_tls_verify_true",
			cfg: map[string]string{
				"api-proxy":                 "https://proxy.example.com",
				"api-proxy-skip-tls-verify": "true",
			},
			wantProxy: "https://proxy.example.com",
			wantSkip:  ptrTo(true),
		},
		{
			name: "skip_tls_verify_false",
			cfg: map[string]string{
				"api-proxy":                 "https://proxy.example.com",
				"api-proxy-skip-tls-verify": "false",
			},
			wantProxy: "https://proxy.example.com",
			wantSkip:  ptrTo(false),
		},
		{
			name: "skip_tls_verify_case_insensitive",
			cfg: map[string]string{
				"api-proxy":                 "https://proxy.example.com",
				"api-proxy-skip-tls-verify": "TRUE",
			},
			wantProxy: "https://proxy.example.com",
			wantSkip:  ptrTo(true),
		},
		{name: "empty_config_no_api_proxy", cfg: map[string]string{}},
	}
}

func assertParseAPIProxyConfig(t *testing.T, tt parseAPIProxyConfigTest) {
	proxy, ca, skip, err := kubeconfig.ParseAPIProxyConfig(tt.cfg)

	if tt.wantErr != "" {
		require.Error(t, err)
		assert.Contains(t, err.Error(), tt.wantErr)

		return
	}

	require.NoError(t, err)
	assert.Equal(t, tt.wantProxy, proxy)
	assert.Equal(t, tt.wantCA, ca)
	assert.Equal(t, tt.wantSkip, skip)
}

// TestOIDCConfigWithAPIProxy verifies that api-proxy fields in a kubeconfig
// auth-provider config map are correctly parsed into OidcConfig.
func TestOIDCConfigWithAPIProxy(t *testing.T) {
	t.Run("all_fields_from_file", testOIDCAPIProxyAllFieldsFromFile)
	t.Run("no_api_proxy_fields", testOIDCAPIProxyNoFields)
	t.Run("invalid_ca_data_returns_error", testOIDCAPIProxyInvalidCAData)
}

func testOIDCAPIProxyAllFieldsFromFile(t *testing.T) {
	kubeConfigFile := filepath.Join(getTestDataPath(), "kubeconfig_oidc_api_proxy")

	contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(kubeConfigFile, kubeconfig.KubeConfig)
	require.NoError(t, err, "expected no error loading api-proxy kubeconfig")
	require.Empty(t, contextErrors, "expected no context errors")
	require.Equal(t, 1, len(contexts))

	oidcConf, err := contexts[0].OidcConfig()
	require.NoError(t, err)
	require.NotNil(t, oidcConf)

	assert.Equal(t, "https://api-proxy.example.com/kubernetes", oidcConf.APIProxy)

	require.NotNil(t, oidcConf.APIProxyCACert, "expected APIProxyCACert to be set")
	assert.Contains(t, *oidcConf.APIProxyCACert, "-----BEGIN CERTIFICATE-----")
	assert.Contains(t, *oidcConf.APIProxyCACert, "-----END CERTIFICATE-----")

	require.NotNil(t, oidcConf.APIProxySkipTLSVerify, "expected APIProxySkipTLSVerify to be set")
	assert.False(t, *oidcConf.APIProxySkipTLSVerify)
}

func testOIDCAPIProxyNoFields(t *testing.T) {
	tempFile := createTempKubeconfig(t, `apiVersion: v1
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: plain-cluster
contexts:
- context:
    cluster: plain-cluster
    user: plain-user
  name: plain-context
current-context: plain-context
kind: Config
users:
- name: plain-user
  user:
    auth-provider:
      config:
        client-id: "cid"
        client-secret: "csecret"
        idp-issuer-url: "https://oidc.example.com"
        scope: "profile,email"
      name: oidc`)

	defer func() { _ = os.Remove(tempFile) }()

	contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(tempFile, kubeconfig.KubeConfig)
	require.NoError(t, err)
	require.Empty(t, contextErrors)
	require.Equal(t, 1, len(contexts))

	oidcConf, err := contexts[0].OidcConfig()
	require.NoError(t, err)
	require.NotNil(t, oidcConf)

	assert.Empty(t, oidcConf.APIProxy, "APIProxy should be empty when not configured")
	assert.Nil(t, oidcConf.APIProxyCACert, "APIProxyCACert should be nil when not configured")
	assert.Nil(t, oidcConf.APIProxySkipTLSVerify, "APIProxySkipTLSVerify should be nil when not configured")
}

func testOIDCAPIProxyInvalidCAData(t *testing.T) {
	tempFile := createTempKubeconfig(t, `apiVersion: v1
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: bad-ca-cluster
contexts:
- context:
    cluster: bad-ca-cluster
    user: bad-ca-user
  name: bad-ca-context
current-context: bad-ca-context
kind: Config
users:
- name: bad-ca-user
  user:
    auth-provider:
      config:
        client-id: "cid"
        idp-issuer-url: "https://oidc.example.com"
        scope: "profile,email"
        api-proxy: "https://proxy.example.com"
        api-proxy-ca-data: "!!!invalid-base64!!!"
      name: oidc`)

	defer func() { _ = os.Remove(tempFile) }()

	contexts, contextErrors, err := kubeconfig.LoadContextsFromFile(tempFile, kubeconfig.KubeConfig)
	require.NoError(t, err)
	require.Empty(t, contextErrors)
	require.Equal(t, 1, len(contexts))

	_, err = contexts[0].OidcConfig()
	require.Error(t, err, "expected error for invalid base64 api-proxy-ca-data")
	assert.Contains(t, err.Error(), "api-proxy-ca-data")
}

// TestContextCopyPreservesAPIProxyFields verifies that Context.Copy() performs
// a proper deep-copy of the api-proxy fields in OidcConf.
func TestContextCopyPreservesAPIProxyFields(t *testing.T) {
	caData := "-----BEGIN CERTIFICATE-----\nMIIBIjANBg==\n-----END CERTIFICATE-----"
	skipVerify := false

	original := &kubeconfig.Context{
		Name: "test-context",
		OidcConf: &kubeconfig.OidcConfig{
			ClientID:              "cid",
			APIProxy:              "https://proxy.example.com/k8s",
			APIProxyCACert:        &caData,
			APIProxySkipTLSVerify: &skipVerify,
		},
	}

	copied := original.Copy()
	require.NotNil(t, copied)
	require.NotNil(t, copied.OidcConf)

	// Values must match.
	assert.Equal(t, original.OidcConf.APIProxy, copied.OidcConf.APIProxy)
	require.NotNil(t, copied.OidcConf.APIProxyCACert)
	assert.Equal(t, *original.OidcConf.APIProxyCACert, *copied.OidcConf.APIProxyCACert)
	require.NotNil(t, copied.OidcConf.APIProxySkipTLSVerify)
	assert.Equal(t, *original.OidcConf.APIProxySkipTLSVerify, *copied.OidcConf.APIProxySkipTLSVerify)

	// Pointers must differ — it is a genuine deep copy.
	assert.NotSame(t, original.OidcConf.APIProxyCACert, copied.OidcConf.APIProxyCACert)
	assert.NotSame(t, original.OidcConf.APIProxySkipTLSVerify, copied.OidcConf.APIProxySkipTLSVerify)

	// Mutating the copy must not affect the original.
	newCA := "mutated"
	copied.OidcConf.APIProxyCACert = &newCA
	assert.Equal(t, caData, *original.OidcConf.APIProxyCACert)
}

// TestBuildAPIProxyTLSConfig verifies the TLS configuration built for the
// api-proxy transport.
func TestBuildAPIProxyTLSConfig(t *testing.T) {
	t.Run("skip_tls_verify_true", func(t *testing.T) {
		skip := true
		conf := &kubeconfig.OidcConfig{APIProxySkipTLSVerify: &skip}
		tlsCfg := kubeconfig.BuildAPIProxyTLSConfig(conf, "test-ctx")
		require.NotNil(t, tlsCfg)
		assert.True(t, tlsCfg.InsecureSkipVerify)
	})

	t.Run("skip_tls_verify_false", func(t *testing.T) {
		skip := false
		conf := &kubeconfig.OidcConfig{APIProxySkipTLSVerify: &skip}
		tlsCfg := kubeconfig.BuildAPIProxyTLSConfig(conf, "test-ctx")
		require.NotNil(t, tlsCfg)
		assert.False(t, tlsCfg.InsecureSkipVerify)
	})

	t.Run("valid_ca_cert_populates_root_cas", func(t *testing.T) {
		caPath := filepath.Join(getTestDataPath(), "oidc_ca.pem")
		caBytes, err := os.ReadFile(caPath) // #nosec G304 -- test fixture path is controlled.
		require.NoError(t, err)

		caStr := string(caBytes)
		conf := &kubeconfig.OidcConfig{APIProxyCACert: &caStr}
		tlsCfg := kubeconfig.BuildAPIProxyTLSConfig(conf, "test-ctx")
		require.NotNil(t, tlsCfg)
		assert.NotNil(t, tlsCfg.RootCAs, "expected RootCAs pool to be populated")
	})

	t.Run("no_fields_returns_default_tls_config", func(t *testing.T) {
		conf := &kubeconfig.OidcConfig{}
		tlsCfg := kubeconfig.BuildAPIProxyTLSConfig(conf, "test-ctx")
		require.NotNil(t, tlsCfg)
		assert.False(t, tlsCfg.InsecureSkipVerify)
		assert.Nil(t, tlsCfg.RootCAs)
	})
}

// TestSetupProxyWithAPIProxy verifies that SetupProxy routes requests through
// the api-proxy URL when OidcConf.APIProxy is set.
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
			Server: "https://kube-apiserver.internal:6443",
		},
		OidcConf: &kubeconfig.OidcConfig{
			APIProxy: mockProxy.URL,
		},
	}

	err := ctx.SetupProxy()
	require.NoError(t, err, "SetupProxy must not fail when APIProxy is set")

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v1/namespaces", nil)
	w := httptest.NewRecorder()

	err = ctx.ProxyRequest(w, req)
	require.NoError(t, err)

	select {
	case r := <-received:
		assert.NotNil(t, r)
	default:
		t.Fatal("expected the request to reach the api-proxy mock server")
	}
}
