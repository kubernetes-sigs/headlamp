package headlampconfig_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockMultiplexer implements headlampconfig.WebSocketMultiplexer for testing.
type mockMultiplexer struct{}

func (m *mockMultiplexer) HandleClientWebSocket(_ http.ResponseWriter, _ *http.Request) {}

func TestHeadlampCFGZeroValues(t *testing.T) {
	cfg := headlampconfig.HeadlampCFG{}

	assert.Equal(t, uint(0), cfg.Port)
	assert.Equal(t, 0, cfg.SessionTTL)
	assert.False(t, cfg.UseInCluster)
	assert.False(t, cfg.CacheEnabled)
	assert.False(t, cfg.DevMode)
	assert.False(t, cfg.Insecure)
	assert.False(t, cfg.EnableHelm)
	assert.False(t, cfg.EnableDynamicClusters)
	assert.False(t, cfg.AllowKubeconfigChanges)
	assert.False(t, cfg.WatchPluginsChanges)
	assert.False(t, cfg.OidcUseCookie)
	assert.False(t, cfg.UnsafeUseServiceAccountToken)
	assert.False(t, cfg.EnableClusterInventory)
	assert.Equal(t, "", cfg.ListenAddr)
	assert.Equal(t, "", cfg.KubeConfigPath)
	assert.Equal(t, "", cfg.SkippedKubeContexts)
	assert.Equal(t, "", cfg.StaticDir)
	assert.Equal(t, "", cfg.PluginDir)
	assert.Equal(t, "", cfg.UserPluginDir)
	assert.Equal(t, "", cfg.StaticPluginDir)
	assert.Equal(t, "", cfg.BaseURL)
	assert.Equal(t, "", cfg.TLSCertPath)
	assert.Equal(t, "", cfg.TLSKeyPath)
	assert.Equal(t, "", cfg.PodDebugImage)
	assert.Equal(t, "", cfg.NodeShellImage)
	assert.Equal(t, "", cfg.DefaultLightTheme)
	assert.Equal(t, "", cfg.DefaultDarkTheme)
	assert.Equal(t, "", cfg.ForceTheme)
	assert.Equal(t, "", cfg.ServiceAccountTokenPath)
	assert.Equal(t, "", cfg.InClusterContextName)
	assert.Equal(t, []string(nil), cfg.ProxyURLs)
	assert.Nil(t, cfg.KubeConfigStore)
	assert.Nil(t, cfg.Telemetry)
	assert.Nil(t, cfg.Metrics)
	assert.Equal(t, time.Duration(0), cfg.ClusterInventoryRootReconcileInterval)
	assert.Equal(t, time.Duration(0), cfg.ClusterInventoryNoCRDCacheTTL)
}

//nolint:funlen // Asserting 30+ fields requires a long function
func TestHeadlampCFGPopulated(t *testing.T) {
	kubeConfigStore := kubeconfig.NewContextStore()

	cfg := &headlampconfig.HeadlampCFG{ //nolint:gosec // test paths, not real credentials
		UseInCluster:                          true,
		InClusterContextName:                  "in-cluster",
		ListenAddr:                            "0.0.0.0",
		CacheEnabled:                          true,
		DevMode:                               true,
		Insecure:                              true,
		EnableHelm:                            true,
		EnableDynamicClusters:                 true,
		AllowKubeconfigChanges:                true,
		WatchPluginsChanges:                   true,
		Port:                                  4466,
		KubeConfigPath:                        "/tmp/kubeconfig",
		SkippedKubeContexts:                   "ctx1,ctx2",
		StaticDir:                             "/static",
		PluginDir:                             "/plugins",
		UserPluginDir:                         "/user-plugins",
		StaticPluginDir:                       "/static-plugins",
		KubeConfigStore:                       kubeConfigStore,
		BaseURL:                               "/headlamp",
		ProxyURLs:                             []string{"http://proxy:8080"},
		TLSCertPath:                           "/certs/tls.crt",
		TLSKeyPath:                            "/certs/tls.key",
		SessionTTL:                            3600,
		PodDebugImage:                         "debugger:latest",
		NodeShellImage:                        "shell:latest",
		OidcUseCookie:                         true,
		DefaultLightTheme:                     "light-theme",
		DefaultDarkTheme:                      "dark-theme",
		ForceTheme:                            "dark",
		UnsafeUseServiceAccountToken:          true,
		ServiceAccountTokenPath:               "/var/run/secrets/token",
		EnableClusterInventory:                true,
		ClusterInventoryProviderFile:          "/providers.json",
		ClusterInventoryLabelSelector:         "app=myapp",
		ClusterInventoryRootReconcileInterval: 5 * time.Minute,
		ClusterInventoryNoCRDCacheTTL:         30 * time.Second,
	}

	assert.True(t, cfg.UseInCluster)
	assert.Equal(t, "in-cluster", cfg.InClusterContextName)
	assert.Equal(t, "0.0.0.0", cfg.ListenAddr)
	assert.True(t, cfg.CacheEnabled)
	assert.True(t, cfg.DevMode)
	assert.True(t, cfg.Insecure)
	assert.True(t, cfg.EnableHelm)
	assert.True(t, cfg.EnableDynamicClusters)
	assert.True(t, cfg.AllowKubeconfigChanges)
	assert.True(t, cfg.WatchPluginsChanges)
	assert.Equal(t, uint(4466), cfg.Port)
	assert.Equal(t, "/tmp/kubeconfig", cfg.KubeConfigPath)
	assert.Equal(t, "ctx1,ctx2", cfg.SkippedKubeContexts)
	assert.Equal(t, "/static", cfg.StaticDir)
	assert.Equal(t, "/plugins", cfg.PluginDir)
	assert.Equal(t, "/user-plugins", cfg.UserPluginDir)
	assert.Equal(t, "/static-plugins", cfg.StaticPluginDir)
	assert.Same(t, kubeConfigStore, cfg.KubeConfigStore)
	assert.Equal(t, "/headlamp", cfg.BaseURL)
	assert.Equal(t, []string{"http://proxy:8080"}, cfg.ProxyURLs)
	assert.Equal(t, "/certs/tls.crt", cfg.TLSCertPath)
	assert.Equal(t, "/certs/tls.key", cfg.TLSKeyPath)
	assert.Equal(t, 3600, cfg.SessionTTL)
	assert.Equal(t, "debugger:latest", cfg.PodDebugImage)
	assert.Equal(t, "shell:latest", cfg.NodeShellImage)
	assert.True(t, cfg.OidcUseCookie)
	assert.Equal(t, "light-theme", cfg.DefaultLightTheme)
	assert.Equal(t, "dark-theme", cfg.DefaultDarkTheme)
	assert.Equal(t, "dark", cfg.ForceTheme)
	assert.True(t, cfg.UnsafeUseServiceAccountToken)
	assert.Equal(t, "/var/run/secrets/token", cfg.ServiceAccountTokenPath)
	assert.True(t, cfg.EnableClusterInventory)
	assert.Equal(t, "/providers.json", cfg.ClusterInventoryProviderFile)
	assert.Equal(t, "app=myapp", cfg.ClusterInventoryLabelSelector)
	assert.Equal(t, 5*time.Minute, cfg.ClusterInventoryRootReconcileInterval)
	assert.Equal(t, 30*time.Second, cfg.ClusterInventoryNoCRDCacheTTL)
}

//nolint:funlen // Asserting many fields requires a long function
func TestHeadlampConfigStruct(t *testing.T) {
	kubeConfigStore := kubeconfig.NewContextStore()
	c := cache.New[interface{}]()
	mux := &mockMultiplexer{}

	cfg := &headlampconfig.HeadlampConfig{
		HeadlampCFG: &headlampconfig.HeadlampCFG{
			UseInCluster:    true,
			KubeConfigPath:  "/tmp/kubeconfig",
			KubeConfigStore: kubeConfigStore,
			BaseURL:         "/headlamp",
			Port:            4466,
		},
		OidcClientID:              "my-client",
		OidcValidatorClientID:     "validator",
		OidcClientSecret:          "secret",
		OidcIdpIssuerURL:          "https://issuer",
		OidcCallbackURL:           "https://callback",
		OidcValidatorIdpIssuerURL: "https://validator-issuer",
		OidcUseAccessToken:        true,
		OidcSkipTLSVerify:         true,
		OidcCACert:                "ca-cert-data",
		OidcUsePKCE:               true,
		OidcScopes:                []string{"openid", "profile"},
		Cache:                     c,
		Multiplexer:               mux,
		TelemetryConfig: config.Config{
			ServiceName:    "headlamp-test",
			ServiceVersion: strPtr("0.30.0"),
		},
		TelemetryHandler:        &telemetry.RequestHandler{},
		MeUsernamePaths:         "preferred_username",
		MeEmailPaths:            "email",
		MeGroupsPaths:           "groups",
		MeUserInfoURL:           "https://userinfo",
		ProxyAuthEnabled:        true,
		ProxyAuthUsernameHeader: "X-User",
		ProxyAuthGroupHeader:    "X-Group",
		ProxyAuthEmailHeader:    "X-Email",
		ProxyAuthTokenHeader:    "X-Token",
		ServerCtx:               context.Background(),
	}

	require.NotNil(t, cfg.HeadlampCFG)
	assert.True(t, cfg.UseInCluster)
	assert.Equal(t, "/tmp/kubeconfig", cfg.KubeConfigPath)
	assert.Same(t, kubeConfigStore, cfg.KubeConfigStore)
	assert.Equal(t, "/headlamp", cfg.BaseURL)
	assert.Equal(t, uint(4466), cfg.Port)
	assert.Equal(t, "my-client", cfg.OidcClientID)
	assert.Equal(t, "validator", cfg.OidcValidatorClientID)
	assert.Equal(t, "secret", cfg.OidcClientSecret)
	assert.Equal(t, "https://issuer", cfg.OidcIdpIssuerURL)
	assert.Equal(t, "https://callback", cfg.OidcCallbackURL)
	assert.Equal(t, "https://validator-issuer", cfg.OidcValidatorIdpIssuerURL)
	assert.True(t, cfg.OidcUseAccessToken)
	assert.True(t, cfg.OidcSkipTLSVerify)
	assert.Equal(t, "ca-cert-data", cfg.OidcCACert)
	assert.True(t, cfg.OidcUsePKCE)
	assert.Equal(t, []string{"openid", "profile"}, cfg.OidcScopes)
	assert.Same(t, c, cfg.Cache)
	assert.Same(t, mux, cfg.Multiplexer)
	assert.Equal(t, "headlamp-test", cfg.TelemetryConfig.ServiceName)
	assert.NotNil(t, cfg.TelemetryHandler)
	assert.Equal(t, "preferred_username", cfg.MeUsernamePaths)
	assert.Equal(t, "email", cfg.MeEmailPaths)
	assert.Equal(t, "groups", cfg.MeGroupsPaths)
	assert.Equal(t, "https://userinfo", cfg.MeUserInfoURL)
	assert.True(t, cfg.ProxyAuthEnabled)
	assert.Equal(t, "X-User", cfg.ProxyAuthUsernameHeader)
	assert.Equal(t, "X-Group", cfg.ProxyAuthGroupHeader)
	assert.Equal(t, "X-Email", cfg.ProxyAuthEmailHeader)
	assert.Equal(t, "X-Token", cfg.ProxyAuthTokenHeader)
	assert.NotNil(t, cfg.ServerCtx)
}

func TestHeadlampConfigNilEmbeddedPointer(t *testing.T) {
	cfg := &headlampconfig.HeadlampConfig{
		HeadlampCFG: nil,
		Cache:       cache.New[interface{}](),
	}

	require.NotNil(t, cfg)
	assert.NotNil(t, cfg.Cache)
	assert.Nil(t, cfg.HeadlampCFG)

	// Accessing a promoted field through the nil embedded pointer must panic.
	// The embedded *HeadlampCFG is nil so cfg.Port (promoted field) cannot be resolved.
	require.Panics(t, func() {
		_ = cfg.Port
	}, "expected panic when accessing promoted field through nil embedded pointer")
}

func TestWebSocketMultiplexerInterface(t *testing.T) {
	var mux headlampconfig.WebSocketMultiplexer = &mockMultiplexer{}
	assert.NotNil(t, mux)
}

func strPtr(s string) *string {
	return &s
}
