package headlampconfig_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/config"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/headlampconfig"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubMultiplexer is a minimal WebSocketMultiplexer implementation for tests.
type stubMultiplexer struct {
	called bool
}

func (s *stubMultiplexer) HandleClientWebSocket(w http.ResponseWriter, r *http.Request) {
	s.called = true
}

// Compile-time check that the stub satisfies the interface.
var _ headlampconfig.WebSocketMultiplexer = (*stubMultiplexer)(nil)

func TestHeadlampCFGZeroValues(t *testing.T) {
	cfg := headlampconfig.HeadlampCFG{}

	assert.False(t, cfg.UseInCluster)
	assert.False(t, cfg.DevMode)
	assert.False(t, cfg.Insecure)
	assert.False(t, cfg.EnableHelm)
	assert.False(t, cfg.EnableDynamicClusters)
	assert.False(t, cfg.UnsafeUseServiceAccountToken)
	assert.Equal(t, uint(0), cfg.Port)
	assert.Equal(t, 0, cfg.SessionTTL)
	assert.Empty(t, cfg.BaseURL)
	assert.Empty(t, cfg.ProxyURLs)
	assert.Nil(t, cfg.KubeConfigStore)
	assert.Nil(t, cfg.Telemetry)
	assert.Nil(t, cfg.Metrics)
	assert.Equal(t, time.Duration(0), cfg.ClusterInventoryRootReconcileInterval)
	assert.Equal(t, time.Duration(0), cfg.ClusterInventoryNoCRDCacheTTL)
}

func TestHeadlampConfigZeroValues(t *testing.T) {
	cfg := headlampconfig.HeadlampConfig{}

	assert.Nil(t, cfg.HeadlampCFG)
	assert.Nil(t, cfg.Cache)
	assert.Nil(t, cfg.Multiplexer)
	assert.Nil(t, cfg.TelemetryHandler)
	assert.Nil(t, cfg.ServerCtx)
	assert.False(t, cfg.OidcUseAccessToken)
	assert.False(t, cfg.OidcSkipTLSVerify)
	assert.False(t, cfg.OidcUsePKCE)
	assert.False(t, cfg.ProxyAuthEnabled)
	assert.Empty(t, cfg.OidcClientID)
	assert.Empty(t, cfg.OidcScopes)
}

// Accessing an embedded field through a nil *HeadlampCFG panics; callers must
// always populate the embedded struct. This documents that requirement.
func TestHeadlampConfigNilEmbeddedPanics(t *testing.T) {
	cfg := headlampconfig.HeadlampConfig{}

	assert.Panics(t, func() {
		_ = cfg.Port
	})
}

// newTestCFG builds a HeadlampCFG with every field populated (a superset of
// what buildHeadlampCFG in server.go sets), so renames or type changes of any
// field break this test.
func newTestCFG(store kubeconfig.ContextStore) *headlampconfig.HeadlampCFG {
	return &headlampconfig.HeadlampCFG{ //nolint:gosec // test fixture, not real credentials
		UseInCluster:                          true,
		InClusterContextName:                  "main",
		ListenAddr:                            "localhost",
		Port:                                  4466,
		DevMode:                               true,
		Insecure:                              true,
		EnableHelm:                            true,
		EnableDynamicClusters:                 true,
		AllowKubeconfigChanges:                true,
		WatchPluginsChanges:                   true,
		CacheEnabled:                          true,
		KubeConfigPath:                        "/tmp/kubeconfig",
		SkippedKubeContexts:                   "skip-me",
		StaticDir:                             "static",
		PluginDir:                             "plugins",
		UserPluginDir:                         "user-plugins",
		StaticPluginDir:                       "static-plugins",
		KubeConfigStore:                       store,
		Telemetry:                             nil,
		Metrics:                               nil,
		BaseURL:                               "/headlamp",
		ProxyURLs:                             []string{"https://example.com"},
		TLSCertPath:                           "/tls/cert.pem",
		TLSKeyPath:                            "/tls/key.pem",
		SessionTTL:                            3600,
		PodDebugImage:                         "busybox",
		NodeShellImage:                        "alpine",
		NodeShellNamespace:                    "kube-system",
		OidcUseCookie:                         true,
		DefaultLightTheme:                     "light",
		DefaultDarkTheme:                      "dark",
		ForceTheme:                            "light",
		UnsafeUseServiceAccountToken:          true,
		ServiceAccountTokenPath:               "/var/run/token",
		EnableClusterInventory:                true,
		ClusterInventoryProviderFile:          "providers.yaml",
		ClusterInventoryLabelSelector:         "app=headlamp",
		ClusterInventoryRootReconcileInterval: 5 * time.Minute,
		ClusterInventoryNoCRDCacheTTL:         time.Minute,
	}
}

// Mirrors how server.go builds the config (buildHeadlampCFG + createHeadlampConfig),
// guarding against accidental field renames or type changes.
func TestHeadlampConfigConstruction(t *testing.T) {
	store := kubeconfig.NewContextStore()
	c := cache.New[interface{}]()
	mux := &stubMultiplexer{}

	cfg := &headlampconfig.HeadlampConfig{
		HeadlampCFG:               newTestCFG(store),
		OidcClientID:              "client-id",
		OidcValidatorClientID:     "validator-client-id",
		OidcClientSecret:          "test-value",
		OidcIdpIssuerURL:          "https://idp.example.com",
		OidcCallbackURL:           "https://headlamp.example.com/oidc-callback",
		OidcValidatorIdpIssuerURL: "https://validator.example.com",
		OidcUseAccessToken:        true,
		OidcSkipTLSVerify:         true,
		OidcCACert:                "ca-cert",
		OidcUsePKCE:               true,
		OidcScopes:                []string{"openid", "profile", "email"},
		Cache:                     c,
		Multiplexer:               mux,
		TelemetryConfig:           config.Config{},
		TelemetryHandler:          nil,
		MeUsernamePaths:           "username",
		MeEmailPaths:              "email",
		MeGroupsPaths:             "groups",
		MeUserInfoURL:             "https://idp.example.com/userinfo",
		ProxyAuthEnabled:          true,
		ProxyAuthUsernameHeader:   "X-User",
		ProxyAuthGroupHeader:      "X-Groups",
		ProxyAuthEmailHeader:      "X-Email",
		ProxyAuthTokenHeader:      "X-Token",
		ServerCtx:                 nil,
	}

	// Embedded fields are reachable directly on HeadlampConfig.
	assert.Equal(t, uint(4466), cfg.Port)
	assert.Equal(t, "/headlamp", cfg.BaseURL)
	assert.True(t, cfg.UseInCluster)
	assert.Equal(t, []string{"https://example.com"}, cfg.ProxyURLs)

	// Interface fields work through the config.
	require.NotNil(t, cfg.Multiplexer)
	cfg.Multiplexer.HandleClientWebSocket(nil, nil)
	assert.True(t, mux.called)

	require.NotNil(t, cfg.KubeConfigStore)
	require.NotNil(t, cfg.Cache)
	assert.Equal(t, []string{"openid", "profile", "email"}, cfg.OidcScopes)
}

// Mutating an embedded field through the outer struct writes to the shared
// *HeadlampCFG, matching how createHeadlampConfig assigns fields after construction.
func TestHeadlampConfigEmbeddedMutation(t *testing.T) {
	inner := &headlampconfig.HeadlampCFG{}
	cfg := headlampconfig.HeadlampConfig{HeadlampCFG: inner}

	cfg.BaseURL = "/base"
	cfg.Port = 8080

	assert.Equal(t, "/base", inner.BaseURL)
	assert.Equal(t, uint(8080), inner.Port)
}
