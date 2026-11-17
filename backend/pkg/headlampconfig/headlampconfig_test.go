/*
Copyright 2025 The Kubernetes Authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package headlampconfig_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/kubernetes-sigs/headlamp/backend/pkg/cache"
	"github.com/kubernetes-sigs/headlamp/backend/pkg/clusterdiscovery"
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

// stubContextStore is a resource-free ContextStore for tests. The real
// NewContextStore starts a cache cleanup goroutine with no Close method, which
// would leak until the test process exits; the tests here never call store
// methods, so a no-op stub avoids that.
type stubContextStore struct{}

func (stubContextStore) AddContext(*kubeconfig.Context) error { return nil }
func (stubContextStore) UpdateContextIfCurrent(*kubeconfig.Context, *kubeconfig.Context) error {
	return nil
}
func (stubContextStore) GetContexts() ([]*kubeconfig.Context, error)    { return nil, nil }
func (stubContextStore) GetContext(string) (*kubeconfig.Context, error) { return nil, nil }
func (stubContextStore) RemoveContext(string) error                     { return nil }
func (stubContextStore) AddContextWithKeyAndTTL(*kubeconfig.Context, string, time.Duration) error {
	return nil
}
func (stubContextStore) UpdateTTL(string, time.Duration) error        { return nil }
func (stubContextStore) AddListener(kubeconfig.ContextChangeListener) {}
func (stubContextStore) GetContextKeys() ([]string, error)            { return nil, nil }

// Compile-time check that the stub satisfies the interface.
var _ kubeconfig.ContextStore = stubContextStore{}

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
	assert.Empty(t, cfg.AppName)
	assert.Empty(t, cfg.BaseURL)
	assert.Empty(t, cfg.ProxyURLs)
	assert.Nil(t, cfg.KubeConfigStore)
	assert.Nil(t, cfg.Telemetry)
	assert.Nil(t, cfg.Metrics)
	assert.Nil(t, cfg.DiscoverySources)
}

func TestHeadlampConfigZeroValues(t *testing.T) {
	cfg := headlampconfig.HeadlampConfig{}

	assert.Nil(t, cfg.HeadlampCFG)
	assert.Nil(t, cfg.Cache)
	assert.Nil(t, cfg.Multiplexer)
	assert.Nil(t, cfg.TelemetryHandler)
	assert.Nil(t, cfg.ServerCtx)
	assert.False(t, cfg.OidcAutoLogin)
	assert.False(t, cfg.OidcUseAccessToken)
	assert.False(t, cfg.OidcSkipTLSVerify)
	assert.False(t, cfg.OidcUsePKCE)
	assert.False(t, cfg.OidcSkipLogout)
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
// what buildHeadlampCFG in server.go sets), acting as a constructibility and
// field-name guard.
func newTestCFG(store kubeconfig.ContextStore) *headlampconfig.HeadlampCFG {
	return &headlampconfig.HeadlampCFG{ //nolint:gosec // test fixture, not real credentials
		AppName:                      "Headlamp",
		UseInCluster:                 true,
		InClusterContextName:         "main",
		ListenAddr:                   "localhost",
		Port:                         4466,
		DevMode:                      true,
		Insecure:                     true,
		EnableHelm:                   true,
		EnableDynamicClusters:        true,
		AllowKubeconfigChanges:       true,
		WatchPluginsChanges:          true,
		CacheEnabled:                 true,
		KubeConfigPath:               "/tmp/kubeconfig",
		KubeConfigDir:                "/tmp/kubeconfigs",
		SkippedKubeContexts:          "skip-me",
		StaticDir:                    "static",
		PluginDir:                    "plugins",
		UserPluginDir:                "user-plugins",
		StaticPluginDir:              "static-plugins",
		KubeConfigStore:              store,
		Telemetry:                    nil,
		Metrics:                      nil,
		BaseURL:                      "/headlamp",
		ProxyURLs:                    []string{"https://example.com"},
		TLSCertPath:                  "/tls/cert.pem",
		TLSKeyPath:                   "/tls/key.pem",
		SessionTTL:                   3600,
		PodDebugImage:                "busybox",
		NodeShellImage:               "alpine",
		NodeShellNamespace:           "kube-system",
		OidcUseCookie:                true,
		OidcUseTokenBroadcast:        true,
		DefaultLightTheme:            "light",
		DefaultDarkTheme:             "dark",
		ForceTheme:                   "light",
		UnsafeUseServiceAccountToken: true,
		ServiceAccountTokenPath:      "/var/run/token",
		DiscoverySources: map[string]clusterdiscovery.Settings{
			"cluster_inventory": {
				Enabled:               true,
				LabelSelector:         "app=headlamp",
				Namespaces:            "team-a,team-b",
				RootReconcileInterval: 5 * time.Minute,
				NoCRDCacheTTL:         time.Minute,
			},
		},
	}
}

// TestHeadlampConfigConstruction verifies struct constructibility, promoted
// embedded field access, and interface delegation on HeadlampConfig.
func TestHeadlampConfigConstruction(t *testing.T) {
	store := stubContextStore{}
	c := cache.New[interface{}]()
	mux := &stubMultiplexer{}

	t.Cleanup(func() { _ = c.Close() })

	cfg := &headlampconfig.HeadlampConfig{
		HeadlampCFG:               newTestCFG(store),
		OidcAutoLogin:             true,
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
		OidcSkipLogout:            true,
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
	assert.True(t, cfg.OidcAutoLogin)
	assert.True(t, cfg.OidcSkipLogout)
	assert.Equal(t, []string{"openid", "profile", "email"}, cfg.OidcScopes)
}

// Go's embedded-pointer semantics mean that a write to a promoted field on the
// outer struct (HeadlampConfig) reaches the shared *HeadlampCFG directly.
// Verify this guarantee so field access patterns remain obvious to future readers.
func TestHeadlampConfigEmbeddedMutation(t *testing.T) {
	inner := &headlampconfig.HeadlampCFG{}
	cfg := headlampconfig.HeadlampConfig{HeadlampCFG: inner}

	cfg.BaseURL = "/base"
	cfg.Port = 8080

	assert.Equal(t, "/base", inner.BaseURL)
	assert.Equal(t, uint(8080), inner.Port)
}
