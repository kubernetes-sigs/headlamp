/*
Copyright 2026 The Kubernetes Authors.

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
	assert.Equal(t, "", cfg.TelemetryConfig.ServiceName)
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

func TestHeadlampConfigConstruction(t *testing.T) { //nolint:funlen
	cfg := &headlampconfig.HeadlampConfig{
		HeadlampCFG: &headlampconfig.HeadlampCFG{
			UseInCluster:                 true,
			InClusterContextName:         "my-cluster",
			ListenAddr:                   "0.0.0.0",
			CacheEnabled:                 true,
			DevMode:                      true,
			Insecure:                     true,
			EnableHelm:                   true,
			EnableDynamicClusters:        true,
			AllowKubeconfigChanges:       true,
			Port:                         4466,
			KubeConfigPath:               "/tmp/config",
			BaseURL:                      "/headlamp",
			ProxyURLs:                    []string{"http://proxy:8080"},
			SessionTTL:                   3600,
			PodDebugImage:                "docker.io/alpine:latest",
			NodeShellImage:               "docker.io/alpine:latest",
			DefaultLightTheme:            "light",
			DefaultDarkTheme:             "dark",
			ForceTheme:                   "",
			UnsafeUseServiceAccountToken: true,
			ServiceAccountTokenPath:      "/custom/token/path",
			EnableClusterInventory:       true,
			ClusterInventoryProviderFile: "/etc/provider.yaml",
		},
		OidcClientID:            "my-client",
		OidcClientSecret:        "my-secret", // #nosec G101
		OidcIdpIssuerURL:        "https://issuer.example.com",
		OidcCallbackURL:         "https://headlamp/callback",
		OidcUseAccessToken:      true,
		OidcSkipTLSVerify:       true,
		OidcCACert:              "/etc/ca.pem",
		OidcUsePKCE:             true,
		OidcScopes:              []string{"openid", "profile"},
		MeUsernamePaths:         "/me/username",
		MeEmailPaths:            "/me/email",
		MeGroupsPaths:           "/me/groups",
		MeUserInfoURL:           "/me/userinfo",
		ProxyAuthEnabled:        true,
		ProxyAuthUsernameHeader: "X-User",
		ProxyAuthGroupHeader:    "X-Groups",
		ProxyAuthEmailHeader:    "X-Email",
		ProxyAuthTokenHeader:    "X-Token",
	}

	assert.True(t, cfg.UseInCluster)
	assert.Equal(t, "my-cluster", cfg.InClusterContextName)
	assert.Equal(t, "0.0.0.0", cfg.ListenAddr)
	assert.Equal(t, uint(4466), cfg.Port)
	assert.Equal(t, "/headlamp", cfg.BaseURL)
	assert.Equal(t, "my-client", cfg.OidcClientID)
	assert.True(t, cfg.ProxyAuthEnabled)
	assert.Equal(t, "X-User", cfg.ProxyAuthUsernameHeader)
	assert.True(t, cfg.CacheEnabled)
	assert.True(t, cfg.DevMode)
	assert.True(t, cfg.Insecure)
	assert.True(t, cfg.EnableHelm)
	assert.True(t, cfg.EnableDynamicClusters)
	assert.True(t, cfg.AllowKubeconfigChanges)
	assert.Equal(t, "/tmp/config", cfg.KubeConfigPath)
	assert.Equal(t, []string{"http://proxy:8080"}, cfg.ProxyURLs)
	assert.Equal(t, 3600, cfg.SessionTTL)
	assert.Equal(t, "docker.io/alpine:latest", cfg.PodDebugImage)
	assert.Equal(t, "docker.io/alpine:latest", cfg.NodeShellImage)
	assert.Equal(t, "light", cfg.DefaultLightTheme)
	assert.Equal(t, "dark", cfg.DefaultDarkTheme)
	assert.True(t, cfg.UnsafeUseServiceAccountToken)
	assert.Equal(t, "/custom/token/path", cfg.ServiceAccountTokenPath)
	assert.True(t, cfg.EnableClusterInventory)
	assert.Equal(t, "/etc/provider.yaml", cfg.ClusterInventoryProviderFile)
	assert.Equal(t, "my-secret", cfg.OidcClientSecret)
	assert.Equal(t, "https://issuer.example.com", cfg.OidcIdpIssuerURL)
	assert.Equal(t, "https://headlamp/callback", cfg.OidcCallbackURL)
	assert.True(t, cfg.OidcUseAccessToken)
	assert.True(t, cfg.OidcSkipTLSVerify)
	assert.Equal(t, "/etc/ca.pem", cfg.OidcCACert)
	assert.True(t, cfg.OidcUsePKCE)
	assert.Equal(t, []string{"openid", "profile"}, cfg.OidcScopes)
	assert.Equal(t, "/me/username", cfg.MeUsernamePaths)
	assert.Equal(t, "/me/email", cfg.MeEmailPaths)
	assert.Equal(t, "/me/groups", cfg.MeGroupsPaths)
	assert.Equal(t, "/me/userinfo", cfg.MeUserInfoURL)
	assert.Equal(t, "X-Groups", cfg.ProxyAuthGroupHeader)
	assert.Equal(t, "X-Email", cfg.ProxyAuthEmailHeader)
	assert.Equal(t, "X-Token", cfg.ProxyAuthTokenHeader)
}

func TestHeadlampConfigEmbedsHeadlampCFG(t *testing.T) {
	subCfg := &headlampconfig.HeadlampCFG{Port: 8080, BaseURL: "/test"}
	cfg := headlampconfig.HeadlampConfig{HeadlampCFG: subCfg}

	assert.Equal(t, uint(8080), cfg.Port)
	assert.Equal(t, "/test", cfg.BaseURL)
}

func TestHeadlampConfigPanicsOnNilHeadlampCFG(t *testing.T) {
	cfg := headlampconfig.HeadlampConfig{HeadlampCFG: nil}

	assert.Nil(t, cfg.HeadlampCFG)
	assert.Panics(t, func() { _ = cfg.Port })
}

type mockMultiplexer struct{}

func (m *mockMultiplexer) HandleClientWebSocket(_ http.ResponseWriter, _ *http.Request) {}

var _ headlampconfig.WebSocketMultiplexer = (*mockMultiplexer)(nil)

func TestWebSocketMultiplexerInConfig(t *testing.T) {
	mux := &mockMultiplexer{}
	cfg := headlampconfig.HeadlampConfig{Multiplexer: mux}
	assert.NotNil(t, cfg.Multiplexer)
}

func TestBuildHeadlampCFGPattern(t *testing.T) { //nolint:funlen
	cfg := &headlampconfig.HeadlampCFG{
		UseInCluster:                          true,
		InClusterContextName:                  "in-cluster",
		KubeConfigPath:                        "/etc/kubernetes/admin.conf",
		Port:                                  4466,
		BaseURL:                               "/headlamp",
		ProxyURLs:                             []string{"http://proxy:3128"},
		SessionTTL:                            7200,
		EnableHelm:                            true,
		EnableDynamicClusters:                 true,
		AllowKubeconfigChanges:                true,
		CacheEnabled:                          true,
		DevMode:                               true,
		Insecure:                              false,
		StaticDir:                             "/app/frontend",
		PluginDir:                             "/app/plugins",
		UserPluginDir:                         "/app/user-plugins",
		StaticPluginDir:                       "/app/static-plugins",
		TLSCertPath:                           "/etc/certs/tls.crt",
		TLSKeyPath:                            "/etc/certs/tls.key",
		PodDebugImage:                         "docker.io/alpine:3.19",
		NodeShellImage:                        "docker.io/alpine:3.19",
		DefaultLightTheme:                     "light",
		DefaultDarkTheme:                      "dark",
		ForceTheme:                            "dark",
		OidcUseCookie:                         true,
		UnsafeUseServiceAccountToken:          false,
		ServiceAccountTokenPath:               "",
		EnableClusterInventory:                true,
		ClusterInventoryProviderFile:          "/etc/inventory/provider.yaml",
		ClusterInventoryRootReconcileInterval: 5 * time.Minute,
		ClusterInventoryNoCRDCacheTTL:         10 * time.Minute,
	}

	assert.True(t, cfg.UseInCluster)
	assert.Equal(t, "/etc/kubernetes/admin.conf", cfg.KubeConfigPath)
	assert.Equal(t, uint(4466), cfg.Port)
	assert.Equal(t, "/headlamp", cfg.BaseURL)
	assert.Equal(t, 7200, cfg.SessionTTL)
	assert.Equal(t, 5*time.Minute, cfg.ClusterInventoryRootReconcileInterval)
	assert.Equal(t, "in-cluster", cfg.InClusterContextName)
	assert.Equal(t, []string{"http://proxy:3128"}, cfg.ProxyURLs)
	assert.True(t, cfg.EnableHelm)
	assert.True(t, cfg.EnableDynamicClusters)
	assert.True(t, cfg.AllowKubeconfigChanges)
	assert.True(t, cfg.CacheEnabled)
	assert.True(t, cfg.DevMode)
	assert.False(t, cfg.Insecure)
	assert.False(t, cfg.UnsafeUseServiceAccountToken)
	assert.Equal(t, "/app/frontend", cfg.StaticDir)
	assert.Equal(t, "/app/plugins", cfg.PluginDir)
	assert.Equal(t, "/app/user-plugins", cfg.UserPluginDir)
	assert.Equal(t, "/app/static-plugins", cfg.StaticPluginDir)
	assert.Equal(t, "/etc/certs/tls.crt", cfg.TLSCertPath)
	assert.Equal(t, "/etc/certs/tls.key", cfg.TLSKeyPath)
	assert.Equal(t, "docker.io/alpine:3.19", cfg.PodDebugImage)
	assert.Equal(t, "docker.io/alpine:3.19", cfg.NodeShellImage)
	assert.Equal(t, "light", cfg.DefaultLightTheme)
	assert.Equal(t, "dark", cfg.DefaultDarkTheme)
	assert.Equal(t, "dark", cfg.ForceTheme)
	assert.True(t, cfg.OidcUseCookie)
	assert.True(t, cfg.EnableClusterInventory)
	assert.Equal(t, "/etc/inventory/provider.yaml", cfg.ClusterInventoryProviderFile)
	assert.Equal(t, 10*time.Minute, cfg.ClusterInventoryNoCRDCacheTTL)
}

func TestCreateHeadlampConfigPattern(t *testing.T) {
	headlampCFG := &headlampconfig.HeadlampCFG{
		ListenAddr:   "127.0.0.1",
		Port:         4466,
		BaseURL:      "/headlamp",
		CacheEnabled: true,
		DevMode:      true,
	}

	cfg := &headlampconfig.HeadlampConfig{
		HeadlampCFG:           headlampCFG,
		OidcClientID:          "test-client",
		OidcClientSecret:      "test-secret", // #nosec G101
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
	assert.Equal(t, "validator-client", cfg.OidcValidatorClientID)
	assert.Equal(t, "https://accounts.example.com", cfg.OidcIdpIssuerURL)
	assert.Equal(t, "https://headlamp/oidc-callback", cfg.OidcCallbackURL)
	assert.Equal(t, []string{"openid", "email"}, cfg.OidcScopes)
	assert.True(t, cfg.OidcUsePKCE)
	assert.False(t, cfg.OidcUseAccessToken)
	assert.False(t, cfg.ProxyAuthEnabled)
	assert.Equal(t, uint(4466), cfg.Port)
	assert.Equal(t, "/headlamp", cfg.BaseURL)
}
