package headlampconfig_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/stretchr/testify/assert"
)

func TestHeadlampCFGZeroValues(t *testing.T) {
	cfg := headlampconfig.HeadlampCFG{}

	assert.False(t, cfg.UseInCluster)
	assert.Equal(t, "", cfg.InClusterContextName)
	assert.Equal(t, "", cfg.ListenAddr)
	assert.False(t, cfg.CacheEnabled)
	assert.False(t, cfg.DevMode)
	assert.False(t, cfg.Insecure)
	assert.False(t, cfg.EnableHelm)
	assert.False(t, cfg.EnableDynamicClusters)
	assert.False(t, cfg.AllowKubeconfigChanges)
	assert.False(t, cfg.WatchPluginsChanges)
	assert.Equal(t, uint(0), cfg.Port)
	assert.Equal(t, "", cfg.KubeConfigPath)
	assert.Equal(t, "", cfg.SkippedKubeContexts)
	assert.Equal(t, "", cfg.StaticDir)
	assert.Equal(t, "", cfg.PluginDir)
	assert.Equal(t, "", cfg.UserPluginDir)
	assert.Equal(t, "", cfg.StaticPluginDir)
	assert.Nil(t, cfg.KubeConfigStore)
	assert.Nil(t, cfg.Telemetry)
	assert.Nil(t, cfg.Metrics)
	assert.Equal(t, "", cfg.BaseURL)
	assert.Nil(t, cfg.ProxyURLs)
	assert.Equal(t, "", cfg.TLSCertPath)
	assert.Equal(t, "", cfg.TLSKeyPath)
	assert.Equal(t, 0, cfg.SessionTTL)
	assert.Equal(t, "", cfg.PodDebugImage)
	assert.Equal(t, "", cfg.NodeShellImage)
	assert.False(t, cfg.OidcUseCookie)
	assert.Equal(t, "", cfg.DefaultLightTheme)
	assert.Equal(t, "", cfg.DefaultDarkTheme)
	assert.Equal(t, "", cfg.ForceTheme)
	assert.False(t, cfg.UnsafeUseServiceAccountToken)
	assert.Equal(t, "", cfg.ServiceAccountTokenPath)
	assert.False(t, cfg.EnableClusterInventory)
	assert.Equal(t, "", cfg.ClusterInventoryProviderFile)
	assert.Equal(t, "", cfg.ClusterInventoryLabelSelector)
	assert.Equal(t, time.Duration(0), cfg.ClusterInventoryRootReconcileInterval)
	assert.Equal(t, time.Duration(0), cfg.ClusterInventoryNoCRDCacheTTL)
}

func TestHeadlampConfigZeroValues(t *testing.T) {
	cfg := headlampconfig.HeadlampConfig{}

	assert.Nil(t, cfg.HeadlampCFG)
	assert.Equal(t, "", cfg.OidcClientID)
	assert.Equal(t, "", cfg.OidcValidatorClientID)
	assert.Equal(t, "", cfg.OidcClientSecret)
	assert.Equal(t, "", cfg.OidcIdpIssuerURL)
	assert.Equal(t, "", cfg.OidcCallbackURL)
	assert.Equal(t, "", cfg.OidcValidatorIdpIssuerURL)
	assert.False(t, cfg.OidcUseAccessToken)
	assert.False(t, cfg.OidcSkipTLSVerify)
	assert.Equal(t, "", cfg.OidcCACert)
	assert.False(t, cfg.OidcUsePKCE)
	assert.Nil(t, cfg.OidcScopes)
	assert.Nil(t, cfg.Cache)
	assert.Nil(t, cfg.Multiplexer)
	assert.Equal(t, headlampconfig.HeadlampConfig{}.TelemetryConfig, cfg.TelemetryConfig)
	assert.Nil(t, cfg.TelemetryHandler)
	assert.Equal(t, "", cfg.MeUsernamePaths)
	assert.Equal(t, "", cfg.MeEmailPaths)
	assert.Equal(t, "", cfg.MeGroupsPaths)
	assert.Equal(t, "", cfg.MeUserInfoURL)
	assert.False(t, cfg.ProxyAuthEnabled)
	assert.Equal(t, "", cfg.ProxyAuthUsernameHeader)
	assert.Equal(t, "", cfg.ProxyAuthGroupHeader)
	assert.Equal(t, "", cfg.ProxyAuthEmailHeader)
	assert.Equal(t, "", cfg.ProxyAuthTokenHeader)
	assert.Nil(t, cfg.ServerCtx)
}

func TestHeadlampConfigConstruction(t *testing.T) {
	cfg := &headlampconfig.HeadlampConfig{
		HeadlampCFG: &headlampconfig.HeadlampCFG{
			UseInCluster:         true,
			InClusterContextName: "my-cluster",
			ListenAddr:           "0.0.0.0",
			CacheEnabled:         true,
			DevMode:              true,
			Insecure:             true,
			EnableHelm:           true,
			EnableDynamicClusters: true,
			AllowKubeconfigChanges: true,
			Port:                 4466,
			KubeConfigPath:       "/tmp/config",
			BaseURL:              "/headlamp",
			ProxyURLs:            []string{"http://proxy:8080"},
			SessionTTL:           3600,
			PodDebugImage:        "docker.io/alpine:latest",
			NodeShellImage:       "docker.io/alpine:latest",
			DefaultLightTheme:    "light",
			DefaultDarkTheme:     "dark",
			ForceTheme:           "",
			UnsafeUseServiceAccountToken: true,
			ServiceAccountTokenPath:      "/var/run/secrets/token",
			EnableClusterInventory:       true,
			ClusterInventoryProviderFile: "/etc/provider.yaml",
		},
		OidcClientID:          "my-client",
		OidcClientSecret:      "my-secret",
		OidcIdpIssuerURL:      "https://issuer.example.com",
		OidcCallbackURL:       "https://headlamp/callback",
		OidcUseAccessToken:    true,
		OidcSkipTLSVerify:     true,
		OidcCACert:            "/etc/ca.pem",
		OidcUsePKCE:           true,
		OidcScopes:            []string{"openid", "profile"},
		MeUsernamePaths:       "/me/username",
		MeEmailPaths:          "/me/email",
		MeGroupsPaths:         "/me/groups",
		MeUserInfoURL:         "/me/userinfo",
		ProxyAuthEnabled:       true,
		ProxyAuthUsernameHeader: "X-User",
		ProxyAuthGroupHeader:    "X-Groups",
		ProxyAuthEmailHeader:    "X-Email",
		ProxyAuthTokenHeader:    "X-Token",
	}

	assert.Equal(t, true, cfg.HeadlampCFG.UseInCluster)
	assert.Equal(t, "my-cluster", cfg.HeadlampCFG.InClusterContextName)
	assert.Equal(t, "0.0.0.0", cfg.HeadlampCFG.ListenAddr)
	assert.Equal(t, uint(4466), cfg.HeadlampCFG.Port)
	assert.Equal(t, "/headlamp", cfg.HeadlampCFG.BaseURL)
	assert.Equal(t, "my-client", cfg.OidcClientID)
	assert.Equal(t, true, cfg.ProxyAuthEnabled)
	assert.Equal(t, "X-User", cfg.ProxyAuthUsernameHeader)
}

func TestHeadlampConfigEmbedsHeadlampCFG(t *testing.T) {
	subCfg := &headlampconfig.HeadlampCFG{Port: 8080, BaseURL: "/test"}
	cfg := headlampconfig.HeadlampConfig{HeadlampCFG: subCfg}

	assert.Equal(t, uint(8080), cfg.Port)
	assert.Equal(t, "/test", cfg.BaseURL)
}

func TestHeadlampConfigAllowsNilHeadlampCFG(t *testing.T) {
	cfg := headlampconfig.HeadlampConfig{HeadlampCFG: nil}

	assert.Nil(t, cfg.HeadlampCFG)
}

type mockMultiplexer struct{}

func (m *mockMultiplexer) HandleClientWebSocket(_ http.ResponseWriter, _ *http.Request) {}

func TestWebSocketMultiplexerInterface(t *testing.T) {
	var m headlampconfig.WebSocketMultiplexer = &mockMultiplexer{}
	assert.NotNil(t, m)
}

func TestWebSocketMultiplexerInConfig(t *testing.T) {
	mux := &mockMultiplexer{}
	cfg := headlampconfig.HeadlampConfig{Multiplexer: mux}
	assert.NotNil(t, cfg.Multiplexer)
}

func TestBuildHeadlampCFGPattern(t *testing.T) {
	cfg := &headlampconfig.HeadlampCFG{
		UseInCluster:        true,
		InClusterContextName: "in-cluster",
		KubeConfigPath:      "/etc/kubernetes/admin.conf",
		Port:                4466,
		BaseURL:             "/headlamp",
		ProxyURLs:           []string{"http://proxy:3128"},
		SessionTTL:          7200,
		EnableHelm:          true,
		EnableDynamicClusters: true,
		AllowKubeconfigChanges: true,
		CacheEnabled:         true,
		DevMode:              true,
		Insecure:             false,
		StaticDir:            "/app/frontend",
		PluginDir:            "/app/plugins",
		UserPluginDir:        "/app/user-plugins",
		StaticPluginDir:      "/app/static-plugins",
		TLSCertPath:          "/etc/certs/tls.crt",
		TLSKeyPath:           "/etc/certs/tls.key",
		PodDebugImage:        "docker.io/alpine:3.19",
		NodeShellImage:       "docker.io/alpine:3.19",
		DefaultLightTheme:    "light",
		DefaultDarkTheme:     "dark",
		ForceTheme:           "dark",
		OidcUseCookie:        true,
		UnsafeUseServiceAccountToken: false,
		ServiceAccountTokenPath:      "",
		EnableClusterInventory:       true,
		ClusterInventoryProviderFile: "/etc/inventory/provider.yaml",
		ClusterInventoryRootReconcileInterval: 5 * time.Minute,
		ClusterInventoryNoCRDCacheTTL:         10 * time.Minute,
	}

	assert.True(t, cfg.UseInCluster)
	assert.Equal(t, "/etc/kubernetes/admin.conf", cfg.KubeConfigPath)
	assert.Equal(t, uint(4466), cfg.Port)
	assert.Equal(t, "/headlamp", cfg.BaseURL)
	assert.Equal(t, 7200, cfg.SessionTTL)
	assert.Equal(t, 5*time.Minute, cfg.ClusterInventoryRootReconcileInterval)
}

func TestCreateHeadlampConfigPattern(t *testing.T) {
	headlampCFG := &headlampconfig.HeadlampCFG{
		ListenAddr:  "127.0.0.1",
		Port:        4466,
		BaseURL:     "/headlamp",
		CacheEnabled: true,
		DevMode:      true,
	}

	cfg := &headlampconfig.HeadlampConfig{
		HeadlampCFG:           headlampCFG,
		OidcClientID:          "test-client",
		OidcClientSecret:      "test-secret",
		OidcIdpIssuerURL:      "https://accounts.example.com",
		OidcCallbackURL:       "https://headlamp/oidc-callback",
		OidcValidatorClientID: "validator-client",
		OidcSkipTLSVerify:     false,
		OidcCACert:            "",
		OidcUsePKCE:           true,
		OidcUseAccessToken:    false,
		OidcScopes:            []string{"openid", "email"},
		ProxyAuthEnabled:      false,
	}

	assert.Equal(t, "test-client", cfg.OidcClientID)
	assert.Equal(t, "https://accounts.example.com", cfg.OidcIdpIssuerURL)
	assert.True(t, cfg.OidcUsePKCE)
	assert.False(t, cfg.OidcUseAccessToken)
	assert.False(t, cfg.ProxyAuthEnabled)
	assert.Equal(t, uint(4466), cfg.Port)
	assert.Equal(t, "/headlamp", cfg.BaseURL)
}
